import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'readFile',
  description: 'Read file contents with intelligent pagination. For files >5000 lines, automatically paginates with clear continuation instructions. Use startLine/endLine for precise ranges or to continue reading truncated files. Supports absolute paths and project-relative paths. Optimized for large files with smart context detection.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file (relative to project root like "src/lib/utils.ts" or absolute like "/Users/name/project/file.ts"). Do NOT use "./" prefix for relative paths.' },
      startLine: { type: 'number', description: 'Start line number (1-indexed, inclusive). Use for pagination or reading specific sections.' },
      endLine: { type: 'number', description: 'End line number (1-indexed, inclusive). Required when using startLine for precise ranges.' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'FileText'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relPath, startLine, endLine } = args;

    if (!relPath) {
      return { success: false, output: 'Missing required argument: path. Provide the file path relative to the project root.' };
    }

    // Normalize path handling
    const isAbsolute = relPath.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(relPath);
    let targetPath: string;
    if (isAbsolute) {
      targetPath = relPath.replace(/\\/g, '/');
    } else {
      const cleaned = relPath.replace(/^\.\//, '').replace(/^\//, '');
      const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
      targetPath = `${root}/${cleaned}`;
    }

    // Intelligent file type detection
    const fileExtension = targetPath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'ts': 'TypeScript', 'tsx': 'TypeScript (React)', 'js': 'JavaScript', 'jsx': 'JavaScript (React)',
      'py': 'Python', 'rb': 'Ruby', 'go': 'Go', 'rs': 'Rust', 'java': 'Java',
      'c': 'C', 'cpp': 'C++', 'h': 'C Header', 'hpp': 'C++ Header',
      'cs': 'C#', 'php': 'PHP', 'swift': 'Swift', 'kt': 'Kotlin',
      'scala': 'Scala', 'dart': 'Dart', 'lua': 'Lua', 'r': 'R',
      'sql': 'SQL', 'sh': 'Shell', 'bash': 'Bash', 'zsh': 'Zsh',
      'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'sass': 'Sass',
      'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'yml': 'YAML',
      'toml': 'TOML', 'ini': 'INI', 'conf': 'Config', 'md': 'Markdown',
      'txt': 'Plain Text', 'csv': 'CSV', 'tsv': 'TSV'
    };
    const detectedLanguage = languageMap[fileExtension] || 'Unknown';

    // Smart chunk size based on file type and size
    const DEFAULT_CHUNK_SIZE = 5000; // Increased from 500 to 5000 for much larger reads
    const MAX_CHUNK_SIZE = 10000; // Maximum chunk size for very large files
    
    // Validate and normalize line numbers with intelligent chunking
    const requestedStart = Math.max(1, Math.floor(startLine ?? 1));
    let requestedEnd = Math.max(requestedStart, Math.floor(endLine ?? (requestedStart + DEFAULT_CHUNK_SIZE - 1)));
    
    // Cap the chunk size to prevent overwhelming responses
    if (requestedEnd - requestedStart > MAX_CHUNK_SIZE) {
      requestedEnd = requestedStart + MAX_CHUNK_SIZE;
    }
    
    // Read file range with improved error handling
    const range = await (window as any).electron.readFileRange(targetPath, requestedStart, requestedEnd, context.projectRoot);
    if (!range?.success) {
      throw new Error(range?.error || 'Range read failed');
    }

    // Simple header with essential info only
    const header = `// File: ${relPath} | Lines: ${range.totalLines} | Bytes: ${range.totalBytes} | Showing: ${range.startLine}-${range.endLine}\n`;
    
    // Smart footer with continuation instructions - only if actually truncated
    let footer = '';
    const actuallyTruncated = range.hasMore && range.endLine < range.totalLines;
    
    if (actuallyTruncated) {
      const nextStart = range.nextStartLine;
      const nextEnd = Math.min(nextStart + DEFAULT_CHUNK_SIZE - 1, range.totalLines);
      const remainingLines = range.totalLines - range.endLine;
      footer = `\n// [CONTENT TRUNCATED: ${remainingLines} more lines] Continue with startLine=${nextStart}, endLine=${nextEnd}`;
    } else if (range.startLine > 1) {
      // The file was not truncated at the end, but the user started reading from the middle.
      footer = `\n// [NOTE: You read a middle chunk (lines ${range.startLine}-${range.endLine}) of a ${range.totalLines}-line file. The file is small enough to read completely if startLine=1 is used.]`;
    }

    return { 
      success: true, 
      output: header + range.content + footer, 
      truncated: actuallyTruncated,
      metadata: {
        totalLines: range.totalLines,
        totalBytes: range.totalBytes,
        showing: { start: range.startLine, end: range.endLine },
        hasMore: actuallyTruncated,
        language: detectedLanguage,
        fileType: fileExtension
      }
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    return { 
      success: false, 
      output: `Failed to read file: ${errorMsg}\n\nHINT: Verify the path is correct. Use relative paths like "src/lib/utils.ts" or absolute paths like "/full/path/to/file.ts".` 
    };
  }
};
