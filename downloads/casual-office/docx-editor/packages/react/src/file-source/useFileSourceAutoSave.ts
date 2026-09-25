/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * useFileSourceAutoSave — periodic auto-save from a DocxEditor into
 * a FileSource.
 *
 * Bridges the existing editor surface (`DocxEditorRef.save()` →
 * `.docx` ArrayBuffer) with the existing storage surface
 * (`FileSource.save(id, bytes)`) so a Mode 3 / Mode 2 user's edits
 * land in the gateway's host backend without anyone wiring it by
 * hand.
 *
 * Why this lives at the host-app layer and not inside DocxEditor:
 *
 *   - DocxEditor is the eigenpal-upstream surface; FileSource is
 *     casual-editor's storage abstraction. Mixing them inside the
 *     editor would force every embedder to take a FileSource shape
 *     they may not want.
 *   - Auto-save policy (interval, dirty-detection, beforeunload
 *     behaviour) is application-level. Keeping it as a hook leaves
 *     it composable.
 *
 * Scope notes
 *
 *   - "Snapshot on room drain" (the design intent in CLAUDE.md) is
 *     genuinely the WS gateway's responsibility — but the gateway
 *     can't decode Y.Doc state without a Bun worker pool. Auto-save
 *     on the CLIENT covers most of the same need: as long as the
 *     editor pushes its serialized .docx every N seconds, a sudden
 *     disconnect loses at most one tick's worth of edits. The
 *     remaining gap (room-drain snapshot) is left as a follow-up.
 *
 *   - Etag conflict handling is not implemented. Last-write-wins is
 *     fine for single-user Mode 3; multi-user co-edit through a
 *     single FileSource is a separate design problem.
 *
 *   - One save in flight at a time, but never lossy: a request that
 *     lands while a save is resolving is queued, and the in-flight
 *     drain loop re-runs once more for it. This matters on tab close —
 *     a hide flush racing an interval tick must not be silently
 *     dropped. A hung save is bounded by SAVE_TIMEOUT_MS so it can't
 *     pin the in-flight guard and halt all future autosaves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FileSource } from './types';

/**
 * Upper bound on a single save round-trip. If FileSource.save() hangs
 * past this, the tick resolves as an error so the in-flight guard is
 * released and later autosaves keep working instead of deadlocking.
 */
const SAVE_TIMEOUT_MS = 30000;

/**
 * A save error is a *conflict* when the store rejected the write because our
 * version is stale — someone else changed the doc (WOPI 409, personal 412).
 * These must never be retried on the auto-loop: retrying a WOPI 409 re-sends the
 * same stale version and fails forever (silent loss), and blindly re-saving
 * would clobber the other writer. Instead the hook pauses and surfaces it, and
 * only an explicit user-initiated `flush()` (a deliberate overwrite) retries.
 */
export function isConflictError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; status?: number };
  return e.name === 'WopiSaveConflictError' || e.status === 412 || e.status === 409;
}

// ---------------------------------------------------------------
// Pure controller — extracted so it's bun-unit-testable without a
// React renderer. The hook below is a thin wrapper that exposes the
// controller's state to React.
// ---------------------------------------------------------------

/**
 * Result of one auto-save tick. `skip` means "nothing changed worth
 * saving" (no ref attached, editor returned null bytes, or a prior
 * save is still in flight); `ok` carries the etag the FileSource
 * returned; `err` carries the throw.
 */
export type AutoSaveTickResult =
  | { kind: 'skip'; reason: 'no-ref' | 'no-bytes' | 'in-flight' | 'not-ready' }
  | { kind: 'ok'; etag: string; savedAt: Date }
  | { kind: 'err'; err: unknown };

