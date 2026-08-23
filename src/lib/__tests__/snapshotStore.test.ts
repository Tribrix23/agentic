import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addFileToSnapshot, getSnapshotsFrom, saveSnapshot } from '../snapshotStore';

describe('non-Git snapshot tracking', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  it('isolates identical message ids by conversation', () => {
    saveSnapshot({ userMessageId: 'turn-1', conversationId: 'chat-a', timestamp: 1, projectPath: 'C:/a', files: [] });
    saveSnapshot({ userMessageId: 'turn-1', conversationId: 'chat-b', timestamp: 2, projectPath: 'C:/b', files: [] });
    addFileToSnapshot('turn-1', { type: 'file_create', path: 'C:/b/new.txt' }, 'chat-b');

    expect(getSnapshotsFrom('chat-a', 'turn-1')[0].files).toEqual([]);
    expect(getSnapshotsFrom('chat-b', 'turn-1')[0].files).toEqual([{ type: 'file_create', path: 'C:/b/new.txt' }]);
  });

  it('keeps the first pre-mutation state for a path', () => {
    saveSnapshot({ userMessageId: 'turn-2', conversationId: 'chat-a', timestamp: 1, projectPath: 'C:/a', files: [] });
    addFileToSnapshot('turn-2', { type: 'file_modify', path: 'C:/a/file.txt', content: 'before' }, 'chat-a');
    addFileToSnapshot('turn-2', { type: 'file_modify', path: 'C:/a/file.txt', content: 'after' }, 'chat-a');

    expect(getSnapshotsFrom('chat-a', 'turn-2')[0].files[0].content).toBe('before');
  });
});
