#!/usr/bin/env python3
"""
Migración (paso 1/2): copiar los PDFs ORIGINALES desde el stack viejo
(Directus + MinIO) a la carpeta library/ de NAS-PDF Lite.

Solo usa la librería estándar de Python.

Uso:
  1) Exporta la tabla `documentos` a CSV (desde la carpeta del proyecto viejo):

     docker exec dms_database psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
       -c "COPY (SELECT d.titulo, f.id AS archivo_id FROM documentos d JOIN directus_files f ON f.id = d.archivo) TO STDOUT WITH CSV HEADER" > documentos.csv

  2) Ejecuta (Directus debe estar aún levantado):

     python3 exportar_originales.py documentos.csv

     Variables opcionales: DIRECTUS_URL (por defecto http://localhost:8055)
"""
import csv
import os
import sys
import urllib.request

DIRECTUS_URL = os.environ.get("DIRECTUS_URL", "http://localhost:8055").rstrip("/")
LIB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "library")


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python3 exportar_originales.py documentos.csv")
        return 2
    csv_path = sys.argv[1]
    os.makedirs(LIB_DIR, exist_ok=True)

    ok = 0
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            title = (row.get("titulo") or "").strip()
            file_id = (row.get("archivo_id") or "").strip()
            if not title or not file_id:
                continue
            if not title.lower().endswith(".pdf"):
                title += ".pdf"
            dest = os.path.join(LIB_DIR, os.path.basename(title))
            if os.path.exists(dest):
                print(f"· {title} ya está en library/ — omitido")
                ok += 1
                continue
            url = f"{DIRECTUS_URL}/assets/{file_id}"
            try:
                with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as out:
                    while True:
                        chunk = r.read(256 * 1024)  # por bloques: 0 RAM extra
                        if not chunk:
                            break
                        out.write(chunk)
                print(f"✓ {title} descargado ({os.path.getsize(dest)} bytes)")
                ok += 1
            except Exception as exc:
                print(f"✗ {title}: {exc}")
    print(f"\n{ok} originales listos en library/")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
