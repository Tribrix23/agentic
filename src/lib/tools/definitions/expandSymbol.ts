import { ToolDefinition, ToolHandler } from '../types';
import { ASTIndexer } from '../../search/astIndexer';

export const definition: ToolDefinition = {
  name: 'expandSymbol',
  description: 'Expands a specific hidden function or class body from a file that was previously compressed by readFile.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      symbolName: { type: 'string', description: 'Name of the function or class to expand' }
    },
    required: ['path', 'symbolName']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Maximize'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, symbolName } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : (context.projectRoot ? `${context.projectRoot}/${path}` : path).replace(/\/+/g, '/');

    const content = await (window as any).electron.readFileContent(targetPath, context.projectRoot);
    if (!content) return { success: false, output: `File not found: ${targetPath}` };

    const indexer = new ASTIndexer();
    await indexer.init();
    
    // Chunk the file using AST to find the specific symbol
    const chunks = indexer.chunkFile(targetPath, content);
    const targetChunk = chunks.find(c => c.symbolName === symbolName);
    
    if (!targetChunk) {
      return { success: false, output: `Symbol '${symbolName}' not found in ${path}.` };
    }

    return { 
      success: true, 
      output: `Expanded ${symbolName} in ${path}:\n\n${targetChunk.content}` 
    };
  } catch (error: any) {
    return { success: false, output: `Failed to expand symbol: ${error.message}` };
  }
};

