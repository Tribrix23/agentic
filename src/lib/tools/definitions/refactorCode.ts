import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'refactorCode',
  description: 'Suggest code refactoring improvements using AI analysis.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file to analyze' },
      focus: { type: 'string', description: 'Focus area (performance, readability, security, all)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 25000,
  icon: 'RefreshCw'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, focus = 'all' } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    const content = await (window as any).electron.readFileContent(targetPath, context.projectRoot);
    const suggestions: string[] = [];
    
    // Basic static analysis
    const lines = content.split('\n');
    
    // Check for long functions
    let currentFunction: string[] = [];
    let functionName = '';
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect function start
      const funcMatch = line.match(/(function|const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (funcMatch) {
        functionName = funcMatch[2];
        currentFunction = [];
        braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      } else if (functionName) {
        currentFunction.push(line);
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        
        if (braceCount === 0) {
          if (currentFunction.length > 50) {
            suggestions.push(`Function "${functionName}" is too long (${currentFunction.length} lines). Consider breaking it down.`);
          }
          functionName = '';
          currentFunction = [];
        }
      }
    }
    
    // Check for console.log statements
    const consoleLogs = content.match(/console\.log/g);
    if (consoleLogs && consoleLogs.length > 5) {
      suggestions.push(`Found ${consoleLogs.length} console.log statements. Consider removing or replacing with proper logging.`);
    }
    
    // Check for TODO comments
    const todos = content.match(/TODO|FIXME|HACK/g);
    if (todos) {
      suggestions.push(`Found ${todos.length} TODO/FIXME comments that should be addressed.`);
    }
    
    // Check for deeply nested code
    for (let i = 0; i < lines.length; i++) {
      const indent = lines[i].search(/\S/);
      if (indent > 12) {
        suggestions.push(`Line ${i + 1}: Deep nesting detected (indent level ${indent / 2}). Consider refactoring.`);
        break;
      }
    }
    
    // Check for duplicate code (simple check)
    const lineMap = new Map<string, number>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 20) {
        lineMap.set(trimmed, (lineMap.get(trimmed) || 0) + 1);
      }
    }
    
    for (const [line, count] of lineMap.entries()) {
      if (count > 3) {
        suggestions.push(`Duplicate code detected (appears ${count} times): "${line.substring(0, 50)}..."`);
        break;
      }
    }
    
    if (suggestions.length === 0) {
      return { success: true, output: 'No obvious refactoring opportunities found. Code looks good!' };
    }
    
    return { success: true, output: `Refactoring suggestions:\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}` };
  } catch (error: any) {
    return { success: false, output: `Failed to analyze code: ${error.message || String(error)}` };
  }
};
