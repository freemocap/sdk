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
in both views. The graph starts in two rows at 100%, with every stage's settings
open. Independent chevrons expand/collapse settings without changing the camera,
including after explicit focus or `Fit all`. Expansion state survives list/graph
switches. Titles, ports and select values wrap; measured ports keep connections
attached as heights change. Gutter routes use tangent rounded corners. Pan/zoom
and explicit `Fit all` remain available for content beyond the viewport.
The internal `reusable` availability is not displayed as a badge.

`SettingFilePath({label, path, onBrowse, onClear?, disabled?})` adapts Core's
calibration picker to any file. It displays the full wrapped, selectable path.
The host supplies native browsing, cancellation, validation and errors; the SDK
has no Electron/Tauri dependency and never changes the path itself.

`SidebarProcessingAction({text, onClick, disabled?, description?, iconClass?})`
exposes Core's `ProcessMocapPanel` full-width accent action, with its existing
`processmocap-icon`, button classes, theme colors and a 44px minimum target.
Optional `description` opens from the existing named help icon; it is never rendered as permanent explanatory copy.

| Core source under `freemocap-ui/src/` | Public SDK surface |
| --- | --- |
| `layout/content/SidePanelContent.tsx` → `components/control-panels/recording-info-panel/ProcessMocapPanel.tsx` → `ButtonSm`, `styles/button-sm.css`, `styles/icons.css` | `SidebarProcessingAction` |
| `components/mocap-setup/mocap-setup-modal.tsx`, `mocap-processing.css` | `PipelineWindow`, `PipelinePanel` header/body |
| `components/mocap-setup/processing-outline.tsx`, `stage-section.tsx` | Shared left outline and list sections |
| `components/common/CalibrationTomlPicker.tsx` | `SettingFilePath` with host-provided browsing |
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
every swatch has a visible label. `NumberField` and `ControlSection` descriptions,
and `Legend` notes/details, open through `AnchoredInfo`. Static explanations
belong behind help icons; action labels, factual values, progress, and actual
errors remain visible. These controls perform no processing
or network requests.

## Application logs

`LogStore`, `LogTerminal`, and `BottomLogPanel` expose Core's bounded,
virtualized log UI without Core stores or routes. Import `@freemocap/ui/styles.css`
once. Create one application-owned `LogStore({storageKey: 'your-app.logs'})`.
After fetching the backend's lifetime identity, await `store.beginSession(id)`
before subscribing or connecting the log stream, then call `start()` and feed
`subscribeToLog(record => store.add(record))`. Expose the server `LogHub.session_id`
through the application's existing status endpoint. The same identity survives
page reloads; a new hub/backend has a new identity. Never use component mount,
port number, or a newly generated browser UUID as the session identity.

The constructor restores nothing until `beginSession` confirms the session.
Same-session history restores without an artificial restart divider; a new
session clears the viewer. Repeated calls with the same ID are harmless.
Register `beforeunload` to call `persistNow()`. On application teardown,
unsubscribe, remove that listener, and call `dispose()`. Panel visibility does
not own any of these operations; collection continues while the panel is hidden.

Persistence retains the full 10,000-record bounded history, not a smaller tail.
IndexedDB stores the full snapshot asynchronously, coalescing new records over
500 ms. A small synchronous unload journal (at most 250,000 characters) covers
records not yet committed. `persistNow()` writes that journal immediately and
returns a promise for the database flush; await it when confirming persistence
outside browser unload. Existing same-session localStorage history migrates once
and is removed after a successful database commit. No smaller history tail is
silently substituted when storage is full.

Surface `store.persistenceError` when browser storage is unavailable. Failed
background writes back off for 60 seconds; a failed journal is not repeatedly
written until the database recovers. Oversized uncommitted bursts require the
async flush to complete before they are reload-safe. A failed database read
preserves unknown saved history and requires reload to retry; live collection
continues.
Omit `storageKey` for memory-only history. `log_id` values deduplicate replayed
history. This viewer storage is separate from durable training logs/artifacts.

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


## Confirmed playback control

`PlaybackWorkspace` accepts optional `controlsRef` and `onPresentedFrame` props.
The exported `PlaybackWorkspaceHandle` provides `pause()`,
`getPresentedFrame(): PresentedFrame | null`, and
`seekFrame(localFrameIndex): Promise<PresentedFrame | null>`.

