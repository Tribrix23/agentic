# 39 — Embedded-mode contract (the editor *is* the host's editor)

_From the 2026-07-09 four-stream analysis (docs gap, sheets gap, requirements audit, platform research: Zoho / OnlyOffice / WOPI / Collabora / Slack / TipTap-CKEditor-Froala-Nutrient-Syncfusion). Sibling of [[38-unified-sdk-contract]]._

## The bar (user's words)
"It should NOT feel embedded — it should be **part of dochub after integration, not a separate product added through**." So: after integration a user opens a file in dochub and edits it *in dochub*. The editor is an invisible engine; **the host is the product, all the way down.** Zero separate-product signals — no editor logo, menubar, About, file dialogs, or download-instead-of-save.

## Core finding
The SDKs are ~70% embed-ready (they already have `chrome`, `features`, `documentMode`, `collab`, `user`, `fileSource`/`onSave`). The **one true gap** was: there was **no chrome level that hides the app shell (logo/menubar/About/Help) while keeping the editing toolbar**. `chrome:"full"` renders the SDK's TitleBar+MenuBar (→ the "two shells"); `chrome:"none"` also kills the toolbar. Docs was the offender; **sheets is already ~native** (no logo, no File▸Open, Cmd+S already saves) except a "View on GitHub" Help link + thin menus.

> **RESOLVED (2026-07-19):** docs shipped `chrome:"embedded"` — a fourth preset that gates the app shell (title bar + menu bar) *independently* of the editing surface. `resolveChromeVisibility()` (`docx-editor/packages/react/src/components/features.ts`) computes `appShellDefault = chrome !== 'embedded' && chrome !== 'none'` while keeping toolbar/menus as the editing surface; the preset is exposed as `chrome?: 'none' | 'minimal' | 'embedded' | 'full'` (`DocxEditor.tsx:656`). This closes the two-shells + logo + menubar + About gap.

## The contract — `mode:"embedded"` + a `host` object

> **Shipped-shape note (2026-07-19):** the `mode="embedded"` + nested `chrome={{…}}` object + unified `host={{…}}` object sketched below did **not** ship in this shape. What landed is a **`chrome` string enum** (`'none' | 'minimal' | 'embedded' | 'full'`) plus **flat props** (`showToolbar`, `features`, `onSave`, `collab`, `user`, …) — `mode` stays reserved for the editor's `EditorMode` (editing/suggesting/viewing). The **unified `host` object remains open** (not yet a single prop). The block below is the original design sketch, kept for intent.

Same-origin React ⇒ **props/callbacks, not postMessage** (drop the iframe tax; keep a postMessage adapter in reserve for true 3rd-party hosts). Modeled on OnlyOffice `customization` + `events` and Zoho `save_url`, but as JS functions.

```ts
<CasualEditor
  docId title docType={"word"|"cell"}      // one SDK, doctype switch (OnlyOffice)
  source={{ bytes | url | ir }}            // HOST provides the file
  permissions={{ edit, comment, review, download, print, share, rename }}
  mode="embedded"                          // flips ALL chrome defaults at once
  chrome={{ menuBar:false, toolbar:'full', statusBar:false, about:false,
            help:false, logo:false, close:{visible:true} }}  // granular overrides
  host={{
    onReady, onDirtyChange, onSave({bytes|ir, reason}),   // reason: shortcut|autosave|interval|close
    onSaveAs, onSelection, onRename, onRequestOpen, onClose, onError,
    user, collab:{ server, room:fileId, token }, autosave:{ enabled, waitingTime:1500 },
  }}
  ref  // .save() .forceSave() .getContent() .setContent() .executeCommand()
/>
```

`mode="embedded"` bakes in the behavior — a host can't get it half-right:
- **Cmd/Ctrl+S** → `preventDefault()` → `host.onSave({reason:'shortcut'})`; NEVER downloads (handle `metaKey`+`ctrlKey`).
- **Hidden (host owns):** logo, menubar, window title, About, Help, Feedback, account menu, File▸Open/New/Save/Export/Download, the editor's version-history panel.
- **Suppressed keys:** Cmd+O, Cmd+N (host owns open/new).
- **Kept (editing surface):** formatting toolbar, formula bar + name box + sheet tabs (sheets), grid, ruler, zoom, panel rail, comments/suggestions/track-changes (inline).
- **Delegated:** save/persistence (`onSave`/fileSource), versions (host ledger), presence (in-canvas cursors + host header pile), theme/locale/identity (`appearance`/`locale`/`user`), errors/loading (`onError`/`renderError`).

