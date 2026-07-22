import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'listDirectory',
  description: 'List contents of a directory in a tree format.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to list (use "." for root)' },
      depth: { type: 'number', description: 'Maximum depth to traverse (default 2)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'FolderTree'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, depth = 2 } = args;
    const tree = await (window as any).electron.readProjectFiles(path);
    
    // Helper to format tree
    const formatTree = (nodes: any[], currentDepth: number, maxDepth: number, prefix: string = ''): string => {
      if (currentDepth > maxDepth) return prefix + '...\n';
      
      let result = '';
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        const linePrefix = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        
        result += prefix + linePrefix + node.name + (node.type === 'folder' ? '/' : '') + '\n';
        
        if (node.type === 'folder' && node.children) {
          result += formatTree(node.children, currentDepth + 1, maxDepth, prefix + childPrefix);
        }
      }
      return result;
    };
    
    const output = formatTree(tree, 1, depth);
    return { success: true, output: output || 'Empty directory' };
  } catch (error: any) {
    return { success: false, output: `Failed to list directory: ${error.message || String(error)}` };
  }
};
