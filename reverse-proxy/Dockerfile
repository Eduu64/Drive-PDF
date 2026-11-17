# Mi Drive — imagen del proxy inverso: nginx alpino + nuestra config.
# ~15 MB. Se construye UNA vez (como la de Node); luego funciona sin Internet.
FROM nginx:1.26-alpine

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8090

# nginx:alpine ya arranca con "daemon off" y logs por stdout/stderr
