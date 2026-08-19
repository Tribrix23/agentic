import { ToolCall, ToolResult, ToolContext } from './types';
import { getTool } from './registry';
import { checkPermission, PermissionConfig } from '../permissions';
import { addFileToSnapshot, getSnapshot } from '../snapshotStore';
import { withFileWriteLock } from '../fileWriteQueue';
import { isSequentialThinkingTool, normalizeSequentialThinkingArguments } from '../sequentialThinking';
import { artifactStore } from './artifactStore';
import { normalizeToolResult } from './result';
import { formatValidationErrors, validateToolArguments } from './validation';

const FILE_MUTATION_TOOLS = new Set([
  'writeFile', 'editFile', 'createFile', 'replace_file_content', 'multi_replace_file_content',
]);

function resolveToolPath(toolCall: ToolCall, context: ToolContext): string {
  const value = toolCall.arguments?.path || toolCall.arguments?.TargetFile || toolCall.arguments?.filePath || '';
  if (!value || value.startsWith('/') || /^[a-zA-Z]:(\\|\/)/.test(value)) return value;
  return context.projectRoot ? `${context.projectRoot}/${value}`.replace(/\/+/g, '/') : value;
}

export async function executeTool(toolCall: ToolCall, context: ToolContext, permissionConfig: PermissionConfig): Promise<ToolResult> {

  if (isSequentialThinkingTool(toolCall.name)) {
    toolCall.arguments = normalizeSequentialThinkingArguments(toolCall.arguments);
  }

  // Validation: tool name format (alphanumeric + underscores, reasonable length)
  // This prevents obvious HTML tags and random text while allowing flexibility
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(toolCall.name) || toolCall.name.length > 100) {
    console.error('[executor] INVALID TOOL NAME FORMAT:', toolCall.name);
    return { 
      success: false, 
      output: `[INVALID FORMAT] "${toolCall.name}" has invalid format. Tool names must be alphanumeric with underscores only.` 
    };
  }

  let toolName = toolCall.name;
  if (toolName === 'bash') {
    toolName = 'runCommand';
    toolCall.name = 'runCommand'; // Update the call itself for UI consistency
  }

  const tool = getTool(toolName);
  if (!tool) {
    console.error('[executor] Tool not found in registry:', toolCall.name);
    return { success: false, output: `Tool not found: ${toolCall.name}. The tool may not be registered. Check the tool registry.` };
  }

  const validation = validateToolArguments(tool.definition.parameters, toolCall.arguments);
  if (!validation.valid) {
    const message = formatValidationErrors(validation.errors);
    return normalizeToolResult({
      success: false,
      output: `Invalid arguments for tool "${toolCall.name}": ${message}`,
      diagnostics: [{ category: 'validation', message, details: validation.errors }],
    });
  }

  // ── Permission check ──────────────────────────────────────────────────
  const permission = checkPermission(toolCall.name, toolCall.arguments, permissionConfig);

  if (permission === 'deny') {
    return { success: false, output: `Permission denied for tool: ${toolCall.name}` };
  }

  // NOTE: 'ask' approval is handled by the SecurityInterceptor in agentLoop.ts
  // (via the tool-approval-needed event). The executor does NOT show its own
  // approval UI — that caused duplicate approval cards.
  // SecurityInterceptor now only blocks truly dangerous operations (deleteFile, renameFile, runCommand)
  // while the permission system handles fine-grained control for other tools like writeFile/editFile.


  const startTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), tool.definition.timeout);
  const onContextAbort = () => controller.abort();
  context.signal.addEventListener('abort', onContextAbort);

  try {
    // ── Snapshot: capture inverse actions BEFORE tool execution ───────────────────
    const userMessageId = context.userMessageId;
    if (userMessageId) {
      const turnSnapshot = getSnapshot(userMessageId);
      const usesGitCheckpoint = Boolean(turnSnapshot?.gitCheckpoint);
      const getFullPath = (p: string) => {
        if (!p) return '';
        if (!p.startsWith('/') && !/^[a-zA-Z]:(\\|\/)/.test(p) && context.projectRoot) {
          return `${context.projectRoot}/${p}`.replace(/\/+/g, '/');
        }
        return p;
      };

      const toolName = toolCall.name;
      let pathArg = toolCall.arguments?.path || toolCall.arguments?.TargetFile || toolCall.arguments?.filePath || '';
      let oldPathArg = toolCall.arguments?.oldPath || '';
      let newPathArg = toolCall.arguments?.newPath || '';

      const targetPath = getFullPath(pathArg);
      const targetOldPath = getFullPath(oldPathArg);
      const targetNewPath = getFullPath(newPathArg);

      try {
        if (usesGitCheckpoint) {
          // The hidden Git checkpoint already contains the complete pre-turn tree,
          // including files that were untracked at the time of capture.
        } else if (['writeFile', 'editFile', 'createFile', 'replace_file_content', 'multi_replace_file_content'].includes(toolName)) {
          if (targetPath) {
            try {
              const existing = await (window as any).electron?.readFileContent(targetPath, context.projectRoot);
              if (existing !== undefined && existing !== null) {
                addFileToSnapshot(userMessageId, { type: 'file_modify', path: targetPath, content: existing });
              }
            } catch {
              addFileToSnapshot(userMessageId, { type: 'file_create', path: targetPath });
            }
          }
        } else if (toolName === 'createFolder') {
          if (targetPath) {
            addFileToSnapshot(userMessageId, { type: 'folder_create', path: targetPath });
          }
        } else if (toolName === 'renameFile' || toolName === 'renameFolder') {
          if (targetOldPath && targetNewPath) {
            addFileToSnapshot(userMessageId, { type: 'rename', path: targetNewPath, oldPath: targetOldPath });
          }
        } else if (toolName === 'deleteFile' || toolName === 'delete_file' || toolName === 'deleteFolder') {
          if (targetPath) {
            const backupRes = await (window as any).electron?.backupPath(targetPath, context.projectRoot);
            if (backupRes?.success && backupRes.backupPath) {
              const type = toolName === 'deleteFolder' ? 'folder_delete' : 'file_delete';
              addFileToSnapshot(userMessageId, { type, path: targetPath, backupPath: backupRes.backupPath });
            }
          }
        }
      } catch (e) {
        console.error('[Executor] Failed to capture snapshot:', e);
      }
    }

    const combinedContext = { ...context, signal: controller.signal };
    const runHandler = () => tool.handler(toolCall.arguments, combinedContext);
    // Sub-agents are launched concurrently, so protect conflicting file writes
    // at the last shared execution boundary rather than relying on the parser.
    const result = FILE_MUTATION_TOOLS.has(toolCall.name)
      ? await withFileWriteLock(resolveToolPath(toolCall, context), runHandler)
      : await runHandler();
    if (result) {
      (result as any).durationMs = Date.now() - startTime;
    }
    return applyOutputPolicy(normalizeToolResult(result || { success: false, output: 'Tool returned no result.' }), tool.definition.name, tool.definition.capabilities?.output);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const cancelled = context.signal.aborted;
      return normalizeToolResult({
        success: false,
        output: cancelled ? 'Tool execution cancelled.' : `Tool execution timed out after ${tool.definition.timeout}ms`,
        diagnostics: [{ category: cancelled ? 'cancelled' : 'timeout', message: err.message || String(err) }],
      });
    }
    return normalizeToolResult({
      success: false,
      output: `Error executing tool: ${err.message}`,
      diagnostics: [{ category: 'internal', message: err.message || String(err) }],
    });
  } finally {
    clearTimeout(timeoutId);
    // Clean up the abort listener to prevent memory leak
    if (context.signal.removeEventListener) {
      context.signal.removeEventListener('abort', onContextAbort);
    }
  }
}

function applyOutputPolicy(
  result: ToolResult,
  toolName: string,
  policy?: { inlineMaxBytes: number; previewBytes: number; artifactOnOverflow: boolean },
): ToolResult {
  if (!policy) return result;
  const originalBytes = new TextEncoder().encode(result.output).byteLength;
  if (originalBytes <= policy.inlineMaxBytes) return result;
  const artifactRef = policy.artifactOnOverflow
    ? artifactStore.put(result.output, { label: `${toolName} output` })
    : undefined;
  const preview = result.output.slice(0, policy.previewBytes);
  return {
    ...result,
    output: `${preview}\n\n[Output truncated.${artifactRef ? ` Full output stored as artifact ${artifactRef.id}.` : ''}]`,
    artifactRef,
    truncated: true,
    truncation: {
      truncated: true,
      originalBytes,
      includedBytes: new TextEncoder().encode(preview).byteLength,
      continuation: artifactRef ? `readArtifact({ artifactId: "${artifactRef.id}", offset: ${preview.length} })` : undefined,
    },
  };
}