A `PresentedFrame` contains `recording` (`id`, optional `parentDirectory`),
`mediaSource`, `localFrameIndex`, `sourceFrameNumber`, `timestampSeconds`, and
`presentationEpoch`. It describes an image group committed to every camera canvas.
Source frame/time come from the saved media timeline, never an assumed offset or
nominal FPS calculation. Use the application's exact integer timestamp table when
saving scientific labels; `timestampSeconds` locates display only.

Seek/source change/unmount invalidate the snapshot. `seekFrame` pauses and resolves
only after matching images are committed, or returns null for supersession/failure.
Call `getPresentedFrame()` when saving a selection; a requested slider position or
an earlier callback does not establish what is currently displayed. The transient
epoch prevents old presentation callbacks from identifying a new source session.


`PlaybackWorkspace` starts with valid annotated videos when available, otherwise
uses the recording's preferred source. A manual Raw choice lasts for the current
recording session. Its optional `getTargetCrop(request)` prop supplies preloaded
source-image pixel bounds for the exact recording, camera filename, media source,
source frame, and image dimensions in `TargetCropRequest`. Return null when that
projection is unavailable. Applications own geometry, padding, and provenance;
the SDK clamps intersecting bounds and clears invalid crops. Each close-up draws
from the same committed bitmap as the full camera image, without another decoder,
clock, network request, or pixel readback. Each camera has a larger floating close-up with image dragging and aspect-preserving
resize handles on all four edges and four corners, without a visible header. Pointer capture and keyboard arrows move/resize it within its camera;
placement survives frame and source changes and clamps on parent resize. Interactions
do not pan the underlying image. Updated providers also refresh the paused committed frame.


`PlaybackWorkspace.renderImageControls(context)` places application controls on
individual camera images. `context.getPresentedFrame()` reads the currently
committed camera-specific `PresentedImage` or null while seeking; use it on click,
after `context.pause()`, and validate application result/revision membership before
saving. `activeVideoId` identifies the camera selected from a catalog. The SDK does
not infer inclusion or approval from playback position.

`ImageSelectionToggle` supplies visible included/excluded, saving, unavailable,
and error states. `ImageCatalog` groups supplied image entries by moment, displays
lazy thumbnails and inclusion controls, and offers inclusion/camera filters.
Its controlled navigation accepts actual previous/next image IDs from the
application's saved membership. Included and Generated modes are distinct;
focused F/G shortcuts use those supplied IDs and never wrap or invent membership.
The application owns catalog routes, persistence, conflicts, selection semantics,
thumbnail resources, and exact confirmed-frame seeking.

For an active training dataset, use `ImageCatalog mode="members"` with
`items: DatasetImageItem[]`, `onRemove(id)`, and `onNavigate(id)`. Supply the
authoritative current dataset members. `DatasetImageItem` has no inclusion flag;
this mode renders exactly that dataset and does not keep separate membership or
hidden-card state. The X action requests dataset removal through `onRemove`.
The application must persist removal of the image and its associated training
labels, invalidate derived training inputs, and supply the resulting membership.
Failed writes remain failures, reported through `error` or the item's `error`;
the SDK does not optimistically claim that removal succeeded. Viewing an image
only invokes `onNavigate` and does not modify the dataset.

Dataset cards retain camera/frame identity and supplied crop imagery. Their flat
responsive grid adds columns as available width increases, with card widths bounded
at 176 pixels. This mode has no candidate inclusion filters or Include controls.
The application can place an explicit Undo action in the existing `actions` slot.
Place it in a bounded flex-column parent with `min-height: 0`; the dataset catalog
fills the remaining height and scrolls internally, without a fixed-height cap.


`BottomLogPanel` collapses to zero height by dragging its divider down or using
Hide logs. Its floating Logs button restores the previous size without reserving
a log row; collection/history remain in the application-owned store.

`PlaybackWorkspace.navigationGroups` places app-supplied previous/next actions
in the playback toolbar. Each `PlaybackNavigationGroup` supplies `id`, `label`,
optional `count`, `pending`, `previous` and `next`; missing callbacks disable
boundaries. Applications provide separate Labeled and Included targets using
saved membership and confirmed seeking. Omit catalog navigation to avoid a
duplicate sidebar workflow. `ImageCatalog.onIncludeAll` exposes the full-batch
action with `includeAllPending`/`includeAllDisabled`; it never applies only to
filtered entries. The application owns atomic initialization and persistence.
Null or failed thumbnail URLs show Target unavailable instead of a false crop.


When close-ups are enabled, the full camera image is top-aligned in the upper
region and the untouched close-up starts at the bottom. The close-up viewport
matches the actual crop aspect ratio, filling the image surface without added
letterboxing or clipping the supplied target bounds. The fixed backing canvas
avoids per-frame buffer resizing; its displayed aspect restores source pixel
proportions. Manual placement/width persist while parent bounds remain enforced.

