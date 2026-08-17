import type { ToolCall } from './messageTypes';

export const WRITE_FILE_TOOLS = ['writeFile', 'createFile', 'write_to_file'] as const;
export const EDIT_FILE_TOOLS = ['editFile', 'replace_file_content', 'multi_replace_file_content'] as const;

export function isFileTool(toolName: string): boolean {
  return (WRITE_FILE_TOOLS as readonly string[]).includes(toolName)
    || (EDIT_FILE_TOOLS as readonly string[]).includes(toolName);
}

export function getFileOperation(toolCall: ToolCall): 'Writing' | 'Editing' {
  if ((EDIT_FILE_TOOLS as readonly string[]).includes(toolCall.name)) return 'Editing';

  const fileArtifact = toolCall.result?.artifacts?.find(artifact =>
    artifact.type === 'file_change' || artifact.type === 'file_create'
  );
  const isNew = fileArtifact?.metadata?.isNew ?? (fileArtifact as any)?.isNew;
  return isNew === false ? 'Editing' : 'Writing';
}

export function getFileActivityPrefix(toolCall: ToolCall): string {
  const operation = getFileOperation(toolCall);
  return toolCall.agentKind === 'subagent' ? `Subagent is ${operation}` : operation;
}