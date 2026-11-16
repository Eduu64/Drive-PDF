/* NAS PDF — Drive · aplicación principal (refactor)
 * Mobile-first · accesible · 100 % local (sin librerías ni red externa).
 * Requiere common.js (api, IC, toast, tema…). */
'use strict';

/* ---------- referencias ---------- */
const app = $('#app'), main = $('#main'), sidebar = $('#sidebar'), scrim = $('#scrim'), navBtn = $('#nav-btn');
const itemsEl = $('#items'), stateEl = $('#state'), crumbsEl = $('#crumbs'), treeEl = $('#tree');
const searchForm = $('#search-form'), searchInput = $('#search'), resultsTitle = $('#results-title');
const selbar = $('#selbar'), selCount = $('#sel-count');
const menuEl = $('#menu'), menuScrim = $('#menu-scrim');
const statusEl = $('#status'), fileInput = $('#file-input'), dropOverlay = $('#drop-overlay');
const themeBtn = $('#theme-btn'), viewBtns = $$('[data-view]');
const dlgName = $('#dlg-name'), dlgConfirm = $('#dlg-confirm'), dlgMove = $('#dlg-move'), dlgUpload = $('#dlg-upload');
$$('[data-ic]').forEach((n) => { n.innerHTML = IC[n.dataset.ic] || ''; });

const mq = window.matchMedia('(min-width: 48em)');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- utilidades ---------- */
const parentOf = (p) => p.split('/').slice(0, -1).join('/');
const hrefFor = (p) => '#/' + (p ? p.split('/').map(encodeURIComponent).join('/') : '');
const viewerHref = (p) => 'viewer.html#' + encodeURIComponent(p);
const viewerEditHref = (p) => 'viewer.html?edit=1#' + encodeURIComponent(p);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
function cwdFromHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) return '';
  try { return h.split('/').map(decodeURIComponent).join('/'); } catch { return ''; }
}
let announceT;
function announce(msg) {
  statusEl.textContent = '';
  clearTimeout(announceT);
  announceT = setTimeout(() => { statusEl.textContent = msg; }, 60);
}

const state = {
  cwd: cwdFromHash(),
  view: store.get('naspdf-view') === 'list' ? 'list' : 'grid',
  query: '',
  listing: { folders: [], files: [] },
  byPath: new Map(),
  folders: [],
  selected: new Set(),
};

/* ==========================================================================
   Barra lateral: cajón en móvil, columna plegable en escritorio
   ========================================================================== */
const drawerOpen = () => !mq.matches && sidebar.classList.contains('open');
function setSidebar(open, focus = true) {
  if (mq.matches) {
    app.classList.toggle('sb-collapsed', !open);
    store.set('naspdf-sb', open ? '1' : '0');
  } else {
    sidebar.classList.toggle('open', open);
    scrim.classList.toggle('show', open);
    main.inert = open;
  }
  navBtn.setAttribute('aria-expanded', String(open));
  navBtn.setAttribute('aria-label', open ? 'Ocultar carpetas' : 'Mostrar carpetas');
  if (!mq.matches && focus) (open ? $('#sb-close') : navBtn).focus();
}
function syncSidebar() {
  sidebar.classList.remove('open');
  scrim.classList.remove('show');
  main.inert = false;
  const open = mq.matches && store.get('naspdf-sb') !== '0';
  app.classList.toggle('sb-collapsed', mq.matches && !open);
  navBtn.setAttribute('aria-expanded', String(open));
  navBtn.setAttribute('aria-label', open ? 'Ocultar carpetas' : 'Mostrar carpetas');
}
navBtn.addEventListener('click', () => {
  setSidebar(mq.matches ? app.classList.contains('sb-collapsed') : !sidebar.classList.contains('open'));
});
$('#sb-close').addEventListener('click', () => setSidebar(false));
scrim.addEventListener('click', () => setSidebar(false));
mq.addEventListener('change', syncSidebar);

