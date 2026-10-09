// Tiny static server for the airplane/monkey render pages: /vendor → the site's vendored three.js, /stl → the airplane STL folder, everything else → this folder.
// /vendor and /assets come from the dist/ of the copy this file is in (a worktree renders its own models). RENDER_PORT (default 8851)
// lets a second copy serve at the same time; runpage.cjs reads the same variable.
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, '..', '..', 'dist').replace(/\\/g, '/'), PORT = Number(process.env.RENDER_PORT) || 8851;
const ROOTS = [
  ['/vendor/', DIST + '/vendor/'],
  ['/stl/', 'C:/Users/LUIZ/Documents/modelos_ju3d/Airplane Oftalmology1/airplane 21 08 2026/STL/'],
  ['/assets/', DIST + '/assets/'],
  ['/photos/', 'C:/Users/LUIZ/OneDrive/ANIMAÇÃO_JU3D/'],
  ['/', __dirname + '/']
];
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.stl': 'application/octet-stream', '.bin': 'application/octet-stream'};
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  for (const [prefix, dir] of ROOTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length) || 'index.html');
    if (!file.startsWith(path.normalize(dir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, '127.0.0.1', () => console.log('serving on ' + PORT, DIST));
