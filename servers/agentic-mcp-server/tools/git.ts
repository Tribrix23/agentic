import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

export function setupGitTools(registerTool: (def: any, handler: any) => void) {
  registerTool(
    {
      name: "gitStatus",
      description: "Get the current git status",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
        },
      },
    },
    async (args: { cwd?: string }) => {
      const { stdout } = await execAsync("git status", { cwd: args.cwd || process.cwd() });
      return stdout;
    }
  );

  registerTool(
    {
      name: "gitAdd",
      description: "Stage files for commit",
      inputSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" } },
        },
        required: ["files"],
      },
    },
    async (args: { files: string[] }) => {
      const { stdout } = await execAsync(`git add ${args.files.join(" ")}`);
      return stdout || "Files staged successfully.";
    }
  );

  registerTool(
    {
      name: "gitCommit",
      description: "Commit staged files with a message",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Commit message" },
        },
        required: ["message"],
      },
    },
    async (args: { message: string }) => {
      // Escape the message for shell
      const escapedMsg = args.message.replace(/"/g, '\\"');
      const { stdout } = await execAsync(`git commit -m "${escapedMsg}"`);
      return stdout || "Commit successful.";
    }
  );

  registerTool(
    {
      name: "gitDiff",
      description: "Show changes between commits, commit and working tree, etc",
      inputSchema: {
        type: "object",
        properties: {
          args: { type: "string", description: "Additional args like --cached, HEAD~1, etc" },
        },
      },
    },
    async (args: { args?: string }) => {
      const { stdout } = await execAsync(`git diff ${args.args || ""}`);
      return stdout || "No differences found.";
    }
  );

  registerTool(
    {
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
    },
    async (args: { target: string; createBranch?: boolean }) => {
      const flag = args.createBranch ? "-b" : "";
      const { stdout, stderr } = await execAsync(`git checkout ${flag} ${args.target}`);
      return stdout || stderr || `Successfully checked out ${args.target}.`;
    }
  );
}
