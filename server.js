const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3030;
const DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Only these files are served; everything else (server.js, package.json, .git, ...) is 404.
const PUBLIC_FILES = new Set(['index.html', 'app.js', 'styles.css', 'logo.png', 'logo-mark.png']);

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, HEAD' });
    return res.end('405 Method Not Allowed');
  }

  let reqPath;
  try {
    reqPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return notFound(res);
  }
  if (reqPath === '/') reqPath = '/index.html';

  const fileName = reqPath.slice(1);
  if (!PUBLIC_FILES.has(fileName)) return notFound(res);

  const filePath = path.join(DIR, fileName);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') return notFound(res);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Server Error');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

server.listen(PORT, () => {
  console.log(`SlitSmart Factory OS is running live at http://localhost:${PORT}`);
});
