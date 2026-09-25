/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Returns true when the DocOps AI panel should be available.
 *
 * Enabled via the explicit feature flag on web, and ALWAYS on the desktop
 * (Tauri) shell: there the native `ai-worker` model is the only working AI
 * backend, so the DocOps panel — which routes through `DesktopTransport` to
 * that model — is the primary AI surface. (The browser WebLLM "writer" tier
 * the panel replaces is never loaded on desktop.)
 */
export function isDocOpsEnabled(): boolean {
  if (window.__casualFeatures__?.docops) return true;
  return !!(window as { __TAURI__?: unknown }).__TAURI__;
}
