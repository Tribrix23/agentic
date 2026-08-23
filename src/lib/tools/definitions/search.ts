import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'search',
  description: 'Search for text in file contents or by filename patterns. Returns structured results with file paths, line numbers, and context. Supports regex patterns, case sensitivity, file filtering, and context lines. Ideal for finding code patterns, function definitions, or locating specific files.',
  category: 'search',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query - text pattern or regex to search for in file contents.' },
      path: { type: 'string', description: 'Directory to search in (use "." for project root, or specific path like "src/components").' },
      filenamePattern: { type: 'string', description: 'Optional: Filter files by name pattern (e.g. "*.ts", "test_*.js", "*component*").' },
      contextLines: { type: 'number', description: 'Number of context lines before/after matches (default: 2). Use 0 for match-only results.' },
      caseSensitive: { type: 'boolean', description: 'Case-sensitive search (default: false).' },
      maxResults: { type: 'number', description: 'Maximum number of matches to return (default: 50).' },
      useRegex: { type: 'boolean', description: 'Treat query as regex pattern (default: false).' }
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
      filenamePattern,
      contextLines = 2, 
      caseSensitive = false,
      maxResults = 50,
      useRegex = false
    } = args;
    
    // Normalize target path
    const targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
      ? relativeOrAbsPath 
      : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');

    // Build search regex
    let searchRegex: RegExp;
    try {
      if (useRegex) {
        searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');
      } else {
        // Escape special regex characters for literal search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchRegex = new RegExp(escapedQuery, caseSensitive ? 'g' : 'gi');
      }
    } catch (e) {
      return { success: false, output: `Invalid search pattern: ${query}. Error: ${(e as Error).message}` };
    }

    // Get file tree
    const tree = await (window as any).electron.readProjectFiles(targetPath, context.projectRoot);
    
    interface SearchResult {
      file: string;
      line: number;
      column: number;
      match: string;
      context: string;
    }
    
    const results: SearchResult[] = [];
    let totalMatches = 0;
    
    // Collect files matching filename pattern
    const collectFiles = (nodes: any[]): string[] => {
      let files: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file') {
          if (!filenamePattern || matchesFilenamePattern(node.name, filenamePattern)) {
            files.push(node.path);
          }
        } else if (node.children) {
          files = files.concat(collectFiles(node.children));
        }
      }
      return files;
    };
    
    function matchesFilenamePattern(filename: string, pattern: string): boolean {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`, caseSensitive ? '' : 'i');
      return regex.test(filename);
    }
    
    const allFiles = collectFiles(tree);
    
    // Search each file
    for (const filePath of allFiles) {
      if (totalMatches >= maxResults) break;
      
      try {
        const content = await (window as any).electron.readFileContent(filePath, context.projectRoot);
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (totalMatches >= maxResults) break;
          
          const line = lines[i];
          searchRegex.lastIndex = 0; // Reset regex state
          
          let match;
          while ((match = searchRegex.exec(line)) !== null && totalMatches < maxResults) {
            const startLine = Math.max(0, i - contextLines);
            const endLine = Math.min(lines.length, i + contextLines + 1);
            const contextLinesArray = lines.slice(startLine, endLine);
            
            const context = contextLinesArray
              .map((l: string, idx: number) => {
                const lineNum = startLine + idx + 1;
                const marker = idx === (i - startLine) ? '>>>' : '   ';
                return `${marker} ${lineNum}: ${l}`;
              })
              .join('\n');
            
            results.push({
              file: filePath,
              line: i + 1,
              column: match.index + 1,
              match: match[0],
              context
            });
            
            totalMatches++;
          }
        }
      } catch (e) {
        // Skip files that can't be read
        console.warn(`[search] Failed to read file: ${filePath}`);
      }
    }
    
    if (results.length === 0) {
      return { 
        success: true, 
        output: `No matches found for "${query}" in ${targetPath}${filenamePattern ? ` (files matching: ${filenamePattern})` : ''}.` 
      };
    }
    
    // Format output with structured results
    const output = results.map((result, idx) => {
      return `╭─ Match #${idx + 1} ─────────────────────────────────────────────────────╮
│ File: ${result.file.padEnd(55)} │
│ Line: ${result.line.toString().padStart(4)} | Column: ${result.column.toString().padStart(3)} | Match: "${result.match}" │
╰────────────────────────────────────────────────────────────────────╯
${result.context}`;
    }).join('\n\n');
    
    let footer = '';
    if (totalMatches >= maxResults) {
      footer = `\n\n╭─────────────────────────────────────────────────────────────────╮
│ ⚠ RESULTS TRUNCATED - Reached maximum ${maxResults} matches              │
│ Try narrowing your search or increase maxResults parameter.       │
╰─────────────────────────────────────────────────────────────────╯`;
    }
    
    return { 
      success: true, 
      output: output + footer,
      metadata: {
        totalMatches,
        query,
        path: targetPath,
        filenamePattern,
        truncated: totalMatches >= maxResults
      }
    };
  } catch (error: any) {
    return { success: false, output: `Search failed: ${error.message || String(error)}` };
  }
};
