import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

export type ManagedProcessStatus = 'running' | 'done' | 'error' | 'killed';

export interface ManagedProcessRecord {
  id: string;
  command: string;
  cwd: string;
  status: ManagedProcessStatus;
  pid?: number;
  exitCode?: number | null;
  signal?: string | null;
  startedAt: number;
  endedAt?: number;
  outputBytes: number;
  truncated: boolean;
}

interface InternalRecord {
  status: ManagedProcessRecord;
  child: ChildProcessWithoutNullStreams;
  chunks: Array<{ stream: 'stdout' | 'stderr'; data: Buffer }>;
  bufferedBytes: number;
}

export interface RunCaptureResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
  truncated: boolean;
}

const MAX_BUFFER_BYTES = 5 * 1024 * 1024;

export class ProcessManager {
  private static instance: ProcessManager;
  private readonly records = new Map<string, InternalRecord>();
  private sequence = 0;
  onExit?: (status: ManagedProcessRecord) => void;

  static getInstance(): ProcessManager { return this.instance || (this.instance = new ProcessManager()); }

  spawn(command: string, cwd = process.cwd()): string {
    const id = `proc_${Date.now().toString(36)}_${(++this.sequence).toString(36)}`;
    const child = spawn(command, {
      cwd: path.resolve(cwd), shell: true,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: 'pipe',
    });
    const status: ManagedProcessRecord = { id, command, cwd: path.resolve(cwd), status: 'running', pid: child.pid, startedAt: Date.now(), outputBytes: 0, truncated: false };
    const record: InternalRecord = { status, child, chunks: [], bufferedBytes: 0 };
    this.records.set(id, record);
    const collect = (stream: 'stdout' | 'stderr') => (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      status.outputBytes += chunk.byteLength;
      record.chunks.push({ stream, data: chunk });
      record.bufferedBytes += chunk.byteLength;
      while (record.bufferedBytes > MAX_BUFFER_BYTES && record.chunks.length > 0) {
        const excess = record.bufferedBytes - MAX_BUFFER_BYTES;
        const oldest = record.chunks[0];
        if (oldest.data.byteLength <= excess) {
          record.chunks.shift();
          record.bufferedBytes -= oldest.data.byteLength;
        } else {
          oldest.data = oldest.data.subarray(excess);
          record.bufferedBytes -= excess;
        }
        status.truncated = true;
      }
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.once('error', error => this.finish(record, 'error', null, error.message));
    child.once('close', (code, signal) => this.finish(record, status.status === 'killed' ? 'killed' : code === 0 ? 'done' : 'error', code, undefined, signal));
    return id;
  }

  async runCapture(command: string, cwd = process.cwd(), timeoutMs = 30_000): Promise<RunCaptureResult> {
    const id = this.spawn(command, cwd);
    const record = this.records.get(id)!;
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.kill(id); }, timeoutMs);
      const complete = () => {
        clearTimeout(timer);
        resolve({
          success: record.status.status === 'done',
          stdout: this.streamOutput(record, 'stdout'),
          stderr: this.streamOutput(record, 'stderr'),
          exitCode: record.status.exitCode ?? null,
          error: record.status.status === 'killed'
            ? `Process timed out after ${timeoutMs}ms and was terminated.`
            : record.status.status === 'error' ? `Process exited with ${record.status.exitCode ?? 'an error'}.` : undefined,
          truncated: record.status.truncated,
        });
      };
      if (record.status.status !== 'running') complete();
      else record.child.once('close', complete);
    });
  }

  get(id: string): ManagedProcessRecord | undefined { return this.records.get(id)?.status; }
  output(id: string, maxBytes = 50_000): string {
    const record = this.records.get(id); if (!record) return 'Process not found.';
    const text = Buffer.concat(record.chunks.map(chunk => chunk.data)).subarray(-Math.max(0, maxBytes)).toString('utf8');
    return record.status.truncated || record.status.outputBytes > maxBytes ? `[...TRUNCATED...]\n${text}` : text;
  }
  input(id: string, input: string): boolean { const record = this.records.get(id); return Boolean(record && record.status.status === 'running' && record.child.stdin.write(input.endsWith('\n') ? input : `${input}\n`)); }
  kill(id: string): boolean {
    const record = this.records.get(id); if (!record || record.status.status !== 'running') return false;
    record.status.status = 'killed';
    if (process.platform === 'win32' && record.child.pid) spawn('taskkill', ['/pid', String(record.child.pid), '/T', '/F']);
    else record.child.kill('SIGTERM');
    return true;
  }
  list(): ManagedProcessRecord[] { return Array.from(this.records.values(), record => ({ ...record.status })); }

  private finish(record: InternalRecord, status: ManagedProcessStatus, exitCode: number | null, error?: string, signal?: NodeJS.Signals | null): void {
    if (record.status.endedAt) return;
    record.status.status = status; record.status.exitCode = exitCode; record.status.signal = signal; record.status.endedAt = Date.now();
    if (error) record.status.outputBytes += Buffer.byteLength(error);
    this.onExit?.({ ...record.status });
  }

  private streamOutput(record: InternalRecord, stream: 'stdout' | 'stderr'): string {
    return Buffer.concat(record.chunks.filter(chunk => chunk.stream === stream).map(chunk => chunk.data)).toString('utf8');
  }
}