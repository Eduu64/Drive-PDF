/* NAS-PDF Lite — app principal estilo Drive (carpetas + tiempo real) */
'use strict';

initTheme();

const grid = $('#grid');
const content = $('#content');
const area = $('#files-area');
const searchInput = $('#search');
const menu = $('#menu');
const dropOverlay = $('#drop-overlay');
const fileInput = $('#file-input');
const breadcrumb = $('#breadcrumb');
const moveModal = $('#move-modal');

$('#logo-icon').innerHTML = I.logo;
$('#search-icon').innerHTML = I.search;
$('#upload-icon').innerHTML = I.upload;
$('#folder-btn').innerHTML = I.folderPlus;
$('#view-btn').innerHTML = I.grid;
$('#move-close').innerHTML = I.x;
$('#theme-btn').innerHTML = document.documentElement.dataset.theme === 'dark' ? I.sun : I.moon;

let cwd = '';                 // carpeta actual ('' = raíz)
let view = localStorage.getItem('naspdf-view') || 'grid';
let listing = { folders: [], files: [] };
let query = '';
let searching = false;
let uploading = false;
let moveTarget = null;        // path del archivo a mover (modal abierto)
let moveDest = '';            // carpeta elegida en el modal

area.classList.toggle('list-view', view === 'list');
$('#view-btn').innerHTML = view === 'list' ? I.grid : I.list;

/* ---------- carga y render ---------- */
async function load() {
  if (searching) return;
  content.classList.add('loading');
  content.innerHTML = '<span class="spinner"></span>';
  grid.style.display = 'none';
  breadcrumb.style.display = query ? 'none' : 'flex';
  try {
    if (query) {
      const r = await api('/api/search?q=' + encodeURIComponent(query));
      listing = { folders: [], files: r.files };
    } else {
      listing = await api('/api/files?path=' + encodeURIComponent(cwd));
    }
    render();
  } catch (e) {
    content.innerHTML = '<div class="empty"><div class="big">⚠</div>' + e.message + '</div>';
    return;
  }
}

function crumbs() {
  const parts = cwd ? cwd.split('/') : [];
  const acc = [];
  const out = [{ name: 'Biblioteca', path: '' }];
  for (const p of parts) {
    acc.push(p);
    out.push({ name: p, path: acc.join('/') });
  }
  return out;
}

function renderBreadcrumb() {
  breadcrumb.innerHTML = '';
  const items = crumbs();
  items.forEach((c, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.innerHTML = I.chev;
      breadcrumb.appendChild(sep);
    }
    const b = document.createElement('button');
    b.className = 'crumb' + (i === items.length - 1 ? ' current' : '');
    b.textContent = c.name;
    b.addEventListener('click', () => { cwd = c.path; query = ''; searchInput.value = ''; load(); });
    breadcrumb.appendChild(b);
  });
}

function render() {
  grid.innerHTML = '';
  renderBreadcrumb();
  breadcrumb.style.display = query ? 'none' : 'flex';
  const emptyView = listing.folders.length === 0 && listing.files.length === 0;
  if (emptyView) {
    content.style.display = 'block';
    content.classList.remove('loading');
    content.innerHTML = query
      ? '<div class="empty"><div class="big">🔍</div>Ningún documento coincide con la búsqueda</div>'
      : '<div class="empty"><div class="big">📂</div>' + (cwd ? 'Carpeta vacía' : 'Sube tu primer PDF con el botón «Subir PDF»<br>o arrastrándolo aquí') + '</div>';
    grid.style.display = 'none';
    return;
  }
  content.style.display = 'none';
  grid.style.display = 'grid';
  for (const f of listing.folders) grid.appendChild(buildFolderCard(f));
  for (const f of listing.files) grid.appendChild(buildFileCard(f));
}

