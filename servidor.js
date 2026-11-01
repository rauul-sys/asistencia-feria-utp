// Servidor local para probar la app en la PC (la cámara web funciona en localhost).
// Uso: node servidor.js  y abre http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const PUERTO = Number(process.env.PORT) || 8080;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(RAIZ, path.normalize(ruta).replace(/^[/\\]+/, ''));
  if (!archivo.startsWith(RAIZ)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(archivo, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(datos);
  });
}).listen(PUERTO, '127.0.0.1', () => console.log(`App lista en http://localhost:${PUERTO}`));
