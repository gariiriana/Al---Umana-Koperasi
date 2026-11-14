"""Build the Toksan product seed from the Google Sheet export (tab "Database").

Usage:
  uv run --no-project --with openpyxl python -I build_product_seed.py <sheet.xlsx> <out.sql> <report.md>

Reads rows 3..201: B nama, C kategori, D dapur (Tempat Pembuatan), E harga reseller.
Writes one INSERT per kept product and a Markdown report of every cleaning decision.
The SQL is environment data: keep it out of the repository.
"""
import re
import sys
import time

import openpyxl

DAPUR = {"bakery": "bakery", "baskery": "bakery", "hangat saji": "hangat_saji", "depan": "depan"}


def clean_name(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def sql_text(value):
    return "'" + value.replace("'", "''") + "'"


def main(xlsx_path, out_sql, out_report):
    sheet = openpyxl.load_workbook(xlsx_path, data_only=True)["Database"]
    kept = {}
    skipped = []
    duplicates = {}
    normalised = []
    for row in range(3, 202):
        name = clean_name(sheet.cell(row, 2).value)
        if not name:
            continue
        if re.fullmatch(r"[\d.,\s]+", name):
            skipped.append((row, name, "nama berupa angka (baris sampah)"))
            continue
        raw_dapur = clean_name(sheet.cell(row, 4).value).lower()
        dapur = DAPUR.get(raw_dapur)
        if dapur is None:
            skipped.append((row, name, f"dapur tidak dikenal: {sheet.cell(row, 4).value!r}"))
            continue
        if raw_dapur != dapur.replace("_", " "):
            normalised.append((row, name, f"dapur {sheet.cell(row, 4).value!r} -> {dapur}"))
        harga = sheet.cell(row, 5).value
        if not isinstance(harga, (int, float)) or harga <= 0:
            skipped.append((row, name, f"harga kosong/tidak valid: {harga!r}"))
            continue
        raw_kategori = clean_name(sheet.cell(row, 3).value).lower()
        kategori = raw_kategori if raw_kategori in ("makanan", "minuman") else "lainnya"
        key = name.lower()
        entry = {"row": row, "name": name, "dapur": dapur, "kategori": kategori, "harga": int(round(harga))}
        if key in kept:
            # The sheet's VLOOKUP returns the first match, so the top row is the price actually charged.
            duplicates.setdefault(key, [kept[key]]).append(entry)
            continue
        kept[key] = entry

    now = int(time.time() * 1000)
    with open(out_sql, "w", encoding="utf-8") as sql:
        for entry in sorted(kept.values(), key=lambda e: (e["dapur"], e["name"].lower())):
            sql.write(
                "INSERT INTO products (id, name, name_key, dapur, kategori, harga, active, created_at, updated_at, updated_by) "
                f"VALUES (lower(hex(randomblob(16))), {sql_text(entry['name'])}, {sql_text(entry['name'].lower())}, "
                f"'{entry['dapur']}', '{entry['kategori']}', {entry['harga']}, 1, {now}, {now}, 'seed');\n"
            )

    with open(out_report, "w", encoding="utf-8") as report:
        report.write(f"# Seed produk Toksan\n\nDisimpan: **{len(kept)}** produk.\n\n")
        report.write(f"## Dilewati ({len(skipped)})\n\n")
        for row, name, reason in skipped:
            report.write(f"- baris {row}: {name} — {reason}\n")
        report.write(f"\n## Nama dobel ({len(duplicates)}) — dipakai baris paling atas (yang dipakai VLOOKUP sheet)\n\n")
        for key, entries in duplicates.items():
            parts = "; ".join(f"baris {e['row']}: {e['dapur']} Rp{e['harga']}" for e in entries)
            report.write(f"- {entries[0]['name']}: {parts} → dipakai baris {entries[0]['row']}\n")
        report.write(f"\n## Dapur dirapikan ({len(normalised)})\n\n")
        for row, name, change in normalised:
            report.write(f"- baris {row}: {name} — {change}\n")
    print(f"kept={len(kept)} skipped={len(skipped)} duplicates={len(duplicates)} normalised={len(normalised)}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
