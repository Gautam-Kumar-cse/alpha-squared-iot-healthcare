/**
 * ALPHA SQUARED - Local Development & Production Server
 * 
 * Serves static web frontend files (web/) and executes backend serverless
 * API endpoints (api/) with full ES Module and JSON body support.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const WEB_DIR = path.resolve(__dirname, 'web');
const API_DIR = path.resolve(__dirname, 'api');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers for API and local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // -------------------------------------------------------------
  // 1. API Route Handling (/api/...)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    const apiRelPath = pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    let targetFile = path.resolve(API_DIR, `${apiRelPath}.js`);

    if (!fs.existsSync(targetFile)) {
      targetFile = path.resolve(API_DIR, apiRelPath, 'index.js');
    }

    if (fs.existsSync(targetFile)) {
      // Collect request body
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          if (rawBody && req.headers['content-type']?.includes('application/json')) {
            try {
              req.body = JSON.parse(rawBody);
            } catch {
              req.body = {};
            }
          } else {
            req.body = rawBody ? { raw: rawBody } : {};
          }

          // Attach query parameters
          req.query = Object.fromEntries(parsedUrl.searchParams.entries());

          // Attach helper methods to response
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
          };

          const fileUrl = `file://${targetFile.replace(/\\/g, '/')}`;
          const module = await import(`${fileUrl}?t=${Date.now()}`);
          if (typeof module.default === 'function') {
            await module.default(req, res);
          } else {
            res.status(500).json({ error: 'Endpoint did not export a default handler function.' });
          }
        } catch (apiErr) {
          console.error(`[API ERROR] ${pathname}:`, apiErr);
          res.status(500).json({ error: 'Internal API execution error', message: apiErr.message });
        }
      });
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `API route not found: ${pathname}` }));
    }
  }

  // -------------------------------------------------------------
  // 2. Static File Serving (web/)
  // -------------------------------------------------------------
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(WEB_DIR, `.${reqPath}`);

  // Clean URLs: e.g. /dashboard -> /dashboard.html
  if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
    filePath = `${filePath}.html`;
  }

  // Security check: prevent directory traversal outside web
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 fallback
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>404 Not Found</title><style>body{background:#030712;color:#f8fafc;font-family:sans-serif;padding:3rem;text-align:center;}a{color:#00f0ff;}</style></head>
        <body>
          <h1>404 — Page Not Found</h1>
          <p>The requested file <code>${pathname}</code> was not found.</p>
          <p><a href="/index.html">&larr; Return to Alpha Squared Home</a></p>
        </body>
        </html>
      `);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('\n=============================================================');
  console.log('  ALPHA SQUARED — IoT Smart Health & Emergency Detection System');
  console.log('  Government Polytechnic Gaya | Local Development Server');
  console.log('=============================================================');
  console.log(`\n  🚀 Website is LIVE and accessible at:`);
  console.log(`     👉 Local:   http://localhost:${PORT}`);
  console.log(`     👉 Network: http://127.0.0.1:${PORT}`);
  console.log(`\n  🌐 Direct Quick Links:`);
  console.log(`     - Landing Page:     http://localhost:${PORT}/index.html`);
  console.log(`     - About Us Page:    http://localhost:${PORT}/about.html`);
  console.log(`     - Health Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`     - Device API Panel: http://localhost:${PORT}/device.html`);
  console.log(`     - Live GPS Map:     http://localhost:${PORT}/location.html`);
  console.log(`     - Health History:   http://localhost:${PORT}/history.html`);
  console.log(`     - Emergency Center: http://localhost:${PORT}/emergency.html`);
  console.log(`     - Settings:         http://localhost:${PORT}/settings.html`);
  console.log(`\n  ⚡ Backend API Endpoints:`);
  console.log(`     - POST /api/device/connect`);
  console.log(`     - POST /api/device/test`);
  console.log(`     - POST /api/device/ingest`);
  console.log(`     - GET  /api/device/telemetry`);
  console.log(`     - GET  /api/device/history`);
  console.log('\n  Press Ctrl+C to stop the server.\n');
});

