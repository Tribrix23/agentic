import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'appendFile',
  description: 'Append content to the end of an existing file. Use this instead of writeFile when writing large files incrementally.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      content: { type: 'string', description: 'Content to append' }
    },
    required: ['path', 'content']
  },
  requiresApproval: false,
  dangerLevel: 'low',
  timeout: 10000,
  icon: 'FilePlus'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relativeOrAbsPath, content } = args;
    
    if (!relativeOrAbsPath) {
      return { success: false, output: `Failed to append to file: Missing 'path' parameter.` };
    }

    const targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
      ? relativeOrAbsPath 
      : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
      
    // Check if file exists first
    const exists = await (window as any).electron.fileExists(targetPath);
    if (!exists) {
        // Create if doesn't exist
        await (window as any).electron.writeFile(targetPath, content);
    } else {
        const existingContent = await (window as any).electron.readFileContent(targetPath);
        const newContent = existingContent + (existingContent.endsWith('\n') ? '' : '\n') + content;
        await (window as any).electron.writeFile(targetPath, newContent);
    }
    
    return { 
      success: true, 
      output: `Successfully appended content to ${relativeOrAbsPath}.`,
    };
  } catch (error: any) {
    return { success: false, output: `Error appending to file: ${error.message}` };
  }
};
