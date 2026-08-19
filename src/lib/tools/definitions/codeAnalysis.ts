import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'codeAnalysis',
  description: 'Analyze a source code file for imports, exports, or symbols.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to analyze' },
      type: { 
        type: 'string', 
        enum: ['imports', 'exports', 'symbols'],
        description: 'Type of analysis to perform'
      }
    },
    required: ['path', 'type']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'Code'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, type } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)
      ? path
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');
    const content = await (window as any).electron.readFileContent(targetPath, context.projectRoot);
    const lines = content.split('\n');
    let results: string[] = [];
    
    // Very naive regex-based parsing for simplicity
    if (type === 'imports') {
      const importRegex = /^import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        results.push(match[0].trim());
      }
    } else if (type === 'exports') {
      const exportRegex = /^export\s+(const|let|var|function|class|interface|type)\s+([a-zA-Z0-9_]+)/gm;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        results.push(`${match[1]} ${match[2]}`);
      }
      // Also catch export { ... }
      const exportBlockRegex = /^export\s+\{([^}]+)\}/gm;
      while ((match = exportBlockRegex.exec(content)) !== null) {
        results.push(`export { ${match[1].trim()} }`);
      }
    } else if (type === 'symbols') {
      const symbolRegex = /^(?:export\s+)?(?:async\s+)?(function|class|interface|type)\s+([a-zA-Z0-9_]+)/gm;
      let match;
      while ((match = symbolRegex.exec(content)) !== null) {
        results.push(`${match[1]} ${match[2]}`);
      }
      
      const varRegex = /^(?:export\s+)?(const|let|var)\s+([a-zA-Z0-9_]+)\s*(:|=)/gm;
      while ((match = varRegex.exec(content)) !== null) {
        results.push(`${match[1]} ${match[2]}`);
      }
    }
    
    if (results.length === 0) {
      return { success: true, output: `No ${type} found in ${targetPath}` };
    }
    
    return { success: true, output: `Found ${type} in ${targetPath}:\n${results.join('\n')}` };
  } catch (error: any) {
    return { success: false, output: `Failed to analyze code: ${error.message || String(error)}` };
  }
};
