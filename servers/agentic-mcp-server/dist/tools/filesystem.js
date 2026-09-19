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
function setupFileSystemTools(registerTool) {
    // 1. readFile
    // 2. writeFile
    // 3. editFile
    // 4. grepSearch
    registerTool({
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
    }, async (args) => {
        const results = [];
        const regex = args.isRegex ? new RegExp(args.query, 'g') : null;
        async function walk(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist')
                        continue;
                    await walk(fullPath);
                }
                else {
                    try {
                        const content = await fs.readFile(fullPath, "utf-8");
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (regex ? regex.test(line) : line.includes(args.query)) {
                                results.push(`${fullPath}:${i + 1}: ${line.trim()}`);
                                if (results.length >= 100)
                                    return; // Cap at 100 results
                            }
                        }
                    }
                    catch (e) {
                        // Ignore binary files or unreadable files
                    }
                }
            }
        }
        await walk(args.path);
        return results.length > 0 ? results.join('\n') : "No matches found.";
    });
    // 5. listDirectory
}
// 5. listDirectory
