import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'listDirectory',
  description: 'List contents of a directory in a tree format. Use "." for the project root.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path from the project root (e.g. "." or "app/agentic" or "src/components"). Do NOT prefix with "./" or "/".' },
      depth: { type: 'number', description: 'Maximum depth to traverse (default 2, max 4)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'FolderTree'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relPath = '.', depth = 2 } = args;
    const maxDepth = Math.min(Number(depth) || 2, 4);

    // ── Path resolution ─────────────────────────────────────────────────
    // If already absolute, use as-is. Otherwise join with project root.
    // Normalize to forward slashes for readProjectFiles (Electron IPC).
    let targetPath: string;
    const isAbsolute = relPath.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(relPath);
    if (isAbsolute) {
      targetPath = relPath.replace(/\\/g, '/');
    } else {
      // Strip leading ./ or / from relative path
      const cleaned = relPath.replace(/^\.\//, '').replace(/^\//, '');
      const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
      targetPath = cleaned === '.' ? root : `${root}/${cleaned}`;
    }

    const tree = await (window as any).electron.readProjectFiles(targetPath);

    // ── Format tree ─────────────────────────────────────────────────────
    // depth starts at 0 for top-level entries.
    // When depth === maxDepth and the node is a folder with children,
    // show '...' ONCE for that folder rather than recursing.
    const formatTree = (nodes: any[], currentDepth: number, prefix: string = ''): string => {
      if (!Array.isArray(nodes) || nodes.length === 0) return '';

      let result = '';
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        const label = node.name + (node.type === 'folder' ? '/' : '');

        result += `${prefix}${connector}${label}\n`;

        if (node.type === 'folder' && Array.isArray(node.children)) {
          if (currentDepth < maxDepth - 1) {
            result += formatTree(node.children, currentDepth + 1, prefix + childPrefix);
          } else if (node.children.length > 0) {
            // At max depth, just note there is more content
            result += `${prefix}${childPrefix}...\n`;
          }
        }
      }
      return result;
    };

    const output = formatTree(tree, 0).trimEnd();

    // Build the response so the AI gets a definitive, clear answer
    const resolvedNote = `Path: ${targetPath}`;
    if (!output) {
      return {
        success: true,
        output: `${resolvedNote}\nResult: This directory is EMPTY (contains no files or folders).`
      };
    }

    return {
      success: true,
      output: `${resolvedNote}\n${output}`
    };
  } catch (error: any) {
    const msg = error?.message || String(error);
    // Give the AI enough info to correct itself
    return {
      success: false,
      output: `Directory not found or inaccessible. Error: ${msg}\nHINT: Make sure the path is relative to the project root (e.g. "app/agentic", not "agentic"). Use listDirectory(".") to see the root.`
    };
  }
};
