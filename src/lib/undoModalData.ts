import type { CheckpointChange } from './gitCheckpointTypes';
import type { TurnSnapshot } from './snapshotStore';

export interface UndoDisplayChange {
  path: string;
  added?: number;
  removed?: number;
  type?: string;
}

export function checkpointChangesToUndoChanges(changes: CheckpointChange[]): UndoDisplayChange[] {
  return changes.map(change => ({
    path: change.path,
    type: change.type === 'created' ? 'file_create' : change.type === 'deleted' ? 'file_delete' : 'file_modify',
    added: change.added,
    removed: change.removed,
  }));
}

export function legacySnapshotsToUndoChanges(snapshots: TurnSnapshot[]): UndoDisplayChange[] {
  const changes: UndoDisplayChange[] = [];
  for (const snapshot of snapshots) {
    for (const file of snapshot.files) {
      if (changes.some(change => change.path === file.path)) continue;
      const added = file.type === 'file_modify' && file.content
        ? String(file.content).split('\n').length
        : undefined;
      changes.push({ path: file.path, type: file.type, added });
    }
  }
  return changes;
}
