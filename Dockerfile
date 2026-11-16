# NAS-PDF Lite — imagen mínima: Node + los archivos del proyecto. Sin build, sin npm install.
FROM node:20-alpine

WORKDIR /app
COPY server.js ./
COPY public ./public

ENV PORT=8090
EXPOSE 8090

# usuario sin privilegios (en Linux, si los volúmenes son tuyos: chown -R 1000:1000 library annotations)
RUN mkdir -p library annotations && chown -R node:node /app
USER node

CMD ["node", "server.js"]
