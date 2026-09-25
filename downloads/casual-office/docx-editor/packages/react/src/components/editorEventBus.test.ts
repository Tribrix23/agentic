/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for the typed event bus that backs DocxEditor's unified
 * `on()`/`off()` emitter (doc 38 §3). The bus is framework-agnostic so it can
 * be exercised without rendering the editor.
 */
import { describe, expect, it, mock } from 'bun:test';

import { createEditorEventBus } from './editorEventBus';

interface TestEvents {
  change: (value: number) => void;
  ready: (label: string) => void;
}

describe('createEditorEventBus', () => {
  it('delivers the emitted payload to a subscribed listener', () => {
    const bus = createEditorEventBus<TestEvents>();
    const seen: number[] = [];
    bus.on('change', (v) => seen.push(v));
    bus.emit('change', 1);
    bus.emit('change', 2);
    expect(seen).toEqual([1, 2]);
  });

  it('scopes listeners to their event name', () => {
    const bus = createEditorEventBus<TestEvents>();
    const change = mock(() => {});
    const ready = mock(() => {});
    bus.on('change', change);
    bus.on('ready', ready);
    bus.emit('change', 5);
    expect(change).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(0);
  });

  it('on() returns a disposer that removes the listener', () => {
    const bus = createEditorEventBus<TestEvents>();
    const fn = mock(() => {});
    const dispose = bus.on('change', fn);
    bus.emit('change', 1);
    dispose();
    bus.emit('change', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('off() removes a listener by reference', () => {
    const bus = createEditorEventBus<TestEvents>();
    const fn = mock(() => {});
    bus.on('change', fn);
    bus.off('change', fn);
    bus.emit('change', 1);
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('a throwing listener does not block the others', () => {
    const bus = createEditorEventBus<TestEvents>();
    const after = mock(() => {});
    // Silence the intentional console.error for this case.
    const spy = mock(() => {});
    const original = console.error;
    console.error = spy as unknown as typeof console.error;
    try {
      bus.on('change', () => {
        throw new Error('boom');
      });
      bus.on('change', after);
      bus.emit('change', 1);
    } finally {
      console.error = original;
    }
    expect(after).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emitting an event with no listeners is a no-op', () => {
    const bus = createEditorEventBus<TestEvents>();
    expect(() => bus.emit('ready', 'hello')).not.toThrow();
  });
});