## Live scalar charts and prediction previews

`MetricSeriesChart({series, color?, height?})` displays a validated client
`MetricSeries` with its real step label and scalar units, latest value, and
explicit display-history omission count. Plot height defaults to 180 pixels for
compact dashboard layouts. Each plot uses the extracted Core D3 scaffolding:
persistent paths and axes, resize observation, clipping, and bounded 1 Hz display
refresh. It does not convert loss to FPS or replace missing values with zero.

`SamplePreviewGrid({previews, resolveImageUrl?})` displays lazy, asynchronously
decoded immutable prediction artifacts with their actual step and checkpoint.
Use `resolveImageUrl` for root-relative API URLs when frontend and backend origins
differ. Loading and failure states replace an unavailable image rather than showing
an old prediction under a new checkpoint label. The application supplies overlays
and controls prediction cadence; the SDK never performs model inference.

Compose these controls with `PipelinePanel` or `PipelineWindow` and the retained
pipeline snapshot. The application owns the dashboard tabs, trainer settings,
train/validation split, durable history, and run selection. Chart extraction
provenance is recorded in `provenance/charts-seed.json` at the SDK repository root.


For a short linear workflow, pass `graphLayout="single-row"` to `PipelinePanel`.
The default remains `two-rows`. Both layouts use measured card heights, open
settings by default, and an initial camera scale of 1. Narrow viewports use the
existing pan/zoom controls rather than automatically shrinking the text.

### Workspace composition
`WorkspaceTabs` supplies controlled keyboard-navigable tabs (arrows/Home/End). Applications own panel IDs, accessible labels, mounted lifetimes and persistence. `WorkspaceToolbar` holds persistent application-owned commands and concise consequential facts. `RunActivity` displays caller-supplied stage, elapsed time, optional progress and update age; after 30 seconds without an update it reports stale telemetry and stops pulsing. This describes telemetry freshness, not task failure. Reduced-motion preference disables the pulse. These components use existing Skull tokens via `@freemocap/ui/styles.css`; scope domain layout rules rather than overriding generic headers/buttons.


### Large dataset galleries

Members-mode `ImageCatalog` renders visible rows plus two overscan rows rather
than mounting every image. Cards have bounded width and fixed row geometry;
thumbnail loading does not move the scroll position. Surviving image IDs anchor
the viewport when the supplied membership changes.

Optional `selectedIds` and `onSelectionChange(ids)` control checkbox selection
for a bulk action, independently of persisted membership. Shift-click selects a
range in the supplied order. The application sends one bulk mutation and updates
membership only from its authoritative result. `DatasetImageItem.facts` displays
application-owned scores or help controls; SDK does not calculate quality.
`removed: true` retains a removed row in place, labels it Removed, excludes it
from the member count, disables removal/selection and clears it from the bulk
selection. The application decides when an explicit refresh drops those rows.
Keep thumbnail URLs tied to immutable label artifacts, and memoize item
preparation instead of rebuilding the catalog for every playback tick.

### Spherical coverage

`SphericalCoverageViewer` renders an STL and caller-supplied counts. Supply
`meshUrl`, `meshScale` (authored units to display units), `meshCenter` (in display
units), and a positive enclosing `radius` in those same units. The model transform
is `authoredPosition * meshScale - meshCenter`; the SDK does not infer units or
poses. SkellyClicker supplies metres at this boundary, independently of the
millimetre convention used by other motion-capture interfaces.

`counts` has `azimuthBins * zBins` nonnegative integer entries in z-major order.
Unit-sphere z bands span [-1, 1]; azimuth spans [0, 2π) about +Z, starting at +X
toward +Y. The application owns equal-area bin assignment, eligibility, unknown
viewpoints, pool selection, and a numeric legend. Zero is gray; positive counts
range from teal at 1 to gold at the maximum (a maximum of 1 is gold).

The near hemisphere is translucent; the far hemisphere is culled to avoid mixing
two cell counts in one color. Orbit to inspect the other side. Geometry is reused
between count updates; orbit does not fetch the mesh or modify counts. Rendering
is on demand, with resource disposal on unmount. `onViewRotation` receives a
row-major 3×3 object-to-camera rotation with no translation. Camera coordinates
are +X right, +Y up, -Z forward. This callback supports application-owned angular
projections; it does not prescribe a projection or histogram algorithm.
