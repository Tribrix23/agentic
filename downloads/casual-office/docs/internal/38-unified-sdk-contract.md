# 38 — Unified SDK contract (docs + sheets)

_Design spec for Phase 3 of the SDK & Collab initiative (doc 37). This is the
**one canonical contract** that both editors conform to; it is the spec that
**docs#267** and **sheets#277** implement. It changes no product code — it fixes
names, shapes, and semantics so the two SDKs stop diverging._

> Scope: the SDK **surface** — component props, the imperative handle, the events
> map, feature/slot config, and the collab-by-config prop. Not the internals
> (ProseMirror vs Univer), not the iframe wire (`embed/protocol.ts` keeps its
> `casual.*` envelopes; this spec is the in-process React/JS surface those
> envelopes already shadow).

## 0. Why now

The two SDKs already do the same jobs under different names. Concrete drift
observed in the source today:

| Concern            | Docs today                                                                 | Sheets today                                                                  |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| interaction mode   | `mode?: EditorMode` (`DocxEditor.tsx:693`), enum at `DocxEditor.tsx:1037`   | `documentMode?: DocumentMode` (`CasualSheets.tsx:237`), enum at `api.ts:73`    |
| mode enum          | `'editing' \| 'suggesting' \| 'viewing'`                                    | `'editing' \| 'viewing'` (no suggest)                                          |
| ready signal       | `onReady(api)` (`DocxEditor.tsx:625`)                                       | `onReady(api)` (`CasualSheets.tsx:123`)                                        |
| change event       | `onChange(document: Document)` (`DocxEditor.tsx:542`)                       | `onChange(snapshot: IWorkbookData)` (`CasualSheets.tsx:132`)                   |
| selection event    | `onSelectionChange(state)` (`DocxEditor.tsx:544`)                           | none as a prop — only `api.getSelection()` + wire `SelectionChangedData`       |
| error event        | `onError(error)` (`DocxEditor.tsx:546`)                                     | none                                                                           |
| dirty event        | none                                                                        | none                                                                           |
| collab-by-config   | `backendUrl?: string` on `CasualEditor` (`CasualEditor.tsx:96`)            | `collab?: AttachCollabOptions` (`CasualSheets.tsx:249`, `attachCollab.ts:70`)  |
| collab status      | `onCollabState(state)` (`CasualEditor.tsx:128`)                            | `collab.onStatus(status)` (`attachCollab.ts:99`)                              |
| feature flags      | none — only `show*` booleans + `chrome` preset                             | `features?: Record<string, boolean>` (`CasualSheets.tsx:214`)                  |
| toolbar/menu slots | none — only `toolbarExtra?: ReactNode` (`DocxEditor.tsx:654`)              | `extensions?: ChromeExtensions` (`extensions.ts:111`)                          |
| chrome preset      | `chrome?: 'none' \| 'minimal' \| 'full'` (`DocxEditor.tsx:618`)             | `chrome?: 'none' \| 'minimal' \| 'full'` (`CasualSheets.tsx:210`)              |
| iframe density     | `viewMode?: 'preview' \| 'editor'` (`CasualEditorIframe.tsx:46`)            | n/a                                                                            |
| command dispatch   | none on the ref                                                            | `api.executeCommand(id, params)` (`api.ts:111`)                                |
| focus              | `ref.focus()` (`DocxEditor.tsx:833`)                                        | none                                                                           |

`chrome` and `onReady` already agree — those are the template. Everything else
gets a single canonical name below.

## 1. Dual-mount shape

Both SDKs expose the **same declarative config** in two mount styles. React hosts
mount the component; vanilla hosts call an imperative constructor. Config keys are
identical across both — the constructor takes the same object the component takes
as props.

```ts
// React
<CasualDocs   {...config} ref={ref} />
<CasualSheets {...config} ref={ref} />

// Imperative (framework-agnostic)
const editor = mountCasualDocs(el, config);   // returns EditorHandle
const editor = mountCasualSheets(el, config); // returns EditorHandle
editor.on('change', …);
editor.destroy();
```