function renderTree() {
  const had = treeEl.contains(document.activeElement) ? document.activeElement.dataset.nav : null;
  treeEl.replaceChildren();
  const add = (name, path, depth, icon) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'tree-link';
    a.href = hrefFor(path);
    a.dataset.nav = path;
    a.style.setProperty('--depth', depth);
    if (!state.query && path === state.cwd) a.setAttribute('aria-current', 'page');
    a.innerHTML = icon + '<span></span>';
    a.lastChild.textContent = name;
    if (path) a.title = path;
    li.append(a);
    treeEl.append(li);
  };
  add('Biblioteca', '', 0, IC.library);
  for (const p of state.folders) add(p.split('/').pop(), p, p.split('/').length, IC.folder);
  if (had !== null) { const a = $$('a', treeEl).find((x) => x.dataset.nav === had); if (a) a.focus({ preventScroll: true }); }
}
async function refreshFolders() {
  try {
    const r = await api('/api/folders');
    state.folders = (r.folders || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
    renderTree();
  } catch { /* la barra lateral sigue mostrando lo último conocido */ }
}

/* ==========================================================================
   Navegación (hash → botón «atrás» del navegador funciona)
   ========================================================================== */
function navigate(path) {
  const fromDrawer = drawerOpen();
  if (state.query) clearSearch(true);
  state.selected.clear();
  const target = hrefFor(path);
  if (location.hash === target || (!location.hash && path === '')) { state.cwd = path; load(); }
  else location.hash = target;
  if (fromDrawer) { setSidebar(false, false); main.focus({ preventScroll: true }); }
}
window.addEventListener('hashchange', () => {
  state.cwd = cwdFromHash();
  if (state.query) clearSearch(true);
  state.selected.clear();
  load();
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  navigate(a.dataset.nav);
});

/* ---------- búsqueda ---------- */
let searchT;
function applySearch() {
  const q = searchInput.value.trim();
  if (q === state.query) return;
  state.query = q;
  state.selected.clear();
  load();
}
function clearSearch(noLoad) {
  state.query = '';
  searchInput.value = '';
  if (!noLoad) load();
}
searchForm.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(searchT); applySearch(); });
searchInput.addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(applySearch, 250); });
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchInput.value) { e.preventDefault(); clearSearch(); }
});

/* ==========================================================================
   Carga y render
   ========================================================================== */
let loadSeq = 0;
async function load({ silent = false } = {}) {
  const seq = ++loadSeq;
  if (!silent) showLoading();
  try {
    let data;
    if (state.query) {
      const r = await api('/api/search?q=' + encodeURIComponent(state.query));
      data = { folders: [], files: r.files };
    } else {
      data = await api('/api/files?path=' + encodeURIComponent(state.cwd));
    }
    if (seq !== loadSeq) return;
    state.listing = data;
    state.byPath = new Map([...data.folders, ...data.files].map((x) => [x.path, x]));
    for (const p of [...state.selected]) if (!state.byPath.has(p)) state.selected.delete(p);
    render(silent);
  } catch (e) {
    if (seq !== loadSeq) return;
    showError(e.message);
  }
  refreshFolders();
}

function skeletonItem() {
  const li = document.createElement('li');
  li.className = 'item skeleton';
  li.setAttribute('aria-hidden', 'true');
  li.innerHTML = '<div class="item-card"><div class="item-preview sk"></div><div class="item-foot"><div class="item-text"><span class="sk sk-line"></span><span class="sk sk-line short"></span></div></div></div>';
  return li;
}
function showLoading() {
  stateEl.replaceChildren();
  itemsEl.hidden = false;
  itemsEl.setAttribute('aria-busy', 'true');
  itemsEl.replaceChildren(...Array.from({ length: 8 }, skeletonItem));
  selbar.hidden = true;
}

function stateBlock(icon, title, text, buttons) {
  const d = document.createElement('div');
  d.className = 'state';
  d.innerHTML = icon + '<h2></h2><p></p>';
  d.querySelector('h2').textContent = title;
  d.querySelector('p').textContent = text;
  (buttons || []).forEach((b) => d.append(b));
  return d;
}
function actionBtn(label, icon, fn, primary = true) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn' + (primary ? ' btn-primary' : '');
  b.innerHTML = (icon || '') + '<span></span>';
  b.lastChild.textContent = label;
  b.addEventListener('click', fn);
  return b;
}
function showError(msg) {
  itemsEl.hidden = true;
  itemsEl.setAttribute('aria-busy', 'false');
  itemsEl.replaceChildren();
  selbar.hidden = true;
  stateEl.replaceChildren(stateBlock(IC.alert, 'No se pudo cargar', msg, [actionBtn('Reintentar', '', () => load())]));
  announce('Error: ' + msg);
}
function showEmpty() {
  itemsEl.hidden = true;
  selbar.hidden = true;
  let block;
  if (state.query) {
    block = stateBlock(IC.search, 'Sin resultados', 'Ningún documento coincide con «' + state.query + '».',
      [actionBtn('Borrar búsqueda', '', () => clearSearch(), false)]);
  } else if (!state.cwd) {
    block = stateBlock(IC.upload, 'Tu biblioteca está vacía', 'Sube tu primer PDF con el botón o arrastrándolo a esta ventana.',
      [actionBtn('Subir PDF', IC.upload, () => openUpload())]);
  } else {
    block = stateBlock(IC.folder, 'Esta carpeta está vacía', 'Sube PDF aquí o arrástralos a esta ventana.',
      [actionBtn('Subir PDF', IC.upload, () => openUpload())]);
  }
  stateEl.replaceChildren(block);
}