export interface PerformAutoSaveDeps {
  /** Returns the live editor ref (or null when the editor isn't mounted). */
  getRef: () => AutoSaveEditorRef | null;
  fileSource: FileSource;
  docId: string;
  name?: string;
  /**
   * Last-known etag for optimistic concurrency. Threaded into
   * `FileSource.save(...)` as `If-Match` so a concurrent host-side change
   * surfaces as a 412/conflict instead of silently clobbering the other
   * writer. Undefined on first save.
   */
  etag?: string;
  /**
   * Optional readiness gate. When it returns `false` the tick is SKIPPED
   * before the editor is even serialized — used to refuse saving before a
   * collab Y.Doc has completed its initial sync, which would otherwise push
   * the empty mount-time seed over the stored document (data-loss). Absent →
   * always ready (single-user / non-collab).
   */
  isReady?: () => boolean;
}

/**
 * One-shot save round-trip. Pure with respect to React — takes its
 * dependencies as plain args + getRef, returns a discriminated
 * result. The React hook wraps this with in-flight bookkeeping and
 * state.
 */
export async function performAutoSave(deps: PerformAutoSaveDeps): Promise<AutoSaveTickResult> {
  const ref = deps.getRef();
  if (!ref) return { kind: 'skip', reason: 'no-ref' };
  // Refuse to serialize/push before the source of truth is ready (e.g. collab
  // still syncing). Guards against overwriting stored content with the empty
  // seed the editor mounts with.
  if (deps.isReady && !deps.isReady()) return { kind: 'skip', reason: 'not-ready' };
  try {
    const bytes = await ref.save({ selective: true });
    // When the editor ref is mounted, a null return means serialization
    // failed silently (the editor caught the error internally). Surface it
    // as an error so the status indicator shows "Save failed" rather than
    // silently treating it as "no changes" (audit: autosave-skip-hides-failures).
    if (!bytes) {
      return { kind: 'err', err: new Error('Document serialization returned no bytes') };
    }
    const result = await deps.fileSource.save(deps.docId, bytes, {
      name: deps.name,
      etag: deps.etag,
    });
    return { kind: 'ok', etag: result.etag, savedAt: new Date() };
  } catch (err) {
    return { kind: 'err', err };
  }
}

// ---------------------------------------------------------------
// React hook
// ---------------------------------------------------------------

/**
 * Minimal subset of DocxEditorRef the hook needs. Typed structurally
 * so the hook doesn't depend on the full editor surface — the host
 * passes a ref the editor populates; the hook only ever calls
 * `save()`.
 */
export interface AutoSaveEditorRef {
  save: (options?: { selective?: boolean }) => Promise<ArrayBuffer | null>;
}

