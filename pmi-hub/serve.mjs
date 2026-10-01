// Small web server for running PMI Hub on Replit or any Node host (no dependencies).
//   /       site/index.html   the real app: Microsoft 365 sign-in, data in Firebase
//   /demo   dist/dev.html     try-out copy: no sign-in, data only in this browser
// Build first: npm run build:web (and npm run dev for /demo). `npm start` does both.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const ROUTES = { '/': 'site/index.html', '/index.html': 'site/index.html', '/demo': 'dist/dev.html' };

http
  .createServer((req, res) => {
    const file = ROUTES[new URL(req.url, 'http://x').pathname];
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(file ? `${path.basename(file)} has not been built yet. Run: npm start` : 'Not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '0.0.0.0', () => console.log(`PMI Hub on http://localhost:${PORT}  (try-out copy: /demo)`));
