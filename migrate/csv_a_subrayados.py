#!/usr/bin/env python3
"""
Migración (paso 2/2): convertir los subrayados guardados en la tabla
`subrayados` de PostgreSQL (app vieja) a las capas JSON de NAS-PDF Lite.

Solo usa la librería estándar de Python.

Uso:
  1) Exporta la tabla a CSV (desde la carpeta del proyecto viejo):

     docker exec dms_database psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
       -c "COPY (SELECT d.titulo, s.pagina, s.coordenadas, s.color, s.opacidad
                 FROM subrayados s JOIN documentos d ON d.id = s.document_id
                 ORDER BY d.titulo, s.id) TO STDOUT WITH CSV HEADER" > subrayados.csv

  2) Ejecuta:

     python3 csv_a_subrayados.py subrayados.csv
"""
import csv
import json
import os
import sys

ANN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "annotations")


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python3 csv_a_subrayados.py subrayados.csv")
        return 2
    csv_path = sys.argv[1]
    os.makedirs(ANN_DIR, exist_ok=True)

    layers = {}  # titulo -> lista de subrayados
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            title = (row.get("titulo") or "").strip()
            if not title:
                continue
            if not title.lower().endswith(".pdf"):
                title += ".pdf"
            try:
                page = int(float(row["pagina"]))
                opacity = int(float(row["opacidad"]))
                rects = row["coordenadas"]
                if isinstance(rects, str):
                    rects = json.loads(rects)
                color = (row.get("color") or "#facc15").strip()
            except Exception as exc:
                print(f"✗ fila inválida para {title}: {exc}")
                continue
            if not (5 <= opacity <= 95):
                opacity = 30
            layers.setdefault(title, []).append({
                "id": "h" + str(len(layers[title])) + "mig",
                "page": page,
                "rects": rects,
                "color": color,
                "opacity": opacity,
            })

    written = 0
    for title, items in layers.items():
        dest = os.path.join(ANN_DIR, os.path.basename(title) + ".json")
        layer = {"highlights": items, "updated": None, "migrado": True}
        with open(dest, "w", encoding="utf-8") as out:
            json.dump(layer, out, ensure_ascii=False)
        print(f"✓ {title}: {len(items)} subrayados → {os.path.basename(dest)}")
        written += 1

    print(f"\n{written} capas de subrayado creadas en annotations/")
    return 0 if written else 1


if __name__ == "__main__":
    sys.exit(main())
