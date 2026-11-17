#!/bin/sh
# Mi Drive — ajusta el dueño de los volúmenes y baja a usuario sin privilegios.
#
# Resuelve los 500 al escribir cuando library/ o annotations/ pertenecen a otro
# uid en el servidor (síntoma: leer funciona, escribir da "No se pudo...").
# El contenedor arranca como root SOLO para esto; en la línea siguiente baja
# a 'node' antes de servir ni una petición.
chown -R node:node /app/library /app/annotations 2>/dev/null || true
exec su-exec node:node node server.js
