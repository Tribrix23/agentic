import { strict as assert } from 'assert';
import { beforeEach, describe, it } from 'node:test';
import { clearFileWriteQueues, normalizeFilePath, withFileWriteLock } from '../fileWriteQueue';

describe('fileWriteQueue', () => {
  beforeEach(() => clearFileWriteQueues());

  it('normalizes equivalent Windows paths to one key', () => {
    assert.equal(normalizeFilePath('C:\\Project\\SRC\\index.html'), 'c:/project/src/index.html');
    assert.equal(normalizeFilePath('c:/project/src/index.html'), 'c:/project/src/index.html');
  });

  it('serializes operations for the same target path', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const gate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = withFileWriteLock('C:\\Project\\index.html', async () => {
      events.push('first:start');
      await gate;
      events.push('first:end');
    });
    const second = withFileWriteLock('c:/project/index.html', async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await Promise.resolve();
    assert.deepEqual(events, ['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('allows different target paths to run concurrently', async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });

    const first = withFileWriteLock('index.html', async () => {
      events.push('html:start');
      await gate;
    });
    const second = withFileWriteLock('script.js', async () => {
      events.push('js:start');
    });

    await Promise.resolve();
    assert.deepEqual(events.sort(), ['html:start', 'js:start']);
    release();
    await Promise.all([first, second]);
  });
});