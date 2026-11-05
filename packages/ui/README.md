# FreeMoCap playback UI

## Pipeline control panel

`PipelinePanel` presents a typed workflow using Core's graph camera, measured
cards, ports, explanation callouts and expandable list sections. Import the
same `@freemocap/ui/styles.css`. It performs no processing or network requests.

Supply `graph: PipelineGraph` (`definition` uses the existing client
`ProcessingPlan['graph']` contract, plus `topological_order`) and
`nodePresentation` keyed by every node ID. Each presentation supplies `label`,
`description`, `kind` (`source`, `computation`, `review`, `publication`),
`availability` (`available`, `reusable`, `manual`, `unavailable`, `unimplemented`),
and an explanatory `reason`. Optional `configuration`, `summary` and `artifacts`
provide the application's shared settings, status content and artifact paths.
Availability describes capability or input readiness; it does not assert that
a node ran. In particular, reusable artifacts still require application validation.

```tsx
<PipelinePanel graph={workflow} nodePresentation={stages}
  view={view} onViewChange={setView}
  actions={<button disabled>Create training set</button>}
  notice="Human review and dataset publication are not connected yet."/>
```

Keep configuration values controlled by the application; graph/list switching
renders the same supplied content, without duplicating the settings model.
Use Core's exported `SettingRow({label, info: {title, text}, control})` with
`SettingSelectInput`, `SettingToggleSwitch`, and `ValueSelector` (optional `label`
names the numeric input). `SettingsGroupHeading` and `SettingsSummaryChip`
provide the same hierarchy and factual summaries as Core. Explanations belong
in `info`, opened by `AnchoredInfo`, not visible paragraphs. The older
`PipelineSetting` wrapper delegates to `SettingRow`. `locked` makes
configuration inert during a run. Optional `operations: TaskOperation[]` displays
actual retained counts and timings; omitting it produces no simulated progress.
`actions` delegates execution controls to the application. Use `notice` only
for actual validation/load/save errors, which remain visible as an alert.

`PipelineWindow` (also exported as `PipelineDialog`) accepts `title`, optional
`subtitle`, `onClose` and `children`. It retains Core's processing-window chrome
and uses native modal focus containment. Info popovers stay in the modal's DOM
ownership and browser top layer. The panel includes Core's left stage outline
in both views. The graph starts in two rows of compact cards at 80–100% according to the available width;
selecting a stage expands its shared settings. Pan/zoom and explicit `Fit all`
remain available; changing configuration does not reset a user-controlled camera.

`SidebarProcessingAction({text, onClick, disabled?, description?, iconClass?})`
exposes Core's `ProcessMocapPanel` full-width accent action, with its existing
`processmocap-icon`, button classes, theme colors and a 44px minimum target.
Omit `description` when the application keeps explanatory copy behind info.

| Core source under `freemocap-ui/src/` | Public SDK surface |
| --- | --- |
| `layout/content/SidePanelContent.tsx` → `components/control-panels/recording-info-panel/ProcessMocapPanel.tsx` → `ButtonSm`, `styles/button-sm.css`, `styles/icons.css` | `SidebarProcessingAction` |
| `components/mocap-setup/mocap-setup-modal.tsx`, `mocap-processing.css` | `PipelineWindow`, `PipelinePanel` header/body |
| `components/mocap-setup/processing-outline.tsx`, `stage-section.tsx` | Shared left outline and list sections |
| `components/common/settings-layout/` | `SettingRow`, select, toggle, headings, summary chips and settings CSS |
| `components/ui-components/ValueSelector.tsx`, `AnchoredInfo.tsx` | Numeric editor and help popovers |
| `components/processing-graph/ProcessingGraphView.tsx`, `processing-graph.css` | Camera, focus, typed ports, setting callouts and graph styling |

The panel checks stage IDs, required port bindings and dependency order before
rendering. This is display validation, not a replacement for the server's graph
compiler or application payload validation. Manual gates may appear in the
workflow without being executable handlers. Extraction sources and adaptations
are recorded in `provenance/pipeline-ui-seed.json` at the SDK repository root.

## Themed controls and scene legend

Import `@freemocap/ui/styles.css` once. `NumberField` takes `label`, a string or
number `value`, `onChange(value: string)`, and optional `min`, `max`, `step`,
`disabled`, and `description`. It uses Core's input container, labels and theme.
The app owns parsing and validation, including empty or incomplete input.
`ButtonSm` is the existing shared button; use `text`, `onClick`, `disabled`, and
`buttonType="secondary"` for a themed action.

`ControlSection` groups `children` under `title`, with optional `description`.
Set `collapsible` and optional `defaultOpen` for a disclosure. `Legend` takes
`label`, `items: {label, color, description?}[]`, optional `note`, and optional
`details` content. Supply actual scene colors and application-owned meanings;
every swatch has a visible label. Details are available in a disclosure rather
than a permanent paragraph over the scene. These controls perform no processing
or network requests.

## Application logs

