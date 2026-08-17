import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'executeCode',
  description: 'Execute a code snippet and return the output. Supports JavaScript/TypeScript evaluation.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Code to execute' },
      language: { type: 'string', description: 'Language (javascript, typescript, python)' },
      timeout: { type: 'number', description: 'Execution timeout in ms (default: 5000)' }
    },
    required: ['code', 'language']
  },
  requiresApproval: true,
  dangerLevel: 'moderate',
  timeout: 10000,
  icon: 'Code'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { code, language, timeout = 5000 } = args;
    
    if (language === 'javascript' || language === 'typescript') {
      // For JS/TS, we can use eval (with caution)
      // In a real implementation, this would use a sandboxed environment
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Execution timeout')), timeout);
        try {
          const output = eval(code);
          clearTimeout(timer);
          resolve(String(output ?? 'undefined'));
        } catch (e: any) {
          clearTimeout(timer);
          reject(e);
        }
      });
      return { success: true, output: String(result) };
    }
    
    if (language === 'python') {
      // Python execution would require a backend service
      return { 
        success: false, 
        output: 'Python execution requires backend configuration. Use runCommand with python instead.' 
      };
    }
    
    return { success: false, output: `Unsupported language: ${language}` };
  } catch (error: any) {
    return { success: false, output: `Execution error: ${error.message || String(error)}` };
  }
};
