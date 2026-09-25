/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Boot-time probe — picks the right FileSource implementation for
 * the running deploy mode.
 *
 * Probe order (see chooseFileSource):
 *
 *   1. !__GATEWAY_BUILD__                           → BrowserFileSource
 *   2. URL matches /doc/{id}?access_token=          → WopiFileSource
 *   3. /auth/me returns 200                         → PersonalFileSource
 *   4. Else (gateway unreachable / 401)             → BrowserFileSource
 *
 * `__GATEWAY_BUILD__` is the build-time flag set by the Docker image's
 * Vite config; the static-Pages build leaves it `false`.
 */

import { BrowserFileSource } from './browser';
import { PersonalFileSource } from './personal';
import type { FileSource } from './types';
import type { UserWire } from './wire';
import { WopiFileSource } from './wopi';

declare const __GATEWAY_BUILD__: boolean | undefined;

export interface ChooseFileSourceOptions {
  /**
   * Origin of the gateway. Defaults to "" (same-origin). Local dev
   * with Vite on :5173 should pass `http://localhost:8080`.
   */
  baseUrl?: string;
  /**
   * Override for fetch. Tests inject a mock here; production passes
   * nothing and the global fetch is used.
   */
  fetchImpl?: typeof fetch;
  /**
   * If your build doesn't have access to the `__GATEWAY_BUILD__`
   * compile-time flag, set this directly. Defaults to whatever the
   * flag evaluates to.
   */
  gatewayBuild?: boolean;
  /**
   * Override the WOPI URL probe. Mainly for tests that inject a
   * synthetic context; production should leave it unset and let
   * the probe scan window.location.
   */
  wopiContext?: WopiContext | null;
}

/**
 * WopiContext is the bundle of state the WOPI redirect lands in
 * the browser URL: docId (path component) + access_token (query
 * param). Extracted once at boot by `extractWopiContext()`.
 */
export interface WopiContext {
  docId: string;
  accessToken: string;
}

/**
 * extractWopiContext scans a browser-Location-shaped object for the
 * WOPI redirect's URL fingerprint:
 *
 *     /doc/{base64url-docId}?access_token=<JWT>
 *
 * Returns null when the URL doesn't match (any other page on a
 * gateway-built editor — landing, personal-mode dashboard, etc.).
 * Exported so the host app can call it directly for its own routing.
 */
export function extractWopiContext(loc?: { pathname: string; search: string }): WopiContext | null {
  const l = loc ?? (typeof window !== 'undefined' ? window.location : null);
  if (!l) return null;
  const params = new URLSearchParams(l.search);
  const token = params.get('access_token');
  // Match /doc/<docId> where docId is base64url. We don't anchor the
  // tail strictly — a trailing slash + query is fine — because the
  // SPA router may rewrite the path slightly.
  const match = l.pathname.match(/^\/doc\/([A-Za-z0-9_-]+)\/?$/);
  if (!token || !match) return null;
  return { docId: match[1], accessToken: token };
}

/**
 * Remove the `access_token` query param from the visible browser URL via
 * history.replaceState, once it's been captured in memory. A WOPI JWT sitting
 * in the address bar leaks into browser history, referrers, bookmarks, and any
 * screen-share; we keep it only in the FileSource instance. No-op outside the
 * browser or when there's no token to strip.
 */
export function stripAccessTokenFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('access_token')) return;
    url.searchParams.delete('access_token');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* malformed URL / sandboxed history — nothing safe to do. */
  }
}

/**
 * Runs the probe and returns the chosen source. Never throws — every
 * branch has a defined fallback so the editor always boots with
 * *some* FileSource.
 *
 * Probe order (highest priority first):
 *
 *   1. !gatewayBuild              → BrowserFileSource
 *   2. WOPI URL present           → WopiFileSource
 *   3. /auth/me responds 200      → PersonalFileSource
 *   4. else                       → BrowserFileSource (fallback)
 *
 * WOPI is checked before personal because a Mode-2 deploy may also
 * have personal auth mounted (it's the same gateway). The URL is the
 * deciding signal: a freshly-redirected WOPI user has the access_token
 * in their URL; a personal-mode user does not.
 */
export async function chooseFileSource(opts: ChooseFileSourceOptions = {}): Promise<FileSource> {
  const isGatewayBuild =
    opts.gatewayBuild ?? (typeof __GATEWAY_BUILD__ !== 'undefined' && __GATEWAY_BUILD__);
  if (!isGatewayBuild) {
    return new BrowserFileSource();
  }

  const baseUrl = opts.baseUrl ?? '';
  // Wrap fetch in an arrow so it's not bound to `this` — see the
  // fetchImpl pattern in personal.ts / wopi.ts.
  const fetchImpl: typeof fetch =
    opts.fetchImpl ?? (((input, init) => fetch(input, init)) as typeof fetch);

  // 1. WOPI probe — the URL alone is enough to pick this branch.
  //    The token's validity is collab's problem; if it's bad, the
  //    eventual /wopi/files/{id}/contents call will surface a
  //    403 / 401 and the editor's error boundary takes over.
  const wopi = opts.wopiContext ?? extractWopiContext();
  if (wopi) {
    const source = new WopiFileSource({
      docId: wopi.docId,
      accessToken: wopi.accessToken,
      baseUrl,
      fetchImpl,
    });
    // Token is now captured in-memory in the FileSource — wipe it from the
    // address bar so it can't leak via history / referrer / screen-share.
    if (!opts.wopiContext) stripAccessTokenFromUrl();
    return source;
  }

  // 2. Personal probe — /auth/me returning 200 means there's a live
  //    session cookie on this origin.
  try {
    const res = await fetchImpl(baseUrl + '/auth/me', { credentials: 'include' });
    if (res.ok) {
      const body = (await res.json()) as { user: UserWire };
      return new PersonalFileSource({
        baseUrl,
        user: { id: body.user.id, username: body.user.username },
        fetchImpl,
      });
    }
  } catch {
    // Gateway unreachable from a Mode-3 build is the operator's bug,
    // not the user's. Fall through to BrowserFileSource so the editor
    // still loads (in degraded mode); the auth gate UI in the
    // embedding app will surface the real failure.
  }
  return new BrowserFileSource();
}
