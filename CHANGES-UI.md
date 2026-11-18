# Cambios de esta versión (integración del rediseño del visor)

Fecha: 2025-11-18 · Base: tu `Mi-Drive.zip` + los 5 archivos del rediseño (`files (3).zip`)

## Qué se integró (provenía del rediseño)

| Archivo nuevo | Destino en la app |
| --- | --- |
| `tokens.css` (v2) | `public/css/tokens.css` — sustituye al anterior |
| `viewer.css` | `public/css/viewer.css` — sustituye a `app.css` (eliminado) |
| `viewer.html` | `public/viewer.html` — sustituye al anterior |
| `viewer-ui.js` | `public/js/viewer-ui.js` — capa de interfaz nueva (cajón de miniaturas + ARIA) |
| `viewer-smoke.js` | `tests/viewer-smoke.js` — test de humo del visor |

## Qué cambia para el usuario

- Visor rediseñado mobile-first: barra superior en rejilla (sin solapamientos), miniaturas
  en cajón deslizante en móvil (fondo oscurecido, foco y `inert` gestionados) y columna
  fija en escritorio; herramientas abajo en móvil / columna derecha en escritorio.
- Accesibilidad: roles y estados ARIA que siguen en vivo a lo que hace `viewer.js`
  (MutationObservers), skip-link, `prefers-reduced-motion`, `forced-colors`, áreas seguras.
- Sistema de tokens v2 compartido por Drive y visor (contraste AA/AAA, escalas fluidas,
  tema claro/oscuro/sistema — compatible con el `initTheme()` existente).
- El Drive (index.html + drive.css) NO cambia: verificado que el nuevo `tokens.css`
  define todas las variables que `drive.css` usa (`--shadow-md/lg` incluidas).
- `viewer.js` NO se toca: la capa `viewer-ui.js` solo observa su DOM.

## Ajustes que hice yo al integrar (el rediseño solo venía "suelto")

1. **Eliminado `public/css/app.css`** y actualizado el árbol de `README.md`: el nuevo
   `viewer.html` carga `viewer.css`, y `app.css` usaba 7 variables que el nuevo
   `tokens.css` ya no define (`--panel`, `--muted`, `--green`, `--red`, `--yellow`,
   `--panel2`, `--shadow`).
2. **`tests/viewer-smoke.js` rutas**: buscaba `viewer.html` y `js/` en la raíz del
   proyecto; en el repo viven en `public/` (ahora usa `public/`, como `tests/smoke.js`).
3. **`tests/viewer-smoke.js` API**: `getComputedStyle(...)` no existe en Node; ahora
   usa `w.getComputedStyle(...)`.
4. **`tests/viewer-smoke.js` modo edición**: cargaba el visor en modo lectura, donde el
   control «Esc vuelve a cursor» no puede funcionar (`viewer.js` solo lo hace con
   `?edit=1`); ahora carga `viewer.html?edit=1#…`.
5. **Regresión evitada**: en modo edición el nuevo HTML habría dejado visible el botón
   ✏ «Editar subrayados» (el HTML antiguo lo ocultaba con `style="display:none"` y
   `viewer.js` solo lo muestra en lectura). Solución en CSS:
   `body:not(.reading) .edit-btn { display: none; }` — sin tocar `viewer.js`.

## Verificación

- `tests/smoke.js` (Drive): **48/48 ✓**
- `tests/viewer-smoke.js` (visor, móvil + escritorio): **59/59 ✓**
- Servidor real arrancado: `/`, `/viewer.html`, todos los CSS/JS/vendor y `/api/health`
  responden **200**; ninguna referencia residual a `app.css`.
