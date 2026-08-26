import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFileToSnapshot, deleteSnapshotsFrom, getSnapshotForMessage, getSnapshotsFrom, saveSnapshot, updateSnapshot } from '../snapshotStore';
import { getGitCheckpointManifest } from '../gitCheckpoint';
import { checkpointChangesToUndoChanges, legacySnapshotsToUndoChanges } from '../undoModalData';

const temporaryDirectories: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

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

  it('scopes lookup and deletion by conversation', () => {
    saveSnapshot({ userMessageId: 'turn-1', conversationId: 'chat-a', timestamp: 1, projectPath: 'C:/a', files: [] });
    saveSnapshot({ userMessageId: 'turn-1', conversationId: 'chat-b', timestamp: 2, projectPath: 'C:/b', files: [] });

    expect(getSnapshotForMessage('chat-b', 'turn-1')?.projectPath).toBe('C:/b');
    deleteSnapshotsFrom('chat-a', 'turn-1');
    expect(getSnapshotForMessage('chat-a', 'turn-1')).toBeUndefined();
    expect(getSnapshotForMessage('chat-b', 'turn-1')?.projectPath).toBe('C:/b');
  });

  it('persists optional checkpoint display metadata', () => {
    saveSnapshot({ userMessageId: 'turn-3', conversationId: 'chat-a', timestamp: 1, projectPath: 'C:/a', gitCheckpoint: 'abc', files: [] });
    updateSnapshot('chat-a', 'turn-3', {
      checkpointManifest: [{ path: 'new.txt', type: 'created', added: 2, removed: 0 }],
      checkpointManifestCapturedAt: 10,
    });

    expect(getSnapshotForMessage('chat-a', 'turn-3')?.checkpointManifest).toEqual([
      { path: 'new.txt', type: 'created', added: 2, removed: 0 },
    ]);
  });

  it('maps Git and legacy changes to their displayed undo actions', () => {
    expect(checkpointChangesToUndoChanges([
      { path: 'script.js', type: 'created', added: 3, removed: 0 },
      { path: 'src/app.ts', type: 'modified', added: 2, removed: 1 },
      { path: 'old.txt', type: 'deleted', added: 0, removed: 4 },
    ])).toEqual([
      { path: 'script.js', type: 'file_create', added: 3, removed: 0 },
      { path: 'src/app.ts', type: 'file_modify', added: 2, removed: 1 },
      { path: 'old.txt', type: 'file_delete', added: 0, removed: 4 },
    ]);
    expect(legacySnapshotsToUndoChanges([{
      userMessageId: 'turn-1', conversationId: 'chat-a', timestamp: 1, projectPath: 'C:/a',
      files: [{ type: 'file_modify', path: 'file.txt', content: 'one\ntwo' }, { type: 'file_create', path: 'new.txt' }],
    }])).toEqual([
      { path: 'file.txt', type: 'file_modify', added: 2 },
      { path: 'new.txt', type: 'file_create', added: undefined },
    ]);
  });

  it('reports modified, created, and deleted files relative to a Git checkpoint', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quantix-checkpoint-'));
    temporaryDirectories.push(root);
    git(root, 'init');
    git(root, 'config', 'user.name', 'Test User');
    git(root, 'config', 'user.email', 'test@example.com');
    fs.writeFileSync(path.join(root, 'modified.txt'), 'before\n');
    fs.writeFileSync(path.join(root, 'deleted.txt'), 'delete me\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'baseline');
    const checkpoint = git(root, 'rev-parse', 'HEAD');

    fs.writeFileSync(path.join(root, 'modified.txt'), 'before\nafter\n');
    fs.writeFileSync(path.join(root, 'script.js'), 'line 1\nline 2\n');
    fs.rmSync(path.join(root, 'deleted.txt'));

    const result = await getGitCheckpointManifest(root, checkpoint);
    expect(result.success).toBe(true);
    expect(result.changes).toEqual([
      { path: 'deleted.txt', type: 'deleted', added: 0, removed: 1 },
      { path: 'modified.txt', type: 'modified', added: 1, removed: 0 },
      { path: 'script.js', type: 'created', added: 2, removed: 0 },
    ]);
  });
});
