import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'checkSyntax',
  description: 'Check syntax errors in code files using language-specific linters.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file or directory to check' },
      language: { type: 'string', description: 'Language (auto, javascript, typescript, python, go)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 15000,
  icon: 'CheckCircle'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, language = 'auto' } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    let command: string;
    
    if (language === 'auto') {
      // Auto-detect based on file extension
      if (path.endsWith('.ts') || path.endsWith('.tsx')) {
        command = `npx tsc --noEmit "${targetPath}"`;
      } else if (path.endsWith('.js') || path.endsWith('.jsx')) {
        command = `npx eslint "${targetPath}"`;
      } else if (path.endsWith('.py')) {
        command = `python -m py_compile "${targetPath}"`;
      } else if (path.endsWith('.go')) {
        command = `go vet "${targetPath}"`;
      } else {
        return { success: false, output: 'Could not auto-detect language. Specify language explicitly.' };
      }
    } else if (language === 'typescript') {
      command = `npx tsc --noEmit "${targetPath}"`;
    } else if (language === 'javascript') {
      command = `npx eslint "${targetPath}"`;
    } else if (language === 'python') {
      command = `python -m py_compile "${targetPath}"`;
    } else if (language === 'go') {
      command = `go vet "${targetPath}"`;
    } else {
      return { success: false, output: `Unsupported language: ${language}` };
    }

    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Syntax check failed:\n${result.error}` };
    }
    
    if (result.stdout && result.stdout.trim()) {
      return { success: false, output: `Syntax issues found:\n${result.stdout}` };
    }
    
    return { success: true, output: 'No syntax errors found.' };
  } catch (error: any) {
    return { success: false, output: `Failed to check syntax: ${error.message || String(error)}` };
  }
};
