/* Mi Drive — utilidades compartidas (sin frameworks, 100 % local)
 * v2: iconos IC (SVG inline escalables + tipos de archivo), tema sistema/claro/oscuro,
 *     toasts accesibles. Todo lo anterior (I, api, fmt*, ensureAuth) se mantiene. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- iconos SVG inline (sin CDN, hermético) ---------- */
const I = {
  logo: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
  dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  eraser: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
  pen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  cursor: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 3 7 17 2.5-6.5L20 11Z"/><path d="M13 13l6 6"/></svg>',
  sun: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  undo: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
  save: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  cloud: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="m9 19 3 3 3-3"/><path d="M12 22v-9"/></svg>',
  back: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
  minus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  play: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
  spinner: '<svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round"/></svg>',
  folder: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  folderPlus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/></svg>',
  grid: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  list: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.4 3.3a2.1 2.1 0 0 1 3 3L7 18.6 3 20l1.4-4Z"/></svg>',
  moveI: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9H3l3-4 3 4H7"/><path d="M19 15h2l-3 4-3-4h2"/><path d="M5 9v7a3 3 0 0 0 3 3h8"/><path d="M19 15V8a3 3 0 0 0-3-3H8"/></svg>',
  wipe: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="M15 12 12 9"/></svg>',
};
document.head.insertAdjacentHTML('beforeend',
  '<style>.spin{animation:spin-rot .8s linear infinite}@keyframes spin-rot{to{transform:rotate(360deg)}}</style>');

/* ---------- iconos nuevos (IC): escalan con CSS, sin tamaño fijo, ocultos a lectores ---------- */
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const svgI = (body, cls = 'i') =>
  '<svg class="' + cls + '" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
