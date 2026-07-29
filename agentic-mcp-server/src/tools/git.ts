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
}