export interface UseFileSourceAutoSaveOptions {
  /** FileSource to push saved bytes into. */
  fileSource: FileSource;
  /** The doc id within `fileSource`. */
  docId: string;
  /**
   * React ref pointing at the editor instance. Must expose a
   * compatible `save()` shape — DocxEditorRef satisfies this.
   * Plain ref so the hook works with both `useRef<DocxEditorRef>()`
   * and any other ref shape.
   */
  editorRef: React.RefObject<AutoSaveEditorRef | null>;
  /**
   * Tick interval in ms. Default 30s — same cadence as the editor's
   * own localStorage auto-save.
   */
  interval?: number;
  /** Hard-off switch. Default true. */
  enabled?: boolean;
  /**
   * Readiness gate evaluated fresh on every tick. Return `false` to skip the
   * save (e.g. while a collab Y.Doc is still syncing) so autosave never
   * overwrites stored content with the editor's empty mount-time seed. Absent
   * → always ready.
   */
  isReady?: () => boolean;
  /**
   * Etag captured from `FileSource.open()`. Seeds the optimistic-concurrency
   * chain: it's sent as `If-Match` on the next save and refreshed from every
   * save result, so a concurrent host-side change surfaces as a conflict
   * instead of a silent last-write-wins overwrite. Reseeds when `docId` changes.
   */
  initialEtag?: string;
  /**
   * Optional file-name to attach on first-save (when docId is null
   * — see save() below). The hook doesn't watch this for changes;
   * the host should call FileSource.rename() for that.
   */
  name?: string;
  /**
   * Fires after every successful tick. Hosts can use this to update
   * a "Saved at HH:MM" indicator without subscribing to the hook's
   * status.
   */
  onSaved?: (when: Date, etag: string) => void;
  /**
   * Fires when a save tick throws. The hook keeps trying on
   * subsequent ticks; the host decides whether to surface a banner.
   */
  onError?: (err: unknown) => void;
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseFileSourceAutoSaveReturn {
  status: AutoSaveStatus;
  /** Last successful save time. null until the first save lands. */
  lastSavedAt: Date | null;
  /** Last error caught — kept for status='error' rendering. */
  lastError: unknown;
  /**
   * True while a version conflict (the stored file changed underneath us) is
   * unresolved. The auto-loop is paused — it will NOT save again on its own, so
   * every edit made from here on is un-persisted until the conflict is resolved
   * by calling `flush()` (an explicit overwrite / "Save anyway") or reloading.
   *
   * INTEGRATION CONTRACT — the host MUST surface this (or `pendingError` /
   * `status === 'error'`, all of which stay set durably during a conflict) and
   * offer the user a resolve action wired to `flush()`. A host that ignores all
   * of these signals will silently drop edits while paused. Because the signals
   * are durable (unlike a transient error, they do not auto-clear), surfacing
   * any ONE of them is enough to prevent silent data loss.
   */
  conflict: boolean;
  /**
   * True when the last save attempt failed and none has succeeded since — even
   * after the transient error badge auto-clears. Consumers use this to avoid
   * showing a stale "Saved" while edits are actually un-persisted. Stays set
   * for the whole duration of an unresolved `conflict` (the auto-clear timer is
   * cancelled), so it doubles as a durable "unsaved changes" signal there.
   */
  pendingError: boolean;
  /**
   * Force a save right now (bypassing the interval), clearing any conflict
   * pause — i.e. a deliberate overwrite. Returns when the round-trip finishes.
   * Useful for "Save & close" buttons or a "Save anyway" conflict action.
   */
  flush: () => Promise<void>;
}

/**
 * Schedules periodic saves of the editor's current .docx bytes into
 * the configured FileSource. See module doc for scope notes.
 */
export function useFileSourceAutoSave(
  opts: UseFileSourceAutoSaveOptions
): UseFileSourceAutoSaveReturn {
  const {
    fileSource,
    docId,
    editorRef,
    interval = 30000,
    enabled = true,
    name,
    isReady,
    initialEtag,
    onSaved,
    onError,
  } = opts;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<unknown>(null);
  // Unresolved version conflict. While true, auto-ticks and hide-flushes are
  // suppressed so we never silently re-conflict or overwrite the other writer;
  // an explicit flush() clears it.
  const [conflict, setConflict] = useState(false);
  // True while the most recent save attempt FAILED and no successful save has
  // landed since. Survives the 60 s error-badge auto-clear, so the UI never
  // reverts to a lying "Saved X ago" with a pre-failure timestamp while edits
  // are actually un-persisted (audit: false 'Saved' after a failed autosave).
  const [pendingError, setPendingError] = useState(false);
  const conflictRef = useRef(false);

  // Ref for "is a save currently in flight" — guarding setState
  // doesn't help because React batches updates; a plain mutable ref
  // gives us reliable in-flight detection.
  const inFlightRef = useRef(false);
  // "A save was requested while one was already running." The drain
  // loop in runSave re-runs once more when this is set, so a flush or
  // hide-triggered save is never silently dropped just because an
  // interval tick happened to be mid-flight (audit: autosave-flush-no-queue).
  const pendingRef = useRef(false);
  // Auto-clear "Save failed" after 60 s so a stale error badge doesn't
  // persist indefinitely when the next ticks simply have nothing to save
  // (audit: autosave-stale-error-status).
  const errorClearTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The promise for the currently-draining save loop. flush() callers
  // join this so an awaited flush() resolves only once their requested
  // save has actually run, even if another save was in flight when they
  // called (audit: autosave-pagehide-no-await coupling).
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  // Last-known etag for optimistic concurrency. Seeded from open() via
  // initialEtag, refreshed from each successful save, and reseeded whenever the
  // doc changes so a stale etag can't leak across documents.
  const lastEtagRef = useRef<string | undefined>(initialEtag);
  // Seed the concurrency etag from the freshly-opened doc, but NEVER clobber an
  // etag we've already advanced via a save — initialEtag can resolve late
  // (undefined → loadState.etag) after a save already ran, which would send a
  // stale version and cause a spurious conflict. Reset only when the doc changes.
  const seededDocRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (seededDocRef.current !== docId) {
      seededDocRef.current = docId;
      lastEtagRef.current = initialEtag; // new document — take its etag
    } else if (lastEtagRef.current === undefined && initialEtag !== undefined) {
      lastEtagRef.current = initialEtag; // same doc, etag resolved after mount
    }
  }, [docId, initialEtag]);

  // Callbacks captured via ref so the tick effect doesn't restart
  // when the host passes a fresh arrow on every render. Same trick
  // PersonalAuthGate uses for onAuthenticated.
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onErrorRef.current = onError;
  }, [onSaved, onError]);

  // Snapshot of the host-controlled deps inside a ref so the timing
  // effect can read fresh values without re-firing on every change.
  const cfgRef = useRef({ fileSource, docId, editorRef, name, isReady });
  useEffect(() => {
    cfgRef.current = { fileSource, docId, editorRef, name, isReady };
  }, [fileSource, docId, editorRef, name, isReady]);

  /**
   * Performs exactly one save round-trip and reflects the outcome in
   * status / lastSavedAt / lastError. Bounded by SAVE_TIMEOUT_MS: a
   * FileSource.save() that hangs (network stall, unresponsive host)
   * resolves as an error instead of pinning the in-flight flag forever
   * and silently halting all future autosaves (audit:
   * autosave-inflight-deadlock).
   */
  const executeOne = useCallback(async (): Promise<void> => {
    const cfg = cfgRef.current;
    // Not-ready (e.g. collab still syncing): skip silently without flashing a
    // 'saving' status every tick, and never touch the stored document.
    if (cfg.isReady && !cfg.isReady()) return;
    setStatus('saving');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<AutoSaveTickResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ kind: 'err', err: new Error('autosave timed out') }),
        SAVE_TIMEOUT_MS
      );
    });
    try {
      const result = await Promise.race([
        performAutoSave({
          getRef: () => cfg.editorRef.current,
          fileSource: cfg.fileSource,
          docId: cfg.docId,
          name: cfg.name,
          isReady: cfg.isReady,
          etag: lastEtagRef.current,
        }),
        timeout,
      ]);
      switch (result.kind) {
        case 'ok':
          // Advance the concurrency chain so the NEXT save's If-Match matches
          // the version we just wrote.
          lastEtagRef.current = result.etag;
          setLastSavedAt(result.savedAt);
          setStatus('saved');
          setLastError(null);
          setPendingError(false);
          clearTimeout(errorClearTimerRef.current);
          errorClearTimerRef.current = undefined;
          onSavedRef.current?.(result.savedAt, result.etag);
          break;
        case 'err':
          if (isConflictError(result.err)) {
            // Adopt the host's CURRENT version from the conflict error so a
            // user-initiated flush() ('Save anyway') sends it and overwrites,
            // instead of re-threading the stale etag and conflicting forever
            // (WopiSaveConflictError.actual / PersonalFileSourceError.actual).
            const actual = (result.err as { actual?: string }).actual;
            if (actual) lastEtagRef.current = actual;
            // Durable conflict: pause the auto-loop and surface it until the
            // user resolves it. Deliberately NOT auto-cleared — a hidden
            // conflict means every further edit is silently lost.
            conflictRef.current = true;
            setConflict(true);
            setStatus('error');
            setLastError(result.err);
            setPendingError(true);
            clearTimeout(errorClearTimerRef.current);
            errorClearTimerRef.current = undefined;
            onErrorRef.current?.(result.err);
            break;
          }
          setStatus('error');
          setLastError(result.err);
          setPendingError(true);
          // Auto-clear the error badge after 60 s so a one-off failure
          // doesn't haunt the title bar forever (autosave-stale-error-status).
          clearTimeout(errorClearTimerRef.current);
          errorClearTimerRef.current = setTimeout(() => {
            setStatus((s) => (s === 'error' ? 'idle' : s));
            setLastError(null);
            errorClearTimerRef.current = undefined;
          }, 60_000);
          onErrorRef.current?.(result.err);
          break;
        case 'skip':
          // Idle if there was nothing to save; preserve any prior
          // 'saved' status when the skip was just "no edits since
          // last tick" so the host's "Saved at HH:MM" sticks.
          if (result.reason === 'no-ref') setStatus('idle');
          else setStatus((s) => (s === 'saving' ? 'idle' : s));
          break;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, []);

  /**
   * Public save entry point. Coalescing + guaranteed-flush: requests a
   * save and drains every pending request through a single loop so
   * concurrent callers (interval tick + hide flush + host "Save & close")
   * never drop each other's intent. Returns a promise that resolves once
   * the requested save has actually run, even when another save was in
   * flight at call time.
   */
  const runSave = useCallback((): Promise<void> => {
    // Register intent first, so a call that arrives mid-flight is picked
    // up by the running drain loop rather than skipped.
    pendingRef.current = true;
    if (inFlightRef.current && inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }
    inFlightRef.current = true;
    const drain = (async () => {
      try {
        while (pendingRef.current) {
          pendingRef.current = false;
          await executeOne();
        }
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;
      }
    })();
    inFlightPromiseRef.current = drain;
    return drain;
  }, [executeOne]);

  // Public save entry point. Unlike the interval/hide callers, this clears an
  // active conflict pause first — it represents a deliberate user decision to
  // overwrite (the WopiFileSource has already adopted the host's current
  // version, so this save succeeds rather than re-conflicting).
  const flush = useCallback((): Promise<void> => {
    conflictRef.current = false;
    setConflict(false);
    return runSave();
  }, [runSave]);

  // Interval ticker. Re-arms when `enabled` or `interval` change;
  // every other dep is read via ref so the timer survives parent
  // re-renders. Suppressed while a conflict is unresolved so we don't
  // silently re-conflict (WOPI) or overwrite the other writer.
  useEffect(() => {
    if (!enabled || interval <= 0) return;
    const id = setInterval(() => {
      if (!conflictRef.current) void runSave();
    }, interval);
    return () => clearInterval(id);
  }, [enabled, interval, runSave]);

  // Flush the final interval of edits when the page is being hidden or
  // unloaded, so closing the tab between ticks doesn't lose up to one
  // interval's worth of edits (Phase 2 / audit doc 17 — "Option A").
  //
  // `visibilitychange` → 'hidden' is the reliable primary signal: it
  // fires on tab switch, app switch, and close, while the page is usually
  // still alive enough to complete an async save. `pagehide` backs it up
  // for the real unload / bfcache path. We deliberately avoid
  // `beforeunload` — browsers don't honour its async work and registering
  // it disables the back/forward cache. Best-effort, not a safety net for
  // crash / network-drop (that's the deferred server-side snapshot,
  // "Option C" in doc 18); it closes the common tab-close case.
  useEffect(() => {
    if (!enabled) return;
    const flushOnHide = () => {
      // Don't await — the page may be going away. Skip while a conflict is
      // unresolved: a hide-flush must not silently overwrite the other writer.
      if (!conflictRef.current) void runSave();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushOnHide();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushOnHide);
    };
  }, [enabled, runSave]);

  // Clear stale error timer on unmount.
  useEffect(() => {
    return () => clearTimeout(errorClearTimerRef.current);
  }, []);

  // Stable object identity so hosts can pass the return value into
  // dependency arrays without churn.
  return useMemo(
    () => ({
      status,
      lastSavedAt,
      lastError,
      conflict,
      pendingError,
      flush,
    }),
    [status, lastSavedAt, lastError, conflict, pendingError, flush]
  );
}
