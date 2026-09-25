/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Tiny typed event bus backing the DocxEditor unified `on()`/`off()` emitter
 * (doc 38 §3 — unified SDK contract). Every canonical event carries a single
 * payload; listeners fan out in registration order, and one throwing listener
 * never blocks the others. Kept framework-agnostic (no React) so it is unit
 * testable in isolation.
 *
 * `E` is an event map — an object type whose keys are event names and whose
 * values are single-argument handlers, e.g. `{ change: (doc: Document) => void }`.
 */

/** Extract the payload type of a single-argument handler `(arg: A) => void`. */
type EventArg<H> = H extends (arg: infer A) => void ? A : never;

export interface EditorEventBus<E> {
  /** Fire an event to every subscribed listener. */
  emit<K extends keyof E>(name: K, arg: EventArg<E[K]>): void;
  /** Subscribe to an event; returns a disposer that removes the listener. */
  on<K extends keyof E>(name: K, handler: E[K]): () => void;
  /** Remove a previously-subscribed listener. */
  off<K extends keyof E>(name: K, handler: E[K]): void;
}

/** Create an isolated typed event bus. */
export function createEditorEventBus<E>(): EditorEventBus<E> {
  const listeners = new Map<keyof E, Set<(arg: unknown) => void>>();
  return {
    emit(name, arg) {
      const set = listeners.get(name);
      if (!set) return;
      // Snapshot so a listener that unsubscribes mid-dispatch doesn't skip peers.
      for (const handler of [...set]) {
        try {
          handler(arg);
        } catch (e) {
          console.error(`DocxEditor event listener for '${String(name)}' threw:`, e);
        }
      }
    },
    on(name, handler) {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(handler as (arg: unknown) => void);
      return () => {
        listeners.get(name)?.delete(handler as (arg: unknown) => void);
      };
    },
    off(name, handler) {
      listeners.get(name)?.delete(handler as (arg: unknown) => void);
    },
  };
}
