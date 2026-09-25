/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Default reconnecting/offline indicator for the SDK. A thin strip
// rendered above the editing surface whenever the Yjs provider isn't
// `connected`. The editor stays usable — edits buffer in this tab's
// in-memory Y.Doc and flush on reconnect — but they are NOT yet
// persisted to disk (no y-indexeddb provider), so closing the tab
// while offline loses them. The copy reflects that honestly until
// offline persistence lands (tracker 27, Next phase). Theme-token
// styled via --doc-* vars so it inherits the host's light/dark surface.
import type { CSSProperties } from 'react';
import type { CollabStatus } from './useCollab';

const base: CSSProperties = {
  flex: '0 0 auto',
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 500,
  textAlign: 'center',
  fontFamily:
    'var(--doc-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
};

const byStatus: Record<Exclude<CollabStatus, 'connected'>, CSSProperties> = {
  connecting: {
    background: 'var(--doc-warning-bg, #fffbeb)',
    color: 'var(--doc-warning-text, #92400e)',
    borderBottom: '1px solid var(--doc-warning-border, #fde68a)',
  },
  disconnected: {
    background: 'var(--doc-danger-bg, #fef2f2)',
    color: 'var(--doc-danger-text, #991b1b)',
    borderBottom: '1px solid var(--doc-danger-border, #fecaca)',
  },
};

const labels: Record<Exclude<CollabStatus, 'connected'>, string> = {
  connecting: 'Reconnecting to the session…',
  disconnected:
    "You're offline — keep this tab open and your edits will sync when the connection returns.",
};

/**
 * Renders nothing when `status` is `connected`; otherwise a full-width
 * amber (connecting) or red (disconnected) strip with a short message.
 */
export function ReconnectBanner({ status }: { status: CollabStatus }) {
  if (status === 'connected') return null;
  return (
    <div role="status" aria-live="polite" style={{ ...base, ...byStatus[status] }}>
      {labels[status]}
    </div>
  );
}
