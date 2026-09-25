# Casual Editor SDK — consumer guide

Integrating `@casualoffice/docs` (the Casual Editor — a WYSIWYG `.docx` editor) into
a host app. This guide covers the **unified SDK contract** shipped across the doc-38
work: the imperative handle, the events map, feature flags, extensions,
collaboration, the AI assistant, and style isolation.

Every symbol named here is a real export of `@casualoffice/docs` as of `main`. The
package barrel is `packages/react/src/index.ts`.

> Casual Sheets (`@casualoffice/sheets`) exposes the same unified contract
> (`documentMode`, `features`, `.on()/.off()`, `getContent`/`setContent`, collab by
> config) so a host that learns one editor already knows the other.

---

## 1. Install and mount

```bash
npm install @casualoffice/docs
```

The editor ships a stylesheet you **must** import once — it is not auto-injected:

```ts
import '@casualoffice/docs/styles.css';
```

There are two React mount styles plus one framework-agnostic imperative mount.

### `<CasualEditor>` — batteries-included wrapper

The wrapper bundles the editor + a `FileSource` (bytes I/O) + optional collab +
optional autosave. Point it at a document id and hand it a storage adapter:

```tsx
import { CasualEditor, BrowserFileSource } from '@casualoffice/docs';
import '@casualoffice/docs/styles.css';

const fileSource = new BrowserFileSource();

export function App() {
  return <CasualEditor fileSource={fileSource} docId="my-doc.docx" autosave />;
}
```

### `<DocxEditor>` — the raw editing surface

When you want to own loading/saving yourself, mount `DocxEditor` directly and feed it
bytes via `documentBuffer` (an `ArrayBuffer`, `Uint8Array`, `Blob`, or `File`) or a
pre-parsed `document`:

```tsx
import { useRef } from 'react';
import { DocxEditor, type DocxEditorRef } from '@casualoffice/docs';
import '@casualoffice/docs/styles.css';

export function App({ bytes }: { bytes: ArrayBuffer }) {
  const ref = useRef<DocxEditorRef>(null);
  return <DocxEditor ref={ref} documentBuffer={bytes} onReady={(api) => api.focus()} />;
}
```

### `renderAsync` — imperative mount (no React in your code)

`renderAsync(input, container, options)` mounts the editor into a DOM node and
resolves to a `DocxEditorHandle` once the document has parsed:

```ts
import { renderAsync } from '@casualoffice/docs';
import '@casualoffice/docs/styles.css';

const handle = await renderAsync(docxBlob, document.getElementById('editor')!, {
  documentMode: 'editing',
});

const blob = await handle.save(); // Blob | null
handle.destroy();
```

`options` is every `DocxEditorProps` key except `documentBuffer` / `document` (the
bytes are the first argument). `DocxEditorHandle` is a small surface —
`save()` (returns a `Blob`), `getDocument()`, `focus()`, `setZoom()`,
`scrollToParaId()`, `scrollToPosition()`, `destroy()`. For the full imperative handle
(events, `executeCommand`, etc.) use the React `ref` on `<DocxEditor>` / `<CasualEditor>`
(§5).

---

## 2. Modes

The interaction mode is `documentMode` — one of three values (`EditorMode`):

```ts
type EditorMode = 'editing' | 'suggesting' | 'viewing';
```

- `'editing'` — direct edits (default).
- `'suggesting'` — edits captured as tracked changes.
- `'viewing'` — read-only.

Set it declaratively:

```tsx
<DocxEditor documentBuffer={bytes} documentMode="suggesting" />
```

or at runtime through the ref:

```ts
ref.current?.setDocumentMode('viewing');
const mode = ref.current?.getDocumentMode(); // 'viewing'
```

Mode changes fire `onDocumentModeChange(mode)` (the canonical name) and the
`'documentModeChange'` emitter event. `onModeChange` is the deprecated alias and
still fires. `documentMode` supersedes the older `mode` / `readOnly` props — when
both are supplied, `documentMode` wins.

