/**
 * Wadjet build script.
 *
 * Bundles the TypeScript entry points with esbuild and copies the static
 * WebExtension assets (manifest, sidebar markup/styles, icons) into `dist/`,
 * which is the directory `web-ext` loads.
 *
 * Usage:
 *   node scripts/build.mjs            Build once.
 *   node scripts/build.mjs --watch    Rebuild on change.
 *   node scripts/build.mjs --clean    Remove the output directory and exit.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, 'src');
const outDir = resolve(root, 'dist');

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const cleanOnly = args.has('--clean');

/** esbuild options shared by both build modes. */
const buildOptions = {
  entryPoints: {
    background: resolve(srcDir, 'background/index.ts'),
    'sidebar/index': resolve(srcDir, 'sidebar/index.ts'),
    'content/overlay': resolve(srcDir, 'content/overlay.ts'),
    'content/enrich-overlay': resolve(srcDir, 'content/enrich-overlay.ts'),
    'content/threat-scan': resolve(srcDir, 'content/threat-scan.ts'),
    'devtools/devtools': resolve(srcDir, 'devtools/devtools.ts'),
    'devtools/panel': resolve(srcDir, 'devtools/panel.ts'),
  },
  outdir: outDir,
  bundle: true,
  format: 'iife',
  target: ['firefox128'],
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

/** Copy the static assets that are not processed by esbuild. */
async function copyStatic() {
  await mkdir(outDir, { recursive: true });
  await cp(resolve(srcDir, 'manifest.json'), resolve(outDir, 'manifest.json'));
  await cp(resolve(srcDir, 'icons'), resolve(outDir, 'icons'), { recursive: true });
  await cp(resolve(srcDir, 'sidebar/index.html'), resolve(outDir, 'sidebar/index.html'));
  await cp(resolve(srcDir, 'sidebar/styles.css'), resolve(outDir, 'sidebar/styles.css'));
  await cp(resolve(srcDir, 'devtools/devtools.html'), resolve(outDir, 'devtools/devtools.html'));
  await cp(resolve(srcDir, 'devtools/panel.html'), resolve(outDir, 'devtools/panel.html'));
  await cp(resolve(srcDir, 'devtools/panel.css'), resolve(outDir, 'devtools/panel.css'));
}

async function clean() {
  await rm(outDir, { recursive: true, force: true });
}

async function main() {
  if (cleanOnly) {
    await clean();
    console.log('Removed dist/.');
    return;
  }

  await clean();
  await copyStatic();

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes… (static assets are copied once at startup)');
    return;
  }

  await build(buildOptions);
  console.log('Build complete → dist/');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
