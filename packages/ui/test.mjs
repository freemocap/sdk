import {build} from 'esbuild';
import {readdir,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('src');
const files=(await readdir(root,{recursive:true})).filter(path=>path.endsWith('.test.ts'));
const out=resolve('../../.test-artifacts/ui-tests');
await mkdir(out,{recursive:true});
const outputs=[];
for(const file of files){
  const outfile=join(out,file.replaceAll(/[\\/]/g,'-').replace(/\.ts$/,'.cjs'));
  await build({entryPoints:[join(root,file)],outfile,bundle:true,platform:'node',format:'cjs',target:'node22',logLevel:'warning'});
  outputs.push(outfile);
}
const result=spawnSync(process.execPath,['--test',...outputs],{stdio:'inherit'});
process.exitCode=result.status??1;