## The 10 must-gets (platform-validated checklist)
1 explicit embedded preset (not 15 flags) · 2 host owns save, SDK signals dirty + emits bytes · 3 Ctrl+S rerouted to host · 4 OnlyOffice-modeled chrome flags · 5 two-stage ready handshake (`onReady`) · 6 full event vocabulary (ready/change/save/saveAs/selection/close/error/requestOpen/rename) · 7 host owns file identity/lifecycle · 8 permissions first-class (gate capability, not just UI) · 9 collab-by-config, **one backend for all doc types** · 10 exact-origin allowlist if postMessage ever used. Plus `forceSave()` + autosave debounce.

## Net-new SDK work (docs + sheets, lockstep)
1. ~~**The editing-only chrome level**~~ — **DONE (2026-07-19).** Shipped as the `chrome:'embedded'` preset: hides TitleBar/MenuBar/logo/About **independently of the toolbar gate**. The TitleBar+MenuBar were previously welded to `showToolbarEffective`; `resolveChromeVisibility()` (`features.ts`) now splits the app shell (`appShellDefault`) from the editing surface, and `chrome:'embedded'` (`DocxEditor.tsx:656`) drops the shell while keeping toolbar + menus. This killed the two-shells + logo + menubar + About.
2. **Ctrl+S default = host-save-no-download** in embedded (works today when `onSave` set; make it the default). Suppress Cmd+O/N.
3. **Sheets:** add `feature:'help'`/`'branding'` gate (kill "View on GitHub", `MenuBar.tsx:1106/1122`); ship the ~10 missing dialogs (insert-function, conditional-formatting, data-validation, name-manager, custom-sort, …) so it's a real editor, not a toy; add a peer-roster to collab status for header parity.
4. **The `host` object** (unified open/save/close/versions/presence delegation) on both.

## Host-only quick wins (ship to Drive NOW, no SDK release)
- Docs: pass `onSave` → **Cmd+S saves to Drive, no download** (worst offender); `onRequestOpen:()=>{}` → Cmd+O off; `renderLogo:()=>null` → hide the doc icon.
- Sheets: `features={{ file:false }}`.
These remove the biggest offenders immediately; the editing-only chrome level + sheets gates are the SDK release that finishes it.

## Single collab server (all apps)
One app-agnostic `@casualoffice/collab` deployment (Hocuspocus+Yjs, `room=fileId`, format-agnostic) brokers docs + sheets + future apps. Today the compose points at the docs-bundled image as the gateway — move to a **dedicated collab image** any app points at. Zoho/OnlyOffice both prove one session model serves both doc types.

## Depth decision (for sign-off)
- **A — Recommended: SDK toolbar, app-shell hidden.** `mode:"embedded"` hides logo/menu/About/shell; the SDK's formatting toolbar stays, themed to dochub tokens. This is what OnlyOffice/Zoho/WOPI/Collabora all do — the toolbar is "editing," not "chrome." Fastest, proven native.
- **B — Deepest: host renders its OWN toolbar via `executeCommand`.** SDK near-headless (TipTap-style); dochub draws the formatting bar. Most "it's literally dochub," biggest lift, only pure-headless editors do it. Can be a phase-2 on top of A (the imperative `executeCommand` handle already exists).

## Plan
0. Host-only quick wins → Drive (immediate).
1. SDK: `mode:"embedded"` + editing-only chrome + Ctrl+S/O/N + `host` object — docs + sheets lockstep.
2. Sheets: help/branding gate + missing dialogs + peer roster.
3. Dedicated app-agnostic collab image; point Drive + compose at it.
4. Drive: adopt `mode:"embedded"` + `host` → re-verify (screenshots + Cmd+S-saves + one-shell).
