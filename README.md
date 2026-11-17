# NAS-PDF Lite

Gestión de PDFs estilo **Drive** (con carpetas, búsqueda y tiempo real) + **app de subrayado** para tu red local, optimizada al máximo en **RAM**, **espacio** y **autonomía**: 100 % local, 100 % tuyo, sin una sola dependencia externa.

Es la versión modular del proyecto anterior (Directus + PostgreSQL + MinIO + React/nginx + local-saver + firewall): mismo flujo de trabajo, pero en **dos contenedores ligeros (~60 MB de RAM entre ambos)** en vez de 6 contenedores con ~2 GB de base.

---

## 100 % local — verificado, no prometido

- **Cero llamadas a Internet**: el código no contiene ni una URL externa; las únicas cadenas `http://` son texto de ayuda y el namespace XML `w3.org` que pdf.js usa como *identificador* (no es una petición de red). Las librerías (pdf.js 3.11.174 y pdf-lib 1.17.1) están **vendidas** en `public/vendor/`; pdf.js solo pide rutas locales (`/vendor/`, `/files/`) y `cMapUrl`/`standardFontDataUrl` no están configurados.
- **Cero servicios externos**: nada de Directus, MinIO, PostgreSQL, Redis ni cuentas. El servidor solo usa `http`, `fs` y `path` de Node — lo puedes compilar mentalmente: 3 `require`.
- **Cero telemetría, fuentes de Google, CDN o iconos externos**: iconos SVG inline, tipografía `system-ui`.
- Puedes apagar el router de Internet y todo sigue funcionando igual.
- Comprobación rápida desde tu navegador: `http://<TU-IP>:8090/api/health`.

## 100 % tuyo (producción propia)

- Tus datos son **dos carpetas planas** que puedes copiar, sincronizar o meter en cualquier backup: `library/` (PDFs originales) y `annotations/` (capas de subrayado JSON de KBs).
- Cambiar de máquina = copiar dos carpetas. Sin exportaciones, sin dumps, sin credenciales.
- El código es tuyo y pequeño (~1.500 líneas entre servidor y web); nada de imágenes propietarias ni suscripciones.

---

## La app principal (estilo Drive — rediseño UI/UX completo)

> Interfaz renovada con un **sistema de diseño propio** (`css/tokens.css`: variables semánticas, contraste AA/AAA, tipografía y escalas fluidas) y estilos nuevos (`css/drive.css`). Mobile-first y accesible (roles ARIA, foco gestionado, live regions, `prefers-reduced-motion`, skip-link).

- **Barra lateral con árbol de carpetas** en escritorio (plegable) y **cajón deslizante en móvil**; navegación por hash (`#/Universidad/…`) → el botón **atrás del navegador funciona** y las migas son enlaces reales.
- **Carpetas**: «Nueva carpeta» y «Renombrar» con **diálogos nativos `<dialog>`** (validación en línea, foco atrapado, Esc); menú ⋮ tipo ARIA (flechas para navegar, hoja inferior en móvil).
- **Selección múltiple de documentos**: casillas en las tarjetas → barra de acciones (seleccionar todo / **mover en lote** / **eliminar en lote**), con confirmación y resumen por archivo.
- **Subida con cola y progreso**: diálogo con zona de arrastre, estado por archivo (en cola / subiendo / subido / ya existía / error), barra global y toasts; también arrastra PDFs a cualquier parte de la ventana.
- **Búsqueda global** (`/` la enfoca desde cualquier punto de la página) y **vista cuadrícula / lista** con transición suave (respeta `prefers-reduced-motion`).
- **Tema sistema / claro / oscuro** en un clic (sigue a `prefers-color-scheme` por defecto); toasts accesibles.
- **Abrir documentos**: clic en una tarjeta → **visor de lectura** (como un visor de PDF normal, sin herramientas); la edición se abre solo de forma explícita: ⋮ → *Editar subrayados*, o el botón ✏ dentro del propio visor. La flecha ← del visor vuelve al Drive **en la carpeta en la que estabas**.
- **Tiempo real (SSE)**: si subes, mueves o borras desde otro dispositivo, la vista se actualiza sola; los contadores de subrayados (✏ n) cambian al vivo cuando alguien subraya.

