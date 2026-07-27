import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'readFile',
  description: 'Read the contents of a file in the project.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file relative to project root (e.g. "next.config.ts" or "src/lib/utils.ts"). Do NOT add "./" prefix.' },
      startLine: { type: 'number', description: 'Optional start line (1-indexed)' },
      endLine: { type: 'number', description: 'Optional end line (1-indexed)' }
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

    // ── Path resolution (same as listDirectory) ────────────────────────
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

    // Keep raw content verbatim, do not strip HTML tags
    const content = typeof raw === 'string' ? raw : (raw ?? '');

    if (!content.trim()) {
      return { success: true, output: '(File is empty)' };
    }

    let output = content;
    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split('\n');
      const start = Math.max(0, (startLine ?? 1) - 1);
      const end = endLine ?? lines.length;
      output = lines.slice(start, end).join('\n');
    }

    // CRITICAL: Add warning for HTML files to prevent tool call confusion
    if (relPath.endsWith('.html') || relPath.endsWith('.htm') || relPath.endsWith('.css') || relPath.endsWith('.js')) {
      console.log(`[readFile] Read ${relPath} (${content.length} chars). This is file content for reference only - NOT tool calls.`);
    }

    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Failed to read file: ${error?.message || String(error)}\nHINT: Make sure the path is relative to the project root (e.g. "next.config.ts" not "./next.config.ts").` };
  }
};
