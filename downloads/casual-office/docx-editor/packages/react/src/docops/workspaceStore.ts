/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Shared, process-level workspace index for on-device workspace RAG
 * (north-star O2). There is ONE user workspace (the open local folder)
 * regardless of how many editor tabs/instances exist, so the index is a
 * module singleton the host populates once (via the embed `setWorkspace`
 * command or a desktop bridge) and every DocsBridge consults.
 *
 * Everything stays in memory / on the machine — the host extracts plain text
 * from local files and pushes it here; nothing leaves the device.
 */

import { WorkspaceIndex, type WorkspaceDoc } from '@casualoffice/docops';

let shared: WorkspaceIndex | null = null;

/** Replace the indexed workspace with `docs` (host-driven). */
export function setWorkspaceDocs(docs: WorkspaceDoc[]): void {
  if (!docs.length) {
    shared = null;
    return;
  }
  const idx = new WorkspaceIndex();
  for (const doc of docs) idx.add(doc);
  shared = idx;
}

export function clearWorkspace(): void {
  shared = null;
}

/** The shared index, or null when no workspace folder is open. */
export function getSharedWorkspace(): WorkspaceIndex | null {
  return shared && shared.size > 0 ? shared : null;
}
