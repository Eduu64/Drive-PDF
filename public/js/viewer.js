/* NAS-PDF Lite — visor con subrayado sincronizado (vanilla, sin React)
 *
 * - Los subrayados viven en una capa JSON por documento (annotations/<nombre>.pdf.json):
 *   el PDF original NUNCA se modifica. Se pueden borrar uno a uno o todos juntos.
 * - Sincronización: autoguardado con debounce (8 s) + botón/Ctrl+S.
 * - Virtualización: solo las páginas visibles (+2 de margen) tienen canvas;
 *   el resto son divs-placeholder → RAM estable con PDFs enormes.
 */
'use strict';

initTheme();

/* ---------- refs e iconos ---------- */
$('#back-btn').innerHTML = I.back;
$('#ic-cursor').innerHTML = I.cursor;
$('#ic-pen').innerHTML = I.pen;
$('#ic-eraser').innerHTML = I.eraser;
$('#ic-wipe').innerHTML = I.wipe;
$('#ic-undo').innerHTML = I.undo;
$('#ic-cloud').innerHTML = I.cloud;
$('#ic-download').innerHTML = I.download;
$('#zoom-in').innerHTML = I.plus;
$('#zoom-out').innerHTML = I.minus;

const scrollEl = $('#pages-scroll');
const pagesCol = $('#pages-col');
const thumbsEl = $('#thumbs');
const pageInput = $('#page-input');
const pageTotal = $('#page-total');
const syncBadge = $('#sync-badge');
const syncText = $('#sync-text');
const btnCursor = $('#btn-cursor');
const btnHl = $('#btn-hl');
const btnDelMode = $('#btn-del-mode');
const btnWipe = $('#btn-wipe');
const btnUndo = $('#btn-undo');
const btnSync = $('#btn-sync');
const btnExport = $('#btn-export');
const btnPomo = $('#btn-pomo');
const pomoTime = $('#pomo-time');

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';

/* ---------- estado ---------- */
const fileName = (() => {
  const h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  return h.endsWith('.pdf') ? h : h + '.pdf';
})();
const baseName = fileName.split('/').pop();   // nombre sin carpetas (para títulos y descargas)

let pdfDoc = null;
let numPages = 0;
let scale = 1.2;
const MAX_DPR = 1.5;
const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
const MARGIN = 28;                 // coincide con el margen inferior de cada página
const OVERSCAN = 2;
const DEFAULT_ROW = 1000 + MARGIN;
const AUTOSAVE_MS = 8000;

let unitWidth = null;              // tamaño de página en unidades PDF (sin escala)
let unitHeight = null;
let scrollTop = 0;
let viewportH = 800;
let currentPage = 1;
let editingPageInput = false;

let highlights = [];               // [{id, page, rects:[{x,y,width,height}], color, opacity}]
let dirty = false;
let saving = false;
let savingRef = false;
let autosaveTimer = null;

let mode = localStorage.getItem('naspdf-mode') === 'cursor' ? 'cursor' : 'highlight';
let deleteMode = false;
let toolColor = localStorage.getItem('naspdf-color') || '#facc15';
let opacity = parseInt(localStorage.getItem('naspdf-opacity') || '30', 10);

const pageState = new Map();       // pageNum -> {wrap, canvas, ctx, hlLayer, scale, renderTask, textTask}
const thumbTasks = new Map();
let thumbObserver = null;
const thumbRefs = new Map();

let undoStack = [];
const UNDO_MAX = 50;

/* ---------- badge de sincronización ---------- */
function setSync(state, text) {
  syncBadge.className = 'sync-badge ' + state;
  syncText.textContent = text;
}

/* ---------- fila de página ---------- */
function rowHeight() {
  return (unitHeight ? unitHeight * scale : 1000) + MARGIN;
}
function pageCssWidth() {
  return unitWidth ? unitWidth * scale : 800;
}

function visibleWindow() {
  if (!numPages) return [0, -1];
  const rh = rowHeight();
  const first = Math.floor(scrollTop / rh);
  const count = Math.ceil(viewportH / rh) + 1;
  return [
    Math.max(0, first - OVERSCAN),
    Math.min(numPages - 1, first + count + OVERSCAN),
  ];
}

