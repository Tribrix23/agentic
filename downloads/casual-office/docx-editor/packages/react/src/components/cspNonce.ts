/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * cspNonce — helper for strict-CSP (Content-Security-Policy) hosts.
 *
 * A host serving `style-src 'nonce-<value>'` blocks any `<style>` / `<link
 * rel="stylesheet">` that doesn't carry a matching `nonce` attribute. The
 * iframe-mounted editor (`<CasualEditorIframe>`) is the style-isolation path,
 * so its stylesheets live in the same-origin iframe document. When the host
 * passes the same nonce it put in its CSP header, we stamp it onto every
 * stylesheet the iframe document contains — both the ones present at load and
 * any injected later by the runtime — so the browser keeps them.
 *
 * Same-origin only: the embed document is served from the host origin and the
 * iframe carries `allow-same-origin`, so `iframe.contentDocument` is reachable.
 * If cross-origin access throws, we bail quietly — the nonce is also threaded
 * through the iframe URL for the runtime to apply at parse time.
 */

/** Selector for the elements a CSP `style-src` nonce governs. */
const STYLE_SELECTOR = 'style, link[rel="stylesheet"]';

function stampElement(el: Element, nonce: string): void {
  // `nonce` is an IDL attribute on HTMLStyleElement/HTMLLinkElement; setting
  // the content attribute too covers older engines and querySelector matching.
  if (el.getAttribute('nonce') === nonce) return;
  el.setAttribute('nonce', nonce);
  (el as HTMLElement & { nonce?: string }).nonce = nonce;
}

/**
 * Stamp `nonce` onto every current and future stylesheet in `doc`.
 *
 * Returns a cleanup function that disconnects the observer watching for
 * runtime-injected stylesheets. Safe to call with an empty nonce (no-op) and
 * safe if `doc` is briefly inaccessible.
 *
 * @param doc   The iframe's `contentDocument`.
 * @param nonce The CSP nonce value (without the `nonce-` prefix).
 */
export function applyCspNonce(doc: Document | null | undefined, nonce: string): () => void {
  const noop = (): void => {};
  if (!doc || !nonce) return noop;

  const stampAll = (): void => {
    doc.querySelectorAll(STYLE_SELECTOR).forEach((el) => stampElement(el, nonce));
  };

  try {
    stampAll();
  } catch {
    return noop;
  }

  if (typeof MutationObserver === 'undefined' || !doc.head) return noop;

  // Stylesheets can be injected after the document loads (e.g. the runtime's
  // bundler emitting <style> tags). Watch the head and stamp new ones.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(STYLE_SELECTOR)) stampElement(node, nonce);
        node.querySelectorAll?.(STYLE_SELECTOR).forEach((el) => stampElement(el, nonce));
      });
    }
  });
  observer.observe(doc.head, { childList: true, subtree: true });
  return () => observer.disconnect();
}
