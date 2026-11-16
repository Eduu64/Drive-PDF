#!/usr/bin/env node
/**
 * NAS-PDF Lite v2 — servidor único SIN dependencias externas (solo Node >= 16).
 *
 *  - 1 proceso, 1 puerto (8090 por defecto; 8080/8081 libres).
 *  - 100% local: cero llamadas a Internet (ni entrantes de redes ajenas ni
 *    salientes), cero servicios externos: el sistema de archivos es la BD.
 *  - RAM mínima: streaming en subidas/descargas, nunca un PDF entero en memoria.
 *  - Espacio mínimo: los subrayados son capas JSON de KBs en annotations/;
 *    el PDF original nunca se modifica; no hay copias "pintadas" en el servidor.
 *  - Carpetas, búsqueda global, mover/renombrar, eventos en tiempo real (SSE).
 *  - Aislamiento LAN: rechaza conexiones que no vengan de red privada.
 *  - Opcional: NASPDF_TOKEN protege las operaciones de escritura.
 *
 * Variables de entorno:
 *   PORT (8090) · MAX_MB (512) · LIB_DIR · ANN_DIR · NASPDF_TOKEN (vacío=off)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8090', 10);
const MAX_MB = parseInt(process.env.MAX_MB || '512', 10);
const TOKEN = process.env.NASPDF_TOKEN || '';
const LIB_DIR = process.env.LIB_DIR || path.join(__dirname, 'library');
const ANN_DIR = process.env.ANN_DIR || path.join(__dirname, 'annotations');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MAX_UPLOAD = MAX_MB * 1024 * 1024;
const MAX_ANN_BODY = 8 * 1024 * 1024;
const MAX_JSON_BODY = 64 * 1024;
const MAX_HIGHLIGHTS = 2000;
const MAX_RECTS = 400;
const MAX_DEPTH = 6;

fs.mkdirSync(LIB_DIR, { recursive: true });
fs.mkdirSync(ANN_DIR, { recursive: true });

/* Diagnóstico de permisos de escritura: los volúmenes montados pueden tener
   otro dueño. En Docker lo arregla docker-entrypoint.sh automáticamente;
   sin Docker, `chown -R 1000:1000 library annotations` lo resuelve. */
function causaEscritura(err) {
  if (!err) return '';
  if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EROFS')
    return ' — sin permisos de escritura en el volumen (' + err.code + ')';
  return err.code ? ' (' + err.code + ')' : '';
}
for (const [nom, dir] of [['library', LIB_DIR], ['annotations', ANN_DIR]]) {
  try { fs.accessSync(dir, fs.constants.W_OK); }
  catch {
    console.log(`  ⚠ AVISO: ${nom}/ NO es escribible por este usuario (uid ${process.getuid()}) — las escrituras fallarán`);
  }
}

/* ------------------------------------------------------------------ *
 * Filtrado LAN: solo direcciones privadas / locales                   *
 * ------------------------------------------------------------------ */
