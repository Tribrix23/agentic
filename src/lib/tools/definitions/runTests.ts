import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'runTests',
  description: 'Run project tests using npm test, jest, pytest, or other test frameworks.',
  category: 'terminal',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to test file or directory (optional)' },
      framework: { type: 'string', description: 'Test framework (auto, jest, pytest, vitest)' },
      coverage: { type: 'boolean', description: 'Generate coverage report' },
      watch: { type: 'boolean', description: 'Run in watch mode' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 60000,
  icon: 'TestTube'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, framework = 'auto', coverage = false, watch = false } = args;
    
    let command: string;
    
    if (framework === 'auto') {
      // Try to detect test framework
      const tree = await (window as any).electron.readProjectFiles(context.projectRoot);
      const hasJest = JSON.stringify(tree).includes('jest');
      const hasPytest = JSON.stringify(tree).includes('pytest');
      const hasVitest = JSON.stringify(tree).includes('vitest');
      
      if (hasPytest) {
        command = 'pytest';
        if (path) command += ` ${path}`;
        if (coverage) command += ' --cov';
      } else if (hasVitest) {
        command = 'npx vitest run';
        if (path) command += ` ${path}`;
        if (coverage) command += ' --coverage';
      } else if (hasJest) {
        command = 'npx jest';
        if (path) command += ` ${path}`;
        if (coverage) command += ' --coverage';
      } else {
        command = 'npm test';
      }
    } else if (framework === 'jest') {
      command = `npx jest ${path || ''} ${coverage ? '--coverage' : ''}`;
    } else if (framework === 'pytest') {
      command = `pytest ${path || ''} ${coverage ? '--cov' : ''}`;
    } else if (framework === 'vitest') {
      command = `npx vitest run ${path || ''} ${coverage ? '--coverage' : ''}`;
    } else {
      return { success: false, output: `Unknown framework: ${framework}` };
    }
    
    if (watch) {
      command += ' --watch';
    }
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Tests failed: ${result.error}` };
    }
    
    return { success: true, output: result.stdout || 'Tests completed' };
  } catch (error: any) {
    return { success: false, output: `Failed to run tests: ${error.message || String(error)}` };
  }
};
