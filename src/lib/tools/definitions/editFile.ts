import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'editFile',
  description: 'Edit a file by finding a specific string and replacing it.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      search: { type: 'string', description: 'Exact string to search for' },
      replace: { type: 'string', description: 'String to replace it with' }
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
    
    // Check if the agent passed a regex like "/pattern/g" or "s/pattern/replacement/g"
    let isRegex = false;
    let regexObj: RegExp | null = null;
    
    if (!fileContent.includes(finalSearch) && finalSearch) {
      let regexPattern = '';
      let regexFlags = '';
      
      if (finalSearch.startsWith('/') && finalSearch.lastIndexOf('/') > 0) {
        const lastSlash = finalSearch.lastIndexOf('/');
        regexPattern = finalSearch.substring(1, lastSlash);
        regexFlags = finalSearch.substring(lastSlash + 1);
      } else if (finalSearch.startsWith('s/') && finalSearch.lastIndexOf('/') > 1) {
        // If they passed `s/hi/world/g` in the search field
        const parts = finalSearch.split('/');
        if (parts.length >= 3) {
          regexPattern = parts[1];
          finalReplace = parts[2];
          regexFlags = parts[3] || '';
        }
      }
      
      if (regexPattern) {
        try {
          if (!regexFlags.includes('g')) regexFlags += 'g';
          regexObj = new RegExp(regexPattern, regexFlags);
          // Check if regex matches empty string, which causes severe corruption
          if ("".match(regexObj)) {
             return { success: false, output: `Failed to edit file: The provided regex \`${regexPattern}\` matches empty strings and would corrupt the file. Please provide a more specific search string.` };
          }
          isRegex = true;
        } catch (e) {
          // ignore invalid regex
        }
      }
    }

    if (!isRegex && !fileContent.includes(finalSearch)) {
      return { 
        success: false, 
        output: `Search string not found in ${targetPath}.\n\nTried to search for: [\`${search}\`].\n\nArguments received:\n${JSON.stringify(args, null, 2)}\n\nPlease check your spelling, whitespace, quotes, and newlines.` 
      };
    }
    
    // Use split and join to globally replace all occurrences of the search string
    let newContent = content;
    if (isRegex && regexObj) {
      newContent = fileContent.replace(regexObj, finalReplace);
    } else {
      newContent = fileContent.split(finalSearch).join(finalReplace);
    }
    const result = await (window as any).electron.saveFileContent(targetPath, newContent);
    
    if (result.success) {
      return { 
        success: true, 
        output: `Successfully edited ${targetPath}`,
        artifacts: [{
          type: 'diff',
          path: targetPath,
          original: content,       // Store original so undo can restore it
          diff: `--- ${targetPath}\n+++ ${targetPath}\n- ${search}\n+ ${replace}` // Simplified diff
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
