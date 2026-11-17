// Uso: npm i jsdom@24 && node tests/smoke.js   (solo desarrollo; la web NO depende de jsdom)
const { JSDOM } = require('jsdom');
const fs = require('fs');
const root = require('path').join(__dirname, '..') + '/';
let html = fs.readFileSync(root + 'public/index.html', 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const calls = []; const errors = [];
const FILES = { '': { folders: [{name:'Apuntes',path:'Apuntes'},{name:'Libros',path:'Libros'}],
  files: [{name:'a.pdf',path:'a.pdf',size:2048,mtime:1700000000000,highlights:3},{name:'b.pdf',path:'b.pdf',size:3*1048576,mtime:1710000000000,highlights:0}] },
  'Apuntes': { folders: [], files: [] } };
const dom = new JSDOM(html, { url: 'http://localhost/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.matchMedia = (q) => ({ matches: /min-width: 48em/.test(q), addEventListener(){}, removeEventListener(){}, addListener(){}, media:q });
w.Element.prototype.scrollIntoView = function () {};
w.CSS = { escape: (s) => String(s).replace(/"/g, '\\"') };
w.prompt = () => null;
w.fetch = async (url, opts = {}) => {
  calls.push((opts.method || 'GET') + ' ' + url);
  const u = new URL(url, 'http://localhost');
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
  if (u.pathname === '/api/config') return json({ auth: false });
  if (u.pathname === '/api/files' && !opts.method) return json(FILES[u.searchParams.get('path')] || { folders: [], files: [] });
  if (u.pathname === '/api/folders' && !opts.method) return json({ folders: ['Apuntes', 'Apuntes/Mates', 'Libros'] });
  if (u.pathname === '/api/search') return json({ files: [{name:'a.pdf',path:'Apuntes/a.pdf',size:10,mtime:1700000000000,highlights:1}] });
  return json({ ok: true });
};
// dialog stubs (jsdom no implementa showModal)
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLDialogElement.prototype.close = function (v) { if (v !== undefined) this.returnValue = v; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.addEventListener('error', (e) => errors.push('ERR: ' + e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eval_ = (f) => w.eval(fs.readFileSync(root + f, 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  ✗ FALLA:', m)); if (c) console.log('  ✓', m); };
(async () => {
  try { w.eval(fs.readFileSync(root + 'public/js/common.js', 'utf8') + '\n;' + fs.readFileSync(root + 'public/js/drive.js', 'utf8').replace(/^'use strict';/m, '')); } catch (e) { console.log('EXCEPCIÓN al cargar:', e.stack); process.exit(1); }
  await sleep(150);
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
  console.log('— Render inicial —');
  ok($$('#items .item').length === 4, '2 carpetas + 2 PDF renderizados (' + $$('#items .item').length + ')');
  ok($$('#tree a').length === 4, 'árbol lateral: Biblioteca + 3 carpetas (' + $$('#tree a').length + ')');
  ok($('#items').getAttribute('aria-busy') === 'false', 'aria-busy=false tras cargar');
  ok($$('#items svg:not([aria-hidden])').length === 0, 'todos los SVG con aria-hidden');
  ok($$('.item-menu').every((b) => b.getAttribute('aria-label') && b.getAttribute('aria-haspopup') === 'menu'), 'botones ⋯ con aria-label + aria-haspopup');
  ok($$('.sel-input').every((c) => /^Seleccionar «/.test(c.getAttribute('aria-label'))), 'checkboxes con nombre accesible');
  ok($('.item-link').getAttribute('aria-describedby') && w.document.getElementById($('.item-link').getAttribute('aria-describedby')), 'enlace descrito por sus metadatos');
  ok($('.badge-hl .sr-only').textContent === '3 subrayados', 'badge con texto para lectores: ' + $('.badge-hl .sr-only').textContent);
  ok(/viewer\.html#a\.pdf/.test($$('.item-link').find((a) => a.textContent === 'a.pdf').href), 'enlace al visor correcto');
  ok($('#crumbs li') && $('#crumbs [aria-current="page"]').textContent === 'Biblioteca', 'breadcrumb con aria-current');
  ok($('#tree a[aria-current="page"]').textContent === 'Biblioteca', 'árbol marca carpeta actual');
  ok(w.document.title === 'NAS PDF · Biblioteca', 'título de documento');
  ok($('#status').textContent.includes('2 carpetas') , 'anuncio en región viva: "' + $('#status').textContent + '"');

  console.log('— Selección —');
  const cb = $('.item[data-path="a.pdf"] .sel-input'); cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(!$('#selbar').hidden && $('#sel-count').textContent === '1 seleccionado', 'barra de selección: ' + $('#sel-count').textContent);
  ok($('.item[data-path="a.pdf"] .item-card').classList.contains('is-selected'), 'tarjeta marcada .is-selected');
  $('#sel-all').click(); ok($('#sel-count').textContent === '2 seleccionados', 'seleccionar todo');
  $('#sel-clear').click(); ok($('#selbar').hidden, 'cancelar selección oculta la barra');

  console.log('— Menú ARIA —');
  const btn = $('.item[data-path="a.pdf"] .item-menu'); btn.click();
  ok(!$('#menu').hidden && btn.getAttribute('aria-expanded') === 'true', 'menú abierto, aria-expanded=true');
  const items = $$('#menu [role="menuitem"]'); ok(items.length === 6, '6 opciones de documento (' + items.length + ')');
  ok(w.document.activeElement === items[0], 'foco en primera opción');
  const key = (k) => $('#menu').dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  key('ArrowDown'); ok(w.document.activeElement === items[1], 'ArrowDown mueve el foco');
  key('End'); ok(w.document.activeElement === items[5], 'End → última');
  key('Home'); ok(w.document.activeElement === items[0], 'Home → primera');
  key('Escape'); ok($('#menu').hidden && btn.getAttribute('aria-expanded') === 'false' && w.document.activeElement === btn, 'Esc cierra y devuelve foco al botón');
  const bBtn = $('.item[data-path="b.pdf"] .item-menu'); bBtn.click();
  ok($$('#menu [role="menuitem"]').find((i) => /Borrar subrayados/.test(i.textContent)).getAttribute('aria-disabled') === 'true', '«Borrar subrayados» deshabilitado si no hay');
  key('Escape');

  console.log('— Renombrar (diálogo) —');
  btn.click(); $$('#menu [role="menuitem"]').find((i) => i.textContent === 'Renombrar').click();
  ok($('#dlg-name').hasAttribute('open') && $('#dn-input').value === 'a.pdf', 'diálogo abierto con valor actual');
  $('#dn-input').value = 'mal/nombre'; $('#dn-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  ok($('#dn-error').textContent.length > 0 && $('#dn-input').getAttribute('aria-invalid') === 'true' && $('#dlg-name').hasAttribute('open'), 'validación: error visible, aria-invalid, no cierra');
  $('#dn-input').value = 'nuevo'; calls.length = 0;
  $('#dn-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await sleep(80);
  ok(!$('#dlg-name').hasAttribute('open'), 'cierra al validar');
  ok(calls.some((c) => c === 'POST /api/move'), 'POST /api/move enviado');

  console.log('— Eliminar (confirmación) —');
  calls.length = 0; btn.click(); $$('#menu [role="menuitem"]').find((i) => /Eliminar documento/.test(i.textContent)).click();
  ok($('#dlg-confirm').hasAttribute('open') && $('#cf-ok').classList.contains('btn-danger'), 'diálogo de confirmación peligroso');
  ok(w.document.activeElement === $('#cf-cancel'), 'foco inicial en «Cancelar»');
  $('#dlg-confirm').returnValue = 'ok'; $('#dlg-confirm').close('ok'); await sleep(80);
  ok(calls.some((c) => c.startsWith('DELETE /api/files/a.pdf')), 'DELETE /api/files/a.pdf: ' + calls.filter(c=>c.startsWith('DELETE')).join(','));

  console.log('— Carpeta nueva / eliminar carpeta —');
  calls.length = 0; $('#folder-btn').click(); $('#dn-input').value = 'Nueva';
  $('#dn-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await sleep(80);
  ok(calls.includes('POST /api/folders?path=Nueva'), 'POST /api/folders?path=Nueva (' + calls.filter(c=>c.startsWith('POST')).join(',') + ')');

  console.log('— Navegación por hash —');
  const link = $$('.item-link').find((a) => a.textContent === 'Apuntes'); calls.length = 0; link.click(); await sleep(120);
  ok(w.location.hash === '#/Apuntes', 'hash = ' + w.location.hash);
  ok(calls.some((c) => c.includes('/api/files?path=Apuntes')), 'carga /api/files?path=Apuntes');
  ok(/Carpeta vacía|vacía/.test($('#state').textContent), 'estado vacío de carpeta');
  ok($('#tree a[aria-current="page"]').dataset.nav === 'Apuntes', 'árbol marca «Apuntes»');
  ok($$('#crumbs li').length === 2, 'breadcrumb de 2 niveles');

  console.log('— Búsqueda —');
  $('#search').value = 'a'; $('#search-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await sleep(120);
  ok(!$('#results-title').hidden && $('#crumbs').hidden, 'título de resultados visible, migas ocultas');
  ok($('.item-route'), 'ruta de carpeta visible en resultados');

  console.log('— Vista lista/cuadrícula —');
  $('[data-view="list"]').click();
  ok($('#items').classList.contains('is-list') && $('[data-view="list"]').getAttribute('aria-pressed') === 'true' && $('[data-view="grid"]').getAttribute('aria-pressed') === 'false', 'vista lista + aria-pressed');
  ok(w.localStorage.getItem('naspdf-view') === 'list', 'preferencia guardada');

  console.log('— Tema —');
  const t0 = w.document.documentElement.dataset.themePref; $('#theme-btn').click();
  ok(w.document.documentElement.dataset.themePref !== t0, 'ciclo de tema: ' + t0 + ' → ' + w.document.documentElement.dataset.themePref);
  ok(/^Tema: /.test($('#theme-btn').getAttribute('aria-label')), 'aria-label del tema: ' + $('#theme-btn').getAttribute('aria-label'));

  console.log('— Subida —');
  const f = new w.File(['%PDF-1.4'], 'x.pdf', { type: 'application/pdf' }); calls.length = 0;
  const inp = $('#file-input'); Object.defineProperty(inp, 'files', { value: [f], configurable: true }); inp.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(250);
  ok($('#dlg-upload').hasAttribute('open'), 'diálogo de subida abierto');
  ok(calls.some((c) => c.startsWith('POST /api/files?path=')), 'POST subida: ' + calls.filter(c=>c.startsWith('POST /api/files')).join(','));
  ok($('#up-progress').getAttribute('aria-valuenow') === '100', 'progressbar al 100% (aria-valuenow=' + $('#up-progress').getAttribute('aria-valuenow') + ')');
  ok($('.up-item').dataset.state === 'ok', 'fila en estado «ok» con icono + texto');

  console.log('\nRESULTADO: ' + pass + ' ✓  /  ' + fail + ' ✗');
  if (errors.length) console.log('Errores de runtime:', errors);
  process.exit(fail ? 1 : 0);
})();
