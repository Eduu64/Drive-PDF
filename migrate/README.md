# Migración desde el proyecto viejo (Directus + PostgreSQL + MinIO)

La app vieja guardaba: los PDFs originales en MinIO, los metadatos en
PostgreSQL y los subrayados como filas de la tabla `subrayados`. Mi Drive solo necesita dos carpetas planas:

- `library/` → los PDFs originales (tal cual, nunca se modifican)
- `annotations/` → una capa JSON por documento con los subrayados

## 1. Copiar los PDFs originales

```bash
# exporta la tabla documentos a CSV (desde la carpeta del proyecto viejo)
docker exec dms_database psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
  -c "COPY (SELECT d.titulo, f.id AS archivo_id FROM documentos d JOIN directus_files f ON f.id = d.archivo) TO STDOUT WITH CSV HEADER" > documentos.csv

# descarga los originales (Directus aún levantado)
python3 exportar_originales.py documentos.csv
```

Alternativa manual: entra en MinIO Console (http://localhost:9001), bucket
`documentos`, y descarga/copia los PDFs a `library/` a mano.

## 2. Migrar los subrayados ya hechos

```bash
docker exec dms_database psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
  -c "COPY (SELECT d.titulo, s.pagina, s.coordenadas, s.color, s.opacidad
            FROM subrayados s JOIN documentos d ON d.id = s.document_id
            ORDER BY d.titulo, s.id) TO STDOUT WITH CSV HEADER" > subrayados.csv

python3 csv_a_subrayados.py subrayados.csv
```

Las coordenadas se copian 1:1 (mismo formato que usaba la app vieja), así que
los subrayados aparecen exactamente donde los dejaste.

Los PDFs `pintado_*.pdf` de la carpeta `painted_files/` vieja **no hacen
falta**: ahora el "pintado" se genera bajo demanda con el botón de descarga
del visor y no ocupa espacio en el servidor. Puedes borrar esa carpeta.

## 3. Apagar el stack viejo

```bash
docker-compose down --remove-orphans   # en la carpeta del proyecto viejo
# opcional: docker system prune  para liberar las imágenes viejas (varios GB)
```
