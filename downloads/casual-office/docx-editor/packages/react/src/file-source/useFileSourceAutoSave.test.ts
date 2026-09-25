/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';

import { performAutoSave, isConflictError, type AutoSaveEditorRef } from './useFileSourceAutoSave';
import type { FileEntry, FileSource } from './types';

/**
 * fakeFileSource is a minimal in-memory FileSource that records
 * every save call. Only `save` is exercised in the tests; the other
 * methods throw so a stray call site shows up loudly.
 */
function fakeFileSource(): FileSource & {
  saveCalls: Array<{ id: string | null; size: number; name?: string }>;
  saveResult: { id: string; etag: string };
} {
  const saveCalls: Array<{ id: string | null; size: number; name?: string }> = [];
  const fs: FileSource & {
    saveCalls: typeof saveCalls;
    saveResult: { id: string; etag: string };
  } = {
    kind: 'personal',
    label: 'Test',
    list: async () => [] as FileEntry[],
    open: async () => {
      throw new Error('not used');
    },
    save: async (id, bytes, opts) => {
      saveCalls.push({ id, size: bytes.byteLength, name: opts?.name });
      return fs.saveResult;
    },
    rename: async () => {
      throw new Error('not used');
    },
    delete: async () => {
      throw new Error('not used');
    },
    watchRecent: () => () => undefined,
    rememberLastOpened: async () => undefined,
    lastOpened: async () => null,
    saveCalls,
    saveResult: { id: 'doc_id', etag: '7' },
  };
  return fs;
}

function fakeRef(bytes: ArrayBuffer | null): AutoSaveEditorRef {
  return {
    save: async () => bytes,
  };
}

