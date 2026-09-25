/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Verifies the persistence PRIMITIVE that useCollab's offline durability relies
 * on: a Y.Doc's ProseMirror fragment is mirrored into IndexedDB, and a fresh
 * Y.Doc bound to the same room restores it — the "reload / offline session"
 * round-trip. Uses fake-indexeddb so it runs in the unit suite.
 *
 * NOTE: this covers the y-indexeddb round-trip only. The full editor behaviour
 * (IndexedDB hydration → y-prosemirror → painted pages on a real page reload,
 * including a reload with the WS server DOWN so the content can only come from
 * IndexedDB) is verified in a real browser by
 * `e2e/tests/offline-persistence-browser.spec.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

// A fresh fake IndexedDB per test, set explicitly (not via the import-time
// `fake-indexeddb/auto` global) so it survives other suites in the same `bun
// test` process clobbering globals (e.g. happy-dom's register/unregister).
beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  (globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;
});
afterEach(() => {
  // Drop the fake DB so nothing leaks into the next test / suite.
  (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
});

describe('offline persistence (y-indexeddb round-trip)', () => {
  test('a fragment edit survives a simulated reload in a new Y.Doc', async () => {
    const room = 'offline-room';

    // Session 1: edit, then let it flush to IndexedDB.
    const doc1 = new Y.Doc();
    const p1 = new IndexeddbPersistence(room, doc1);
    await p1.whenSynced;
    const frag1 = doc1.getXmlFragment('prosemirror');
    const para = new Y.XmlElement('paragraph');
    para.insert(0, [new Y.XmlText('offline durable content')]);
    frag1.insert(0, [para]);
    await new Promise((r) => setTimeout(r, 50)); // let the update flush to IDB
    await p1.destroy();

    // Session 2 (simulated reload): fresh doc, same room → restores from IDB.
    const doc2 = new Y.Doc();
    const p2 = new IndexeddbPersistence(room, doc2);
    await p2.whenSynced;
    const frag2 = doc2.getXmlFragment('prosemirror');
    expect(frag2.toString()).toContain('offline durable content');
    await p2.destroy();
  });

  test('an empty room restores to an empty fragment (no phantom content)', async () => {
    const doc = new Y.Doc();
    const p = new IndexeddbPersistence('empty-room', doc);
    await p.whenSynced;
    expect(doc.getXmlFragment('prosemirror').length).toBe(0);
    await p.destroy();
  });

  test('two separate rooms do not share persisted content', async () => {
    const docA = new Y.Doc();
    const pA = new IndexeddbPersistence('room-a', docA);
    await pA.whenSynced;
    const el = new Y.XmlElement('paragraph');
    el.insert(0, [new Y.XmlText('only in A')]);
    docA.getXmlFragment('prosemirror').insert(0, [el]);
    await new Promise((r) => setTimeout(r, 50));
    await pA.destroy();

    const docB = new Y.Doc();
    const pB = new IndexeddbPersistence('room-b', docB);
    await pB.whenSynced;
    expect(docB.getXmlFragment('prosemirror').toString()).not.toContain('only in A');
    await pB.destroy();
  });
});