function buildFolderCard(f) {
  const card = document.createElement('div');
  card.className = 'card folder';
  card.innerHTML =
    '<span class="f-icon f-icon-folder">' + I.folder + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="f-name"></div>' +
      '<div class="f-meta"><span>Carpeta</span></div>' +
    '</div>' +
    '<button class="dots" title="Más opciones">' + I.dots + '</button>';
  card.querySelector('.f-name').textContent = f.name;
  card.addEventListener('click', (ev) => {
    if (ev.target.closest('.dots')) return;
    cwd = f.path;
    query = '';
    searchInput.value = '';
    load();
  });
  const dots = card.querySelector('.dots');
  dots.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    closeMenu();
    if (!wasOpen) { openFolderMenu(f, dots); dots.classList.add('open'); }
  });
  return card;
}

function buildFileCard(f) {
  const card = document.createElement('div');
  card.className = 'card';
  const route = f.path.split('/').slice(0, -1).join('/');
  card.innerHTML =
    '<span class="f-icon">' + I.logo + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="f-name"></div>' +
      '<div class="f-meta"><span>' + fmtSize(f.size) + '</span><span>' + fmtDate(f.mtime) + '</span>' +
      (f.highlights ? '<span class="badge-hl">✏ ' + f.highlights + '</span>' : '') + '</div>' +
    '</div>' +
    '<button class="dots" title="Más opciones">' + I.dots + '</button>';
  card.querySelector('.f-name').textContent = f.name;
  card.title = route ? '📁 ' + route : '';
  if (query && route) {
    const routeEl = document.createElement('div');
    routeEl.className = 'f-route';
    routeEl.textContent = '📁 ' + route;
    card.querySelector('.f-name').after(routeEl);
  }
  card.addEventListener('click', (ev) => {
    if (ev.target.closest('.dots')) return;
    openViewer(f.path);
  });
  const dots = card.querySelector('.dots');
  dots.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    closeMenu();
    if (!wasOpen) { openFileMenu(f, dots); dots.classList.add('open'); }
  });
  return card;
}

function openViewer(path, edit) {
  // clic en la tarjeta → visor de lectura; «Editar subrayados» → ?edit=1
  location.href = 'viewer.html' + (edit ? '?edit=1' : '') + '#' + encodeURIComponent(path);
}

