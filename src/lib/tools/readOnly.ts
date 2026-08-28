import type { ToolDefinition } from './types';

// An allow-list is intentional here. Several legacy tools are labelled "safe"
// while still changing the workspace, starting processes, or changing state.
export const READ_ONLY_TOOL_NAMES = new Set([
  'readFile',
  'readArtifact',
  'listDirectory',
  'searchFiles',
  'findText',
  'findDuplicates',
  'codeAnalysis',
  'analyzeDependencies',
  'checkSyntax',
  'validateSchema',
  'gitStatus',
  'gitDiff',
  'getGitBranch',
  'getFileInfo',
  'screenshot',
  'listWindows',
  'listProcesses',
  'getClipboard',
  'sequentialThinking',
]);

export function isReadOnlyToolName(name: string): boolean {
  return READ_ONLY_TOOL_NAMES.has(name);
}

export function getReadOnlyToolDefinitions(
  definitions: Array<{ definition: ToolDefinition }>,
): any[] {
  return definitions
    .filter(tool => isReadOnlyToolName(tool.definition.name))
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
    }));
}
