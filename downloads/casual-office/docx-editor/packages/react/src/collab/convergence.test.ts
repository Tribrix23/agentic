/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Real 2-client collab convergence — the regression net the audit (tracker 27)
 * called for. Unlike the browser/y-webrtc smoke that was skipped in CI, this
 * spins up an in-process @hocuspocus/server (the SAME server the production
 * collab service is built on) on an ephemeral port and drives two real
 * HocuspocusProvider clients against it — the exact provider useCollab.ts uses.
 * It exercises the genuine wire protocol with no browser and no public
 * signaling, so it's deterministic and CI-safe.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { Hocuspocus } from '@hocuspocus/server';
import { HocuspocusProvider } from '@hocuspocus/provider';

// Bun ships a global WebSocket, which @hocuspocus/provider auto-detects — no
// polyfill needed (unlike bare node, which would require the `ws` package).
const PORT = 39517;
const ROOM = 'converge-room';
let server: Hocuspocus;

beforeAll(async () => {
  server = new Hocuspocus({ port: PORT, quiet: true });
  await server.listen();
});

afterAll(async () => {
  await server?.destroy();
});

function connect(doc: Y.Doc): HocuspocusProvider {
  return new HocuspocusProvider({
    url: `ws://127.0.0.1:${PORT}`,
    name: ROOM,
    document: doc,
    token: 'test',
    connect: true,
  });
}

/** Resolve once `predicate` holds or reject after `ms`. */
function waitFor(predicate: () => boolean, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > ms) return reject(new Error('convergence timeout'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

test('an edit on client A converges to client B through the Hocuspocus server', async () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const a = connect(docA);
  const b = connect(docB);
  try {
    // Both providers complete their initial sync with the server.
    await waitFor(() => a.synced === true && b.synced === true);

    // Client A types into a shared text type.
    docA.getText('body').insert(0, 'hello from A');

    // Client B must converge to A's edit over the real WS protocol.
    await waitFor(() => docB.getText('body').toString() === 'hello from A');
    expect(docB.getText('body').toString()).toBe('hello from A');

    // And convergence is bidirectional: an edit on B reaches A.
    docB.getText('body').insert(docB.getText('body').length, ' + B');
    await waitFor(() => docA.getText('body').toString() === 'hello from A + B');
    expect(docA.getText('body').toString()).toBe('hello from A + B');
  } finally {
    a.destroy();
    b.destroy();
    docA.destroy();
    docB.destroy();
  }
});
