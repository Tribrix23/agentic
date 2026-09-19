import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

export function setupFileSystemTools(registerTool: (def: any, handler: any) => void) {
  // 1. readFile
  registerTool(
    {
      name: "readFile",
      description: "Read the contents of a file in the project. Use startLine and endLine to read specific portions.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          startLine: { type: "number", description: "1-indexed start line (inclusive)" },
          endLine: { type: "number", description: "1-indexed end line (inclusive)" },
        },
        required: ["path"],
      },
    },
    async (args: { path: string; startLine?: number; endLine?: number }) => {
      const content = await fs.readFile(args.path, "utf-8");
      
      if (args.startLine !== undefined || args.endLine !== undefined) {
        const lines = content.split('\n');
        const start = args.startLine ? Math.max(1, args.startLine) - 1 : 0;
        const end = args.endLine ? Math.min(lines.length, args.endLine) : lines.length;
        
        return lines.slice(start, end)
          .map((line, i) => `${start + i + 1}: ${line}`)
          .join('\n');
      }
      
      return content;
    }
  );

  // 2. writeFile
  registerTool(
    {
      name: "writeFile",
      description: "Write content to a file (overwrites entire file)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
    async (args: { path: string; content: string }) => {
      await fs.mkdir(path.dirname(args.path), { recursive: true });
      await fs.writeFile(args.path, args.content, "utf-8");
      return `Successfully wrote to ${args.path}`;
    }
  );

  // 3. editFile
  registerTool(
    {
      name: "editFile",
      description: "Surgically replace a contiguous block of lines in an existing file. TargetContent MUST precisely match the existing content in the file.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          startLine: { type: "number", description: "Start line number of the block to replace" },
          endLine: { type: "number", description: "End line number of the block to replace" },
          targetContent: { type: "string", description: "The exact content to be replaced" },
          replacementContent: { type: "string", description: "The new content to insert" },
        },
        required: ["path", "startLine", "endLine", "targetContent", "replacementContent"],
      },
    },
    async (args: { path: string; startLine: number; endLine: number; targetContent: string; replacementContent: string }) => {
      const content = await fs.readFile(args.path, "utf-8");
      const lines = content.split('\n');
      
      const startIdx = Math.max(0, args.startLine - 1);
      const endIdx = Math.min(lines.length, args.endLine);
      
      const currentBlock = lines.slice(startIdx, endIdx).join('\n');
      
      // Simple validation to ensure we're replacing what we think we are replacing
      if (currentBlock.trim() !== args.targetContent.trim()) {
        throw new Error(`Target content mismatch. Expected:\n${args.targetContent}\n\nBut found:\n${currentBlock}`);
      }
      
      const newLines = [...lines.slice(0, startIdx), args.replacementContent, ...lines.slice(endIdx)];
      await fs.writeFile(args.path, newLines.join('\n'), "utf-8");
      
      return `Successfully edited ${args.path}`;
    }
  );

  // 4. grepSearch
  registerTool(
    {
      name: "grepSearch",
      description: "Search for a string or regex pattern across files in a directory",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory to search in" },
          query: { type: "string", description: "The string or regex pattern to search for" },
          isRegex: { type: "boolean", description: "Whether the query is a regex" },
        },
        required: ["path", "query"],
      },
    },
    async (args: { path: string; query: string; isRegex?: boolean }) => {
      const results: string[] = [];
      const regex = args.isRegex ? new RegExp(args.query, 'g') : null;
      
      async function walk(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
            await walk(fullPath);
          } else {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (regex ? regex.test(line) : line.includes(args.query)) {
                  results.push(`${fullPath}:${i + 1}: ${line.trim()}`);
                  if (results.length >= 100) return; // Cap at 100 results
                }
              }
            } catch (e) {
              // Ignore binary files or unreadable files
            }
          }
        }
      }
      
      await walk(args.path);
      return results.length > 0 ? results.join('\n') : "No matches found.";
    }
  );

  // 5. listDirectory
  registerTool(
    {
      name: "listDirectory",
      description: "List contents of a directory",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the directory" },
        },
        required: ["path"],
      },
    },
    async (args: { path: string }) => {
      const files = await fs.readdir(args.path, { withFileTypes: true });
      return files
        .map((f: any) => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`)
        .join("\n");
    }
  );
}
