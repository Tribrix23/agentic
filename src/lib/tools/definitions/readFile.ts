import { ToolDefinition, ToolHandler } from '../types';
import { ASTIndexer } from '../../search/astIndexer';

export const definition: ToolDefinition = {
  name: 'readFile',
  description: 'Read a file from the workspace. By default, returns a Context-Compressed Skeleton of the file (hiding function bodies) to save tokens. Use expandSymbol to see hidden bodies.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to read' },
      full: { type: 'boolean', description: 'If true, bypasses Headroom compression and returns the entire file. Use sparingly.' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'FileText'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, full } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : (context.projectRoot ? `${context.projectRoot}/${path}` : path).replace(/\/+/g, '/');

    const content = await (window as any).electron.readFileContent(targetPath, context.projectRoot);
    if (content === null || content === undefined) {
      return { success: false, output: `File not found: ${targetPath}` };
    }

    if (full || !targetPath.match(/\.(ts|tsx|js|jsx)$/i)) {
      return { success: true, output: content };
    }

    // Apply Headroom Context Compression (Skeleton)
    const indexer = new ASTIndexer();
    await indexer.init();
    const skeleton = indexer.generateSkeleton(targetPath, content);
    
    return { 
      success: true, 
      output: `[HEADROOM COMPRESSION ACTIVE] File: ${path}\n\n${skeleton}\n\n(Note: Function bodies are hidden. Use 'expandSymbol' tool to read a specific function.)` 
    };
  } catch (error: any) {
    return { success: false, output: `Failed to read file: ${error.message}` };
  }
};

