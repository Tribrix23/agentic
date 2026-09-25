/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * CasualEditorIframe — the iframe-mounting variant of `<CasualEditor>`.
 * Doc 16 §5 + §6.
 *
 * **This is the guaranteed style-isolation path** (doc 38 §8). Because the
 * editor mounts inside a same-origin iframe, none of its styles, Tailwind
 * utilities, design-system tokens, or fonts can leak onto the host page, and
 * the host's CSS cannot bleed into the editor. Direct-mount `<CasualEditor>`
 * shares the host's DOM/CSS scope; prefer this variant when strict isolation
 * or strict-CSP compliance matters.
 *
 * For strict-CSP hosts (`style-src 'nonce-…'`), pass {@link
 * CasualEditorIframeProps.cspNonce} — it is threaded through the iframe URL and
 * stamped onto every stylesheet in the iframe document so none are blocked.
 *
 * Public surface is intentionally identical to the existing
 * `<CasualEditor>` so v1.1's migration path is one component swap.
 * v1.2 will rename CasualEditorIframe → CasualEditor (and the
 * existing direct-mount component → CasualEditorDirect).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from 'react';

import { applyCspNonce } from './cspNonce';
import { EmbedHostTransport } from '../embed/EmbedHostTransport';
import type {
  CasualApp,
  CasualErrorData,
  LoadResponseData,
  SaveResponseData,
  SelectionChangedData,
  TelemetryEventData,
} from '../embed/protocol';
import type { FileSource } from '../file-source/types';

export interface CasualEditorIframeRef {
  /** Force a save now via the wire. */
  setViewMode(mode: 'preview' | 'editor'): void;
  /** The underlying iframe, if mounted. Escape hatch only. */
  iframe(): HTMLIFrameElement | null;
}

export interface CasualEditorIframeProps {
  fileSource: FileSource;
  docId: string;
  /** Default `editor`. Live changes push through casual.command.set.viewmode. */
  viewMode?: 'preview' | 'editor';
  /** Default `/embed/docs`. Consumer copies the SDK's
   *  `dist/embed/{embed.html, embed-runtime.js, embed-runtime.css}` to
   *  this path. */
  embedBasePath?: string;
  /** Default `docs`. Sheet SDK ships its own variant with `app: 'sheet'`. */
  app?: CasualApp;
  /** CSP nonce for strict-CSP hosts (`style-src 'nonce-<value>'`). Pass the
   *  same value used in the host's CSP header: it is threaded through the
   *  iframe URL and stamped as the `nonce` attribute on every `<style>` /
   *  `<link rel="stylesheet">` in the iframe document, so the editor's styles
   *  aren't blocked. Omit when the host has no strict style-src policy. */
  cspNonce?: string;
  onSelectionChanged?: (data: SelectionChangedData) => void;
  onTelemetry?: (data: TelemetryEventData) => void;
  onError?: (data: CasualErrorData) => void;
  style?: CSSProperties;
  className?: string;
  testId?: string;
}

const DEFAULT_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
};

export const CasualEditorIframe = forwardRef<CasualEditorIframeRef, CasualEditorIframeProps>(
  function CasualEditorIframe(props, ref) {
    const {
      fileSource,
      docId,
      viewMode = 'editor',
      embedBasePath = '/embed/docs',
      app = 'docs',
      cspNonce,
      onSelectionChanged,
      onTelemetry,
      onError,
      style,
      className,
      testId = 'casual-editor-iframe',
    } = props;

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const transportRef = useRef<EmbedHostTransport | null>(null);
    const nonceCleanupRef = useRef<(() => void) | null>(null);

    // Latest fileSource via ref so the load/save handlers don't
    // rebuild the transport on every consumer re-render.
    const fileSourceRef = useRef(fileSource);
    fileSourceRef.current = fileSource;

    const onLoad = useCallback(async (req: { docId: string }): Promise<LoadResponseData> => {
      try {
        const { bytes, name, etag } = await fileSourceRef.current.open(req.docId);
        return {
          ok: true,
          bytes,
          fileName: name,
          ...(etag !== undefined ? { etag } : {}),
        };
      } catch (err) {
        return {
          ok: false,
          code: 'open_failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }, []);

    const onSave = useCallback(
      async (req: {
        docId: string;
        bytes: ArrayBuffer;
        baseEtag?: string;
      }): Promise<SaveResponseData> => {
        try {
          const opts = req.baseEtag !== undefined ? { etag: req.baseEtag } : undefined;
          const { etag } = await fileSourceRef.current.save(req.docId, req.bytes, opts);
          return { ok: true, etag };
        } catch (err) {
          return {
            ok: false,
            code: 'save_failed',
            message: err instanceof Error ? err.message : String(err),
          };
        }
      },
      []
    );

    // Wire the transport when the iframe fires `load`.
    const onIframeLoad = useCallback(() => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      // Stamp the CSP nonce onto the iframe document's stylesheets (present
      // now and injected later) so strict-CSP hosts don't block them.
      nonceCleanupRef.current?.();
      nonceCleanupRef.current = cspNonce ? applyCspNonce(iframe.contentDocument, cspNonce) : null;
      transportRef.current?.destroy();
      const transport = new EmbedHostTransport({
        app,
        iframeWindow: iframe.contentWindow,
        embedOrigin: window.location.origin,
      });
      transport.on({
        onLoadRequest: onLoad,
        onSaveRequest: onSave,
        ...(onSelectionChanged ? { onSelectionChanged } : {}),
        ...(onTelemetry ? { onTelemetry } : {}),
        ...(onError ? { onError } : {}),
        onEditorReady: () => {
          transport.sendHostHello({ capabilities: ['load', 'save'] });
          transport.sendSetViewMode({ viewMode });
        },
      });
      transportRef.current = transport;
    }, [app, cspNonce, onLoad, onSave, onSelectionChanged, onTelemetry, onError, viewMode]);

    // Push viewMode changes through the wire instead of re-mounting.
    useEffect(() => {
      transportRef.current?.sendSetViewMode({ viewMode });
    }, [viewMode]);

    // Tear-down on unmount.
    useEffect(() => {
      return () => {
        transportRef.current?.destroy();
        transportRef.current = null;
        nonceCleanupRef.current?.();
        nonceCleanupRef.current = null;
      };
    }, []);

    // Imperative ref API.
    if (ref) {
      const apiRef = ref as MutableRefObject<CasualEditorIframeRef | null>;
      apiRef.current = {
        setViewMode: (mode) => transportRef.current?.sendSetViewMode({ viewMode: mode }),
        iframe: () => iframeRef.current,
      };
    }

    const url =
      `${embedBasePath}/embed.html` +
      `?app=${app}` +
      `&docId=${encodeURIComponent(docId)}` +
      `&viewMode=${viewMode}` +
      // Threaded so the embed runtime can also apply the nonce at parse time.
      (cspNonce ? `&cspNonce=${encodeURIComponent(cspNonce)}` : '');

    return (
      <iframe
        ref={iframeRef}
        src={url}
        onLoad={onIframeLoad}
        title="Casual Editor"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
        style={{ ...DEFAULT_STYLE, ...style }}
        className={className}
        data-testid={testId}
      />
    );
  }
);