---

## 3. Loading and saving a document

### With `<CasualEditor>` (via a FileSource)

The wrapper calls `fileSource.open(docId)` on mount and — with `autosave` —
`fileSource.save(docId, bytes)` on a tick (`autosaveInterval`, default 30000 ms).
`FileSource` is an interface; the SDK ships `BrowserFileSource`, `PersonalFileSource`,
and `WopiFileSource`, or you supply your own.

```tsx
<CasualEditor
  fileSource={myFileSource}
  docId={fileId}
  autosave
  autosaveInterval={15000}
  onSave={(bytes) => {/* host hook */}}
/>
```

`ref.current?.flushSave()` forces a save round-trip immediately (no-op when
`autosave` is off).

### With `<DocxEditor>` (bytes in, bytes out)

Feed bytes via `documentBuffer`; read them back with the imperative handle:

```ts
const bytes = await ref.current?.export();          // ArrayBuffer | null (canonical)
const doc   = ref.current?.getContent();            // parsed Document | null
ref.current?.setContent(doc);                       // load a parsed Document
await ref.current?.import(otherBytes);              // load DOCX bytes
```

`export()` / `import()` / `getContent()` / `setContent()` are the canonical
cross-editor names. `save()` / `loadDocumentBuffer()` / `getDocument()` /
`loadDocument()` still work as deprecated aliases.

---

## 4. Events

Every canonical event is available **two ways**: as an `on*` config prop, and via the
`.on(name, handler)` / `.off(name, handler)` emitter on the handle. Same event, same
payload. The config-prop name maps to the emitter name mechanically — drop `on`,
lower-camel the rest (`onSelectionChange` ⇄ `'selectionChange'`).

### Config-callback props

```tsx
<DocxEditor
  documentBuffer={bytes}
  onReady={(api) => {/* fired once, after mount + initial load */}}
  onChange={(doc) => {/* after every committed edit */}}
  onSelectionChange={(sel) => {/* cursor / selection moved */}}
  onSave={(bytes) => {/* after a successful save */}}
  onError={(err) => {/* editor surfaced an error */}}
  onDirtyChange={(dirty) => {/* dirty ⇄ clean transitions */}}
  onDocumentModeChange={(mode) => {/* mode switched */}}
/>
```

### The `.on()/.off()` emitter

```ts
const off = ref.current!.on('change', (doc) => console.log('edited', doc));
// …later
off();                 // disposer removes the listener
ref.current!.off('change', handler); // or remove explicitly
```

The full canonical event-name list (from `DocxEditorEvents`):

| Emitter name           | `on*` prop                 | Payload                    |
| ---------------------- | -------------------------- | -------------------------- |
| `ready`                | `onReady`                  | `DocxEditorRef` (the API)  |
| `change`               | `onChange`                 | `Document`                 |
| `selectionChange`      | `onSelectionChange`        | `SelectionState \| null`   |
| `save`                 | `onSave`                   | `ArrayBuffer`              |
| `error`                | `onError`                  | `Error`                    |
| `dirtyChange`          | `onDirtyChange`            | `boolean`                  |
| `documentModeChange`   | `onDocumentModeChange`     | `EditorMode`               |
| `collaborationReady`   | —                          | collab session info        |
| `collaborationStatus`  | —                          | collab status              |

`collaborationReady` / `collaborationStatus` are never emitted by the single-user
`DocxEditor` itself — the `CasualEditor` wrapper wires them from the collab session.

---

## 5. The imperative handle (`DocxEditorRef`)

`ref.current` (and the `onReady(api)` argument) expose the handle. The canonical
cross-editor methods:

