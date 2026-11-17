# Mi Drive — imagen mínima: Node + los archivos del proyecto. Sin build, sin npm install.
FROM node:20-alpine

WORKDIR /app
COPY server.js ./
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# su-exec (10 KB): permite arrancar como root, dejar los volúmenes con el
# dueño correcto y bajar a un usuario sin privilegios para servir.
RUN mkdir -p library annotations \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && apk add --no-cache su-exec

ENV PORT=8090
EXPOSE 8090

# El entrypoint ajusta el dueño de library/ y annotations/ (así las escrituras
# funcionan sea cual sea el uid del servidor) y baja a 'node' antes de servir.
ENTRYPOINT ["docker-entrypoint.sh"]