function renderCrumbs() {
  const ol = crumbsEl.querySelector('ol');
  ol.replaceChildren();
  crumbsEl.hidden = !!state.query;
  resultsTitle.hidden = !state.query;
  if (state.query) { resultsTitle.textContent = 'Resultados para «' + state.query + '»'; return; }
  const parts = state.cwd ? state.cwd.split('/') : [];
  const crumbs = [{ name: 'Biblioteca', path: '' }];
  parts.forEach((p, i) => crumbs.push({ name: p, path: parts.slice(0, i + 1).join('/') }));
  crumbs.forEach((c, i) => {
    const li = document.createElement('li');
    if (i) li.insertAdjacentHTML('beforeend', '<span class="crumb-sep" aria-hidden="true">' + IC.chev + '</span>');
    const last = i === crumbs.length - 1;
    const el = document.createElement(last ? 'span' : 'a');
    el.className = 'crumb';
    el.textContent = c.name;
    if (last) el.setAttribute('aria-current', 'page');
    else { el.href = hrefFor(c.path); el.dataset.nav = c.path; }
    li.append(el);
    ol.append(li);
  });
}

function render(silent) {
  /* conserva el foco si la lista se redibuja por un evento en tiempo real */
  const act = document.activeElement;
  let restore = null;
  if (itemsEl.contains(act) && act.closest('.item')) {
    restore = { path: act.closest('.item').dataset.path, cls: ['item-link', 'item-menu', 'sel-input'].find((c) => act.classList.contains(c)) };
  }
  renderCrumbs();
  const title = state.query ? 'Resultados de búsqueda' : (state.cwd ? state.cwd.split('/').pop() : 'Biblioteca');
  $('#page-title').textContent = title;
  document.title = 'NAS PDF · ' + title;
  renderTree();

  const { folders, files } = state.listing;
  itemsEl.replaceChildren();
  stateEl.replaceChildren();
  itemsEl.setAttribute('aria-busy', 'false');
  if (!folders.length && !files.length) {
    showEmpty();
    if (!silent) announce(state.query ? 'Sin resultados' : 'Carpeta vacía');
    return;
  }
  itemsEl.hidden = false;
  const frag = document.createDocumentFragment();
  folders.forEach((f) => frag.append(buildFolder(f)));
  files.forEach((f) => frag.append(buildFile(f)));
  itemsEl.append(frag);
  updateSelection(false);
  if (restore && restore.cls) {
    const li = itemsEl.querySelector('.item[data-path="' + CSS.escape(restore.path) + '"]');
    const t = li && li.querySelector('.' + restore.cls);
    if (t) t.focus({ preventScroll: true });
  }
  if (!silent) {
    announce(state.query
      ? plural(files.length, 'resultado', 'resultados')
      : title + ': ' + plural(folders.length, 'carpeta', 'carpetas') + ' y ' + plural(files.length, 'documento', 'documentos'));
  }
}

/* ---------- construcción de elementos ---------- */
let uid = 0;
function buildFolder(f) {
  const id = ++uid;
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.kind = 'folder';
  li.dataset.path = f.path;
  li.innerHTML =
    '<div class="item-card" data-ft="folder">' +
      '<div class="item-preview" aria-hidden="true">' + IC.folder + '</div>' +
      '<div class="item-foot"><span class="item-ic" aria-hidden="true">' + IC.folder + '</span>' +
      '<div class="item-text"><a class="item-link"><span></span></a>' +
      '<span class="item-meta" id="m' + id + '"><span class="m-size">Carpeta</span></span></div>' +
      '<button type="button" class="icon-btn item-menu" aria-haspopup="menu" aria-expanded="false">' + IC.dots + '</button></div>' +
    '</div>';
  const a = li.querySelector('.item-link');
  a.href = hrefFor(f.path);
  a.dataset.nav = f.path;
  a.setAttribute('aria-describedby', 'm' + id);
  a.firstChild.textContent = f.name;
  li.querySelector('.item-menu').setAttribute('aria-label', 'Más opciones de la carpeta «' + f.name + '»');
  return li;
}

