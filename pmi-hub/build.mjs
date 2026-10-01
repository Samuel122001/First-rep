// Builds PMI Hub into one self-contained HTML file.
//   npm run build      -> dist/pmi-hub.html  the claude.ai artifact (data in the artifact's database)
//   npm run build:web  -> site/index.html    the GitHub Pages site (Microsoft 365 sign-in, data in Firebase)
//   npm run dev        -> dist/dev.html      claude.ai build on an in-memory database (local testing)
//   node build.mjs --web --emulator         site/ against the local Firebase emulators (testing)
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const args = new Set(process.argv.slice(2));
const web = args.has('--web');
const dev = args.has('--dev');
const emulator = args.has('--emulator');

function readConfig() {
  const cfg = JSON.parse(fs.readFileSync('firebase.config.json', 'utf8'));
  if (process.env.PMI_FIREBASE_CONFIG && process.env.PMI_FIREBASE_CONFIG.trim()) Object.assign(cfg, JSON.parse(process.env.PMI_FIREBASE_CONFIG));
  if (emulator) {
    cfg.firebase = { apiKey: 'demo-key', authDomain: 'demo-pmi.firebaseapp.com', projectId: 'demo-pmi', appId: 'demo-app' };
    cfg.emulator = { auth: '127.0.0.1:9099', firestore: '127.0.0.1:8080' };
  }
  return cfg;
}

const js = await esbuild.build({
  entryPoints: [web ? 'src/main-web.jsx' : 'src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  write: false,
  legalComments: 'none',
  define: web ? { __PMI_CONFIG__: JSON.stringify(readConfig()) } : {},
});
const css = await esbuild.transform(fs.readFileSync('src/styles.css', 'utf8'), { loader: 'css', minify: true });
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const fonts =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400..700;1,400&family=Jost:wght@400..700&display=swap">';

// The artifact host wraps the page in its own <html>/<head>/<body>, so the page starts with its title.
const page = `<title>DigitalTolk PMI Hub</title>\n${fonts}\n<style>${css.code}</style>\n<div id="app"></div>\n<script>${script}</script>\n`;

if (web) {
  const icon = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#DE5D83" d="M12 2.5c5.5 0 9.5 3.7 9.5 8.4s-4 8.4-9.5 8.4c-1 0-2-.1-2.9-.4L4.4 21l1.1-4.1C3.6 15.4 2.5 13.3 2.5 10.9 2.5 6.2 6.5 2.5 12 2.5z"/></svg>');
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="robots" content="noindex,nofollow">' +
    `<link rel="icon" href="data:image/svg+xml,${icon}">` +
    '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>' +
    page +
    '</body></html>';
  fs.mkdirSync('site', { recursive: true });
  fs.writeFileSync('site/index.html', html);
  fs.writeFileSync('site/.nojekyll', '');
  console.log(`site/index.html  ${(html.length / 1024).toFixed(1)} KB${emulator ? ' (emulator)' : ''}`);
} else {
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/pmi-hub.html', page);
  console.log(`dist/pmi-hub.html  ${(page.length / 1024).toFixed(1)} KB`);
}

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
