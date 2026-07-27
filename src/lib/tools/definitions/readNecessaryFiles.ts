import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'readNecessaryFiles',
  description: 'Read multiple files at once. Provide an array of file paths to read them simultaneously. Useful for quickly gathering context.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      paths: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Array of relative or absolute file paths to read.' 
      }
    },
    required: ['paths']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'Files'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { paths } = args;
    if (!Array.isArray(paths)) {
      return { success: false, output: 'paths must be an array of strings' };
    }

    const results = [];
    for (const p of paths) {
      const res = await (window as any).electron.readFileContent(p);
      if (res && !res.startsWith('Error reading file:')) {
        results.push(`--- FILE: ${p} ---\n${res}\n`);
      } else {
        results.push(`--- FILE: ${p} ---\nError: Could not read file.\n`);
      }
    }

    return { 
      success: true, 
      output: results.join('\n') 
    };
  } catch (error: any) {
    return { success: false, output: `Failed to read files: ${error.message || String(error)}` };
  }
};