function buildFile(f) {
  const id = ++uid;
  const kind = fileKind(f.name);
  const ext = fileExt(f.name).toUpperCase();
  const route = parentOf(f.path);
  const hl = f.highlights || 0;
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.kind = 'file';
  li.dataset.path = f.path;
  li.innerHTML =
    '<div class="item-card" data-ft="' + kind + '">' +
      '<div class="item-preview" aria-hidden="true">' + fileIcon(kind) + (ext ? '<span class="ft-tag">' + ext + '</span>' : '') + '</div>' +
      '<label class="sel"><input type="checkbox" class="sel-input"><span class="sel-box" aria-hidden="true">' + IC.check + '</span></label>' +
      '<div class="item-foot"><span class="item-ic" aria-hidden="true">' + fileIcon(kind) + '</span>' +
      '<div class="item-text"><a class="item-link"><span></span></a>' +
      '<span class="item-meta" id="m' + id + '">' +
        '<span class="m-size">' + fmtSize(f.size) + '</span>' +
        '<span class="m-date"><time datetime="' + new Date(f.mtime).toISOString() + '">' + fmtDate(f.mtime) + '</time></span>' +
        (hl ? '<span class="badge-hl">' + IC.pen + '<span aria-hidden="true">' + hl + '</span><span class="sr-only">' + plural(hl, 'subrayado', 'subrayados') + '</span></span>' : '') +
        (state.query && route ? '<span class="item-route">' + IC.folder + '<span></span></span>' : '') +
      '</span></div>' +
      '<button type="button" class="icon-btn item-menu" aria-haspopup="menu" aria-expanded="false">' + IC.dots + '</button></div>' +
    '</div>';
  const a = li.querySelector('.item-link');
  a.href = viewerHref(f.path);
  a.setAttribute('aria-describedby', 'm' + id);
  a.firstChild.textContent = f.name;
  const r = li.querySelector('.item-route span');
  if (r) r.textContent = route;
  li.querySelector('.sel-input').setAttribute('aria-label', 'Seleccionar «' + f.name + '»');
  li.querySelector('.item-menu').setAttribute('aria-label', 'Más opciones de «' + f.name + '»');
  return li;
}

/* ==========================================================================
   Selección múltiple (solo documentos)
   ========================================================================== */
itemsEl.addEventListener('change', (e) => {
  const cb = e.target.closest('.sel-input');
  if (!cb) return;
  const path = cb.closest('.item').dataset.path;
  if (cb.checked) state.selected.add(path); else state.selected.delete(path);
  updateSelection();
});
function selectedFiles() { return state.listing.files.filter((f) => state.selected.has(f.path)); }
function updateSelection(say = true) {
  const n = state.selected.size;
  $$('.item[data-kind="file"]', itemsEl).forEach((li) => {
    const on = state.selected.has(li.dataset.path);
    li.querySelector('.item-card').classList.toggle('is-selected', on);
    li.querySelector('.sel-input').checked = on;
  });
  itemsEl.classList.toggle('has-selection', n > 0);
  selbar.hidden = n === 0;
  selCount.textContent = plural(n, 'seleccionado', 'seleccionados');
  $('#sel-all').textContent = n && n === state.listing.files.length ? 'Quitar selección' : 'Seleccionar todo';
  if (say) announce(n ? selCount.textContent : 'Selección cancelada');
}
$('#sel-all').addEventListener('click', () => {
  const all = state.listing.files.length;
  if (state.selected.size === all) state.selected.clear();
  else state.listing.files.forEach((f) => state.selected.add(f.path));
  updateSelection();
});
$('#sel-clear').addEventListener('click', () => { state.selected.clear(); updateSelection(); main.focus({ preventScroll: true }); });
$('#sel-move').addEventListener('click', (e) => openMove(selectedFiles(), e.currentTarget));
$('#sel-del').addEventListener('click', (e) => deleteFiles(selectedFiles(), e.currentTarget));

/* ==========================================================================
   Menú «⋯» (patrón ARIA menu: flechas, Inicio/Fin, Esc, foco devuelto)
   ========================================================================== */
