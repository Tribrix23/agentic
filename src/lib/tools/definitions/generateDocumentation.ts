import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'generateDocumentation',
  description: 'Generate documentation from code comments and structure.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file or directory' },
      format: { type: 'string', description: 'Output format (markdown, html)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 20000,
  icon: 'FileText'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, format = 'markdown' } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    const tree = await (window as any).electron.readProjectFiles(targetPath);
    
    const collectFiles = (nodes: any[]): string[] => {
      let files: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file') {
          files.push(node.path);
        } else if (node.children) {
          files = files.concat(collectFiles(node.children));
        }
      }
      return files;
    };
    
    const allFiles = collectFiles(tree);
    let documentation = `# Documentation\n\nGenerated from: ${targetPath}\n\n`;
    
    for (const filePath of allFiles) {
      try {
        const content = await (window as any).electron.readFileContent(filePath);
        const fileName = filePath.split('/').pop();
        
        documentation += `## ${fileName}\n\n`;
        
        // Extract comments and function signatures
        const lines = content.split('\n');
        let inComment = false;
        let commentBlock: string[] = [];
        
        for (const line of lines) {
          // Detect multi-line comments
          if (line.includes('/*')) inComment = true;
          if (inComment) {
            commentBlock.push(line.replace(/\/\*|\*\//g, '').trim());
            if (line.includes('*/')) {
              inComment = false;
              if (commentBlock.length > 0) {
                documentation += commentBlock.join(' ') + '\n\n';
              }
              commentBlock = [];
            }
            continue;
          }
          
          // Detect single-line comments
          if (line.trim().startsWith('//')) {
            documentation += line.trim().substring(2) + '\n';
          }
          
          // Detect function/class definitions
          if (line.match(/(function|class|const|let|var)\s+\w+/)) {
            documentation += `\n\`${line.trim()}\`\n\n`;
          }
        }
        
        documentation += '\n---\n\n';
      } catch (e) {
        // Skip unreadable files
      }
    }
    
    return { success: true, output: documentation };
  } catch (error: any) {
    return { success: false, output: `Failed to generate documentation: ${error.message || String(error)}` };
  }
};
