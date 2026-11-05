# FreeMoCap playback UI

This package exposes the existing Core playback presentation with application-supplied endpoints and selection. Core's parallel implementation is unchanged.

```tsx
import {PlaybackWorkspace} from '@freemocap/ui';
import '@freemocap/ui/styles.css';

<PlaybackWorkspace baseUrl="http://127.0.0.1:8006" recording={null}/>
```

The application supplies its branding, navigation and recording selection. A selection is `{id, parentDirectory?, displayName?}`. Selected recordings use the current client's recording bundle, Parquet and video resource contracts. The server foundation does not implement those application routes. Null selection renders the empty playback layout; it does not simulate a recording.

The package includes the synchronized video controller, grid, playback controls, recording provider, original offscreen 3D worker, Parquet worker, renderer preparation, model subscriptions and transferred-buffer ownership machinery. It supplies its own English translation instance and needs no Core Redux or Electron provider. The stylesheet currently includes Core's shared design tokens and utility classes; it has global selectors. Product logo/splash image rules are excluded.

Install React 19, React DOM 19 and `@freemocap/client` alongside this package. During local development use the sibling client via the development dependency, build with `npm run build`, and install this package through a public local package dependency. `npm test` builds and exercises the copied renderer/transfer tests. The optional reference-recording test requires its documented dataset variables.

Both worker files are emitted beside `dist/index.js` and referenced with `new URL(..., import.meta.url)`. A bundler must preserve or bundle those assets. For Vite linked-package development, exclude `@freemocap/ui` from dependency prebundling if it relocates the module away from these assets. Include the entire `dist/` directory when packing; do not copy just the entry JavaScript file.

This first extraction retains Core's single active viewport-worker design. Multiple simultaneous PlaybackWorkspace instances and server-side rendering are not supported. Real recording playback requires separate application resource integration and validation; the initial SkellyClicker milestone verifies the empty shell and transport.