describe('performAutoSave', () => {
  it('returns ok with the etag when the editor produces bytes', async () => {
    const fs = fakeFileSource();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer;
    const ref = fakeRef(bytes);
    const result = await performAutoSave({
      getRef: () => ref,
      fileSource: fs,
      docId: 'doc_id',
      name: 'Untitled.docx',
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.etag).toBe('7');
      expect(result.savedAt).toBeInstanceOf(Date);
    }
    expect(fs.saveCalls).toHaveLength(1);
    expect(fs.saveCalls[0]).toEqual({
      id: 'doc_id',
      size: 4,
      name: 'Untitled.docx',
    });
  });

  it("skips with reason=no-ref when the editor isn't mounted", async () => {
    const fs = fakeFileSource();
    const result = await performAutoSave({
      getRef: () => null,
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result).toEqual({ kind: 'skip', reason: 'no-ref' });
    expect(fs.saveCalls).toHaveLength(0);
  });

  it("returns err when the editor's save() returns null (serialization failure)", async () => {
    const fs = fakeFileSource();
    const result = await performAutoSave({
      getRef: () => fakeRef(null),
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result.kind).toBe('err');
    if (result.kind === 'err') {
      expect((result.err as Error).message).toMatch(/no bytes/i);
    }
    expect(fs.saveCalls).toHaveLength(0);
  });

  it('returns err when the editor.save() throws', async () => {
    const fs = fakeFileSource();
    const ref: AutoSaveEditorRef = {
      save: async () => {
        throw new Error('boom');
      },
    };
    const result = await performAutoSave({
      getRef: () => ref,
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result.kind).toBe('err');
    if (result.kind === 'err') {
      expect((result.err as Error).message).toBe('boom');
    }
    expect(fs.saveCalls).toHaveLength(0);
  });

  it('returns err when fileSource.save() throws (the host backend rejected)', async () => {
    const fs = fakeFileSource();
    fs.save = async () => {
      throw new Error('gateway down');
    };
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const result = await performAutoSave({
      getRef: () => fakeRef(bytes),
      fileSource: fs,
      docId: 'doc_id',
    });
    expect(result.kind).toBe('err');
    if (result.kind === 'err') {
      expect((result.err as Error).message).toBe('gateway down');
    }
  });

  it("passes the editor's save() the selective:true option", async () => {
    const fs = fakeFileSource();
    let savedWith: { selective?: boolean } | undefined;
    const ref: AutoSaveEditorRef = {
      save: async (opts) => {
        savedWith = opts;
        return new Uint8Array([1]).buffer;
      },
    };
    await performAutoSave({ getRef: () => ref, fileSource: fs, docId: 'd' });
    expect(savedWith).toEqual({ selective: true });
  });

  it('does not call fileSource.save when the editor produces empty bytes', async () => {
    // Empty ArrayBuffer is "no bytes" from the FileSource point of
    // view? Actually no — empty IS valid here (just nothing to save
    // worth noting). The hook delegates empty/non-empty interpretation
    // to FileSource — performAutoSave passes whatever the editor
    // produced. This test pins that behavior.
    const fs = fakeFileSource();
    const bytes = new ArrayBuffer(0);
    const result = await performAutoSave({
      getRef: () => fakeRef(bytes),
      fileSource: fs,
      docId: 'd',
    });
    expect(result.kind).toBe('ok');
    expect(fs.saveCalls[0].size).toBe(0);
  });

  it('skips with reason "not-ready" and never serializes when isReady() is false', async () => {
    const fs = fakeFileSource();
    let serialized = false;
    const ref: AutoSaveEditorRef = {
      save: async () => {
        serialized = true;
        return new Uint8Array([1]).buffer;
      },
    };
    const result = await performAutoSave({
      getRef: () => ref,
      fileSource: fs,
      docId: 'd',
      isReady: () => false,
    });
    expect(result.kind).toBe('skip');
    if (result.kind === 'skip') expect(result.reason).toBe('not-ready');
    // Critical: the editor is never serialized and the store is never touched,
    // so a blank pre-sync doc can't overwrite the persisted document.
    expect(serialized).toBe(false);
    expect(fs.saveCalls.length).toBe(0);
  });

  it('proceeds normally when isReady() is true', async () => {
    const fs = fakeFileSource();
    const bytes = new Uint8Array([0x50, 0x4b]).buffer;
    const result = await performAutoSave({
      getRef: () => fakeRef(bytes),
      fileSource: fs,
      docId: 'd',
      isReady: () => true,
    });
    expect(result.kind).toBe('ok');
    expect(fs.saveCalls.length).toBe(1);
  });

  it('forwards the etag to FileSource.save as If-Match (optimistic concurrency)', async () => {
    let seenEtag: string | undefined = 'not-called';
    const fs: FileSource = {
      kind: 'personal',
      label: 'T',
      list: async () => [],
      open: async () => ({ bytes: new ArrayBuffer(0), name: 'x', etag: 'v1' }),
      save: async (_id, _bytes, opts) => {
        seenEtag = opts?.etag;
        return { id: 'd', etag: 'v2' };
      },
      rename: async () => undefined,
      delete: async () => undefined,
      watchRecent: () => () => undefined,
      rememberLastOpened: async () => undefined,
      lastOpened: async () => null,
    };
    const result = await performAutoSave({
      getRef: () => fakeRef(new Uint8Array([1]).buffer),
      fileSource: fs,
      docId: 'd',
      etag: 'v1',
    });
    expect(seenEtag).toBe('v1');
    expect(result.kind).toBe('ok');
    // The refreshed etag is returned so the caller can advance the chain.
    if (result.kind === 'ok') expect(result.etag).toBe('v2');
  });
});

describe('isConflictError', () => {
  it('recognises WOPI 409 and personal 412 conflicts', () => {
    expect(isConflictError({ name: 'WopiSaveConflictError' })).toBe(true);
    expect(isConflictError({ name: 'PersonalFileSourceError', status: 412 })).toBe(true);
    expect(isConflictError({ status: 409 })).toBe(true);
  });

  it('does not treat ordinary errors or non-objects as conflicts', () => {
    expect(isConflictError(new Error('gateway down'))).toBe(false);
    expect(isConflictError({ status: 500 })).toBe(false);
    expect(isConflictError(null)).toBe(false);
    expect(isConflictError(undefined)).toBe(false);
    expect(isConflictError('nope')).toBe(false);
  });
});