function isLan(addr) {
  if (!addr) return false;
  let a = String(addr).toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1' || a === '::') return true;
  if (a.startsWith('127.')) return true;
  if (a.startsWith('10.')) return true;
  if (a.startsWith('192.168.')) return true;
  if (a.startsWith('169.254.')) return true;
  const m172 = a.match(/^172\.(\d{1,3})\./);
  if (m172) { const n = parseInt(m172[1], 10); if (n >= 16 && n <= 31) return true; }
  const m100 = a.match(/^100\.(\d{1,3})\./);
  if (m100) { const n = parseInt(m100[1], 10); if (n >= 64 && n <= 127) return true; }
  if (a.startsWith('fe80:')) return true;
  if (a.startsWith('fc') || a.startsWith('fd')) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Rutas relativas seguras ("Carpeta/Sub/name.pdf")                    *
 * ------------------------------------------------------------------ */
function safePath(raw, { mustPdf = true, allowRoot = false } = {}) {
  if (typeof raw !== 'string' || raw.length > 240) return null;
  let p;
  try { p = decodeURIComponent(raw); } catch { return null; }
  p = p.replace(/^\/+|\/+$/g, '');
  if (p === '') return allowRoot ? '' : null;
  if (p.includes('\\') || p.includes('\0') || p.includes('//')) return null;
  const parts = p.split('/');
  if (parts.length > MAX_DEPTH) return null;
  for (const seg of parts) {
    if (!seg || seg === '.' || seg === '..') return null;
    if (seg.length > 80) return null;
    if (/^[.\s]/.test(seg)) return null;
    for (const ch of seg) {
      if (ch.codePointAt(0) < 32 || ch.codePointAt(0) === 127) return null;
    }
  }
  if (mustPdf && !/\.pdf$/i.test(parts[parts.length - 1])) return null;
  return parts.join('/');
}

const libAbs = (rel) => path.join(LIB_DIR, rel);
const annAbs = (rel) => path.join(ANN_DIR, rel + '.json');
const annDirAbs = (rel) => path.join(ANN_DIR, rel);

/* ------------------------------------------------------------------ *
 * Validación de la capa de subrayado                                  *
 * ------------------------------------------------------------------ */
function validateLayer(layer) {
  if (!layer || typeof layer !== 'object') return null;
  const hs = layer.highlights;
  if (!Array.isArray(hs) || hs.length > MAX_HIGHLIGHTS) return null;
  const clean = [];
  for (const h of hs) {
    const page = Number(h.page);
    const opacity = Number(h.opacity);
    const color = typeof h.color === 'string' ? h.color : '';
    if (!Number.isInteger(page) || page < 1 || page > 100000) return null;
    if (!Number.isInteger(opacity) || opacity < 5 || opacity > 95) return null;
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return null;
    if (!Array.isArray(h.rects) || h.rects.length === 0 || h.rects.length > MAX_RECTS) return null;
    const rects = [];
    for (const r of h.rects) {
      const x = Number(r.x), y = Number(r.y), w = Number(r.width), ht = Number(r.height);
      if (![x, y, w, ht].every(Number.isFinite)) return null;
      if (x < 0 || y < 0 || w <= 0 || ht <= 0 || w > 10000 || ht > 10000) return null;
      rects.push({ x, y, width: w, height: ht });
    }
    clean.push({ page, rects, color: color.toLowerCase(), opacity });
  }
  return { highlights: clean, updated: new Date().toISOString() };
}

/* ------------------------------------------------------------------ *
 * Eventos en tiempo real (SSE): Drive y visor se actualizan solos     *
 * ------------------------------------------------------------------ */
const sseClients = new Set();
function broadcast(kind, data = {}) {
  const msg = `data: ${JSON.stringify({ kind, ...data })}\n\n`;
  for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }
}
setInterval(() => {
  for (const res of sseClients) { try { res.write(': ping\n\n'); } catch { sseClients.delete(res); } }
}, 25000).unref();

/* ------------------------------------------------------------------ *
 * Utilidades HTTP                                                     *
 * ------------------------------------------------------------------ */
function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(obj));
}

function authed(req) {
  if (!TOKEN) return true; // sin token configurado: confianza LAN (comportamiento por defecto)
  return req.headers['x-naspdf-token'] === TOKEN;
}

function readJson(req, res, limit, cb) {
  const chunks = [];
  let size = 0, over = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) { over = true; return sendJson(res, 413, { error: 'Cuerpo demasiado grande' }); }
    chunks.push(c);
  });
  req.on('error', () => {});
  req.on('end', () => {
    if (over) return;
    try { cb(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { sendJson(res, 400, { error: 'JSON inválido' }); }
  });
}

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) return sendJson(res, 403, { error: 'Ruta no permitida' });

  const ext = path.extname(abs).toLowerCase();
  if (!STATIC_TYPES[ext]) return sendJson(res, 404, { error: 'No encontrado' });

  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'No encontrado' });
    const immutableVendor = rel.startsWith('vendor/');
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[ext],
      'Content-Length': st.size,
      'Cache-Control': immutableVendor ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res);
  });
}

/* PDF original: streaming con soporte de Range */
function servePdf(req, res, rel) {
  const abs = libAbs(rel);
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'PDF no encontrado' });
    const name = rel.split('/').pop();
    const base = {
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    };
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m && (m[1] !== '' || m[2] !== '')) {
        let start, end;
        if (m[1] === '') { const n = parseInt(m[2], 10); start = Math.max(0, st.size - n); end = st.size - 1; }
        else { start = parseInt(m[1], 10); end = m[2] === '' ? st.size - 1 : Math.min(parseInt(m[2], 10), st.size - 1); }
        if (isNaN(start) || start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          return res.end();
        }
        res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') return res.end();
        const s = fs.createReadStream(abs, { start, end });
        s.on('error', () => res.destroy());
        return s.pipe(res);
      }
    }
    res.writeHead(200, { ...base, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    const s = fs.createReadStream(abs);
    s.on('error', () => res.destroy());
    s.pipe(res);
  });
}

/* ------------------------------------------------------------------ *
 * Operaciones sobre la biblioteca                                     *
 * ------------------------------------------------------------------ */
