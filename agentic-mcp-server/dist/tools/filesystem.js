import * as fs from "fs/promises";
import * as path from "path";
export function setupFileSystemTools(registerTool) {
    // 1. readFile
    registerTool({
        name: "readFile",
        description: "Read the contents of a file in the project",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the file" },
            },
            required: ["path"],
        },
    }, async (args) => {
        const content = await fs.readFile(args.path, "utf-8");
        return content;
    });
    // 2. writeFile
    registerTool({
        name: "writeFile",
        description: "Write content to a file",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the file" },
                content: { type: "string", description: "Content to write" },
            },
            required: ["path", "content"],
        },
    }, async (args) => {
        await fs.mkdir(path.dirname(args.path), { recursive: true });
        await fs.writeFile(args.path, args.content, "utf-8");
        return `Successfully wrote to ${args.path}`;
    });
    // 3. listDirectory
    registerTool({
        name: "listDirectory",
        description: "List contents of a directory",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the directory" },
            },
            required: ["path"],
        },
    }, async (args) => {
        const files = await fs.readdir(args.path, { withFileTypes: true });
        return files
            .map((f) => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`)
            .join("\n");
    });
}