| Method                                   | What it does                                              |
| ---------------------------------------- | -------------------------------------------------------- |
| `getContent()`                           | Current parsed `Document`, or `null`.                    |
| `setContent(doc)`                        | Load a pre-parsed `Document`.                            |
| `import(input)`                          | Load DOCX bytes (`ArrayBuffer`/`Uint8Array`/`Blob`/`File`). |
| `export(opts?)`                          | Serialize to `.docx` bytes (`ArrayBuffer \| null`).      |
| `getSelection()`                         | Current cursor / selection info, or `null`.              |
| `executeCommand(id, params?)`            | Run a registered editor command by id; resolves `boolean`. |
| `undo()` / `redo()`                      | Undo / redo the last edit; returns `boolean`.            |
| `focus()`                                | Focus the editing surface.                               |
| `setDocumentMode(mode)` / `getDocumentMode()` | Read / switch the mode at runtime.                  |
| `on(name, handler)` / `off(name, handler)` | Subscribe / unsubscribe to canonical events (§4).      |

```ts
await ref.current?.executeCommand('toggleBold');
ref.current?.undo();
```

The handle also carries a large set of document-agent helpers — `addComment`,
`replyToComment`, `resolveComment`, `proposeChange`, `findInDocument`,
`applyFormatting`, `setParagraphStyle`, `getPageContent`, `insertReportFromData`,
`createDocument`, `scrollToParaId`, `scrollToPage`, `setZoom` — plus escape hatches
`getAgent()` and `getEditorRef()`. Older method names (`getDocument`, `loadDocument`,
`importDocx`, `exportDocx`, `getSelectionInfo`, `save`) remain as deprecated aliases.

`<CasualEditor>`'s ref (`CasualEditorRef`) extends `DocxEditorRef` with `flushSave()`,
`collabPeers()`, and `collabStatus()`.

---

## 6. Hiding features

Pass a `features` map — a flat `Record<string, boolean>` of control-id → enabled.
`false` hides that control; an omitted key defaults to enabled. Ids come from the
published `DOCX_FEATURE_IDS` catalog (unknown ids are ignored, so the catalog can
grow without a breaking change):

```tsx
<DocxEditor
  documentBuffer={bytes}
  features={{ statusBar: false, ruler: false, bold: false }}
/>
```

`DOCX_FEATURE_IDS` covers coarse chrome regions — `toolbar`, `panelRail`,
`statusBar`, `zoomControl`, `printButton`, `outline`, `ruler` — and individual
toolbar controls — `bold`, `italic`, `underline`, `strikethrough`, `paintFormat`.
`isFeatureEnabled(features, id, fallback?)` resolves a single id if you need to branch
on it yourself.

The coarse `show*` props (`showToolbar`, `showStatusBar`, `showPanelRail`,
`showZoomControl`, `showPrintButton`, `showOutline`, `showRuler`) are **deprecated
shortcuts** into this map. They still work, but when both target the same region,
`features` wins. New code should use `features`. (`features` only applies when the
`chrome` preset renders that region.)

---

## 7. Extending the editor

### `editorExtensions` — add or replace behavior

`editorExtensions` is the SuperDoc-style, named way to add or replace ProseMirror
behavior without forking. Each `EditorExtension` has a stable `name` and contributes
raw plugins (an array, or a factory that receives the plugins assembled so far).
Extensions sharing a `name` collapse to the last declaration (override); set
`replace: true` to swap the whole accumulated plugin list instead of appending:

```tsx
import { DocxEditor, type EditorExtension } from '@casualoffice/docs';
import { Plugin } from 'prosemirror-state';

const myExt: EditorExtension = {
  name: 'my-behavior',
  plugins: [new Plugin({ /* … */ })],
};

<DocxEditor documentBuffer={bytes} editorExtensions={[myExt]} />;
```

### `externalPlugins` — the low-level escape hatch

`externalPlugins` takes a raw `Plugin[]` and composes with `editorExtensions` (both
are merged into the plugin stack). Prefer `editorExtensions` for host behavior; keep
`externalPlugins` for raw plugin arrays and collab wiring (e.g. `ySyncPlugin` from
`y-prosemirror`).