/* ---------- render de páginas (ventana virtual) ---------- */
let queueLen = 0;
const MAX_CONCURRENT = 3;
const pendingRender = new Set();

function destroyPage(n) {
  const st = pageState.get(n);
  if (!st) return;
  try { st.renderTask && st.renderTask.cancel(); } catch {}
  try { st.textTask && st.textTask.cancel(); } catch {}
  // devuelve el placeholder a su posición para que el orden y las alturas se mantengan
  const cur = slots.get(n);
  if (cur === st.wrap) {
    const ph = makePlaceholder(n);
    st.wrap.replaceWith(ph);
    slots.set(n, ph);
  }
  st.wrap.remove();
  st.canvas.width = 0;             // libera la memoria del canvas YA
  pageState.delete(n);
  pendingRender.delete(n);
}

async function renderPage(n) {
  if (pageState.has(n) || pendingRender.has(n)) return;
  pendingRender.add(n);
  try {
    const page = await pdfDoc.getPage(n);
    const cssVp = page.getViewport({ scale });
    const renderVp = page.getViewport({ scale: scale * dpr });

    let st = pageState.get(n);
    if (!st) {
      const wrap = document.createElement('div');
      wrap.className = 'page-wrap' + (deleteMode ? ' delete-mode' : '') + (mode === 'cursor' ? ' no-highlight' : '');
      wrap.style.width = cssVp.width + 'px';
      wrap.style.height = cssVp.height + 'px';
      // pdf.js 3.x posiciona la capa de texto con esta variable CSS:
      // si no está, la selección (y el subrayado) se descuadra.
      wrap.style.setProperty('--scale-factor', String(scale));
      wrap.dataset.page = n;

      const canvas = document.createElement('canvas');
      canvas.width = renderVp.width;
      canvas.height = renderVp.height;
      canvas.style.width = cssVp.width + 'px';
      canvas.style.height = cssVp.height + 'px';

      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';

      const hlLayer = document.createElement('div');
      hlLayer.className = 'hl-layer';

      wrap.appendChild(canvas);
      wrap.appendChild(textDiv);
      wrap.appendChild(hlLayer);
      wrap.addEventListener('mouseup', (ev) => onPageMouseUp(ev, n));

      // sustituye el placeholder EN SU POSICIÓN (mantiene el orden de las páginas)
      const slot = slots.get(n);
      if (slot) slot.replaceWith(wrap); else pagesCol.appendChild(wrap);
      slots.set(n, wrap);
      st = { wrap, canvas, ctx: canvas.getContext('2d', { alpha: false }), hlLayer, scale, renderTask: null, textTask: null };
      pageState.set(n, st);
    }

    const canvas = st.canvas;
    const ctx = st.ctx;
    canvas.width = renderVp.width;
    canvas.height = renderVp.height;
    canvas.style.width = cssVp.width + 'px';
    canvas.style.height = cssVp.height + 'px';

    const task = page.render({ canvasContext: ctx, viewport: renderVp });
    st.renderTask = task;
    await task.promise;
    if (pageState.get(n) !== st) return;   // fue destruida mientras renderizaba

    // capa de texto (para poder seleccionar)
    try { st.textTask && st.textTask.cancel(); } catch {}
    const tl = pdfjsLib.renderTextLayer({
      textContentSource: page.streamTextContent(),
      container: st.wrap.querySelector('.textLayer'),
      viewport: cssVp,
      textDivs: [],
    });
    st.textTask = tl;
    await tl.promise;
  } catch (err) {
    if (err && (err.name === 'RenderingCancelledException' || err.code)) return;
    console.warn('Página ' + n + ':', err);
  } finally {
    pendingRender.delete(n);
    pumpQueue();
  }
}