let menuAnchor = null;
function openMenu(anchor, label, entries) {
  closeMenu(false);
  menuEl.replaceChildren();
  menuEl.setAttribute('aria-label', label);
  entries.forEach((en) => {
    if (en === '-') { const hr = document.createElement('hr'); hr.setAttribute('role', 'separator'); menuEl.append(hr); return; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    if (en.danger) b.className = 'danger';
    if (en.disabled) b.setAttribute('aria-disabled', 'true');
    b.innerHTML = en.icon + '<span></span>';
    b.lastChild.textContent = en.label;
    b.addEventListener('click', () => {
      if (en.disabled) { toast(en.disabledMsg || 'No disponible', false); return; }
      const a = menuAnchor;
      closeMenu(false);
      en.fn(a);
    });
    menuEl.append(b);
  });
  menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const sheet = !mq.matches;
  menuEl.classList.toggle('sheet', sheet);
  menuScrim.classList.toggle('show', sheet);
  menuEl.style.left = menuEl.style.top = '';
  menuEl.hidden = false;
  if (!sheet) {
    const r = anchor.getBoundingClientRect(), w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const top = (r.bottom + 6 + h > window.innerHeight) ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
  }
  menuEl.querySelector('[role="menuitem"]').focus();
}
function closeMenu(restore = true) {
  if (menuEl.hidden && !menuAnchor) return;
  menuEl.hidden = true;
  menuScrim.classList.remove('show');
  if (menuAnchor) {
    menuAnchor.setAttribute('aria-expanded', 'false');
    if (restore && menuAnchor.isConnected) menuAnchor.focus();
  }
  menuAnchor = null;
}
menuEl.addEventListener('keydown', (e) => {
  const its = $$('[role="menuitem"]', menuEl);
  const i = its.indexOf(document.activeElement);
  const go = (n) => { e.preventDefault(); its[(n + its.length) % its.length].focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(its.length - 1);
  else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  else if (e.key === 'Tab') { e.preventDefault(); closeMenu(); }
});
document.addEventListener('pointerdown', (e) => {
  if (!menuEl.hidden && !menuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu(false);
});
window.addEventListener('resize', () => closeMenu(false));
main.addEventListener('scroll', () => { if (!menuEl.hidden && !menuEl.classList.contains('sheet')) closeMenu(false); }, { passive: true });

itemsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.item-menu');
  if (!btn) return;
  if (menuAnchor === btn) { closeMenu(); return; }
  const li = btn.closest('.item');
  const item = state.byPath.get(li.dataset.path);
  if (!item) return;
  if (li.dataset.kind === 'folder') {
    openMenu(btn, 'Opciones de la carpeta ' + item.name, [
      { icon: IC.folder, label: 'Abrir', fn: () => navigate(item.path) },
      '-',
      { icon: IC.trash, label: 'Eliminar carpeta (vacía)', danger: true, fn: (a) => deleteFolder(item, a) },
    ]);
  } else {
    openMenu(btn, 'Opciones de ' + item.name, [
      { icon: IC.pen, label: 'Editar subrayados', fn: () => { location.href = viewerEditHref(item.path); } },
      { icon: IC.download, label: 'Descargar original', fn: () => downloadFile(item) },
      { icon: IC.move, label: 'Mover…', fn: (a) => openMove([item], a) },
      { icon: IC.edit, label: 'Renombrar', fn: (a) => renameFile(item, a) },
      { icon: IC.eraser, label: item.highlights ? 'Borrar subrayados (' + item.highlights + ')' : 'Borrar subrayados',
        disabled: !item.highlights, disabledMsg: 'Este documento no tiene subrayados', fn: (a) => clearHighlights(item, a) },
      '-',
      { icon: IC.trash, label: 'Eliminar documento', danger: true, fn: (a) => deleteFiles([item], a) },
    ]);
  }
});

/* ==========================================================================
   Diálogos nativos <dialog> (foco atrapado, Esc y foco devuelto)
   ========================================================================== */
function openDialog(dlg, trigger) {
  dlg._trigger = trigger instanceof HTMLElement ? trigger : null;
  dlg.returnValue = '';
  dlg.showModal();
}
$$('dialog').forEach((d) => {
  d.addEventListener('close', () => {
    const t = d._trigger;
    d._trigger = null;
    requestAnimationFrame(() => {
      if (t && t.isConnected) t.focus();
      else if (!document.querySelector('dialog[open]')) main.focus({ preventScroll: true });
    });
  });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close('cancel');
  });
});

const dnInput = $('#dn-input'), dnError = $('#dn-error'), dnOk = $('#dn-ok');
let nameValidate = null;
$('#dn-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = nameValidate ? nameValidate(dnInput.value.trim()) : '';
  if (err) {
    dnError.textContent = err;
    dnInput.setAttribute('aria-invalid', 'true');
    dnInput.focus();
    return;
  }
  dlgName.close('ok');
});
dnInput.addEventListener('input', () => { dnError.textContent = ''; dnInput.removeAttribute('aria-invalid'); });
function validateName(v) {
  if (!v) return 'Escribe un nombre.';
  if (/[\\/]/.test(v)) return 'El nombre no puede contener / ni \\.';
  if (v.startsWith('.')) return 'El nombre no puede empezar por un punto.';
  return '';
}
function askName({ title, label, value = '', confirm, validate = validateName, selectBase = false, trigger }) {
  return new Promise((resolve) => {
    $('#dn-title').textContent = title;
    $('#dn-label').textContent = label;
    dnOk.textContent = confirm;
    dnInput.value = value;
    dnError.textContent = '';
    dnInput.removeAttribute('aria-invalid');
    nameValidate = validate;
    const done = () => {
      dlgName.removeEventListener('close', done);
      resolve(dlgName.returnValue === 'ok' ? dnInput.value.trim() : null);
    };
    dlgName.addEventListener('close', done);
    openDialog(dlgName, trigger);
    dnInput.focus();
    if (selectBase && /\.pdf$/i.test(value)) dnInput.setSelectionRange(0, value.length - 4); else dnInput.select();
  });
}
function confirmBox({ title, message, confirm, danger = false, trigger }) {
  return new Promise((resolve) => {
    $('#cf-title').textContent = title;
    $('#cf-msg').textContent = message;
    const ok = $('#cf-ok');
    ok.textContent = confirm;
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    const done = () => {
      dlgConfirm.removeEventListener('close', done);
      resolve(dlgConfirm.returnValue === 'ok');
    };
    dlgConfirm.addEventListener('close', done);
    openDialog(dlgConfirm, trigger);
    (danger ? $('#cf-cancel') : ok).focus();   // en acciones destructivas el foco empieza en «Cancelar»
  });
}

