/* Mi Drive — Visor · capa de interfaz (cajón de miniaturas + accesibilidad)
 *
 * NO modifica viewer.js. Solo:
 *   1) gestiona el cajón de miniaturas en móvil (botón, fondo, Esc, foco, inert);
 *   2) refleja en ARIA lo que viewer.js hace con clases (.on, .active) y al reconstruir
 *      #colors y #thumbs (MutationObserver);
 *   3) apunta el botón «volver» a la carpeta del documento (index.html#/Carpeta).
 * Requiere common.js ($, $$, IC). Cargar DESPUÉS de viewer.js. 100 % local. */
'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const mq = window.matchMedia('(min-width: 48em)');
  const drawer = byId('thumbs-drawer'), thumbs = byId('thumbs'), scrim = byId('scrim');
  const toggleBtn = byId('thumbs-btn'), closeBtn = byId('thumbs-close');
  const main = $('.viewer-main'), toolbar = byId('toolbar'), pages = byId('pages-scroll');

  $$('[data-ic]').forEach((n) => { n.innerHTML = IC[n.dataset.ic] || ''; });

  /* ---------- 1 · cajón de miniaturas ---------- */
  const isOpen = () => !mq.matches && drawer.classList.contains('open');
  function setDrawer(open, focus = true) {
    if (mq.matches) open = false;                 // en escritorio las miniaturas son fijas
    drawer.classList.toggle('open', open);
    scrim.classList.toggle('show', open);
    main.inert = open;                            // mientras está abierto, el foco no se escapa al documento
    toolbar.inert = open;
    toggleBtn.setAttribute('aria-expanded', String(open));
    toggleBtn.setAttribute('aria-label', open ? 'Ocultar miniaturas' : 'Mostrar miniaturas');
    if (!focus) return;
    if (open) (thumbs.querySelector('.thumb.active') || thumbs.querySelector('.thumb') || closeBtn).focus();
    else toggleBtn.focus();
  }
  toggleBtn.addEventListener('click', () => setDrawer(!isOpen()));
  closeBtn.addEventListener('click', () => setDrawer(false));
  scrim.addEventListener('click', () => setDrawer(false));
  mq.addEventListener('change', () => setDrawer(false, false));

  /* Esc en fase de captura: cierra el cajón SIN que viewer.js lo interprete como «volver al cursor» */
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    setDrawer(false);
  }, true);

  /* al elegir una miniatura (viewer.js ya hizo scroll) se cierra el cajón y el foco pasa al documento */
  thumbs.addEventListener('click', (e) => {
    if (!e.target.closest('.thumb') || mq.matches) return;
    setDrawer(false, false);
    pages.focus({ preventScroll: true });
  });

  /* ---------- 2a · miniaturas accesibles ---------- */
  function syncCurrent() {
    thumbs.querySelectorAll('.thumb').forEach((t) => {
      if (t.classList.contains('active')) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
  }
  function enhanceThumbs() {
    thumbs.querySelectorAll('.thumb').forEach((t) => {
      if (t.dataset.a11y) return;
      t.dataset.a11y = '1';
      t.setAttribute('role', 'button');
      t.tabIndex = 0;
      t.setAttribute('aria-label', 'Ir a la página ' + t.dataset.page);
      t.querySelectorAll('.t-canvas, p').forEach((n) => n.setAttribute('aria-hidden', 'true'));
    });
    syncCurrent();
  }
  thumbs.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('.thumb');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); }
  });
  new MutationObserver(enhanceThumbs).observe(thumbs, { childList: true });
  new MutationObserver(syncCurrent).observe(thumbs, { attributes: true, attributeFilter: ['class'], subtree: true });
  enhanceThumbs();

  /* ---------- 2b · aria-pressed ← clase .on (cursor, subrayador, borrado, pomodoro) ---------- */
  const toggles = ['btn-cursor', 'btn-hl', 'btn-del-mode', 'btn-pomo'].map(byId).filter(Boolean);
  const syncPressed = () => toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.classList.contains('on'))));
  const pressedObserver = new MutationObserver(syncPressed);
  toggles.forEach((b) => pressedObserver.observe(b, { attributes: true, attributeFilter: ['class'] }));
  syncPressed();

  /* ---------- 2c · colores con nombre (viewer.js reconstruye #colors en cada cambio) ---------- */
  const COLOR_NAMES = { '#facc15': 'amarillo', '#3b82f6': 'azul', '#22c55e': 'verde', '#ef4444': 'rojo' };
  const colorsBox = byId('colors');
  function enhanceColors() {
    for (const d of colorsBox.children) {
      const on = d.classList.contains('on');
      if (d.tagName === 'BUTTON') {
        const hex = (d.dataset.hex || d.title || '').toLowerCase();
        d.dataset.hex = hex;                                     // viewer.js pone el hex en title: lo guardamos y lo sustituimos
        const name = COLOR_NAMES[hex] || hex;
        d.type = 'button';
        d.setAttribute('aria-label', 'Color ' + name);
        d.setAttribute('aria-pressed', String(on));
        d.title = name.charAt(0).toUpperCase() + name.slice(1);
      } else {                                                    // <input type="color"> (no admite aria-pressed)
        d.setAttribute('aria-label', 'Color personalizado' + (on ? ' (activo)' : ''));
      }
    }
  }
  new MutationObserver(enhanceColors).observe(colorsBox, { childList: true });
  enhanceColors();

  /* ---------- 2d · opacidad: valor legible ---------- */
  const opacity = byId('opacity');
  const setOpacityText = () => opacity.setAttribute('aria-valuetext', opacity.value + ' %');
  opacity.addEventListener('input', setOpacityText);
  setOpacityText();

  /* ---------- 3 · «volver» lleva a la carpeta del documento (el Drive usa rutas #/Carpeta/Sub) ---------- */
  const back = byId('back-btn');
  if (back && back.tagName === 'A') {
    try {
      const path = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      const folder = path.split('/').slice(0, -1).join('/');
      if (folder) back.href = 'index.html#/' + folder.split('/').map(encodeURIComponent).join('/');
    } catch { /* se queda en index.html */ }
  }
})();
