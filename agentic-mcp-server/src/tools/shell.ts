import { exec, spawn } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

export function setupShellTools(registerTool: (def: any, handler: any) => void) {
  const activeTasks: Record<string, { pid: number; output: string; status: string; process: ReturnType<typeof spawn> }> = {};

  registerTool(
    {
      name: "runCommand",
      description: "Run a shell command asynchronously.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
    },
    async (args: { command: string }) => {
      const taskId = "task-" + Math.random().toString(36).substr(2, 9);
      const child = spawn(args.command, { shell: true });
      
      activeTasks[taskId] = { pid: child.pid!, output: "", status: "running", process: child };

      child.stdout?.on("data", (data) => {
        activeTasks[taskId].output += data.toString();
      });

      child.stderr?.on("data", (data) => {
        activeTasks[taskId].output += data.toString();
      });

      child.on("close", (code) => {
        activeTasks[taskId].status = code === 0 ? "done" : "error";
        activeTasks[taskId].output += `\n[Process exited with code ${code}]`;
      });

      return { taskId, message: "Command started. Use commandStatus or manageTask to interact." };
    }
  );

  registerTool(
    {
      name: "commandStatus",
      description: "Get the status of a previously executed terminal command",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
      },
    },
    async (args: { taskId: string }) => {
      const task = activeTasks[args.taskId];
      if (!task) return { error: "Task not found" };
      return { pid: task.pid, status: task.status, output: task.output };
    }
  );

  registerTool(
    {
      name: "manageTask",
      description: "Manage a running background task (kill it or send input to stdin).",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          action: { type: "string", description: "'kill' or 'send_input'" },
          input: { type: "string", description: "Required if action is 'send_input'" }
        },
        required: ["taskId", "action"],
      },
    },
    async (args: { taskId: string; action: string; input?: string }) => {
      const task = activeTasks[args.taskId];
      if (!task) return { error: "Task not found" };
      
      if (task.status !== "running") {
        return { error: `Task is already ${task.status}` };
      }

      if (args.action === "kill") {
        task.process.kill();
        return { message: `Sent kill signal to task ${args.taskId}` };
      } else if (args.action === "send_input") {
        if (args.input === undefined) return { error: "Missing input for send_input action" };
        task.process.stdin?.write(args.input + "\n");
        return { message: `Sent input to task ${args.taskId}` };
      } else {
        return { error: "Invalid action. Use 'kill' or 'send_input'" };
      }
    }
  );
}