function pumpQueue() {
  while (queueLen < MAX_CONCURRENT) {
    const [ws, we] = visibleWindow();
    let next = null;
    for (let n = ws + 1; n <= we + 1; n++) {
      if (!pageState.has(n) && !pendingRender.has(n)) { next = n; break; }
    }
    if (next === null) break;
    queueLen++;
    renderPage(next).finally(() => queueLen--);
  }
}

function renderWindow() {
  const [ws, we] = visibleWindow();
  // destruye lo que queda fuera (RAM)
  for (const n of Array.from(pageState.keys())) {
    if (n - 1 < ws || n - 1 > we) destroyPage(n);
  }
  pumpQueue();
}

/* ---------- overlays de subrayado ---------- */
function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a / 100})`;
}

function repaintPage(n) {
  const st = pageState.get(n);
  if (!st) return;
  st.hlLayer.innerHTML = '';
  const hlws = highlights.filter((h) => h.page === n);
  for (const hl of hlws) {
    for (const r of hl.rects) {
      const d = document.createElement('div');
      d.className = 'hl-rect' + (deleteMode ? ' deletable' : '');
      d.style.left = r.x * scale + 'px';
      d.style.top = r.y * scale + 'px';
      d.style.width = r.width * scale + 'px';
      d.style.height = r.height * scale + 'px';
      d.style.backgroundColor = rgba(hl.color, hl.opacity);
      if (deleteMode) d.addEventListener('click', () => removeHighlight(hl));
      st.hlLayer.appendChild(d);
    }
  }
}

function repaintAllOverlays() {
  for (const n of pageState.keys()) repaintPage(n);
  for (const w of pagesCol.querySelectorAll('.page-wrap')) {
    w.classList.toggle('delete-mode', deleteMode);
    w.classList.toggle('no-highlight', mode === 'cursor');
  }
}

/* ---------- sincronización ---------- */
function markDirty() {
  dirty = true;
  setSync('saving', 'Cambios pendientes…');
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { autosaveTimer = null; syncNow(true); }, AUTOSAVE_MS);
}

async function syncNow(isAutosave = false) {
  if (savingRef) return;
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  savingRef = true;
  saving = true;
  setSync('saving', 'Sincronizando…');
  try {
    await api('/api/annotations/' + encodeURIComponent(fileName), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ highlights }),
    });
    dirty = false;
    setSync('ok', 'Guardado ✓');
    if (!isAutosave) toast('Subrayados sincronizados');
  } catch (e) {
    setSync('off', 'Sin guardar');
    toast('No se pudo sincronizar: ' + e.message, true);
    if (isAutosave) markDirty();     // reintenta más tarde
  } finally {
    savingRef = false;
    saving = false;
  }
}

/* flush al cerrar la pestaña: fetch keepalive sobrevive al unload */
window.addEventListener('pagehide', () => {
  if (!dirty || savingRef) return;
  try {
    fetch('/api/annotations/' + encodeURIComponent(fileName), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ highlights }),
      keepalive: true,
    });
  } catch {}
});

/* ---------- subrayados: crear / borrar / deshacer ---------- */
function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  btnUndo.disabled = undoStack.length === 0;
}

const rectEq = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 &&
  Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2;

function addHighlight(page, rects) {
  // dedup: si esa misma línea ya está subrayada en la página, no crea un duplicado
  const dup = highlights.some((h) => h.page === page &&
    h.rects.some((r) => rectEq(r, rects[0]) && Math.abs(r.width - rects[0].width) < 6));
  if (dup) { toast('Ese texto ya está subrayado'); return; }
  const hl = {
    id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    page, rects, color: toolColor, opacity,
  };
  highlights.push(hl);
  repaintPage(page);
  pushUndo({ type: 'add', hl });
  markDirty();
  btnExport.disabled = false;
}

function removeHighlight(hl) {
  const i = highlights.indexOf(hl);
  if (i === -1) return;
  highlights.splice(i, 1);
  repaintPage(hl.page);
  pushUndo({ type: 'del', hl });
  markDirty();
  btnExport.disabled = highlights.length === 0;
}

/* botón de CURSOR: desactiva el subrayador para usar la selección normal */
function applyMode() {
  btnCursor.classList.toggle('on', mode === 'cursor');
  btnHl.classList.toggle('on', mode === 'highlight');
  btnDelMode.classList.toggle('on', deleteMode);
  btnDelMode.classList.toggle('danger-on', deleteMode);
  localStorage.setItem('naspdf-mode', mode);
  repaintAllOverlays();
}
btnCursor.addEventListener('click', () => { mode = 'cursor'; deleteMode = false; applyMode(); });
btnHl.addEventListener('click', () => { mode = 'highlight'; deleteMode = false; applyMode(); });
btnDelMode.addEventListener('click', () => {
  deleteMode = !deleteMode;
  if (deleteMode && mode !== 'cursor') { /* el borrado usa clic, la selección no importa */ }
  applyMode();
});

/* borrar TODOS los subrayados de este documento (la capa se vacía; PDF intacto) */
btnWipe.addEventListener('click', async () => {
  if (highlights.length === 0) return toast('No hay subrayados que borrar');
  if (!confirm('¿Borrar TODOS los subrayados de «' + baseName + '»?\nEl PDF original no se toca.')) return;
  const backup = highlights;
  highlights = [];
  undoStack = [];
  btnUndo.disabled = true;
  repaintAllOverlays();
  btnExport.disabled = true;
  markDirty();
  await syncNow(false);
  pushUndo({ type: 'wipe', backup });
});

btnUndo.addEventListener('click', () => {
  const last = undoStack.pop();
  btnUndo.disabled = undoStack.length === 0;
  if (!last) return;
  if (last.type === 'add') {
    const i = highlights.indexOf(last.hl);
    if (i !== -1) { highlights.splice(i, 1); repaintPage(last.hl.page); }
  } else if (last.type === 'wipe') {
    highlights = last.backup;          // recupera TODO lo borrado
    for (const n of pageState.keys()) repaintPage(n);
    btnExport.disabled = highlights.length === 0;
  } else {
    // recrear el subrayado borrado (mismo id interno, visualmente idéntico)
    highlights.push(last.hl);
    repaintPage(last.hl.page);
    btnExport.disabled = false;
  }
  markDirty();
});

/* selección de texto → subrayado */
function onPageMouseUp(ev, pageNum) {
  if (mode !== 'highlight' || deleteMode) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

  const range = sel.getRangeAt(0);
  const wrap = ev.currentTarget;
  const wrapRect = wrap.getBoundingClientRect();

  let rects = Array.from(range.getClientRects())
    .filter((r) => r.width > 1 && r.height > 1)
    .filter((r) => r.bottom > wrapRect.top && r.top < wrapRect.bottom); // solo esta página
  rects.sort((a, b) => a.top - b.top || a.left - b.left);

  // fusiona líneas adyacentes (igual que la app original)
  const merged = [];
  for (const rect of rects) {
    let hit = false;
    for (let i = 0; i < merged.length; i++) {
      const ex = merged[i];
      if (Math.abs(ex.top - rect.top) < 3 && rect.left <= ex.left + ex.width + 5) {
        const left = Math.min(ex.left, rect.left);
        const right = Math.max(ex.left + ex.width, rect.left + rect.width);
        merged[i] = { left, top: ex.top, width: right - left, height: Math.max(ex.height, rect.height) };
        hit = true;
        break;
      }
    }
    if (!hit) merged.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }

  const lineRects = merged.map((r) => ({
    x: (r.left - wrapRect.left) / scale,
    y: (r.top - wrapRect.top) / scale,
    width: r.width / scale,
    height: r.height / scale,
  }));
  if (lineRects.length === 0) return;

  addHighlight(pageNum, lineRects);
  sel.removeAllRanges();
}

/* ---------- colores y opacidad ---------- */
const PRESET = ['#facc15', '#3b82f6', '#22c55e', '#ef4444'];
const colorsBox = $('#colors');
function buildColors() {
  colorsBox.innerHTML = '';
  for (const c of PRESET) {
    const b = document.createElement('button');
    b.className = 'color-dot' + (toolColor === c && mode === 'highlight' ? ' on' : '');
    b.style.backgroundColor = c;
    b.title = c;
    b.addEventListener('click', () => { toolColor = c; mode = 'highlight'; deleteMode = false; localStorage.setItem('naspdf-color', c); applyMode(); buildColors(); });
    colorsBox.appendChild(b);
  }
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'color-dot' + (!PRESET.includes(toolColor) && mode === 'highlight' ? ' on' : '');
  picker.value = toolColor;
  picker.title = 'Color personalizado';
  picker.addEventListener('input', () => { toolColor = picker.value; mode = 'highlight'; deleteMode = false; localStorage.setItem('naspdf-color', picker.value); applyMode(); buildColors(); });
  colorsBox.appendChild(picker);
}
const opacityInput = $('#opacity');
opacityInput.value = opacity;
opacityInput.addEventListener('input', () => { opacity = parseInt(opacityInput.value, 10); localStorage.setItem('naspdf-opacity', String(opacity)); });

/* ---------- sincronizar / exportar pintado ---------- */
btnSync.addEventListener('click', () => syncNow(false));

btnExport.addEventListener('click', async () => {
  if (highlights.length === 0 || btnExport.disabled) return;
  btnExport.disabled = true;
  const old = btnExport.innerHTML;
  btnExport.innerHTML = I.spinner;
  try {
    const res = await fetch('/files/' + encodeURIComponent(fileName));
    if (!res.ok) throw new Error('No se pudo leer el PDF original');
    const bytes = await res.arrayBuffer();
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const pages = pdf.getPages();

    for (const hl of highlights) {
      const page = pages[hl.page - 1];
      if (!page) continue;
      const { height } = page.getSize();
      const r = parseInt(hl.color.slice(1, 3), 16) / 255;
      const g = parseInt(hl.color.slice(3, 5), 16) / 255;
      const b = parseInt(hl.color.slice(5, 7), 16) / 255;
      for (const rect of hl.rects) {
        page.drawRectangle({
          x: rect.x,
          y: height - rect.y - rect.height,   // coordenadas PDF: origen abajo
          width: rect.width,
          height: rect.height,
          color: PDFLib.rgb(r, g, b),
          opacity: hl.opacity / 100,
        });
      }
    }

    const out = await pdf.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pintado_' + baseName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('PDF pintado descargado (no se guarda en el servidor)');
  } catch (e) {
    toast('Error al exportar: ' + e.message, true);
  } finally {
    btnExport.innerHTML = old;
    btnExport.disabled = highlights.length === 0;
  }
});

/* ---------- pomodoro ---------- */
let pomoLeft = 1500, pomoOn = false, pomoInterval = null;
function drawPomo() {
  pomoTime.textContent = Math.floor(pomoLeft / 60).toString().padStart(2, '0') + ':' + String(pomoLeft % 60).padStart(2, '0');
}
btnPomo.addEventListener('click', () => {
  pomoOn = !pomoOn;
  btnPomo.classList.toggle('on', pomoOn);
  clearInterval(pomoInterval);
  if (pomoOn) {
    pomoInterval = setInterval(() => {
      pomoLeft--;
      if (pomoLeft <= 0) {
        clearInterval(pomoInterval);
        pomoOn = false; pomoLeft = 1500;
        btnPomo.classList.remove('on');
        toast('Pomodoro terminado (25 min)');
      }
      drawPomo();
    }, 1000);
  }
  drawPomo();
});
drawPomo();

/* ---------- miniaturas (lazy con IntersectionObserver) ---------- */
function buildThumbs() {
  thumbsEl.innerHTML = '';
  thumbRefs.clear();
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const n = parseInt(en.target.dataset.page, 10);
      renderThumb(n, en.target);
      thumbObserver.unobserve(en.target);
    }
  }, { root: thumbsEl, rootMargin: '400px' });

  for (let n = 1; n <= numPages; n++) {
    const box = document.createElement('div');
    box.className = 'thumb';
    box.dataset.page = n;
    const ratio = unitWidth ? unitHeight / unitWidth : 1.414;
    box.style.height = Math.round(140 * ratio) + 24 + 'px';
    box.innerHTML = '<div class="t-canvas"><span class="spinner"></span></div><p>' + n + '</p>';
    box.addEventListener('click', () => scrollToPage(n));
    thumbsEl.appendChild(box);
    thumbRefs.set(n, box);
    thumbObserver.observe(box);
  }
}

async function renderThumb(n, box) {
  if (thumbTasks.has(n)) return;
  try {
    const page = await pdfDoc.getPage(n);
    const box2 = thumbRefs.get(n) || box;
    if (!box2.isConnected) return;
    const vp = page.getViewport({ scale: 140 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = '100%';
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp }).promise;
    const holder = box2.querySelector('.t-canvas');
    holder.innerHTML = '';
    holder.style.minHeight = '0';
    holder.appendChild(canvas);
  } catch (e) {
    console.warn('Miniatura ' + n, e);
  }
}

/* ---------- navegación ---------- */
function scrollToPage(n) {
  const clamped = Math.max(1, Math.min(numPages, n));
  scrollEl.scrollTo({ top: (clamped - 1) * rowHeight(), behavior: 'smooth' });
}

$('#page-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const n = parseInt(pageInput.value, 10);
  if (Number.isInteger(n)) scrollToPage(n);
  pageInput.blur();
});
pageInput.addEventListener('focus', () => { editingPageInput = true; });
pageInput.addEventListener('blur', () => { editingPageInput = false; pageInput.value = String(currentPage); });

$('#zoom-in').addEventListener('click', () => setScale(scale + 0.1));
$('#zoom-out').addEventListener('click', () => setScale(scale - 0.1));
function setScale(next) {
  next = Math.max(0.5, Math.min(3, next));
  if (next === scale) return;
  // ancla el zoom en la página visible (todas las filas miden lo mismo → exacto)
  const firstVisible = scrollTop / rowHeight();
  scale = Math.round(next * 10) / 10;
  $('#zoom-pct').textContent = Math.round(scale * 100) + '%';
  for (const n of Array.from(pageState.keys())) destroyPage(n);
  layoutPlaceholders();
  renderWindow();
  scrollEl.scrollTop = firstVisible * rowHeight();
  scrollTop = scrollEl.scrollTop;
}

/* ---------- scroll ---------- */
let rafPending = false;
scrollEl.addEventListener('scroll', () => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    scrollTop = scrollEl.scrollTop;
    renderWindow();
    const prev = currentPage;
    currentPage = numPages
      ? Math.min(numPages, Math.max(1, Math.floor(scrollTop / rowHeight()) + 1))
      : 1;
    if (prev !== currentPage) {
      if (!editingPageInput) pageInput.value = String(currentPage);
      const active = thumbRefs.get(currentPage);
      const old = thumbRefs.get(prev);
      if (old) old.classList.remove('active');
      if (active) { active.classList.add('active'); active.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
  });
});

/* cada página tiene SIEMPRE un elemento en la columna: placeholder o página real */
const slots = new Map();           // pageNum -> elemento DOM actualmente en su posición
function makePlaceholder(n) {
  const ph = document.createElement('div');
  ph.style.height = rowHeight() - MARGIN + 'px';
  ph.style.marginBottom = MARGIN + 'px';
  ph.style.width = pageCssWidth() + 'px';
  ph.dataset.slotPage = n;
  return ph;
}

function layoutPlaceholders() {
  // reconstruye la columna completa con placeholders (las páginas montadas
  // se re-colocan en su sitio, el resto quedan como placeholder a la altura correcta)
  pagesCol.innerHTML = '';
  slots.clear();
  const rendered = new Map(pageState);
  pageState.clear();
  for (let n = 1; n <= numPages; n++) {
    const el = makePlaceholder(n);
    pagesCol.appendChild(el);
    slots.set(n, el);
  }
  for (const [n, st] of rendered) {
    const slot = slots.get(n);
    if (slot) slot.replaceWith(st.wrap);
    slots.set(n, st.wrap);
    pageState.set(n, st);
  }
}

/* ---------- teclado ---------- */
window.addEventListener('keydown', (ev) => {
  const t = ev.target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || ev.target.isContentEditable) return;

  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); syncNow(false); return; }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); btnUndo.click(); return; }
  if (ev.key === 'Escape') { deleteMode = false; mode = 'cursor'; applyMode(); buildColors(); return; }
  if (!numPages) return;
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'PageDown') { ev.preventDefault(); scrollToPage(currentPage + 1); }
  else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || ev.key === 'PageUp') { ev.preventDefault(); scrollToPage(currentPage - 1); }
});

/* ---------- arranque ---------- */
async function boot() {
  $('#doc-title').textContent = baseName;
  $('#doc-title').title = fileName;
  buildColors();
  applyMode();
  $('#zoom-pct').textContent = Math.round(scale * 100) + '%';

  if (!fileName || fileName === '.pdf') {
    $('#doc-title').textContent = 'Sin documento';
    pagesCol.innerHTML = '<div class="empty"><div class="big">📂</div>Abre un documento desde la app principal</div>';
    return;
  }

  // capa de subrayado existente (sincronizada entre dispositivos)
  try {
    const layer = await api('/api/annotations/' + encodeURIComponent(fileName));
    highlights = Array.isArray(layer.highlights) ? layer.highlights : [];
  } catch { highlights = []; }
  btnExport.disabled = highlights.length === 0;
  setSync('ok', 'Guardado ✓');

  try {
    pdfDoc = await pdfjsLib.getDocument({ url: '/files/' + encodeURIComponent(fileName) }).promise;
    numPages = pdfDoc.numPages;
    pageTotal.textContent = '/ ' + numPages;
    pageInput.disabled = false;
    pageInput.max = numPages;

    const p1 = await pdfDoc.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    unitWidth = vp1.width;
    unitHeight = vp1.height;
    $('#pages-col .loading').remove();

    currentPage = 1;
    pageInput.value = '1';
    layoutPlaceholders();
    renderWindow();
    buildThumbs();
    const t1 = thumbRefs.get(1);
    if (t1) t1.classList.add('active');
  } catch (e) {
    pagesCol.innerHTML = '<div class="empty"><div class="big">⚠</div>No se pudo abrir «' + fileName + '»<br>' + e.message + '</div>';
    return;
  }

  const ro = new ResizeObserver(() => { viewportH = scrollEl.clientHeight; renderWindow(); });
  viewportH = scrollEl.clientHeight;
  ro.observe(scrollEl);
}

btnExport.disabled = true;
ensureAuth();
boot();

/* si la URL cambia de documento sin recargar (mismo viewer.html, otro #hash),
   recargamos para arrancar limpio con el PDF nuevo */
window.addEventListener('hashchange', () => location.reload());

/* ---------- tiempo real (SSE) ----------
 * - otro equipo subraya este mismo documento → la capa se recarga aquí sola
 * - el documento se mueve/renombra/borra desde el Drive → aviso inmediato */
function connectEvents() {
  if (!window.EventSource) return;
  const es = new EventSource('/api/events');
  es.onmessage = async (ev) => {
    let data = {};
    try { data = JSON.parse(ev.data); } catch { return; }
    if (data.kind === 'annotations') {
      if (data.path !== fileName || dirty || savingRef) return;   // nuestros propios cambios ya están
      try {
        const layer = await api('/api/annotations/' + encodeURIComponent(fileName));
        highlights = Array.isArray(layer.highlights) ? layer.highlights : [];
        undoStack = [];
        btnUndo.disabled = true;
        for (const n of pageState.keys()) repaintPage(n);
        btnExport.disabled = highlights.length === 0;
        toast('Capa actualizada desde otro dispositivo');
      } catch {}
    } else if (data.kind === 'files') {
      try {
        const r = await fetch('/files/' + encodeURIComponent(fileName), { method: 'HEAD' });
        if (!r.ok) toast('El documento fue eliminado o movido desde otro equipo', true);
      } catch {}
    }
  };
}
connectEvents();