/* ==========================================================================
   Acciones sobre carpetas y documentos
   ========================================================================== */
const apiPath = (p) => '/api/files/' + encodeURIComponent(p);
const afterChange = () => load({ silent: true });

async function createFolder(trigger) {
  const name = await askName({ title: 'Nueva carpeta', label: 'Nombre de la carpeta', confirm: 'Crear', trigger });
  if (name === null) return;
  const path = state.cwd ? state.cwd + '/' + name : name;
  try {
    await api('/api/folders?path=' + encodeURIComponent(path), { method: 'POST' });
    toast('Carpeta «' + name + '» creada');
    afterChange();
  } catch (e) { toast(e.message, true); }
}
async function deleteFolder(f, trigger) {
  const ok = await confirmBox({ title: 'Eliminar carpeta', message: '¿Eliminar la carpeta «' + f.name + '»? Debe estar vacía.', confirm: 'Eliminar', danger: true, trigger });
  if (!ok) return;
  try {
    await api('/api/folders/' + encodeURIComponent(f.path), { method: 'DELETE' });
    toast('Carpeta eliminada');
    afterChange();
  } catch (e) { toast(e.message, true); }
}
function downloadFile(f) {
  const a = document.createElement('a');
  a.href = '/files/' + encodeURIComponent(f.path);
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function renameFile(f, trigger) {
  const name = await askName({
    title: 'Renombrar documento', label: 'Nombre del PDF', value: f.name, confirm: 'Renombrar', selectBase: true, trigger,
    validate: (v) => validateName(v),
  });
  if (name === null || name === f.name) return;
  const finalName = /\.pdf$/i.test(name) ? name : name + '.pdf';
  const dir = parentOf(f.path);
  try {
    await api('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: f.path, to: dir ? dir + '/' + finalName : finalName }) });
    toast('Documento renombrado');
    afterChange();
  } catch (e) { toast(e.status === 409 ? 'Ya existe un documento con ese nombre' : e.message, true); }
}
async function clearHighlights(f, trigger) {
  const ok = await confirmBox({ title: 'Borrar subrayados', message: '¿Borrar los ' + f.highlights + ' subrayados de «' + f.name + '»? El PDF original no se modifica.', confirm: 'Borrar subrayados', danger: true, trigger });
  if (!ok) return;
  try {
    await api('/api/annotations/' + encodeURIComponent(f.path), { method: 'DELETE' });
    toast('Subrayados borrados');
    afterChange();
  } catch (e) { toast(e.message, true); }
}
async function deleteFiles(files, trigger) {
  if (!files.length) return;
  const one = files.length === 1;
  const ok = await confirmBox({
    title: one ? 'Eliminar documento' : 'Eliminar ' + files.length + ' documentos',
    message: one ? '¿Eliminar «' + files[0].name + '» y sus subrayados? Esta acción no se puede deshacer.'
                 : '¿Eliminar los ' + files.length + ' documentos seleccionados y sus subrayados? Esta acción no se puede deshacer.',
    confirm: 'Eliminar', danger: true, trigger,
  });
  if (!ok) return;
  let done = 0, fail = 0, last = '';
  for (const f of files) {
    try { await api(apiPath(f.path), { method: 'DELETE' }); done++; state.selected.delete(f.path); }
    catch (e) { fail++; last = e.message; }
  }
  if (fail) toast(done + ' eliminados, ' + fail + ' con error' + (last ? ': ' + last : ''), true);
  else toast(one ? 'Documento eliminado' : done + ' documentos eliminados');
  afterChange();
}

/* ---------- mover a… ---------- */
const mvList = $('#mv-list'), mvOk = $('#mv-ok');
let mvTargets = [];
async function openMove(files, trigger) {
  if (!files.length) return;
  mvTargets = files;
  $('#mv-desc').textContent = files.length === 1 ? '«' + files[0].name + '»' : files.length + ' documentos';
  mvList.innerHTML = '<p class="muted">Cargando carpetas…</p>';
  mvOk.disabled = true;
  openDialog(dlgMove, trigger);
  try {
    const r = await api('/api/folders');
    const folders = (r.folders || []).slice().sort((a, b) => a.localeCompare(b, 'es'));
    const current = parentOf(files[0].path);
    mvList.replaceChildren();
    const mk = (label, path, depth, icon) => {
      const l = document.createElement('label');
      l.className = 'move-item';
      l.style.setProperty('--depth', depth);
      l.innerHTML = '<input type="radio" name="dest">' + icon + '<span></span><span class="chk" aria-hidden="true">' + IC.check + '</span>';
      const input = l.querySelector('input');
      input.value = path;
      input.checked = path === current;
      l.children[2].textContent = label;
      mvList.append(l);
    };
    mk('Biblioteca (raíz)', '', 0, IC.library);
    folders.forEach((p) => mk(p.split('/').pop(), p, p.split('/').length, IC.folder));
    if (!mvList.querySelector('input:checked')) mvList.querySelector('input').checked = true;
    mvOk.disabled = false;
    (mvList.querySelector('input:checked') || mvList.querySelector('input')).focus();
  } catch (e) {
    mvList.innerHTML = '<p class="field-error"></p>';
    mvList.firstChild.textContent = e.message;
  }
}
$('#mv-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sel = mvList.querySelector('input:checked');
  if (!sel || mvOk.disabled) return;
  const dest = sel.value;
  mvOk.disabled = true;
  let ok = 0, dup = 0, fail = 0, same = 0, last = '';
  for (const f of mvTargets) {
    const to = dest ? dest + '/' + f.name : f.name;
    if (to === f.path) { same++; continue; }
    try {
      await api('/api/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: f.path, to }) });
      ok++; state.selected.delete(f.path);
    } catch (err) { if (err.status === 409) dup++; else { fail++; last = err.message; } }
  }
  dlgMove.close('ok');
  if (ok && !dup && !fail) toast(plural(ok, 'documento movido', 'documentos movidos'));
  else if (!ok && same && !dup && !fail) toast('Ya está en esa carpeta');
  else if (fail) toast(ok + ' movidos, ' + fail + ' con error' + (last ? ': ' + last : ''), true);
  else toast(ok + ' movidos; ' + dup + ' ya existían en el destino', true);
  afterChange();
});

/* ==========================================================================
   Subida de PDF: diálogo + cola con progreso + arrastrar y soltar
   ========================================================================== */
const upList = $('#up-list'), upWrap = $('#up-progress-wrap'), upText = $('#up-progress-text'), upBar = $('#up-progress');
const up = { queue: [], running: false, total: 0, done: 0, ok: 0, dup: 0, fail: 0 };
const UP_LABEL = { wait: ['En cola', 'clock'], run: ['Subiendo…', 'spinner'], ok: ['Subido', 'check'], dup: ['Ya existía', 'info'], err: ['Error', 'alert'] };

function openUpload(trigger) {
  if (!up.running) resetUpload();
  $('#up-dest').textContent = 'Destino: ' + (state.cwd ? '«' + state.cwd + '»' : 'Biblioteca (raíz)');
  if (!dlgUpload.open) openDialog(dlgUpload, trigger || document.activeElement);
}
function resetUpload() {
  upList.replaceChildren();
  upWrap.hidden = true;
  up.total = up.done = up.ok = up.dup = up.fail = 0;
}
function setRow(row, st, msg) {
  const [label, icon] = UP_LABEL[st];
  row.dataset.state = st;
  row.querySelector('.up-status').innerHTML = IC[icon] + '<span></span>';
  row.querySelector('.up-status span').textContent = st === 'err' && msg ? 'Error: ' + msg : label;
}
function buildUpRow(name) {
  const li = document.createElement('li');
  li.className = 'up-item';
  li.innerHTML = '<span class="up-name"></span><span class="up-status"></span>';
  li.querySelector('.up-name').textContent = name;
  li.querySelector('.up-name').title = name;
  setRow(li, 'wait');
  return li;
}
function updateProgress() {
  upWrap.hidden = up.total === 0;
  const pct = up.total ? Math.round((up.done / up.total) * 100) : 0;
  upText.textContent = up.done + ' de ' + plural(up.total, 'archivo', 'archivos');
  upBar.setAttribute('aria-valuenow', String(pct));
  upBar.firstElementChild.style.width = pct + '%';
}
function enqueueUpload(fileList) {
  const files = Array.from(fileList);
  const pdfs = files.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!pdfs.length) { if (files.length) toast('Solo se admiten archivos PDF', true); return; }
  openUpload();
  if (!up.running) resetUpload();
  for (const file of pdfs) {
    const row = buildUpRow(file.name);
    upList.append(row);
    up.queue.push({ file, row, dir: state.cwd });
    up.total++;
  }
  updateProgress();
  runUploads();
}
async function runUploads() {
  if (up.running) return;
  up.running = true;
  while (up.queue.length) {
    const job = up.queue.shift();
    setRow(job.row, 'run');
    job.row.scrollIntoView({ block: 'nearest' });
    const path = job.dir ? job.dir + '/' + job.file.name : job.file.name;
    try {
      await api('/api/files?path=' + encodeURIComponent(path), { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: job.file });
      setRow(job.row, 'ok'); up.ok++;
    } catch (e) {
      if (e.status === 409) { setRow(job.row, 'dup'); up.dup++; }
      else { setRow(job.row, 'err', e.message); up.fail++; }
    }
    up.done++;
    updateProgress();
  }
  up.running = false;
  if (up.ok) toast(plural(up.ok, 'PDF subido', 'PDF subidos') + (up.dup ? ' (' + up.dup + ' ya existían)' : '') + (up.fail ? ' (' + up.fail + ' con error)' : ''), !!up.fail);
  else if (up.dup && !up.fail) toast('Los archivos ya existían', true);
  else if (up.fail) toast('No se pudo subir ningún archivo', true);
  afterChange();
}
$('#upload-btn').addEventListener('click', (e) => openUpload(e.currentTarget));
$('#dz-pick').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { enqueueUpload(fileInput.files); fileInput.value = ''; });

