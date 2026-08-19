import { ToolDefinition, ToolHandler, ToolResult } from '../types';
import { calculateLineChanges } from '../../incrementalToolCallParser';

export const definition: ToolDefinition = {
  name: 'editFile',
  description: 'Edit an existing file using one exact, unique anchor. Replace the anchor, or insert content immediately before or after it. Read the file first. When continuing a large generated file, add exactly one logical section per response and preserve an anchor for the next section. For HTML, insert before </body> or another stable structural anchor; never append blindly or resend the complete file.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      search: { type: 'string', description: 'Exact, unique anchor string to search for' },
      replace: { type: 'string', description: 'Replacement or inserted content' },
      operation: {
        type: 'string',
        enum: ['replace', 'before', 'after'],
        description: 'replace substitutes the anchor; before/after inserts content while preserving the anchor. Defaults to replace.'
      },
      expectedMatches: {
        type: 'number',
        description: 'Required number of exact anchor matches. Defaults to 1. Use a value above 1 only when intentionally editing every matching occurrence.'
      }
    },
    required: ['path', 'search', 'replace']
  },
  requiresApproval: false,
  dangerLevel: 'dangerous',
  timeout: 30000,
  icon: 'FileEdit'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relativeOrAbsPath } = args;
    const operation = args.operation === 'before' || args.operation === 'after' ? args.operation : 'replace';
    const expectedMatches = Number.isInteger(args.expectedMatches) && args.expectedMatches > 0
      ? args.expectedMatches
      : 1;
    
    // Explicitly coerce to strings to avoid "Cannot read properties of undefined (reading 'replace')"
    // Fallback to common hallucinated property names for maximum robustness against agent mistakes
    const rawSearch = args.search ?? args.find ?? args.target ?? args.TargetContent;
    const rawReplace = args.replace ?? args.replacement ?? args.ReplacementContent;
    
    let search = typeof rawSearch === 'string' ? rawSearch : String(rawSearch ?? '');
    let replace = typeof rawReplace === 'string' ? rawReplace : String(rawReplace ?? '');
    
    if (!relativeOrAbsPath) {
      return { success: false, output: `Failed to edit file: Missing 'path' parameter.\n\nArguments received:\n${JSON.stringify(args, null, 2)}` };
    }

    const targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
      ? relativeOrAbsPath 
      : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
      
    const content = await (window as any).electron.readFileContent(targetPath);
    
    let finalSearch = search;
    let finalReplace = replace;
    let fileContent = content;

    if (!finalSearch) {
      return { 
        success: false, 
        output: `Failed to edit file: The 'search' parameter is empty or missing. You must provide the exact string to search for.\n\nArguments received:\n${JSON.stringify(args, null, 2)}` 
      };
    }

    // Normalize line endings to \n for consistent matching
    if (!fileContent.includes(finalSearch) && finalSearch) {
      finalSearch = finalSearch.replace(/\r\n/g, '\n');
      fileContent = fileContent.replace(/\r\n/g, '\n');
    }
    
    if (!fileContent.includes(finalSearch)) {
      return { 
        success: false, 
        output: `Search anchor was not found in ${targetPath}. Read the current file and retry with an exact structural anchor.` 
      };
    }

    const matchCount = fileContent.split(finalSearch).length - 1;
    if (matchCount !== expectedMatches) {
      return {
        success: false,
        output: `Refusing to edit ${targetPath}: expected ${expectedMatches} exact match(es) for the anchor but found ${matchCount}. Use a more specific anchor or set expectedMatches intentionally.`,
      };
    }

    const replacement = operation === 'before'
      ? `${finalReplace}${finalSearch}`
      : operation === 'after'
        ? `${finalSearch}${finalReplace}`
        : finalReplace;
    const newContent = fileContent.split(finalSearch).join(replacement);
    const result = await (window as any).electron.saveFileContent(targetPath, newContent);
    
    if (result.success) {
      const { added, removed } = calculateLineChanges(content, newContent);
      return { 
        success: true, 
        output: `Successfully ${operation === 'replace' ? 'edited' : `inserted content ${operation}`} ${targetPath} (${matchCount} anchor match${matchCount === 1 ? '' : 'es'}).`,
        artifacts: [{
          type: 'file_change',
          path: targetPath,
          content: newContent,
          added,
          removed
        }]
      };
    } else {
      return { success: false, output: `Failed to edit file: ${result.error}\n\nArguments received:\n${JSON.stringify(args, null, 2)}` };
    }
  } catch (error: any) {
    let argsDump = "Unable to stringify args.";
    try {
      argsDump = JSON.stringify(args, null, 2);
    } catch (e) {}
    
    return { success: false, output: `Failed to edit file: ${error.message || String(error)}\n\nArguments received:\n${argsDump}` };
  }
};