## La app de subrayado

Se abre **de forma explícita** (⋮ → *Editar subrayados* en el Drive, o ✏ en el visor de lectura); lo que abre un clic normal es el visor de lectura, sin barra. Barra derecha, de arriba abajo: **Cursor** (la selección normal no subraya; `Esc` vuelve a cursor; se recuerda entre sesiones) · **Subrayador** (selección con fusión de líneas) · **Modo borrado** (clic sobre un subrayado) · **Borrar TODOS los subrayados** (con confirmación y deshacible) · **Deshacer** (`Ctrl+Z`) · colores y opacidad · **Sincronizar** (`Ctrl+S`, con estado *Guardado ✓ / Cambios pendientes…*) · **Descargar PDF pintado** (se genera en tu navegador, no queda nada en el servidor). En el **visor de lectura**, junto al selector de página, hay un **pomodoro de 25 min**: clic en la hora inicia o pausa y el botón ↺ reinicia a 25:00; la píldora se oculta al entrar en modo edición.

- **Sincronización multi-dispositivo**: autoguardado cada 8 s sin cambios + descarga en vivo — si otro equipo subraya el mismo documento, tu visor recarga la capa solo y avisa con un toast.
- **Los subrayados NO son persistentes a la fuerza**: puedes borrar uno, todos (botón o ⋮ del Drive), o dejar la capa a cero; el PDF original jamás se toca.

Atajos: `Ctrl+S` sincronizar · `Ctrl+Z` deshacer · `Esc` cursor · flechas/`AvPag`/`RePag` página.

---

## Aislamiento: solo tu LAN, a nivel Docker (sin tocar el S.O.)

```
tu LAN ──► [ proxy nginx ]──(red "interna", internal:true)──► [ nas-pdf ]
           único puerto publicado (8090)                        └─ CERO salida a Internet
```

**3 capas, todas dentro del docker-compose (nada de iptables ni firewall del S.O.):**

1. **Proxy nginx con allowlist** (`reverse-proxy/nginx.conf`): es el ÚNICO contenedor con puerto publicado (8090). Antes de reenviar nada, acepta solo direcciones privadas (192.168, 10.x, 172.16–31, loopback, link-local, ULA IPv6 y CGNAT 100.64/10) y rechaza el resto con `403`. Cada intento foráneo queda en su log. Probado con nginx real: IP no privada → 403.
2. **Backend sin puerta**: `nas-pdf` no declara `ports:` → nadie puede conectar a él ni siquiera desde el anfitrión; solo el proxy lo alcanza por la red interna. La app conserva además su propio filtro LAN (defensa en profundidad: si algo atravesase el proxy, el backend sigue filtrando).
3. **Cero salida a Internet garantizada por Docker**: la red `interna` se declara `internal: true` → Docker no le da ruta a Internet a esa red. La app (donde están tus datos) **no puede hacer ni una conexión saliente**; el nginx solo se conecta a `nas-pdf`, nunca hacia fuera.

**Endurecimiento de los contenedores** (en el propio compose): filesystem de solo lectura (`read_only`), sin escalada de privilegios (`no-new-privileges`), límite de RAM (192 MB app / 64 MB proxy), healthchecks, y reinicio automático.

**Verifícalo tú mismo (2 minutos) tras arrancar:**