function listFolder(res, rel) {
  const abs = rel ? libAbs(rel) : LIB_DIR;
  fs.readdir(abs, { withFileTypes: true }, (err, entries) => {
    if (err) return sendJson(res, 404, { error: 'Carpeta no encontrada' });
    const folders = [], files = [];
    let pending = entries.length;
    const done = () => {
      if (--pending !== 0) return;
      folders.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      files.sort((a, b) => b.mtime - a.mtime);
      sendJson(res, 200, { path: rel, folders, files });
    };
    if (pending === 0) return sendJson(res, 200, { path: rel, folders, files });
    for (const e of entries) {
      const child = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory() && !e.name.startsWith('.')) {
        folders.push({ name: e.name, path: child });
        done();
      } else if (e.isFile() && /\.pdf$/i.test(e.name)) {
        fs.stat(path.join(abs, e.name), (err2, st) => {
          if (err2 || !st.isFile()) return done();
          const item = { name: e.name, path: child, size: st.size, mtime: st.mtimeMs };
          files.push(item);
          fs.readFile(annAbs(child), 'utf8', (err3, data) => {
            if (!err3) {
              try { item.highlights = JSON.parse(data).highlights.length; } catch {}
            }
            done();
          });
        });
      } else done();
    }
  });
}

/* búsqueda global (recursiva; árbol pequeño → síncrono es simple y barato) */
function searchLib(res, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return sendJson(res, 200, { files: [] });
  const out = [];
  (function walk(rel, depth) {
    const abs = rel ? libAbs(rel) : LIB_DIR;
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && depth < MAX_DEPTH) walk(rel ? rel + '/' + e.name : e.name, depth + 1);
      else if (e.isFile() && /\.pdf$/i.test(e.name) && e.name.toLowerCase().includes(q)) {
        const child = rel ? rel + '/' + e.name : e.name;
        let st = null;
        try { st = fs.statSync(path.join(abs, e.name)); } catch {}
        if (!st) continue;
        const item = { name: e.name, path: child, size: st.size, mtime: st.mtimeMs };
        try { item.highlights = JSON.parse(fs.readFileSync(annAbs(child), 'utf8')).highlights.length; } catch {}
        out.push(item);
      }
    }
  })('', 0);
  out.sort((a, b) => b.mtime - a.mtime);
  sendJson(res, 200, { files: out });
}

function allFolders() {
  const out = [];
  (function walk(rel, depth) {
    const abs = rel ? libAbs(rel) : LIB_DIR;
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const child = rel ? rel + '/' + e.name : e.name;
      out.push(child);
      if (depth < MAX_DEPTH) walk(child, depth + 1);
    }
  })('', 0);
  out.sort((a, b) => a.localeCompare(b, 'es'));
  return out;
}

function uploadFile(req, res, rel) {
  const abs = libAbs(rel);
  if (fs.existsSync(abs)) return sendJson(res, 409, { error: 'Ya existe un PDF con ese nombre aquí', exists: true });

  const cl = parseInt(req.headers['content-length'] || '0', 10);
  if (cl > MAX_UPLOAD) return sendJson(res, 413, { error: `El archivo supera el límite de ${MAX_MB} MB` });

  const tmp = abs + '.part-' + process.pid + '-' + Math.random().toString(36).slice(2, 8);
  const ws = fs.createWriteStream(tmp);
  let size = 0;
  let done = false;
  const cleanup = () => { ws.destroy(); fs.unlink(tmp, () => {}); };

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_UPLOAD) {
      if (!done) { done = true; cleanup(); try { res.writeHead(413, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: `Supera ${MAX_MB} MB` })); } catch {} }
      req.destroy();
    }
  });
  req.on('aborted', () => { if (!done) { done = true; cleanup(); } });
  req.on('error', () => { if (!done) { done = true; cleanup(); } });
  ws.on('error', (err) => { if (!done) { done = true; cleanup(); try { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({ error: 'Error al escribir' + causaEscritura(err) })); } catch {} } });

  req.pipe(ws);
  ws.on('finish', () => {
    if (done) return;
    done = true;
    fs.rename(tmp, abs, (err) => {
      if (err) return sendJson(res, 500, { error: 'No se pudo finalizar la subida' + causaEscritura(err) });
      broadcast('files', {});
      sendJson(res, 200, { ok: true, path: rel });
    });
  });
}

function deleteFile(res, rel) {
  fs.unlink(libAbs(rel), (err) => {
    if (err) return sendJson(res, 404, { error: 'PDF no encontrado' });
    fs.unlink(annAbs(rel), () => {
      broadcast('files', {});
      sendJson(res, 200, { ok: true });
    });
  });
}

