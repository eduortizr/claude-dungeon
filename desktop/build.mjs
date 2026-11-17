// Bundles the Electron main process, with the server it embeds, into one CommonJS file.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
})