```bash
docker compose ps                     # 2 contenedores "healthy"
docker port nas_pdf_lite              # (vacío) => la app no tiene puertos publicados
docker inspect nas_pdf_lite --format '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}} {{end}}'
#   => "interna" (solo esa red)
# prueba de salida a Internet desde el backend (debe FALLAR):
docker exec nas_pdf_lite node -e "fetch('http://example.com').then(()=>console.log('¡SALIDA!')).catch(e=>console.log('SIN SALIDA ✓:', e.cause?.code || e.message))"
curl http://<TU-IP>:8090/api/health   # desde tu LAN => JSON ok
#   y desde una red ajena (móvil con datos, VPN…) => 403 Forbidden
```

**Si al escribir (crear carpeta / subir PDF) vieras un 500**, el mensaje te dice la causa exacta (`— sin permisos de escritura en el volumen (EACCES)`). Lo normal es que no lo veas nunca: el contenedor **ajusta solo el dueño de `library/` y `annotations/` al arrancar** (arranca, hace `chown` a su usuario interno y baja a usuario sin privilegios con `su-exec` antes de servir ni una petición). Si tu S.O. impidiera ese ajuste, `sudo chown -R 1000:1000 library annotations` lo resuelve. El log de arranque también avisa (`⚠ AVISO: library/ NO es escribible…`) si algo no está bien.

- **Funciona con DHCP**: la IP que te diga tu programa cada día es suficiente (Docker publica el 8090 en todas las interfaces del anfitrión).
- **Token de escritura opcional**: arranca con `NASPDF_TOKEN=mi-secreto` (línea comentada en el compose) y todas las operaciones de escritura (subir, borrar, mover, guardar subrayados) exigirán el token; las lecturas siguen libres para tus dispositivos. La web lo pide una vez y lo guarda.
- Blindaje **extra** opcional (tercera capa, si quieres rematarlo a nivel de S.O. — no es necesario):
  - **Windows**: `netsh advfirewall firewall add rule name="NAS-PDF solo LAN" dir=in action=allow protocol=TCP localport=8090 remoteip=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12`
  - **Linux**: `ufw allow from 192.168.0.0/16 to any port 8090 proto tcp`

> Nota: el firewall del proyecto viejo solo bloqueaba el tráfico **saliente** de los contenedores; las conexiones entrantes quedaban fuera de sus reglas. Aquí la entrada se filtra en el proxy y la salida se corta en la red interna de Docker — las dos direcciones, a nivel contenedor.

---

## Arrancar

```bash
docker-compose up -d --build
# abre http://<TU-IP>:8090   (la IP que te diga tu programa cada día)
```

> La **primera** construcción descarga las imágenes base una vez (`node:20-alpine` y `nginx:1.26-alpine`); a partir de ahí todo funciona sin Internet. Las carpetas `library/` y `annotations/` pueden pertenecer a cualquier usuario del servidor: el contenedor adapta los permisos al arrancar. Si no tienes Docker: `node server.js` (sin proxy, la app mantiene su filtro LAN propio). Con token: `NASPDF_TOKEN=mi-secreto node server.js` (o descomenta la línea del compose).

| Variable | Defecto | Qué hace |
|---|---|---|
| `PORT` | `8090` | Puerto de escucha (8080/8081 libres) |
| `MAX_MB` | `512` | Tamaño máximo de subida |
| `NASPDF_TOKEN` | *(vacío = off)* | Exige token en las escrituras |
| `LIB_DIR` / `ANN_DIR` | `./library` / `./annotations` | Rutas de los datos |

## Migrar tus datos del proyecto viejo

Guía en [`migrate/README.md`](migrate/README.md): dos scripts (solo librería estándar de Python) que descargan los originales desde Directus/MinIO a `library/` y convierten la tabla `subrayados` de PostgreSQL en capas JSON — **las coordenadas son idénticas**. Los `pintado_*.pdf` de `painted_files/` ya no hacen falta: bórralos.

---

## Rendimiento (por qué es ligero de verdad)

