"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupFileSystemTools = setupFileSystemTools;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
function setupFileSystemTools(registerTool) {
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
//# sourceMappingURL=filesystem.js.map