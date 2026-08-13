import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { app } from 'electron';

export interface TaskStatus {
  taskId: string;
  command: string;
  status: 'running' | 'done' | 'error' | 'killed';
  exitCode?: number | null;
  startTime: number;
  endTime?: number;
  logFile: string;
}

export class TaskManager {
  private static instance: TaskManager;
  private tasks: Map<string, { process: ChildProcess, status: TaskStatus }> = new Map();
  private logsDir: string;
  public onTaskComplete?: (taskId: string, status: TaskStatus) => void;

  private constructor() {
    this.logsDir = path.join(app.getPath('userData'), 'agentic', 'logs');
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  public spawnTask(command: string, cwd: string): string {
    const taskId = 'task_' + Math.random().toString(36).substring(2, 9);
    const logFile = path.join(this.logsDir, `${taskId}.log`);
    
    // Create initial log file
    fs.writeFileSync(logFile, `=== START: ${command} ===\n`);

    const child = spawn(command, {
      cwd,
      shell: process.platform === 'win32' ? 'powershell.exe' : true,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    const status: TaskStatus = {
      taskId,
      command,
      status: 'running',
      startTime: Date.now(),
      logFile
    };

    this.tasks.set(taskId, { process: child, status });

    child.stdout?.on('data', (data) => {
      fs.appendFileSync(logFile, data);
    });

    child.stderr?.on('data', (data) => {
      fs.appendFileSync(logFile, data);
    });

    child.on('close', (code) => {
      status.status = code === 0 ? 'done' : 'error';
      status.exitCode = code;
      status.endTime = Date.now();
      fs.appendFileSync(logFile, `\n=== END (Exit Code: ${code}) ===\n`);
      if (this.onTaskComplete) {
        this.onTaskComplete(taskId, status);
      }
    });

    child.on('error', (err) => {
      status.status = 'error';
      status.endTime = Date.now();
      fs.appendFileSync(logFile, `\n=== PROCESS ERROR: ${err.message} ===\n`);
    });

    return taskId;
  }

  public getTaskStatus(taskId: string): TaskStatus | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return task.status;
  }

  public getTaskOutput(taskId: string, maxBytes: number = 50000): string {
    const task = this.tasks.get(taskId);
    if (!task) return 'Task not found.';
    
    try {
      const stats = fs.statSync(task.status.logFile);
      const size = stats.size;
      const start = Math.max(0, size - maxBytes);
      
      const buffer = Buffer.alloc(Math.min(size, maxBytes));
      const fd = fs.openSync(task.status.logFile, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      
      let content = buffer.toString('utf8');
      if (start > 0) {
        content = '[...TRUNCATED...]\n' + content;
      }
      return content;
    } catch (e: any) {
      return `Failed to read log file: ${e.message}`;
    }
  }

  public sendInput(taskId: string, input: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status.status !== 'running' || !task.process.stdin) {
      return false;
    }
    
    // Ensure input ends with newline
    const data = input.endsWith('\n') ? input : input + '\n';
    task.process.stdin.write(data);
    fs.appendFileSync(task.status.logFile, `[STDIN] ${data}`);
    return true;
  }

  public killTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status.status !== 'running') return false;
    
    // On Windows, child.kill() often fails to kill child processes of shells (like npm run).
    // A more robust tree-kill is usually needed, but for now we try standard kill.
    if (process.platform === 'win32' && task.process.pid) {
      try {
        spawn('taskkill', ['/pid', task.process.pid.toString(), '/T', '/F']);
      } catch (e) {}
    } else {
      task.process.kill();
    }
    
    task.status.status = 'killed';
    task.status.endTime = Date.now();
    fs.appendFileSync(task.status.logFile, `\n=== KILLED BY USER ===\n`);
    return true;
  }

  public listTasks(): TaskStatus[] {
    return Array.from(this.tasks.values()).map(t => t.status);
  }
}
