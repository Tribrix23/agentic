import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'findText',
  description: 'Search for text in files with surrounding context lines. More powerful than searchFiles for finding specific code patterns.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text to search for' },
      path: { type: 'string', description: 'Directory to search in (use "." for root)' },
      contextLines: { type: 'number', description: 'Number of context lines before and after match (default: 2)' },
      fileFilter: { type: 'string', description: 'Optional extension filter (e.g. ".ts")' },
      caseSensitive: { type: 'boolean', description: 'Case-sensitive search (default: false)' },
      maxResults: { type: 'number', description: 'Maximum number of results (default: 50)' }
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
    const { 
      query, 
      path: relativeOrAbsPath = '.', 
      contextLines = 2, 
      fileFilter, 
      caseSensitive = false,
      maxResults = 50
    } = args;
    
    const targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
      ? relativeOrAbsPath 
      : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');

    const tree = await (window as any).electron.readProjectFiles(targetPath, context.projectRoot);
    const searchRegex = new RegExp(
      caseSensitive ? query : new RegExp(query, 'i'),
      'g'
    );
    
    const results: string[] = [];
    let matchCount = 0;
    
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
      if (matchCount >= maxResults) break;
      
      try {
        const content = await (window as any).electron.readFileContent(filePath, context.projectRoot);
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (matchCount >= maxResults) break;
          const line = lines[i];
          
          if (searchRegex.test(line)) {
            const startLine = Math.max(0, i - contextLines);
            const endLine = Math.min(lines.length, i + contextLines + 1);
            const context = lines.slice(startLine, endLine)
              .map((l: string, idx: number) => {
                const lineNum = startLine + idx + 1;
                const marker = idx === (i - startLine) ? '>>>' : '   ';
                return `${marker} ${lineNum}: ${l}`;
              })
              .join('\n');
            
            results.push(`${filePath}\n${context}\n`);
            matchCount++;
          }
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }
    
    if (results.length === 0) {
      return { success: true, output: 'No matches found.' };
    }
    
    let output = results.join('\n');
    if (matchCount >= maxResults) {
      output += `\n...[Output truncated, max ${maxResults} results reached]`;
    }
    
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Failed to find text: ${error.message || String(error)}` };
  }
};
