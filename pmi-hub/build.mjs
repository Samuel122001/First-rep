// Builds PMI Hub into one self-contained HTML file.
//   npm run build  -> dist/pmi-hub.html   (the page published as the artifact)
//   npm run dev    -> also dist/dev.html  (runs locally on an in-memory database seeded from seed/)
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');

const js = await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  write: false,
  legalComments: 'none',
});
const css = await esbuild.transform(fs.readFileSync('src/styles.css', 'utf8'), { loader: 'css', minify: true });
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const fonts =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400..700;1,400&family=Jost:wght@400..700&display=swap">';

// The artifact host wraps the page in its own <html>/<head>/<body>, so the page starts with its title.
const page = `<title>DigitalTolk PMI Hub</title>\n${fonts}\n<style>${css.code}</style>\n<div id="app"></div>\n<script>${script}</script>\n`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/pmi-hub.html', page);
console.log(`dist/pmi-hub.html  ${(page.length / 1024).toFixed(1)} KB`);

if (dev) {
  // Local data only (git-ignored); without it the dev page starts with an empty database.
  const seedFile = 'seed/local-seed.json';
  const seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : { docs: [] };
  const store = Object.fromEntries(seed.docs.map((d) => [d.path, d.data]));
  const mock = fs.readFileSync('dev/mock-claude.js', 'utf8');
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>' +
    `<script>window.__SEED__=${JSON.stringify(store).replace(/</g, '\\u003c')};</script><script>${mock}</script>` +
    page +
    '</body></html>';
  fs.writeFileSync('dist/dev.html', html);
  console.log('dist/dev.html (local, in-memory database)');
}