/* ---------- menús de 3 puntos ---------- */
function closeMenu() {
  menu.classList.remove('open');
  document.querySelectorAll('.card .dots.open').forEach((b) => b.classList.remove('open'));
}
document.addEventListener('click', (ev) => { if (!ev.target.closest('#menu')) closeMenu(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { closeMenu(); closeMoveModal(); } });

function menuItem(icon, label, cls, fn) {
  const b = document.createElement('button');
  if (cls) b.className = cls;
  b.innerHTML = icon;
  const span = document.createElement('span');
  span.textContent = label;
  b.appendChild(span);
  b.addEventListener('click', () => { closeMenu(); fn(); });
  return b;
}

function openFileMenu(f, anchor) {
  menu.innerHTML = '';
  menu.appendChild(menuItem(I.pen, 'Editar subrayados', '', () => openViewer(f.path, true)));
  menu.appendChild(menuItem(I.download, 'Descargar original', '', () => {
    const a = document.createElement('a');
    a.href = '/files/' + encodeURIComponent(f.path);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }));
  menu.appendChild(menuItem(I.moveI, 'Mover…', '', () => openMoveModal(f)));
  menu.appendChild(menuItem(I.edit, 'Renombrar', '', async () => {
    const newName = prompt('Nuevo nombre del PDF:', f.name);
    if (!newName || newName === f.name) return;
    const parent = f.path.split('/').slice(0, -1).join('/');
    const to = parent ? parent + '/' + newName : newName;
    try {
      await api('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: f.path, to }) });
      toast('Documento renombrado');
      load();
    } catch (e) { toast(e.message, true); }
  }));
  const clearBtn = menuItem(I.eraser, f.highlights ? 'Borrar subrayados (' + f.highlights + ')' : 'Borrar subrayados', '', async () => {
    if (!confirm('¿Borrar TODOS los subrayados de «' + f.name + '»?\nEl PDF original no se toca; solo se elimina la capa de subrayado.')) return;
    try {
      await api('/api/annotations/' + encodeURIComponent(f.path), { method: 'DELETE' });
      toast('Subrayados eliminados — el PDF queda limpio');
      load();
    } catch (e) { toast(e.message, true); }
  });
  if (!f.highlights) clearBtn.style.opacity = '0.45';
  menu.appendChild(clearBtn);

  const sep = document.createElement('div');
  sep.className = 'sep';
  menu.appendChild(sep);
  menu.appendChild(menuItem(I.trash, 'Eliminar documento', 'danger', async () => {
    if (!confirm('¿Eliminar «' + f.name + '» definitivamente?\nSe borrará el PDF y su capa de subrayados. Esta acción no se puede deshacer.')) return;
    try {
      await api('/api/files/' + encodeURIComponent(f.path), { method: 'DELETE' });
      toast('Documento eliminado');
      load();
    } catch (e) { toast(e.message, true); }
  }));
  positionMenu(anchor);
}

function openFolderMenu(f, anchor) {
  menu.innerHTML = '';
  menu.appendChild(menuItem(I.folder, 'Abrir carpeta', '', () => { cwd = f.path; query = ''; searchInput.value = ''; load(); }));
  const sep = document.createElement('div');
  sep.className = 'sep';
  menu.appendChild(sep);
  menu.appendChild(menuItem(I.trash, 'Eliminar carpeta (vacía)', 'danger', async () => {
    if (!confirm('¿Eliminar la carpeta «' + f.name + '»?\nDebe estar vacía (así nunca se borra contenido por accidente).')) return;
    try {
      await api('/api/folders/' + encodeURIComponent(f.path), { method: 'DELETE' });
      toast('Carpeta eliminada');
      load();
    } catch (e) { toast(e.message, true); }
  }));
  positionMenu(anchor);
}

function positionMenu(anchor) {
  menu.style.visibility = 'hidden';
  menu.classList.add('open');
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = Math.min(r.left, window.innerWidth - mw - 10);
  let y = r.bottom + 6;
  if (y + mh > window.innerHeight - 10) y = Math.max(10, r.top - mh - 6);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.visibility = 'visible';
}

/* ---------- modal "Mover a…" ---------- */
function closeMoveModal() {
  moveModal.classList.remove('open');
  moveTarget = null;
}
$('#move-close').addEventListener('click', closeMoveModal);
moveModal.addEventListener('click', (ev) => { if (ev.target === moveModal) closeMoveModal(); });

async function openMoveModal(f) {
  moveTarget = f;
  $('#move-name').textContent = f.name;
  moveDest = cwd;
  const list = $('#move-list');
  list.innerHTML = '<span class="spinner"></span>';
  moveModal.classList.add('open');
  try {
    const r = await api('/api/folders');
    list.innerHTML = '';
    const mk = (label, path, cls) => {
      const b = document.createElement('button');
      b.className = 'move-item' + (cls ? ' ' + cls : '');
      b.innerHTML = (path === '' ? I.logo : I.folder) + '<span></span>';
      b.querySelector('span').textContent = label;
      b.addEventListener('click', () => {
        moveDest = path;
        list.querySelectorAll('.move-item').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      list.appendChild(b);
    };
    mk('Biblioteca (raíz)', '', 'move-root');
    for (const dir of r.folders) mk(dir, dir);
    // preselecciona "mover aquí" (la carpeta actual)
    if (cwd === '') list.querySelector('.move-root').classList.add('on');
    else [...list.querySelectorAll('.move-item')].find((b) => b.textContent === cwd)?.classList.add('on');
  } catch (e) {
    list.innerHTML = '<div class="empty">' + e.message + '</div>';
  }
}

$('#move-here').addEventListener('click', async () => {
  if (!moveTarget) return;
  const parent = moveTarget.path.split('/').slice(0, -1).join('/');
  const to = moveDest ? moveDest + '/' + moveTarget.name : moveTarget.name;
  if (to === moveTarget.path) { toast('Ya está en esa carpeta'); return closeMoveModal(); }
  try {
    await api('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: moveTarget.path, to }) });
    toast('Documento movido');
    closeMoveModal();
    load();
  } catch (e) { toast(e.message, true); }
});

/* ---------- subida (a la carpeta actual) ---------- */
const UPLOAD_LABEL = $('#upload-label');
async function uploadFiles(list) {
  const pdfs = Array.from(list).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdfs.length === 0) {
    if (list.length > 0) toast('Solo se admiten archivos PDF', true);
    return;
  }
  uploading = true;
  $('#upload-btn').disabled = true;
  UPLOAD_LABEL.textContent = 'Subiendo 0/' + pdfs.length;

  let ok = 0, dup = 0, fail = 0;
  for (let i = 0; i < pdfs.length; i++) {
    UPLOAD_LABEL.textContent = 'Subiendo ' + (i + 1) + '/' + pdfs.length;
    try {
      await api('/api/files?path=' + encodeURIComponent(cwd ? cwd + '/' + pdfs[i].name : pdfs[i].name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfs[i],
      });
      ok++;
    } catch (e) {
      if (e.status === 409) dup++;
      else fail++;
    }
  }

  uploading = false;
  $('#upload-btn').disabled = false;
  UPLOAD_LABEL.textContent = 'Subir PDF';
  if (ok && !fail && !dup) toast(ok === 1 ? 'Documento subido' : ok + ' documentos subidos');
  else if (ok && dup) toast(ok + ' subidos · ' + dup + ' ya existían (sin sobrescribir)');
  else if (ok && fail) toast(ok + ' subidos · ' + fail + ' con error', true);
  else if (dup) toast('Ya existían (sin sobrescribir)', true);
  else toast('No se pudo subir', true);
  load();
}

$('#upload-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (ev) => {
  await uploadFiles(ev.target.files);
  fileInput.value = '';
});

/* drag & drop en toda la ventana */
let dragDepth = 0;
window.addEventListener('dragenter', (ev) => {
  if (Array.from(ev.dataTransfer.types).includes('Files')) {
    dragDepth++;
    dropOverlay.classList.add('on');
  }
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.remove('on'); }
});
window.addEventListener('dragover', (ev) => ev.preventDefault());
window.addEventListener('drop', async (ev) => {
  ev.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('on');
  if (ev.dataTransfer.files.length) await uploadFiles(ev.dataTransfer.files);
});

/* ---------- carpeta nueva, vista, buscador, tema ---------- */
$('#folder-btn').addEventListener('click', async () => {
  const name = prompt('Nombre de la carpeta nueva (dentro de «' + (cwd || 'Biblioteca') + '»):');
  if (!name) return;
  const parentSeg = name.trim();
  if (parentSeg.startsWith('.') || parentSeg.includes('/') || parentSeg.includes('\\')) {
    return toast('Nombre de carpeta no válido', true);
  }
  try {
    await api('/api/folders?path=' + encodeURIComponent(cwd ? cwd + '/' + parentSeg : parentSeg), { method: 'POST' });
    toast('Carpeta creada');
    load();
  } catch (e) { toast(e.message, true); }
});

$('#view-btn').addEventListener('click', () => {
  view = view === 'grid' ? 'list' : 'grid';
  localStorage.setItem('naspdf-view', view);
  area.classList.toggle('list-view', view === 'list');
  $('#view-btn').innerHTML = view === 'list' ? I.grid : I.list;
});

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = searchInput.value.trim();
    searching = false;
    load();
  }, 250);
});

$('#theme-btn').addEventListener('click', () => {
  const isDark = toggleTheme(document.documentElement.dataset.theme === 'dark');
  $('#theme-btn').innerHTML = isDark ? I.sun : I.moon;
});

/* ---------- tiempo real (SSE): cualquier cambio refresca la vista ---------- */
function connectEvents() {
  if (!window.EventSource) return;
  const es = new EventSource('/api/events');
  let pending = null;
  es.onmessage = (ev) => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; load(); }, 250);
  };
  es.onerror = () => { /* EventSource reintenta solo */ };
}
ensureAuth().then(connectEvents);
load();
