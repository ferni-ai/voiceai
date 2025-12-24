import * as esbuild from 'esbuild';
import { glob } from 'glob';

const entryPoints = await glob('src/**/*.ts');

await esbuild.build({
  entryPoints,
  outdir: 'dist',
  bundle: false,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  outExtension: { '.js': '.js' },
});

console.log('✅ Build complete');