/* arrastrar y soltar: toda la ventana, y feedback propio sobre la zona del diálogo */
const dropzone = $('#dropzone');
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  if (!dlgUpload.open) {
    $('#drop-text').textContent = 'Suelta aquí para subir a ' + (state.cwd ? '«' + state.cwd + '»' : 'la biblioteca');
    dropOverlay.classList.add('on');
  }
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dropzone.classList.toggle('is-over', dlgUpload.open && !!e.target.closest && !!e.target.closest('#dropzone'));
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) { dropOverlay.classList.remove('on'); dropzone.classList.remove('is-over'); }
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('on');
  dropzone.classList.remove('is-over');
  enqueueUpload(e.dataTransfer.files);
});

/* ==========================================================================
   Barra de herramientas: carpeta nueva, vista, tema
   ========================================================================== */
$('#folder-btn').addEventListener('click', (e) => createFolder(e.currentTarget));

function setView(v, animate = true) {
  const apply = () => {
    state.view = v;
    store.set('naspdf-view', v);
    itemsEl.classList.toggle('is-grid', v === 'grid');
    itemsEl.classList.toggle('is-list', v === 'list');
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  };
  if (animate && document.startViewTransition && !reducedMotion()) document.startViewTransition(apply);
  else apply();
}
viewBtns.forEach((b) => b.addEventListener('click', () => { if (b.dataset.view !== state.view) setView(b.dataset.view); }));

