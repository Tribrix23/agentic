import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'readFile',
  description: 'Read the contents of a file in the project. Always returns a header showing total lines and chars. For files over 500 lines, returns the first 500 lines by default with a footer telling you the exact startLine/endLine to use for the next chunk. Use startLine/endLine to read any specific section.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file relative to project root (e.g. "next.config.ts" or "src/lib/utils.ts"). Do NOT add "./" prefix.' },
      startLine: { type: 'number', description: 'Start line to read from, 1-indexed (inclusive). Use this to paginate large files.' },
      endLine: { type: 'number', description: 'End line to read to, 1-indexed (inclusive). Combine with startLine to read any chunk.' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'FileText'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relPath, startLine, endLine } = args;

    if (!relPath) {
      return { success: false, output: 'Missing required argument: path. Provide the file path relative to the project root.' };
    }

    const isAbsolute = relPath.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(relPath);
    let targetPath: string;
    if (isAbsolute) {
      targetPath = relPath.replace(/\\/g, '/');
    } else {
      const cleaned = relPath.replace(/^\.\//, '').replace(/^\//, '');
      const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
      targetPath = `${root}/${cleaned}`;
    }

    const raw = await (window as any).electron.readFileContent(targetPath);
    const content = typeof raw === 'string' ? raw : (raw ?? '');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const totalChars = content.length;

    let outputLines = lines;
    let start = 0;
    let end = totalLines;

    if (startLine !== undefined || endLine !== undefined) {
      start = Math.max(0, (startLine ?? 1) - 1);
      end = endLine ?? totalLines;
      outputLines = lines.slice(start, end);
    } else if (totalLines > 500) {
      // Default pagination for large files
      end = 500;
      outputLines = lines.slice(0, 500);
    }

    let output = outputLines.join('\n');
    const header = `--- File: ${relPath} | Lines: ${totalLines} | Chars: ${totalChars} | Showing: ${start + 1}-${end} ---\n`;
    
    let footer = '';
    if (end < totalLines) {
      footer = `\n--- End of chunk. Next chunk: startLine=${end + 1}, endLine=${Math.min(end + 500, totalLines)} ---`;
    }

    return { success: true, output: header + output + footer };
  } catch (error: any) {
    return { success: false, output: `Failed to read file: ${error?.message || String(error)}\nHINT: Make sure the path is relative to the project root.` };
  }
};
