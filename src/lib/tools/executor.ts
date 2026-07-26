import { ToolCall, ToolResult, ToolContext } from './types';
import { getTool } from './registry';
import { checkPermission, PermissionConfig } from '../permissions';
import { addFileToSnapshot } from '../snapshotStore';

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

/** The current user message ID — set by MainContent before each agent run */
export let currentUserMessageId: string = '';
export function setCurrentUserMessageId(id: string): void {
  currentUserMessageId = id;
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


  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), tool.definition.timeout);
  const onContextAbort = () => controller.abort();
  context.signal.addEventListener('abort', onContextAbort);

  try {
    // ── Snapshot: capture file content BEFORE any write ───────────────────
    const FILE_WRITE_TOOLS = new Set(['writeFile', 'editFile', 'createFile', 'replace_file_content', 'multi_replace_file_content']);
    if (FILE_WRITE_TOOLS.has(toolCall.name) && currentUserMessageId) {
      let filePath = toolCall.arguments?.path || toolCall.arguments?.TargetFile || toolCall.arguments?.filePath || '';
      if (filePath) {
        // Resolve to absolute path if relative
        if (!filePath.startsWith('/') && !/^[a-zA-Z]:(\\|\/)/.test(filePath) && context.projectRoot) {
          filePath = `${context.projectRoot}/${filePath}`.replace(/\/+/g, '/');
        }
        try {
          const existing = await (window as any).electron?.readFileContent(filePath);
          if (existing !== undefined && existing !== null) {
            addFileToSnapshot(currentUserMessageId, { path: filePath, content: existing });
          }
        } catch { /* file may not exist yet (createFile case) — that's fine */ }
      }
    }

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
