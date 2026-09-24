import { ToolDefinition, ToolHandler, ToolResult } from '../types';
import { calculateLineChanges } from '../../incrementalToolCallParser';
import { getImplementationPlanPath } from '../planModePolicy';

export const definition: ToolDefinition = {
  name: 'editFile',
  description: 'Edit files using exact anchor-based replacement or insertion. Read the file first to identify unique anchors. Supports replace (substitute anchor), before/after (insert while preserving anchor). For large files, add one logical section per response with stable anchors for continuation. Supports absolute and project-relative paths.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative like "src/lib/utils.ts" or absolute like "/full/path/to/file.ts").' },
      search: { type: 'string', description: 'Exact, unique anchor string to search for. Must exist in the file.' },
      replace: { type: 'string', description: 'Replacement content (for replace) or content to insert (for before/after).' },
      operation: {
        type: 'string',
        enum: ['replace', 'before', 'after'],
        description: 'Operation: replace substitutes the anchor; before/after inserts content while preserving the anchor. Default: replace.'
      },
      expectedMatches: {
        type: 'number',
        description: 'Expected number of exact anchor matches. Default: 1. Use >1 only when intentionally editing all occurrences.'
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
    const rawSearch = args.search ?? args.find ?? args.target ?? args.TargetContent ?? args.anchor;
    const rawReplace = args.replace ?? args.replacement ?? args.ReplacementContent ?? args.content;
    
    let search = typeof rawSearch === 'string' ? rawSearch : String(rawSearch ?? '');
    let replace = typeof rawReplace === 'string' ? rawReplace : String(rawReplace ?? '');
    
    if (!relativeOrAbsPath) {
      return { success: false, output: `Failed to edit file: Missing 'path' parameter.\n\nArguments received:\n${JSON.stringify(args, null, 2)}` };
    }

    const isPlanArtifact = context.interactionMode === 'plan';
    const targetPath = isPlanArtifact
      ? getImplementationPlanPath(context)
      : relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath)
        ? relativeOrAbsPath
        : (context.projectRoot ? `${context.projectRoot}/${relativeOrAbsPath}` : relativeOrAbsPath).replace(/\/+/g, '/');
    const boundaryRoot = isPlanArtifact
      ? ((window as any).electron.appDataDir || context.projectRoot)
      : context.projectRoot;
      
    const content = await (window as any).electron.readFileContent(targetPath, boundaryRoot);
    
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
    
    let newContent = '';
    let matchCount = 0;

    if (fileContent.includes(finalSearch)) {
      matchCount = fileContent.split(finalSearch).length - 1;
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
      newContent = fileContent.split(finalSearch).join(replacement);
    } else {
      // 🚀 SPECULATIVE DIFFING ENGINE (Fuzzy Fallback) 🚀
      // If exact string match fails due to whitespace or LLM hallucination, 
      // we use a fuzzy line-matcher that ignores indentation and supports `// ...` wildcards.
      const fuzzyResult = fuzzyMatchAndReplace(fileContent, finalSearch, finalReplace, operation);
      if (!fuzzyResult.success) {
        return { 
          success: false, 
          output: `Search anchor was not found in ${targetPath} (Exact match failed, and Speculative Fuzzy match failed: ${fuzzyResult.error}). Read the current file and retry with a more accurate anchor.` 
        };
      }
      newContent = fuzzyResult.newContent!;
      matchCount = 1; // Fuzzy matcher guarantees exactly 1 match
    }

    const result = await (window as any).electron.saveFileContent(targetPath, newContent, { projectRoot: boundaryRoot });
    
    if (result.success) {
      const { added, removed } = calculateLineChanges(content, newContent);
      return { 
        success: true, 
        output: `Successfully ${operation === 'replace' ? 'edited' : `inserted content ${operation}`} ${targetPath} (${matchCount} anchor match${matchCount === 1 ? '' : 'es'}).${!fileContent.includes(finalSearch) ? ' (Applied via Speculative Fuzzy Diffing)' : ''}`,
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

// --- Speculative Diffing Engine ---
function fuzzyMatchAndReplace(fileContent: string, search: string, replace: string, operation: string): { success: boolean, newContent?: string, error?: string } {
    const fileLines = fileContent.split(/\r?\n/);
    const searchLines = search.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // Tokenize search lines into Literal and Wildcard
    const tokens = searchLines.map(line => {
        const isWildcard = /^(\/\/|#|\/\*|<!--)?\s*\.\.\.\s*(\*\/|-->)?$/.test(line);
        return { type: isWildcard ? 'wildcard' : 'literal', text: line };
    });

    if (!tokens.some(t => t.type === 'literal')) {
         return { success: false, error: "Search block contains only wildcards or is empty." };
    }

    const matches: { start: number, end: number, originalIndent: string }[] = [];

    function searchFrom(fileIdx: number, tokenIdx: number): number | null {
        if (tokenIdx >= tokens.length) return fileIdx - 1;
        const token = tokens[tokenIdx];
        
        if (token.type === 'literal') {
            while (fileIdx < fileLines.length && fileLines[fileIdx].trim().length === 0) fileIdx++;
            if (fileIdx >= fileLines.length || fileLines[fileIdx].trim() !== token.text) return null;
            return searchFrom(fileIdx + 1, tokenIdx + 1);
        } else {
            const nextLiteralIdx = tokens.findIndex((t, i) => i > tokenIdx && t.type === 'literal');
            if (nextLiteralIdx === -1) return fileIdx - 1; // Trailing wildcard
            
            const nextLiteral = tokens[nextLiteralIdx];
            for (let nextFileIdx = fileIdx; nextFileIdx < fileLines.length; nextFileIdx++) {
                if (fileLines[nextFileIdx].trim() === nextLiteral.text) {
                    const res = searchFrom(nextFileIdx, nextLiteralIdx);
                    if (res !== null) return res;
                }
            }
            return null;
        }
    }

    for (let i = 0; i < fileLines.length; i++) {
        const firstToken = tokens.find(t => t.type === 'literal');
        if (!firstToken) break;
        if (fileLines[i].trim() === firstToken.text) {
            const endIdx = searchFrom(i, tokens.findIndex(t => t === firstToken));
            if (endIdx !== null) {
                const indentMatch = fileLines[i].match(/^\s*/);
                matches.push({ start: i, end: endIdx, originalIndent: indentMatch ? indentMatch[0] : '' });
            }
        }
    }

    if (matches.length === 0) return { success: false, error: "No matching block found in file." };
    if (matches.length > 1) return { success: false, error: `Found ${matches.length} ambiguous matches.` };

    const { start, end, originalIndent } = matches[0];
    
    // Auto-indent the replacement block
    const replaceLines = replace.split(/\r?\n/);
    const minReplaceIndent = replaceLines.filter(l => l.trim().length > 0)
        .reduce((min, l) => Math.min(min, l.match(/^\s*/)?.[0].length || 0), Infinity);
    
    let adjustedReplaceLines = replaceLines;
    if (minReplaceIndent !== Infinity && minReplaceIndent < originalIndent.length) {
        const padding = ' '.repeat(originalIndent.length - minReplaceIndent);
        adjustedReplaceLines = replaceLines.map(l => l.trim().length > 0 ? padding + l : l);
    }

    let replacementLines = [];
    if (operation === 'before') {
        replacementLines = [...adjustedReplaceLines, ...fileLines.slice(start, end + 1)];
    } else if (operation === 'after') {
        replacementLines = [...fileLines.slice(start, end + 1), ...adjustedReplaceLines];
    } else {
        replacementLines = adjustedReplaceLines;
    }

    const newContentLines = [
        ...fileLines.slice(0, start),
        ...replacementLines,
        ...fileLines.slice(end + 1)
    ];

    return { success: true, newContent: newContentLines.join('\n') };
}