**Canonical config object** (the shared keys — format-specific extras are
additive and namespaced, never renamed):

```ts
interface CasualEditorConfig<Content, Selection> {
  /** Initial content. Docs: DOCX bytes / Document. Sheets: IWorkbookData. */
  content?: Content | ArrayBuffer | Uint8Array | Blob | File | null;
  /** Interaction mode. Default 'editing'. See §2. */
  documentMode?: DocumentMode;
  /** Built-in chrome preset. Default 'full' for hosts, 'none' for bare-core. */
  chrome?: ChromePreset; // 'none' | 'minimal' | 'full'
  /** Per-control on/off map. See §5. */
  features?: Record<string, boolean>;
  /** Toolbar / menu / panel / dialog slot injection. See §5. */
  extensions?: ChromeExtensions;
  /** Real-time co-editing, declaratively. Omit for single-user. See §6. */
  collab?: CollabConfig;
  /** Light/dark. Reactive. */
  appearance?: 'light' | 'dark';
  /** Locale id + optional string bundle. */
  locale?: string;
  /** Local user identity (author name, id, color) for comments + presence. */
  user?: { id?: string; name: string; color?: string };
  /** Container style/class/testId. */
  style?: CSSProperties;
  className?: string;
  testId?: string;
  /** Config-map event handlers (the on*-prop half of §3). */
  onReady?: (api: EditorHandle<Content, Selection>) => void;
  onChange?: (content: Content) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onSave?: (bytes: ArrayBuffer) => void;
  onError?: (error: Error) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDocumentModeChange?: (mode: DocumentMode) => void;
  onCollaborationReady?: (info: CollaborationInfo) => void;
  onCollaborationStatus?: (status: CollaborationStatus) => void;
}
```

Rule: a host that only wants to render passes `{ content }`. A host that wants a
native editor passes `{ content, documentMode, chrome, features, collab, ... }`.
Nothing is required beyond `content`.

## 2. `documentMode` enum

Canonical enum — **align to the just-merged docs vocabulary** (three values):

```ts
type DocumentMode = 'editing' | 'viewing' | 'suggesting';
```

- `'editing'` — fully editable (default).
- `'viewing'` — read-only; command-veto + permission path.
- `'suggesting'` — edits captured as tracked changes.

Docs already ships all three (`DocxEditor.tsx:1037`). **Sheets adds `'suggesting'`
to the type** and, until sheet-level track-changes exists, treats it as `'editing'`
with a one-line `console.warn` (never silently as `'viewing'`) so the enum is
uniform and forward-compatible. Both keep `getDocumentMode()` / `setDocumentMode()`
on the handle (§4) and fire `onDocumentModeChange` (§3).

`readOnly` (deprecated on both — `CasualSheets.tsx:252`, `DocxEditor.tsx:646`)
maps to `documentMode: 'viewing'` only when `documentMode` is unset; `documentMode`
always wins. New code uses `documentMode`.

## 3. Canonical EVENTS map + `.on()/.off()` emitter

Every event is available **two ways** (peer-standard, per doc 37): as an
`on*` config prop (§1) AND via a `.on(name, handler)` / `.off(name, handler)`
emitter on the handle. Same event, same payload, both surfaces. The emitter
returns an unsubscribe function.

```ts
interface EditorEvents<Content, Selection> {
  ready: (api: EditorHandle<Content, Selection>) => void;
  change: (content: Content) => void;
  selectionChange: (selection: Selection | null) => void;
  save: (bytes: ArrayBuffer) => void;
  error: (error: Error) => void;
  dirtyChange: (dirty: boolean) => void;
  documentModeChange: (mode: DocumentMode) => void;
  collaborationReady: (info: CollaborationInfo) => void;
  collaborationStatus: (status: CollaborationStatus) => void;
}

interface Emitter<E> {
  on<K extends keyof E>(name: K, handler: E[K]): () => void;
  off<K extends keyof E>(name: K, handler: E[K]): void;
}
```

Config-prop name → emitter name is mechanical: drop the `on` prefix and
lower-camel (`onSelectionChange` ⇄ `'selectionChange'`).