---

## 8. Collaboration by config

`<CasualEditor>` turns on real-time co-editing when you pass `backendUrl` — the
`ws://` / `wss://` base URL of a Casual (Hocuspocus + Yjs) gateway. The `docId`
doubles as the room id, and a `user` identity (name + color) is required in collab
mode for presence:

```tsx
<CasualEditor
  fileSource={fileSource}
  docId="room-42"
  backendUrl="wss://collab.example.com/yjs"
  user={{ name: 'Ada', color: '#7c3aed' }}
/>
```

Omit `backendUrl` and the editor runs **single-user** — no WebSocket, no Yjs runtime.
Initial load and final snapshot still flow through the `FileSource`; the socket only
carries Y updates between connected clients. In collab mode the wrapper renders a
presence cluster (avatars + status + Share) and a reconnect banner automatically;
subscribe to `onCollabState` for your own presence UI.

---

## 9. The AI assistant

The built-in DocOps assistant is the supported SDK surface. Unlock it with the `ai`
prop (no `window` global required):

```tsx
<DocxEditor
  documentBuffer={bytes}
  ai={{
    enabled: true,
    // transport is optional — auto-selected when omitted
    onAction: (action) => {
      // fires after each document *write* the assistant performs
      console.log(action.type, action.args, action.result);
    },
  }}
/>
```

- `ai.enabled` — unlocks the assistant panel.
- `ai.transport` — a `DocOpsTransport` routing LLM calls. When omitted it is
  auto-selected (desktop transport under Tauri, direct otherwise); a `CollabTransport`
  proxies through the collab server's `/api/ai/chat`. The explicit `docopsTransport`
  prop still wins when both are set.
- `ai.onAction(action)` — fired after each successful **write** tool run
  (`{ type, args, result }`). Read-only tool runs (searches, stats, outline) never
  fire it.

The `ai` prop is forwarded verbatim from `<CasualEditor>` to `<DocxEditor>`.

---

## 10. Style isolation

`<DocxEditor>` / `<CasualEditor>` mount into the host's DOM and share its CSS scope.
For **guaranteed** style isolation (and strict-CSP compliance) use
`<CasualEditorIframe>`, which mounts the editor inside a same-origin iframe so no
styles, Tailwind utilities, tokens, or fonts leak either way:

```tsx
import { CasualEditorIframe } from '@casualoffice/docs';

<CasualEditorIframe
  fileSource={fileSource}
  docId="my-doc.docx"
  embedBasePath="/embed/docs"
  cspNonce={nonce}
/>;
```

The consumer copies the SDK's `dist/embed/*` (`embed.html`, `embed-runtime.js`,
`embed-runtime.css`) into `embedBasePath` (default `/embed/docs`).

For strict-CSP hosts serving `style-src 'nonce-<value>'`, pass **`cspNonce`** — the
same value used in the host's CSP header. It is threaded through the iframe URL and
stamped as the `nonce` attribute on every `<style>` / `<link rel="stylesheet">` in
the iframe document, so the editor's styles aren't blocked.

### Theming with `--ce-*` tokens

The public theming surface is the `--ce-*` CSS custom-property set (Casual Editor).
Set them on a host wrapper to recolor the editor; internal `--doc-*` variables are an
implementation detail. The `--ce-*` aliases:

| Token             | Controls                          |
| ----------------- | --------------------------------- |
| `--ce-bg`         | Desk behind the page              |
| `--ce-page-paper` | Default page fill (display-only)  |
| `--ce-chrome`     | Toolbar / title / status strips   |
| `--ce-surface`    | Panel / dialog / dropdown bg      |
| `--ce-text`       | Primary text                      |
| `--ce-text-muted` | Secondary text                    |
| `--ce-primary`    | Primary action / accent           |
| `--ce-accent`     | Accent (alias of primary)         |
| `--ce-border`     | Standard borders                  |
| `--ce-link`       | Hyperlinks                        |