function paintTheme() {
  const p = getThemePref();
  themeBtn.innerHTML = { system: IC.monitor, light: IC.sun, dark: IC.moon }[p];
  themeBtn.setAttribute('aria-label', 'Tema: ' + THEME_LABEL[p] + '. Cambiar tema');
  themeBtn.title = 'Tema: ' + THEME_LABEL[p];
}
themeBtn.addEventListener('click', () => { const p = cycleTheme(); paintTheme(); announce('Tema: ' + THEME_LABEL[p]); });

/* ---------- atajos de teclado ---------- */
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    searchInput.focus();
    return;
  }
  if (e.key !== 'Escape' || document.querySelector('dialog[open]') || !menuEl.hidden) return;
  if (drawerOpen()) setSidebar(false);
  else if (state.selected.size) { state.selected.clear(); updateSelection(); }
});

/* ==========================================================================
   Tiempo real (SSE del propio servidor) e inicio
   ========================================================================== */
let evT;
function connectEvents() {
  if (!window.EventSource) return;
  const es = new EventSource('/api/events');
  es.onmessage = () => { clearTimeout(evT); evT = setTimeout(() => load({ silent: true }), 300); };
  es.onerror = () => { /* el navegador reintenta solo */ };
}

setView(state.view, false);
paintTheme();
syncSidebar();
load();
ensureAuth().then(connectEvents);
