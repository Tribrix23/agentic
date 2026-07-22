import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'searchFiles',
  description: 'Search for text across project files.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text or regex to search for' },
      path: { type: 'string', description: 'Directory to search in (use "." for root)' },
      regex: { type: 'boolean', description: 'Treat query as regular expression' },
      fileFilter: { type: 'string', description: 'Optional extension filter (e.g. ".ts")' }
    },
    required: ['query', 'path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Search'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { query, path, regex = false, fileFilter } = args;
    const tree = await (window as any).electron.readProjectFiles(path);
    const searchRegex = regex ? new RegExp(query, 'g') : new RegExp(query.replace(/[.*+?^$\{()|[\]\\]/g, '\\$&'), 'g');
    
    const results: string[] = [];
    let matchCount = 0;
    const MAX_MATCHES = 50;
    
    // Helper to recursively collect files
    const collectFiles = (nodes: any[]): string[] => {
      let files: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file') {
          if (!fileFilter || node.name.endsWith(fileFilter)) {
            files.push(node.path);
          }
        } else if (node.children) {
          files = files.concat(collectFiles(node.children));
        }
      }
      return files;
    };
    
    const allFiles = collectFiles(tree);
    
    for (const filePath of allFiles) {
      if (matchCount >= MAX_MATCHES) break;
      
      try {
        const content = await (window as any).electron.readFileContent(filePath);
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (matchCount >= MAX_MATCHES) break;
          const line = lines[i];
          if (searchRegex.test(line)) {
            results.push(`${filePath}:${i + 1}:${line.trim()}`);
            matchCount++;
          }
        }
      } catch (e) {
        // Skip files that can't be read (e.g. binary)
      }
    }
    
    if (results.length === 0) {
      return { success: true, output: 'No matches found.' };
    }
    
    let output = results.join('\n');
    if (matchCount >= MAX_MATCHES) {
      output += '\n\n...[Output truncated, max 50 matches reached]';
    }
    
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Failed to search files: ${error.message || String(error)}` };
  }
};
