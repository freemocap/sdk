import {build} from 'esbuild';
const common = {bundle:true, format:'esm', platform:'browser', target:'es2022',
  logLevel:'info', loader:{'.svg':'file','.woff2':'file','.woff':'file','.png':'file'}, assetNames:'assets/[name]-[hash]'};
await build({...common, entryPoints:['src/index.ts'], outfile:'dist/index.js', packages:'external'});
await build({...common, entryPoints:{'viewport3d.worker':'src/components/viewport3d/viewport3d.worker.tsx',
  'playback-parquet.worker':'src/services/recording/playback-parquet.worker.ts'}, outdir:'dist'});
await build({...common, entryPoints:['src/styles.css'], outfile:'dist/styles.css'});
