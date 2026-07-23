import { ToolCall, ToolResult, ToolContext } from './types';
import { getTool } from './registry';
import { checkPermission, PermissionConfig } from '../permissions';

// ── Deduplication store ────────────────────────────────────────────────────
// Tracks tool signatures executed this session. Resets when a write operation
// occurs (create/delete/write file/folder) since the filesystem has changed.

const executedSignatures = new Set<string>();

/** Tools that mutate the filesystem — reset the dedup store when called */
const WRITE_TOOLS = new Set([
  'writeFile', 'editFile', 'createFile', 'deleteFile',
  'runCommand', 'gitAdd', 'gitCommit',
]);

/** Call at the start of each new agent run */
export function clearToolCache(): void {
  executedSignatures.clear();
}

export async function executeTool(toolCall: ToolCall, context: ToolContext, permissionConfig: PermissionConfig): Promise<ToolResult> {
  const tool = getTool(toolCall.name);
  if (!tool) {
    return { success: false, output: `Tool not found: ${toolCall.name}` };
  }

  const sig = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;

  // ── Deduplication: block identical read calls within one run ──────────
  if (!WRITE_TOOLS.has(toolCall.name)) {
    if (executedSignatures.has(sig)) {
      console.warn(`[executor] Duplicate tool call blocked: ${sig}`);
      return {
        success: true, // Return success so the AI doesn't retry
        output: `[Already called] ${toolCall.name} with these arguments was already executed earlier in this session. Refer to the previous result above and proceed without calling it again.`,
      };
    }
    executedSignatures.add(sig);
  } else {
    // Write operations invalidate all cached read signatures so a re-read is allowed
    executedSignatures.clear();
  }

  // ── Permission check ──────────────────────────────────────────────────
  const permission = checkPermission(toolCall.name, toolCall.arguments, permissionConfig);
  
  if (permission === 'deny') {
    return { success: false, output: `Permission denied for tool: ${toolCall.name}` };
  }

  // NOTE: 'ask' approval is handled by the SecurityInterceptor in agentLoop.ts
  // (via the tool-approval-needed event). The executor does NOT show its own
  // approval UI — that caused duplicate approval cards.
  // Only dangerLevel:'dangerous' tools with explicit requiresApproval flag use this path.
  if (tool.definition.requiresApproval && permission !== 'allow') {
    const approved = await new Promise<boolean>((resolve) => {
      const handleResponse = (e: any) => {
        if (e.detail.id === toolCall.id) {
          window.removeEventListener('tool-approval-response', handleResponse);
          resolve(e.detail.approved);
        }
      };
      window.addEventListener('tool-approval-response', handleResponse);
      window.dispatchEvent(new CustomEvent('tool-approval-request', { detail: { toolCall } }));
    });

    if (!approved) {
      return { success: false, output: `User rejected tool execution: ${toolCall.name}` };
    }
  }

  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), tool.definition.timeout);
  const onContextAbort = () => controller.abort();
  context.signal.addEventListener('abort', onContextAbort);

  try {
    const combinedContext = { ...context, signal: controller.signal };
    const result = await tool.handler(toolCall.arguments, combinedContext);
    if (result) {
      (result as any).durationMs = Date.now() - startTime;
    }
    return result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, output: `Tool execution timed out after ${tool.definition.timeout}ms` };
    }
    return { success: false, output: `Error executing tool: ${err.message}` };
  } finally {
    clearTimeout(timeoutId);
    context.signal.removeEventListener('abort', onContextAbort);
  }
}
