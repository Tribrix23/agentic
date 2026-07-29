import { exec, spawn } from "child_process";
import * as util from "util";
const execAsync = util.promisify(exec);
export function setupShellTools(registerTool) {
    const activeTasks = {};
    registerTool({
        name: "runCommand",
        description: "Run a shell command asynchronously.",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string" },
            },
            required: ["command"],
        },
    }, async (args) => {
        const taskId = "task-" + Math.random().toString(36).substr(2, 9);
        const child = spawn(args.command, { shell: true });
        activeTasks[taskId] = { pid: child.pid, output: "", status: "running" };
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
        return { taskId, message: "Command started. Use commandStatus to check." };
    });
    registerTool({
        name: "commandStatus",
        description: "Get the status of a previously executed terminal command",
        inputSchema: {
            type: "object",
            properties: {
                taskId: { type: "string" },
            },
            required: ["taskId"],
        },
    }, async (args) => {
        const task = activeTasks[args.taskId];
        if (!task)
            return { error: "Task not found" };
        return task;
    });
}
