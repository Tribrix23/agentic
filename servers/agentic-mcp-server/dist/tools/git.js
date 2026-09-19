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
exports.setupGitTools = setupGitTools;
const child_process_1 = require("child_process");
const util = __importStar(require("util"));
const execAsync = util.promisify(child_process_1.exec);
function setupGitTools(registerTool) {
    registerTool({
        name: "gitStatus",
        description: "Get the current git status",
        inputSchema: {
            type: "object",
            properties: {
                cwd: { type: "string" },
            },
        },
    }, async (args) => {
        const { stdout } = await execAsync("git status", { cwd: args.cwd || process.cwd() });
        return stdout;
    });
    registerTool({
        name: "gitAdd",
        description: "Stage files for commit",
        inputSchema: {
            type: "object",
            properties: {
                files: { type: "array", items: { type: "string" } },
            },
            required: ["files"],
        },
    }, async (args) => {
        const { stdout } = await execAsync(`git add ${args.files.join(" ")}`);
        return stdout || "Files staged successfully.";
    });
    registerTool({
        name: "gitCommit",
        description: "Commit staged files with a message",
        inputSchema: {
            type: "object",
            properties: {
                message: { type: "string", description: "Commit message" },
            },
            required: ["message"],
        },
    }, async (args) => {
        // Escape the message for shell
        const escapedMsg = args.message.replace(/"/g, '\\"');
        const { stdout } = await execAsync(`git commit -m "${escapedMsg}"`);
        return stdout || "Commit successful.";
    });
    registerTool({
        name: "gitDiff",
        description: "Show changes between commits, commit and working tree, etc",
        inputSchema: {
            type: "object",
            properties: {
                args: { type: "string", description: "Additional args like --cached, HEAD~1, etc" },
            },
        },
    }, async (args) => {
        const { stdout } = await execAsync(`git diff ${args.args || ""}`);
        return stdout || "No differences found.";
    });
    registerTool({
        name: "gitCheckout",
        description: "Switch branches or restore working tree files",
        inputSchema: {
            type: "object",
            properties: {
                target: { type: "string", description: "Branch name or commit hash" },
                createBranch: { type: "boolean", description: "If true, creates a new branch (-b)" },
            },
            required: ["target"],
        },
    }, async (args) => {
        const flag = args.createBranch ? "-b" : "";
        const { stdout, stderr } = await execAsync(`git checkout ${flag} ${args.target}`);
        return stdout || stderr || `Successfully checked out ${args.target}.`;
    });
}
