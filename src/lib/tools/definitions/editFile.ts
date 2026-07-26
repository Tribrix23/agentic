import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'editFile',
  description: 'Edit a file by finding a specific string and replacing it.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      search: { type: 'string', description: 'Exact string to search for' },
      replace: { type: 'string', description: 'String to replace it with' }
    },
    required: ['path', 'search', 'replace']
  },
  requiresApproval: false,
  dangerLevel: 'dangerous',
  timeout: 30000,
  icon: 'FileEdit'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relativeOrAbsPath, search, replace } = args;
    const targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
      ? relativeOrAbsPath 
      : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
      
    const content = await (window as any).electron.readFileContent(targetPath);
    
    if (!content.includes(search)) {
      return { success: false, output: `Search string not found in ${targetPath}` };
    }
    
    // Use split and join to globally replace all occurrences of the search string
    const newContent = content.split(search).join(replace);
    const result = await (window as any).electron.saveFileContent(targetPath, newContent);
    
    if (result.success) {
      return { 
        success: true, 
        output: `Successfully edited ${targetPath}`,
        artifacts: [{
          type: 'diff',
          path: targetPath,
          original: content,       // Store original so undo can restore it
          diff: `--- ${targetPath}\n+++ ${targetPath}\n- ${search}\n+ ${replace}` // Simplified diff
        }]
      };
    } else {
      return { success: false, output: `Failed to edit file: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to edit file: ${error.message || String(error)}` };
  }
};