const FILE_BASE = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';
const FOLDER_PATH = '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
const IC = {
  menu: svgI('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  logo: svgI(FILE_BASE + '<path d="M9 14h6M9 18h4"/>'),
  library: svgI('<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>'),
  folder: svgI(FOLDER_PATH),
  folderPlus: svgI(FOLDER_PATH + '<path d="M12 10v6M9 13h6"/>'),
  upload: svgI('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'),
  download: svgI('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  search: svgI('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  grid: svgI('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  list: svgI('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  sun: svgI('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svgI('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  monitor: svgI('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  dots: '<svg class="i" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  pen: svgI('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>'),
  edit: svgI('<path d="M12 20h9"/><path d="M16.4 3.3a2.1 2.1 0 0 1 3 3L7 18.6 3 20l1.4-4Z"/>'),
  move: svgI('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  eraser: svgI('<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'),
  trash: svgI('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  chev: svgI('<path d="m9 18 6-6-6-6"/>'),
  x: svgI('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  check: svgI('<path d="M20 6 9 17l-5-5"/>', 'i i-check'),
  alert: svgI('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  info: svgI('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  clock: svgI('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  spinner: svgI('<circle cx="12" cy="12" r="9" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/>', 'i spin'),
  /* tipos de archivo */
  file: svgI(FILE_BASE),
  file_pdf: svgI(FILE_BASE + '<path d="M8 13h8M8 17h5"/>'),
  file_image: svgI(FILE_BASE + '<circle cx="10" cy="13" r="1.5"/><path d="m18 19-2.6-2.6a1.5 1.5 0 0 0-2.1 0L8 21"/>'),
  file_doc: svgI(FILE_BASE + '<path d="M8 9h2M8 13h8M8 17h8"/>'),
  file_sheet: svgI(FILE_BASE + '<path d="M8 13h8M8 17h8M12 13v8"/>'),
  file_text: svgI(FILE_BASE + '<path d="M8 13h8M8 17h6"/>'),
  file_archive: svgI('<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>'),
};
/* los iconos antiguos (I) también quedan ocultos a lectores de pantalla */
for (const k in I) I[k] = I[k].replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

const FILE_KINDS = {
  pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', xls: 'sheet', xlsx: 'sheet', ods: 'sheet', csv: 'sheet',
  txt: 'text', md: 'text', zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
};
function fileExt(name) { const m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }
function fileKind(name) { return FILE_KINDS[fileExt(name)] || 'file'; }
function fileIcon(kind) { return kind === 'file' ? IC.file : (IC['file_' + kind] || IC.file); }

/* ---------- tema: sistema | claro | oscuro (se guarda la preferencia) ---------- */
const THEME_KEY = 'naspdf-theme';
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };
const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function getThemePref() {
  let v = null;
  try { v = localStorage.getItem(THEME_KEY); } catch {}
  return THEME_ORDER.includes(v) ? v : 'system';
}
function initTheme() {
  const pref = getThemePref();
  const dark = pref === 'dark' || (pref === 'system' && (!darkMQ || darkMQ.matches));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePref = pref;
  return dark;
}
function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch {}
  return initTheme();
}
function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(getThemePref()) + 1) % THEME_ORDER.length];
  setThemePref(next);
  return next;
}
/* compatibilidad con el código anterior */
function toggleTheme(isDark) { setThemePref(isDark ? 'light' : 'dark'); return !isDark; }
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', () => { if (getThemePref() === 'system') initTheme(); });
initTheme();

/* ---------- toasts accesibles ---------- */
let toastTimer = null, liveTimer = null;
function liveRegion(id, role) {
  let r = document.getElementById(id);
  if (!r) {
    r = document.createElement('div');
    r.id = id;
    r.setAttribute('role', role);
    r.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
    document.body.appendChild(r);
  }
  return r;
}
function toast(msg, isError = false) {
  /* texto para lectores de pantalla (regiones vivas persistentes) */
  const live = liveRegion(isError ? 'toast-alert' : 'toast-live', isError ? 'alert' : 'status');
  live.textContent = '';
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { live.textContent = msg; }, 60);

  /* aviso visual (aria-hidden para no duplicar el anuncio) */
  const old = $('.toast');
  if (old) { try { old.hidePopover && old.hidePopover(); } catch {} old.remove(); }
  const t = document.createElement('div');
  t.className = 'toast ' + (isError ? 'err' : 'ok');
  t.setAttribute('aria-hidden', 'true');
  t.innerHTML = '<span class="dot"></span>';
  t.appendChild(document.createTextNode(msg));
  document.body.appendChild(t);
  /* capa superior (por encima de los <dialog>) solo si la página lo pide */
  if (document.documentElement.hasAttribute('data-toast-popover') && t.showPopover) {
    try { t.setAttribute('popover', 'manual'); t.showPopover(); } catch {}
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { try { t.hidePopover && t.hidePopover(); } catch {} t.remove(); }, isError ? 7000 : 4500);
}

/* ---------- formato ---------- */
function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------- API + token de escritura opcional ---------- */
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

async function api(pathname, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  if (WRITE_METHODS.has(method)) {
    const token = localStorage.getItem('naspdf-token');
    if (token) {
      opts.headers = { ...(opts.headers || {}), 'x-naspdf-token': token };
    }
  }
  let res;
  try {
    res = await fetch(pathname, opts);
  } catch {
    throw new Error('Sin conexión con el servidor');
  }
  if (res.status === 401) {
    // token ausente o incorrecto: preguntar una vez y reintentar
    const asked = prompt('Esta Mi Drive pide TOKEN DE ESCRITURA (variable NASPDF_TOKEN del servidor):');
    if (asked !== null) {
      localStorage.setItem('naspdf-token', asked.trim());
      return api(pathname, opts);
    }
  }
  if (!res.ok) {
    let msg = 'Error ' + res.status;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/* comprueba si el servidor exige token y lo pide antes de la primera escritura */
async function ensureAuth() {
  try {
    const cfg = await api('/api/config');
    if (cfg.auth && !localStorage.getItem('naspdf-token')) {
      const asked = prompt('Esta Mi Drive pide TOKEN DE ESCRITURA (variable NASPDF_TOKEN del servidor):');
      if (asked !== null) localStorage.setItem('naspdf-token', asked.trim());
    }
  } catch {}
}