| Event (emitter / `on*` prop)               | Docs today                                             | Sheets today                                    | Verdict                                    |
| ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `ready` / `onReady`                        | ✅ `onReady(api)` (`DocxEditor.tsx:625`)              | ✅ `onReady(api)` (`CasualSheets.tsx:123`)      | keep                                       |
| `change` / `onChange`                      | ✅ `onChange(Document)` (`DocxEditor.tsx:542`)       | ✅ `onChange(IWorkbookData)` (`:132`)           | keep; payload is the format's content type |
| `selectionChange` / `onSelectionChange`    | ✅ `onSelectionChange` (`DocxEditor.tsx:544`)        | ❌ prop; only `getSelection()` + wire           | **new prop on sheets**                     |
| `save` / `onSave`                          | ✅ `onSave(ArrayBuffer)` (`DocxEditor.tsx:505`)      | ✅ `onSave(IWorkbookData)` (`:138`)             | keep                                       |
| `error` / `onError`                        | ✅ `onError(Error)` (`DocxEditor.tsx:546`)           | ❌                                              | **new on sheets**                          |
| `dirtyChange` / `onDirtyChange`            | ❌                                                    | ❌                                              | **new on both** (docs#271)                 |
| `documentModeChange` / `onDocumentModeChange` | ⚠️ `onModeChange` (`DocxEditor.tsx:695`) — rename  | ❌                                              | **rename docs; new on sheets**             |
| `collaborationReady` / `onCollaborationReady` | ⚠️ `onCollabState` (`CasualEditor.tsx:128`)        | ❌ (only `collab.onStatus`)                     | **rename docs; new on sheets**             |
| `collaborationStatus` / `onCollaborationStatus` | ⚠️ folded into `onCollabState`                    | ⚠️ `collab.onStatus` (`attachCollab.ts:99`)     | **promote to top-level event on both**     |

Notes:

- **`onSelectionChanged` vs `onSelectionChange`.** The iframe wire uses the past
  tense (`SelectionChangedData`, `sendSelectionChanged`, `CasualEditorIframe`'s
  `onSelectionChanged`). The **in-process SDK canonical is present-tense
  `onSelectionChange`** (matches docs' existing component prop and peer SDKs). The
  wire layer keeps its own names; the SDK adapter maps `selectionChanged` (wire)
  → `selectionChange` (SDK).
- Docs' `onModeChange` becomes `onDocumentModeChange` to pair with the renamed
  `documentMode` prop; the old name is kept as a deprecated alias for one minor.
- The many docs-only callbacks (`onExport`, `onExportPdf`, `onNew`, `onPrint`,
  `onCopy`, `onCommentAdd`, …) stay as **format-specific host hooks**, not part of
  the canonical cross-editor events map. They are additive and keep their names.

## 4. Canonical imperative handle

`onReady(api)` and `ref.current` both yield the same `EditorHandle`. Canonical
methods (format-specific extras remain, additive):

```ts
interface EditorHandle<Content, Selection> extends Emitter<EditorEvents<Content, Selection>> {
  getContent(): Content | null;
  setContent(content: Content): void;
  import(input: ArrayBuffer | Uint8Array | Blob | File): Promise<Content>;
  export(): Promise<ArrayBuffer | Blob>;
  getSelection(): Selection | null;
  executeCommand(id: string, params?: object): Promise<boolean>;
  undo(): void;
  redo(): void;
  focus(): void;
  setDocumentMode(mode: DocumentMode): void;
  getDocumentMode(): DocumentMode;
  destroy(): void; // imperative-mount only; React uses unmount
}
```

| Canonical method    | Docs today                                                        | Sheets today                                   | Verdict                          |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| `getContent`        | `getDocument()` (`DocxEditor.tsx:823`)                            | `getSnapshot()` (`api.ts:88`)                  | **rename both → `getContent`**   |
| `setContent`        | `loadDocument(doc)` (`DocxEditor.tsx:863`)                        | `loadSnapshot(data)` (`api.ts:91`)             | **rename both → `setContent`**   |
| `import`            | `importDocx` / `loadDocumentBuffer` (`:867`/`:865`)              | `importXlsx` (`api.ts:98`)                     | **add `import` alias on both**   |
| `export`            | `exportDocx` / `save` (`:870`/`:827`)                            | `exportXlsx` (`api.ts:106`)                    | **add `export` alias on both**   |
| `getSelection`      | `getSelectionInfo()` (`DocxEditor.tsx:936`)                       | `getSelection()` (`api.ts:108`)               | **rename docs → `getSelection`** |
| `executeCommand`    | ❌                                                                | `executeCommand(id, params)` (`api.ts:111`)   | **new on docs**                  |
| `undo` / `redo`     | ❌ (internal history only)                                        | ❌                                             | **new on both** (docs#271)       |
| `focus`             | `focus()` (`DocxEditor.tsx:833`)                                  | ❌                                             | **new on sheets**                |
| `setDocumentMode`   | ❌ (mode is prop-driven via `onModeChange`)                       | `setDocumentMode(mode)` (`api.ts:134`)        | **new on docs**                  |
| `getDocumentMode`   | ❌                                                                | `getDocumentMode()` (`api.ts:137`)            | **new on docs**                  |
| `on` / `off`        | `onContentChange` / `onSelectionChange` subscribers (`:946/:948`) | ❌ (has `onMutation`, `api.ts:123`)           | **new unified emitter on both**  |
| `destroy`           | React unmount                                                     | `onExit` + unmount                            | **new on imperative mount**      |
| escape hatch        | `getAgent()` / `getEditorRef()` (`:821`/`:825`)                  | `api.univer` (`api.ts:139`)                    | keep, format-specific, not semver |

Old names stay as deprecated aliases for one minor (docs already aliases
`importDocx`/`exportDocx` to the sheets vocabulary at `DocxEditor.tsx:866-870` —
this generalizes that pattern in the other direction).

## 5. Feature-flag map + toolbar slot system

**Adopt the sheets model wholesale as the shared one.** Sheets already has both
halves; docs has neither and gets them (docs#272 / docs#273).

### 5a. `features?: Record<string, boolean>`

A flat map of control-id → enabled. `false` hides the control **and** blocks its
command; omitted keys default to enabled; only applies when `chrome` is shown
(`CasualSheets.tsx:211-214`). Docs replaces its scattered `show*` booleans
(`showToolbar`, `showPanelRail`, `showStatusBar`, `showZoomControl`,
`showRuler`, `showOutline`, `showPrintButton`, …) with entries in this one map —
the `show*` props stay as deprecated shortcuts that write into `features`. Each
SDK publishes its own **feature-id catalog** (there is no shared id list — a
sheet's `merge` control and a doc's `trackChanges` control are legitimately
different); the *shape* is shared, the *keys* are per-format.

### 5b. `extensions?: ChromeExtensions`

Adopt sheets' `ChromeExtensions` (`extensions.ts:111`) as the shared slot system:

```ts
interface ChromeExtensions {
  toolbar?: ToolbarExtension[]; // id, label, icon, onClick(api) | command, isVisible(api)
  menu?: MenuExtension[];       // menu target, id, label, icon?, shortcut?, onClick | dialog
  dialogs?: Partial<Record<DialogKind, DialogExtension>>; // add or OVERRIDE by kind
  panels?: PanelExtension[];    // id, title, railIcon, component
}
```

- Handlers receive the canonical `EditorHandle` (sheets passes `CasualSheetsAPI`
  today, `extensions.ts:49`; the shared type is the unified handle from §4).
- `MenuTarget` (`extensions.ts:38`) is per-format (a doc has no `data` menu);
  each SDK narrows the union.
- Docs' existing `toolbarExtra?: ReactNode` (`DocxEditor.tsx:654`) and
  `renderTitleBarRight` are **subsumed** by `extensions.toolbar` — kept as
  deprecated escape hatches, not removed.
- Docs' `agentPanel` (`DocxEditor.tsx:762`) is a specialized `panels[]` entry
  under the hood but stays a first-class prop (it predates and is richer than the
  generic panel slot); it is **not** renamed.

## 6. `collab` by config

Unify docs' `backendUrl` (`CasualEditor.tsx:96`) and sheets' `collab`
(`CasualSheets.tsx:249`) into **one shape** — adopt the sheets `collab` prop; it
is already the richer of the two (`attachCollab.ts:70`):

```ts
interface CollabConfig {
  /** Base WebSocket URL of the collab server, e.g. `wss://host/yjs`. */
  server: string;
  /** Room / document id. */
  room: string;
  /** Optional room password. */
  password?: string;
  /** Auth token for the Hocuspocus handshake. */
  token?: string;
  /** 'view' joins read-only; default 'write'. Ignored when `share` is set. */
  role?: 'view' | 'write';
  /** Secure share-link capability (share token bound to the room). */
  share?: { share: string; sp?: string };
  /** Per-snapshot callback (host persists). */
  onSnapshot?: (content: unknown) => void | Promise<void>;
}
```

Semantics:

- Omit `collab` → single-user (docs' current "no `backendUrl`" path,
  `CasualEditor.tsx:238`).
- Present → the SDK wires Yjs/Hocuspocus itself after `onReady` and detaches on
  unmount, re-attaching when `server`/`room`/`password`/`token`/`role` change
  (sheets' documented lifecycle, `CasualSheets.tsx:244-248`).
- **Status is not on `collab`.** Sheets' `collab.onStatus` and docs'
  `onCollabState` both graduate to the top-level `onCollaborationStatus` /
  `onCollaborationReady` events (§3). `CollaborationStatus` unifies sheets'
  `'connecting' | 'live' | 'offline'` (`attachCollab.ts:68`) with docs'
  `CollabStatus`; `CollaborationInfo` carries the peer list docs surfaces via
  `collabPeers()` (`CasualEditor.tsx:172`).
- **Migration:** docs' `backendUrl='wss://…'` + `user` + `share` collapse into
  `collab: { server, room, share, ... }` + top-level `user` (§1). `backendUrl`
  stays as a deprecated alias that constructs a `CollabConfig` for one minor.

The imperative escape hatch (sheets' `attachCollab(api, opts)`,
`attachCollab.ts:117`) remains for hosts driving the room lifecycle themselves;
don't combine it with the declarative prop on one editor.

## 7. Migration / rename table (authoritative)

Every divergence, one row each. Columns: **current docs → canonical → current
sheets**. "—" = doesn't exist there today (net-new work for that repo).

### Props

| Current docs                                  | Canonical                    | Current sheets                          |
| --------------------------------------------- | ---------------------------- | --------------------------------------- |
| `documentBuffer` / `document`                 | `content`                    | `initialData`                           |
| `mode` (`EditorMode`)                         | `documentMode` (3-value)     | `documentMode` (add `'suggesting'`)     |
| `readOnly` (deprecated)                       | `documentMode: 'viewing'`    | `readOnly` (deprecated)                 |
| `chrome`                                       | `chrome`                     | `chrome`                                |
| `show*` booleans (`showToolbar`, …)           | `features[...]`              | `features`                              |
| `toolbarExtra` / `renderTitleBarRight`        | `extensions.toolbar`         | `extensions.toolbar`                    |
| —                                             | `features`                   | `features`                              |
| —                                             | `extensions` (menu/dialogs/panels) | `extensions`                      |
| `backendUrl` (on `CasualEditor`)              | `collab.server` + `collab.room` | `collab`                             |
| `share` (on `CasualEditor`)                   | `collab.share`               | `collab.share`                          |
| `author` / `user`                             | `user`                       | (host wires identity via collab)        |
| `theme` (Theme object)                        | `theme` (format-specific)    | `theme`                                 |
| (dark via `data-theme` on `<html>`)           | `appearance`                 | `appearance`                            |
| `i18n` (Translations)                         | `locale` + bundle            | `locale` / `locales`                    |

### Events (config-prop form)

| Current docs                       | Canonical                     | Current sheets            |
| ---------------------------------- | ----------------------------- | ------------------------- |
| `onReady`                          | `onReady`                     | `onReady`                 |
| `onChange`                         | `onChange`                    | `onChange`                |
| `onSelectionChange`                | `onSelectionChange`           | — (getSelection only)     |
| `onSave`                           | `onSave`                      | `onSave`                  |
| `onError`                          | `onError`                     | —                         |
| —                                  | `onDirtyChange`               | —                         |
| `onModeChange`                     | `onDocumentModeChange`        | —                         |
| `onCollabState` (on `CasualEditor`) | `onCollaborationReady`       | —                         |
| `onCollabState` (status half)      | `onCollaborationStatus`       | `collab.onStatus`         |

### Imperative handle methods

| Current docs                        | Canonical           | Current sheets        |
| ----------------------------------- | ------------------- | --------------------- |
| `getDocument`                       | `getContent`        | `getSnapshot`         |
| `loadDocument`                      | `setContent`        | `loadSnapshot`        |
| `importDocx` / `loadDocumentBuffer` | `import`            | `importXlsx`          |
| `exportDocx` / `save`               | `export`            | `exportXlsx`          |
| `getSelectionInfo`                  | `getSelection`      | `getSelection`        |
| —                                   | `executeCommand`    | `executeCommand`      |
| — (internal history)                | `undo` / `redo`     | —                     |
| `focus`                             | `focus`             | —                     |
| — (mode is prop-driven)             | `setDocumentMode`   | `setDocumentMode`     |
| —                                   | `getDocumentMode`   | `getDocumentMode`     |
| `onContentChange` / `onSelectionChange` subscribers | `on` / `off` | `onMutation` (superseded) |
| `getAgent` / `getEditorRef`         | (escape hatch, keep) | `univer`             |

### Iframe wrapper (`CasualEditorIframe`)

| Current docs                            | Canonical                          | Current sheets |
| --------------------------------------- | ---------------------------------- | -------------- |
| `viewMode: 'preview' \| 'editor'`       | `documentMode` + `chrome`          | —              |
| `sendSetViewMode` / `CommandSetViewModeData` | (wire keeps its name; SDK maps) | —              |
| `onSelectionChanged` (wire, past tense) | `onSelectionChange` (SDK, present) | —              |

The iframe **wire** envelopes in `embed/protocol.ts` (`CommandSetViewModeData`,
`SelectionChangedData`, `casual.*`) are **not** renamed — they are a separate,
versioned transport (`v: 1`, `protocol.ts:31`). The SDK adapter layer translates
between wire names and the canonical SDK names above so a host coding against the
SDK never sees `viewMode` or the past-tense `selectionChanged`.

## 8. Non-goals / out of scope

- No change to ProseMirror/Univer internals or the OOXML/OpenXML models.
- No change to the iframe wire protocol (`embed/protocol.ts`) beyond documenting
  the adapter mapping.
- The `ai={}` SDK prop (docs#269 / sheets#280) is Phase 3's sibling task and gets
  its own contract note; this doc only reserves the config key name.
- Per-format feature-id catalogs are published by each repo, not enumerated here.

## 9. Rollout

1. Land the shared types (`CasualEditorConfig`, `EditorHandle`, `EditorEvents`,
   `DocumentMode`, `ChromeExtensions`, `CollabConfig`) — a small shared `@casual`
   contract package or duplicated identical `.d.ts` per repo (decide in docs#267).
2. Docs (docs#267/#268/#271/#272/#273): rename `mode`→`documentMode` (+ add
   `getDocumentMode`/`setDocumentMode`), add `features`/`extensions`,
   `executeCommand`/`undo`/`redo`, the `.on()/.off()` emitter, and the
   `collab` prop (aliasing `backendUrl`); keep all old names as deprecated
   aliases for one minor.
3. Sheets (sheets#277/#278): add `'suggesting'` to `DocumentMode`, add
   `onSelectionChange`/`onError`/`onDirtyChange`/`onDocumentModeChange`, add
   `focus`, add the `.on()/.off()` emitter and canonical `getContent`/`setContent`/
   `import`/`export` aliases, and surface `onCollaborationStatus/Ready`.
4. Delete the deprecated aliases one minor later.