function getAnnotations(res, rel) {
  fs.readFile(annAbs(rel), 'utf8', (err, data) => {
    if (err) return sendJson(res, 200, { highlights: [], updated: null });
    try {
      const layer = JSON.parse(data);
      if (!Array.isArray(layer.highlights)) throw new Error('corrupta');
      sendJson(res, 200, layer);
    } catch {
      sendJson(res, 200, { highlights: [], updated: null, corrupta: true });
    }
  });
}

function putAnnotations(req, res, rel) {
  fs.access(libAbs(rel), fs.constants.F_OK, (err) => {
    if (err) return sendJson(res, 404, { error: 'El PDF no existe' });

    const chunks = [];
    let size = 0, over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_ANN_BODY) { over = true; return sendJson(res, 413, { error: 'Capa demasiado grande' }); }
      chunks.push(c);
    });
    req.on('aborted', () => {});
    req.on('error', () => {});
    req.on('end', () => {
      if (over) return;
      let layer;
      try { layer = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return sendJson(res, 400, { error: 'JSON inválido' }); }
      const clean = validateLayer(layer);
      if (!clean) return sendJson(res, 400, { error: 'Formato de subrayado inválido' });

      const target = annAbs(rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const tmp = target + '.part';
      fs.writeFile(tmp, JSON.stringify(clean), (err2) => {
        if (err2) return sendJson(res, 500, { error: 'No se pudo guardar' + causaEscritura(err2) });
        fs.rename(tmp, target, (err3) => {
          if (err3) return sendJson(res, 500, { error: 'No se pudo guardar' + causaEscritura(err3) });
          broadcast('annotations', { path: rel, count: clean.highlights.length });
          sendJson(res, 200, { ok: true, count: clean.highlights.length, updated: clean.updated });
        });
      });
    });
  });
}

function deleteAnnotations(res, rel) {
  fs.unlink(annAbs(rel), () => {
    broadcast('annotations', { path: rel, count: 0 });
    sendJson(res, 200, { ok: true });
  });
}

function createFolder(req, res, rel) {
  if (rel === null || rel === '') return sendJson(res, 400, { error: 'Nombre de carpeta inválido' });
  fs.mkdir(libAbs(rel), { recursive: false }, (err) => {
    if (err && err.code === 'EEXIST') return sendJson(res, 409, { error: 'Ya existe una carpeta con ese nombre' });
    if (err) return sendJson(res, 500, { error: 'No se pudo crear la carpeta' + causaEscritura(err) });
    broadcast('files', {});
    sendJson(res, 200, { ok: true, path: rel });
  });
}

function deleteFolder(res, rel) {
  if (!rel) return sendJson(res, 400, { error: 'Ruta inválida' });
  fs.rmdir(libAbs(rel), (err) => {
    if (err && err.code === 'ENOTEMPTY') return sendJson(res, 400, { error: 'La carpeta no está vacía' });
    if (err) return sendJson(res, 404, { error: 'Carpeta no encontrada' });
    fs.rm(annDirAbs(rel), { recursive: true, force: true }, () => {
      broadcast('files', {});
      sendJson(res, 200, { ok: true });
    });
  });
}

/* mover / renombrar PDF (su capa de subrayado viaja con él) */
function moveFile(req, res, body) {
  const from = safePath(body.from);
  const to = safePath(body.to);
  if (!from || !to) return sendJson(res, 400, { error: 'Ruta inválida' });
  const src = libAbs(from), dst = libAbs(to);
  if (src === dst) return sendJson(res, 400, { error: 'Origen y destino coinciden' });
  if (fs.existsSync(dst)) return sendJson(res, 409, { error: 'Ya existe un archivo con ese nombre en el destino' });

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.rename(src, dst, (err) => {
    if (err) return sendJson(res, 404, { error: 'No se pudo mover (¿existe el origen?)' });
    const aFrom = annAbs(from), aTo = annAbs(to);
    if (fs.existsSync(aFrom)) {
      fs.mkdirSync(path.dirname(aTo), { recursive: true });
      fs.renameSync(aFrom, aTo);
    }
    broadcast('files', {});
    sendJson(res, 200, { ok: true, from, to });
  });
}

/* ------------------------------------------------------------------ *
 * Router                                                              *
 * ------------------------------------------------------------------ */