- **Servidor ~40–60 MB de RAM** y streaming en todo (subidas/descargas con `Range`): nunca hay un PDF entero en memoria.
- **Visor virtualizado**: solo las páginas visibles ±2 tienen canvas; el resto son placeholders de altura exacta. Con un PDF de 300+ páginas el consumo del navegador se mantiene plano; `devicePixelRatio` limitado a 1.5; miniaturas solo cuando aparecen en pantalla.
- **SSE en vez de polling**: 1 conexión persistente y eventos solo cuando algo cambia; cero sondeos.
- **Escrituras atómicas**: todo se escribe a `.part` y se renombra — un corte de luz no deja archivos a medias.

## Seguridad incorporada

**A nivel Docker**: proxy nginx con allowlist LAN (único puerto publicado) · backend sin puertos y en red `internal` sin ruta a Internet · filesystems de solo lectura · `no-new-privileges` · límites de RAM y healthchecks · el contenedor ajusta el dueño de los volúmenes al arrancar y baja a usuario sin privilegios (`su-exec`) antes de servir. **En la app**: filtro LAN propio por conexión · nombres y rutas validados (sin path traversal, profundidad máxima 6) · límites de tamaño (subida y capa JSON) · validación estricta de coordenadas · CSP estricta (`script-src 'self'`) · sin CORS abierto (todo es same-origin) · token opcional para escrituras. **En el proxy**: cabeceras `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y versión de servidor oculta.

## Ideas para seguir endureciendo (no incluidas, por diseño compacto)

1. **Snapshots de capas**: guardar `annotations/<nombre>.pdf.json.bak-<fecha>` antes de cada escritura → historial tipo versiones de Drive (5 líneas más de código, más disco).
2. **Papelera**: mover a `library/.papelera/` en vez de borrar de verdad (30 min de trabajo).
3. **Autenticación por usuario completo** (login con cookie de sesión) si algún día lo abres a más gente en la LAN.
4. **HTTPS** innecesario en LAN propia; solo si sale de casa (conjuntamente con auth).
5. **Backup programado**: `robocopy`/`rsync` de `library/` + `annotations/` a otro disco (el comando ya lo tienes arriba; no hace falta código).

## Estructura

```
NAS-PDF-Lite/
├── server.js              ← TODO el servidor (Node puro, 0 dependencias)
├── public/
│   ├── index.html         ← app Drive (carpetas, búsqueda, mover, tiempo real)
│   ├── viewer.html        ← app de subrayado
│   ├── css/tokens.css     ← sistema de diseño (variables semánticas, AA/AAA, temas)
│   ├── css/drive.css      ← estilos del Drive (rediseño UI/UX, mobile-first)
│   ├── css/app.css        ← estilos del visor (usa las variables de tokens.css)
│   ├── js/common.js       ← helpers + token + iconos (I/IC) + tema 3 estados + toasts
│   ├── js/drive.js        ← lógica de la biblioteca (árbol, selección, diálogos, hash)
│   ├── js/viewer.js       ← visor + subrayado + sincronización + SSE
│   └── vendor/            ← pdf.js 3.11.174 + pdf-lib 1.17.1 vendidos
├── tests/                 ← smoke.js de desarrollo (48 comprobaciones del Drive)
│   └── smoke.js           ←   requiere `npm i jsdom@24` — SOLO desarrollo, la web no depende de jsdom
├── reverse-proxy/         ← nginx: allowlist LAN, cabeceras, SSE sin buffering
│   ├── nginx.conf         ←   (config completa, ~80 líneas)
│   └── Dockerfile         ←   nginx:1.26-alpine (~15 MB)
├── library/               ← tus PDFs (git-ignorado)
├── annotations/           ← capas de subrayado JSON (git-ignoradas)
├── migrate/               ← migración desde el stack viejo
├── docker-entrypoint.sh   ← ajusta el dueño de los volúmenes y baja a 'node'
├── Dockerfile             ← imagen de la app (Node, sin dependencias)
└── docker-compose.yml     ← 2 servicios: proxy (único puerto) + app (red interna)
```
