import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'findDuplicates',
  description: 'Find duplicate code blocks or identical files in the project.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory to search (default: root)' },
      minLines: { type: 'number', description: 'Minimum lines to consider as duplicate (default: 5)' },
      fileFilter: { type: 'string', description: 'File extension filter (e.g. ".ts")' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Copy'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relativePath = '.', minLines = 5, fileFilter } = args;
    const targetPath = relativePath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativePath) 
      ? relativePath 
      : `${context.projectRoot}/${relativePath}`.replace(/\/+/g, '/');

    const tree = await (window as any).electron.readProjectFiles(targetPath, context.projectRoot);
    
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
    const fileContents: Record<string, string[]> = {};
    
    // Read all files and split into lines
    for (const filePath of allFiles) {
      try {
        const content = await (window as any).electron.readFileContent(filePath, context.projectRoot);
        fileContents[filePath] = content.split('\n');
      } catch (e) {
        // Skip unreadable files
      }
    }
    
    // Find duplicate blocks
    const duplicates: string[] = [];
    const blockMap = new Map<string, string[]>();
    
    for (const [file1, lines1] of Object.entries(fileContents)) {
      for (let i = 0; i <= lines1.length - minLines; i++) {
        const block = lines1.slice(i, i + minLines).join('\n');
        
        if (blockMap.has(block)) {
          const existing = blockMap.get(block)!;
          if (!existing.includes(file1)) {
            existing.push(file1);
            duplicates.push(`Duplicate block found in:\n  - ${existing.join('\n  - ')}`);
          }
        } else {
          blockMap.set(block, [file1]);
        }
      }
    }
    
    if (duplicates.length === 0) {
      return { success: true, output: 'No duplicates found.' };
    }
    
    return { success: true, output: duplicates.slice(0, 50).join('\n\n') };
  } catch (error: any) {
    return { success: false, output: `Failed to find duplicates: ${error.message || String(error)}` };
  }
};