async function handle(req, res) {
  const url = new URL(req.url, 'http://lan');
  const p = url.pathname;
  const method = req.method;
  let m;

  if (p === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true, app: 'NAS-PDF Lite v2', port: PORT, maxMB: MAX_MB,
      auth: !!TOKEN, remote: req.socket.remoteAddress, lan: isLan(req.socket.remoteAddress),
    });
  }

  if (p === '/api/config' && method === 'GET') {
    return sendJson(res, 200, { auth: !!TOKEN, maxMB: MAX_MB });
  }

  if (p === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ---- API (escrituras protegidas si NASPDF_TOKEN está definido) ----
  if (p.startsWith('/api/')) {
    if (method !== 'GET' && !authed(req)) return sendJson(res, 401, { error: 'Token de escritura requerido' });

    if (p === '/api/files' && method === 'GET') {
      const rel = safePath(url.searchParams.get('path') || '', { mustPdf: false, allowRoot: true });
      if (rel === null) return sendJson(res, 400, { error: 'Ruta inválida' });
      return listFolder(res, rel);
    }
    if (p === '/api/files' && method === 'POST') {
      const rel = safePath(url.searchParams.get('path'));
      if (!rel) return sendJson(res, 400, { error: 'Nombre inválido (solo .pdf, sin rutas raras)' });
      return uploadFile(req, res, rel);
    }
    if (p === '/api/search' && method === 'GET') return searchLib(res, url.searchParams.get('q'));
    if (p === '/api/folders' && method === 'GET') return sendJson(res, 200, { folders: allFolders() });
    if (p === '/api/folders' && method === 'POST') {
      const rel = safePath(url.searchParams.get('path'), { mustPdf: false });
      return createFolder(req, res, rel);
    }
    if (p === '/api/move' && method === 'POST') {
      return readJson(req, res, MAX_JSON_BODY, (body) => moveFile(req, res, body || {}));
    }
    if ((m = p.match(/^\/api\/files\/(.+)$/))) {
      const rel = safePath(m[1]);
      if (!rel) return sendJson(res, 400, { error: 'Ruta inválida' });
      if (method === 'DELETE') return deleteFile(res, rel);
      return sendJson(res, 405, { error: 'Método no permitido' });
    }
    if ((m = p.match(/^\/api\/annotations\/(.+)$/))) {
      const rel = safePath(m[1]);
      if (!rel) return sendJson(res, 400, { error: 'Ruta inválida' });
      if (method === 'GET') return getAnnotations(res, rel);
      if (method === 'PUT') return putAnnotations(req, res, rel);
      if (method === 'DELETE') return deleteAnnotations(res, rel);
      return sendJson(res, 405, { error: 'Método no permitido' });
    }
    if ((m = p.match(/^\/api\/folders\/(.+)$/))) {
      const rel = safePath(m[1], { mustPdf: false });
      if (method === 'DELETE') return deleteFolder(res, rel);
      return sendJson(res, 405, { error: 'Método no permitido' });
    }
    return sendJson(res, 404, { error: 'Endpoint desconocido' });
  }

  // ---- PDFs originales ----
  if ((m = p.match(/^\/files\/(.+)$/))) {
    if (method !== 'GET' && method !== 'HEAD') return sendJson(res, 405, { error: 'Método no permitido' });
    const rel = safePath(m[1]);
    if (!rel) return sendJson(res, 400, { error: 'Ruta inválida' });
    return servePdf(req, res, rel);
  }

  // ---- estáticos ----
  if (method === 'GET' || method === 'HEAD') return serveStatic(req, res, p);
  return sendJson(res, 405, { error: 'Método no permitido' });
}

const server = http.createServer((req, res) => {
  const addr = req.socket.remoteAddress || '';
  if (!isLan(addr)) {
    console.warn(`[BLOQUEADO] ${new Date().toISOString()} ${addr} ${req.method} ${req.url}`);
    try {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Acceso solo desde la LAN' }));
    } catch {}
    return;
  }
  handle(req, res).catch((err) => {
    console.error('Error interno:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' });
    else res.destroy();
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('');
    console.log('  NAS-PDF Lite v2 listo');
    console.log(`  Escuchando en el puerto ${PORT} (8080 y 8081 siguen libres)`);
    console.log(`  Usuario:     uid ${process.getuid()}`);
    console.log(`  Biblioteca:  ${LIB_DIR}`);
    console.log(`  Subrayados:  ${ANN_DIR}`);
    console.log(`  Token de escritura: ${TOKEN ? 'ACTIVADO' : 'desactivado (confianza LAN)'}`);
    console.log('  Acceso:      http://<TU-IP-LAN>:' + PORT + '   (redes no locales => bloqueadas)');
    console.log('');
  });
  process.on('SIGINT', () => { server.close(() => process.exit(0)); process.exit(0); });
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); process.exit(0); });
}

module.exports = { isLan, safePath, validateLayer, server };
