import { describe, expect, it } from 'vitest';
import { ProcessManager } from '../processManager';

describe('ProcessManager', () => {
  it('keeps stdout and stderr distinct for foreground capture', async () => {
    const result = await ProcessManager.getInstance().runCapture(
      `node -e "process.stdout.write('out');process.stderr.write('err')"`,
      process.cwd(),
      5_000,
    );
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
  });

  it('records a stable process identity and terminal status', async () => {
    const manager = ProcessManager.getInstance();
    const id = manager.spawn(`node -e "setTimeout(() => {}, 20)"`, process.cwd());
    expect(manager.get(id)?.status).toBe('running');
    const deadline = Date.now() + 5_000;
    while (manager.get(id)?.status === 'running' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect(manager.get(id)?.status).toBe('done');
    expect(manager.get(id)?.endedAt).toEqual(expect.any(Number));
  });
});