`LogStore`, `LogTerminal`, and `BottomLogPanel` expose Core's bounded, virtualized log UI without Core stores or routes. Import `@freemocap/ui/styles.css` once. Create one `LogStore({storageKey: 'your-app.logs'})`, call `start()`, feed the existing transport's `subscribeToLog(record => store.add(record))`, then unsubscribe and `dispose()` on teardown. Omit storageKey for memory-only history. The 10,000-record memory cap, 300-record persisted tail, idle persistence and 500ms UI polling keep per-record work outside React rendering. Relay `log_id` values deduplicate replayed history.

Mount `<BottomLogPanel store={store} title="Backend logs" initialHeight={210}/>` as a full-width bottom sibling of the application's main region. It owns the resize handle and displays the complete terminal without a duplicate heading row. Set `showHeader` only if the consuming app wants an additional title/collapse row. Alternatively use `<LogTerminal store={store} isCollapsed={false}/>` in your own panel. Filters, search, pause, clear, copy/save, scroll-follow and expandable record details remain available. Pause freezes presentation while the bounded store continues receiving. Clear affects the local view, not backend history or files.

The app owns the existing transport and connection-status display; these components do not open a second WebSocket. Root CSS tokens control appearance.

## Sidebar selection and connection monitor

`RecordingBrowser` adapts Core's playback recording selector to application-provided `BrowserEntry[]`, `selectedId` and `onSelect(id)`. Supply `title`, optional `location`, `loading`/`busyId`/`error`, and `onBrowse`/`onCreate`/`onRefresh` actions; `browseLabel`/`createLabel` customize the action text. Entries have `id`, `name`, optional `path`/`subtitle`, explicit `timestamp` in epoch milliseconds, `sizeBytes`, `cameraCount`, `frameCount`, `durationSeconds`, a `status` label/tone and `details` label/value pairs. Unknown metadata is omitted. No filesystem scan, filename-date inference, imports, project schema or HTTP requests occur in this component. Open/create forms remain application-owned secondary flows.

`ServerConnectionStatus` accepts actual `ConnectionState` from `@freemocap/client`, `endpoint`, optional `onReconnect`/`onDisconnect`, `error`, `httpStatus`, and `processId`. Initialize from `stream.getState()` and subscribe with `stream.on('state-change', handler)`; remove the same handler with `off` on teardown. Connectedness is only the WebSocket state, independent of HTTP health and process liveness. The monitor does not control backend processes or choose ports. Its dropdown follows Core's server-connection controls and shared styling.

`PlaybackWorkspace` accepts `showTimingNotice={false}` to omit the inherited static timing-information popup. Default presentation also omits it for an empty selection. This does not disable real resource errors or numerical/timing validation. Tabs and their application-specific labels belong to the consuming application.

This package exposes the existing Core playback presentation with application-supplied endpoints and selection. Core's parallel implementation is unchanged.

```tsx
import {PlaybackWorkspace} from '@freemocap/ui';
import '@freemocap/ui/styles.css';

<PlaybackWorkspace baseUrl="http://127.0.0.1:8006" recording={null}/>
```

The application supplies its branding, navigation and recording selection. A selection is `{id, parentDirectory?, displayName?}`. Selected recordings use the current client's recording bundle, Parquet and video resource contracts. `freemocap_sdk.recording.create_recording_router` supplies those routes with an application-owned immutable resource resolver; see `packages/server/RECORDING.md`. Null selection renders the empty playback layout; it does not simulate a recording.

`ResizablePanelGroup`, `ResizablePanel` and `ResizableHandle` expose the same pane implementation used inside playback for application layouts such as sidebar/main splits. Groups accept `direction="horizontal"` or `"vertical"`; panel `defaultSize` and `minSize` are percentages. Give handles descriptive `aria-label` values. The handle styling follows group orientation and supports the library's pointer and keyboard interaction.

Recorded 3D sampling follows browser-confirmed video presentation, not requested seek targets. While cameras disagree or a seek is pending, dynamic model frames are withheld. Original source frame identities remain in media timelines; encoded video position is an index into that grid.

The package includes the synchronized video controller, grid, playback controls, recording provider, original offscreen 3D worker, Parquet worker, renderer preparation, model subscriptions and transferred-buffer ownership machinery. It supplies its own English translation instance and needs no Core Redux or Electron provider. The stylesheet currently includes Core's shared design tokens and utility classes; it has global selectors. Product logo/splash image rules are excluded.

Install React 19, React DOM 19 and `@freemocap/client` alongside this package. During local development use the sibling client via the development dependency, build with `npm run build`, and install this package through a public local package dependency. `npm test` builds and exercises the copied renderer/transfer tests. The optional reference-recording test requires its documented dataset variables.

Both worker files are emitted beside `dist/index.js` and referenced with `new URL(..., import.meta.url)`. A bundler must preserve or bundle those assets. For Vite linked-package development, exclude `@freemocap/ui` from dependency prebundling if it relocates the module away from these assets. Include the entire `dist/` directory when packing; do not copy just the entry JavaScript file.

This extraction retains Core's single active viewport-worker design. Multiple simultaneous PlaybackWorkspace instances and server-side rendering are not supported. Applications must validate their actual resource mapping, geometry conversions and native media playback together.
