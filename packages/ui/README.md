# FreeMoCap playback UI

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
