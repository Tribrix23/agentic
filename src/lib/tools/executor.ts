import { ToolCall, ToolResult, ToolContext } from './types';
import { getTool } from './registry';
import { checkPermission, PermissionConfig } from '../permissions';
import { addFileToSnapshot, getSnapshot } from '../snapshotStore';
import { withFileWriteLock } from '../fileWriteQueue';

// ── Deduplication store ────────────────────────────────────────────────────
// Tracks tool signatures executed this session. Resets when a write operation
// occurs (create/delete/write file/folder) since the filesystem has changed.

const executedSignatures = new Set<string>();

/** Tools that mutate the filesystem — reset the dedup store when called */
const WRITE_TOOLS = new Set([
  'writeFile', 'editFile', 'createFile', 'deleteFile',
  'createFolder', 'deleteFolder', 'renameFolder', 'renameFile',
  'runCommand', 'gitAdd', 'gitCommit',
]);

const FILE_MUTATION_TOOLS = new Set([
  'writeFile', 'editFile', 'createFile', 'replace_file_content', 'multi_replace_file_content',
]);

function resolveToolPath(toolCall: ToolCall, context: ToolContext): string {
  const value = toolCall.arguments?.path || toolCall.arguments?.TargetFile || toolCall.arguments?.filePath || '';
  if (!value || value.startsWith('/') || /^[a-zA-Z]:(\\|\/)/.test(value)) return value;
  return context.projectRoot ? `${context.projectRoot}/${value}`.replace(/\/+/g, '/') : value;
}

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

  // Validation: tool name format (alphanumeric + underscores, reasonable length)
  // This prevents obvious HTML tags and random text while allowing flexibility
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(toolCall.name) || toolCall.name.length > 100) {
    console.error('[executor] INVALID TOOL NAME FORMAT:', toolCall.name);
    return { 
      success: false, 
      output: `[INVALID FORMAT] "${toolCall.name}" has invalid format. Tool names must be alphanumeric with underscores only.` 
    };
  }

  const tool = getTool(toolCall.name);
  if (!tool) {
    console.error('[executor] Tool not found in registry:', toolCall.name);
    return { success: false, output: `Tool not found: ${toolCall.name}. The tool may not be registered. Check the tool registry.` };
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
    if (currentUserMessageId) {
      const turnSnapshot = getSnapshot(currentUserMessageId);
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
              const existing = await (window as any).electron?.readFileContent(targetPath);
              if (existing !== undefined && existing !== null) {
                addFileToSnapshot(currentUserMessageId, { type: 'file_modify', path: targetPath, content: existing });
              }
            } catch {
              addFileToSnapshot(currentUserMessageId, { type: 'file_create', path: targetPath });
            }
          }
        } else if (toolName === 'createFolder') {
          if (targetPath) {
            addFileToSnapshot(currentUserMessageId, { type: 'folder_create', path: targetPath });
          }
        } else if (toolName === 'renameFile' || toolName === 'renameFolder') {
          if (targetOldPath && targetNewPath) {
            addFileToSnapshot(currentUserMessageId, { type: 'rename', path: targetNewPath, oldPath: targetOldPath });
          }
        } else if (toolName === 'deleteFile' || toolName === 'delete_file' || toolName === 'deleteFolder') {
          if (targetPath) {
            const backupRes = await (window as any).electron?.backupPath(targetPath, context.projectRoot);
            if (backupRes?.success && backupRes.backupPath) {
              const type = toolName === 'deleteFolder' ? 'folder_delete' : 'file_delete';
              addFileToSnapshot(currentUserMessageId, { type, path: targetPath, backupPath: backupRes.backupPath });
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
    return result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, output: `Tool execution timed out after ${tool.definition.timeout}ms` };
    }
    return { success: false, output: `Error executing tool: ${err.message}` };
  } finally {
    clearTimeout(timeoutId);
    // Clean up the abort listener to prevent memory leak
    if (context.signal.removeEventListener) {
      context.signal.removeEventListener('abort', onContextAbort);
    }
  }
}
