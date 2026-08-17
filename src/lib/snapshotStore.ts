// ============================================================================
// Snapshot Store — Captures file state before each agent turn for undo support
// ============================================================================

export interface FileSnapshot {
  type: 'file_modify' | 'file_create' | 'folder_create' | 'rename' | 'file_delete' | 'folder_delete';
  path: string;
  oldPath?: string;
  content?: string | null;
  backupPath?: string;
}

export interface TurnSnapshot {
  userMessageId: string;
  conversationId: string;
  timestamp: number;
  projectPath: string;
  gitCheckpoint?: string;
  gitRef?: string;
  files: FileSnapshot[];     // files captured BEFORE this turn's edits
}

const STORAGE_KEY = 'quantix_snapshots';
const MAX_SNAPSHOTS = 50;   // prevent unbounded growth

function loadAll(): TurnSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAll(snapshots: TurnSnapshot[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
}

/** Save a new snapshot. Call this BEFORE the agent starts executing a turn. */
export function saveSnapshot(snapshot: TurnSnapshot): void {
  const all = loadAll();
  // Evict oldest if over limit
  const trimmed = all.slice(-(MAX_SNAPSHOTS - 1));
  trimmed.push(snapshot);
  saveAll(trimmed);
}

/** Append a captured file to an existing snapshot (called when a write tool is about to run). */
export function addFileToSnapshot(userMessageId: string, file: FileSnapshot): void {
  const all = loadAll();
  const entry = all.find(s => s.userMessageId === userMessageId);
  if (!entry) return;
  // Only store the FIRST capture (original content before any edits this turn)
  if (!entry.files.find(f => f.path === file.path)) {
    entry.files.push(file);
    saveAll(all);
  }
}

/** Get all snapshots from a given userMessageId onward (inclusive) within a conversation. */
export function getSnapshotsFrom(conversationId: string, fromUserMessageId: string): TurnSnapshot[] {
  const all = loadAll();
  const convSnapshots = all.filter(s => s.conversationId === conversationId);
  const fromIdx = convSnapshots.findIndex(s => s.userMessageId === fromUserMessageId);
  if (fromIdx === -1) return [];
  return convSnapshots.slice(fromIdx);
}

/** Get a single snapshot for a specific user message. */
export function getSnapshot(userMessageId: string): TurnSnapshot | undefined {
  return loadAll().find(s => s.userMessageId === userMessageId);
}

/** Delete all snapshots for a conversation (call after deleting conversation). */
export function deleteConversationSnapshots(conversationId: string): void {
  const filtered = loadAll().filter(s => s.conversationId !== conversationId);
  saveAll(filtered);
}

/** Delete snapshots from a given message onward within a conversation. */
export function deleteSnapshotsFrom(conversationId: string, fromUserMessageId: string): void {
  const all = loadAll();
  const convSnapshots = all.filter(s => s.conversationId === conversationId);
  const fromIdx = convSnapshots.findIndex(s => s.userMessageId === fromUserMessageId);
  if (fromIdx === -1) return;
  const toDelete = new Set(convSnapshots.slice(fromIdx).map(s => s.userMessageId));
  saveAll(all.filter(s => !toDelete.has(s.userMessageId)));
}
