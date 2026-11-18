// Prueba de humo del visor (solo desarrollo; la web NO depende de jsdom).
// Uso:  npm i jsdom@24  &&  node tests/viewer-smoke.js
// Variables opcionales: VIEWER_JS=/ruta/a/viewer.js  COMMON_JS=/ruta/a/common.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');   // viewer.html y js/ viven en public/ (igual que smoke.js usa public/index.html)
const pick = (...c) => c.find((p) => p && fs.existsSync(p));
const VIEWER_JS = pick(process.env.VIEWER_JS, path.join(root, 'js/viewer.js'));
const COMMON_JS = pick(process.env.COMMON_JS, path.join(root, 'js/common.js'));
const UI_JS = path.join(root, 'js/viewer-ui.js');
const HTML = fs.readFileSync(path.join(root, 'viewer.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FALLA: ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, desktop) {
  console.log('\n══ ' + label + ' ══');
  const errors = [];
  const dom = new JSDOM(HTML, { url: 'http://localhost/viewer.html?edit=1#Apuntes%2Fmates.pdf', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.addEventListener('error', (e) => errors.push(e.message));
  w.matchMedia = (q) => ({ matches: /min-width: 48em/.test(q) ? desktop : false, addEventListener() {}, removeEventListener() {}, media: q });
  w.CSS = { escape: String };
  w.HTMLCanvasElement.prototype.getContext = () => ({});
  w.Element.prototype.scrollIntoView = function () {};
  w.Element.prototype.scrollTo = function () {};
  w.ResizeObserver = class { observe() {} disconnect() {} };
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { setTimeout(() => this.cb([{ isIntersecting: true, target: el }]), 0); } unobserve() {} disconnect() {} };
  w.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('/api/annotations') ? { highlights: [] } : { auth: false }) });
  const page = { getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }), render: () => ({ promise: Promise.resolve(), cancel() {} }), streamTextContent: () => ({}) };
  w.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => page }) }), renderTextLayer: () => ({ promise: Promise.resolve(), cancel() {} }) };
  w.PDFLib = {};
  const code = [COMMON_JS, VIEWER_JS, UI_JS].map((f) => fs.readFileSync(f, 'utf8').replace(/^'use strict';/m, '')).join('\n;\n');
  try { w.eval(code); } catch (e) { console.log('EXCEPCIÓN al cargar:', e.stack); process.exit(1); }
  await sleep(250);
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  ok(errors.length === 0, 'sin errores de ejecución al cargar viewer.js (' + (errors[0] || 'ok') + ')');
  ok($('#doc-title').textContent === 'mates.pdf', 'título del documento: ' + $('#doc-title').textContent);
  ok($('#back-btn').getAttribute('href') === 'index.html#/Apuntes', 'volver → carpeta del documento: ' + $('#back-btn').getAttribute('href'));
  ok($('#back-btn').innerHTML.includes('<svg') && $('#ic-pen').innerHTML.includes('<svg') && $('#zoom-in').innerHTML.includes('<svg'), 'viewer.js inyectó los iconos en back-btn, ic-* y zoom');
  ok($('#page-total').textContent === '/ 3' && !$('#page-input').disabled, 'documento cargado: ' + $('#page-total').textContent);
  ok(!$('#pages-col .loading'), 'viewer.js retiró el .loading inicial');
  ok($('#sync-badge').classList.contains('sync-badge') && $('#sync-badge').classList.contains('ok') && $('#sync-badge').getAttribute('role') === 'status', 'sync-badge: clases del JS + role=status');
  ok(w.getComputedStyle(w.document.documentElement).colorScheme !== undefined && w.document.documentElement.dataset.theme, 'tema fijado antes de pintar: data-theme=' + w.document.documentElement.dataset.theme);

  console.log(' – miniaturas');
  const th = $$('#thumbs .thumb');
  ok(th.length === 3, '3 miniaturas creadas por viewer.js');
  ok(th.every((t) => t.getAttribute('role') === 'button' && t.tabIndex === 0), 'cada miniatura es role=button y focusable');
  ok(th[1].getAttribute('aria-label') === 'Ir a la página 2', 'aria-label: ' + th[1].getAttribute('aria-label'));
  ok(th[0].classList.contains('active') && th[0].getAttribute('aria-current') === 'page', 'miniatura activa → aria-current="page"');
  th[0].classList.remove('active'); th[2].classList.add('active'); await sleep(20);
  ok(!th[0].hasAttribute('aria-current') && th[2].getAttribute('aria-current') === 'page', 'aria-current sigue a la clase .active');
  let clicked = 0; th[1].addEventListener('click', () => clicked++); key(th[1], 'Enter'); key(th[1], ' ');
  ok(clicked === 2, 'Enter y Espacio activan la miniatura');

  console.log(' – herramientas y colores');
  ok($('#btn-hl').getAttribute('aria-pressed') === 'true' && $('#btn-cursor').getAttribute('aria-pressed') === 'false', 'aria-pressed inicial (subrayador sí, cursor no)');
  $('#btn-cursor').click(); await sleep(20);
  ok($('#btn-cursor').classList.contains('on') && $('#btn-cursor').getAttribute('aria-pressed') === 'true' && $('#btn-hl').getAttribute('aria-pressed') === 'false', 'viewer.js cambia a cursor → aria-pressed se actualiza solo');
  $('#btn-del-mode').click(); await sleep(20);
  ok($('#btn-del-mode').classList.contains('danger-on') && $('#btn-del-mode').getAttribute('aria-pressed') === 'true', 'modo borrado: .on.danger-on + aria-pressed');
  $('#btn-del-mode').click(); $('#btn-hl').click(); await sleep(20);
  const dots = [...$('#colors').children];
  ok(dots.length === 5 && dots.every((d) => d.classList.contains('color-dot')), '4 colores + selector, todos .color-dot');
  ok(dots[0].getAttribute('aria-label') === 'Color amarillo' && dots[1].title === 'Azul', 'colores con nombre (no hex): ' + dots[0].getAttribute('aria-label'));
  ok(dots[0].classList.contains('on') && dots[0].getAttribute('aria-pressed') === 'true' && dots[1].getAttribute('aria-pressed') === 'false', '.color-dot.on ↔ aria-pressed');
  ok(dots[4].getAttribute('aria-label').startsWith('Color personalizado'), 'selector personalizado con nombre accesible');
  dots[1].click(); await sleep(20);
  const dots2 = [...$('#colors').children];
  ok(dots2[1].classList.contains('on') && dots2[1].getAttribute('aria-pressed') === 'true' && dots2[0].getAttribute('aria-pressed') === 'false', 'tras reconstruir #colors (viewer.js) se vuelven a etiquetar');
  ok($('#opacity').getAttribute('aria-valuetext') === '30 %', 'opacidad: aria-valuetext="' + $('#opacity').getAttribute('aria-valuetext') + '"');

  console.log(' – cajón de miniaturas (' + (desktop ? 'escritorio: fijo' : 'móvil') + ')');
  const drawer = $('#thumbs-drawer'), btn = $('#thumbs-btn');
  btn.click(); await sleep(10);
  if (desktop) {
    ok(!drawer.classList.contains('open') && btn.getAttribute('aria-expanded') === 'false', 'en escritorio el toggle no abre nada (las miniaturas son fijas)');
  } else {
    ok(drawer.classList.contains('open') && $('#scrim').classList.contains('show'), 'el botón abre el cajón y el fondo');
    ok(btn.getAttribute('aria-expanded') === 'true' && btn.getAttribute('aria-label') === 'Ocultar miniaturas', 'aria-expanded + etiqueta cambian');
    ok($('.viewer-main').inert === true && $('#toolbar').inert === true, 'documento y herramientas quedan inert mientras está abierto');
    ok(w.document.activeElement.classList.contains('thumb'), 'el foco entra en una miniatura');
    key(w.document.activeElement, 'Escape'); await sleep(10);
    ok(!drawer.classList.contains('open') && w.document.activeElement === btn, 'Esc cierra y devuelve el foco al botón');
    ok($('#btn-hl').classList.contains('on') && !$('#btn-cursor').classList.contains('on'), 'Esc del cajón NO activó el modo cursor de viewer.js');
    key(w.document.body, 'Escape'); await sleep(20);
    ok($('#btn-cursor').classList.contains('on'), '(control) con el cajón cerrado, Esc sí vuelve a cursor, como siempre');
    btn.click(); th[1].click(); await sleep(10);
    ok(!drawer.classList.contains('open'), 'elegir una miniatura cierra el cajón');
    btn.click(); $('#scrim').click(); await sleep(10);
    ok(!drawer.classList.contains('open'), 'pulsar el fondo cierra el cajón');
    btn.click(); $('#thumbs-close').click(); await sleep(10);
    ok(!drawer.classList.contains('open') && $('.viewer-main').inert === false, 'botón ✕ del cajón cierra y quita inert');
  }
  ok(errors.length === 0, 'sin errores de ejecución tras toda la interacción (' + (errors[0] || 'ok') + ')');
}

(async () => {
  await run('MÓVIL (<48em)', false);
  await run('ESCRITORIO (≥48em)', true);
  console.log('\nRESULTADO: ' + pass + ' ✓  /  ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
})();
