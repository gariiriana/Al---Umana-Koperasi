# Toksan (Toko Santri) — Design

Date: 2026-11-14
Status: approved by user ("eksekusi"), how-to-build delegated to Claude.

## Intent

Toko Santri (Toksan) sells snacks made by three kitchens (Bakery, Hangat Saji,
Depan) to santri, recorded per sesi and per pihak (Rijal = putra, Nisaa = putri).
Today an admin types every row into the Google Sheet "Laporan Penjualan Toksan
TERBARU". Typing is tedious enough that since Aug 2026 the gender column was
left empty and in Oct 2026 sesi was mostly empty; dates were only written on the
first row of each day, which broke the per-day totals.

Goal: a new role **Toksan** whose admin records sales in the app with as little
typing as possible, exports professional daily / weekly / monthly recaps
(PDF + DOCX, Al-Umana letterhead), sees which products sell (Trafik Produk), and
records Obral (discounted resale) separately.

## Decisions made by the user

- New role `toksan`; every Toksan feature is for the Toksan admin only.
- Input: pick product → kitchen (dapur) and reseller price fill in automatically.
  Sesi and Rijal/Nisaa are set by ticking (bulk or per row), not typed. Only
  Jumlah and Retur are typed. Everything else is automatic.
- Prices are always the reseller price (harga reseller) from the product master.
- Exports: rekap harian, mingguan, bulanan as PDF and DOCX with Al-Umana header,
  neat and professional.
- Trafik Produk page in the web app showing which products sell.
- Obral: products from any kitchen resold at a price the admin sets per entry.
  Only the Toksan admin sees it.
- Start from zero: no historical sales are imported from the sheet. The sheet
  tabs Laporan tren pasar, Pivot Table 1, Detail*, Laporan Penjualan and
  Database BARU are not brought into the web app.

## Claude's calls (user may correct)

- **Access:** routes allow `toksan`, `super_admin`, `developer` (the latter two
  to check). Kepala unit Toko Santri does not get access.
- **Storage:** a new Cloudflare Worker `al-umana-toksan` at
  `koperasi-alumana.com/api/toksan/*` with its own D1 database `toksan`. Zero
  Firestore data. Reason: Firestore is on Spark (50k reads/day) and recaps /
  trafik aggregate thousands of rows; D1 aggregates in SQL. Same pattern as the
  absensi Worker.
- **Role check in the Worker:** verify the Firebase ID token (same code as
  absensi), then read `users/{uid}.role` through the Firestore REST API with the
  service account, cached per isolate for 5 minutes (a handful of reads/day).
  Allowed roles: `toksan`, `super_admin`, `developer`.
- **Price snapshot:** each sales row stores the product name, dapur and harga at
  save time, so later price changes never rewrite past omzet.
- **One row = one product × sesi × pihak per date** (UNIQUE). Data shows
  products are sold to both Rijal and Nisaa in the same sesi in only 5 of ~11k
  rows; when it happens the admin adds the product twice. The UNIQUE key also
  blocks the double-entry seen in the sheet (1 Oct 2026).
- **Sesi:** Pagi, Siang, Sore (Sore exists in the sheet, rarely used).
- **Product master seeded** from the sheet tab "Database" (190 products, cleaned:
  dapur typos normalised, duplicate names resolved, products without price
  flagged). Sales start empty. The Toksan admin can add/edit products and
  prices; products are deactivated, never deleted, once they have sales.
- **Editing:** any date can be edited by the Toksan admin; rows record
  `updated_by` / `updated_at`.
- **Obral** has no sesi/pihak. Fields: tanggal, produk (snapshot name/dapur/harga
  normal), harga obral, jumlah, catatan (optional).
- **Weeks** run Senin–Minggu (WIB). Months are calendar months.
- Exports are built in the browser (jsPDF + jspdf-autotable, docx), like the MBG
  reports, using `/logo_alumana.png` and "YAYASAN LEMBAGA WAKAF AL UMANAA".

## Non-goals / anti-goals

- No public storefront page, no santri-facing obral list.
- No import of historical sales; no sync with the Google Sheet.
- No approval queues (see auto-decisions memory): saves are final.
- Must not add Firestore listeners or reads per page load.

## Data model (D1 `toksan`)

```
products(id TEXT PK, name TEXT, name_key TEXT UNIQUE,  -- lower/trim
         dapur TEXT CHECK IN ('bakery','hangat_saji','depan'),
         kategori TEXT CHECK IN ('makanan','minuman','lainnya'),
         harga INTEGER NOT NULL CHECK >= 0, active INTEGER DEFAULT 1,
         created_at, updated_at, updated_by)

sales(id TEXT PK, tanggal TEXT 'YYYY-MM-DD', product_id TEXT,
      product_name TEXT, dapur TEXT, harga INTEGER,          -- snapshots
      sesi TEXT CHECK IN ('pagi','siang','sore'),
      pihak TEXT CHECK IN ('rijal','nisaa'),
      jumlah INTEGER CHECK >= 0, retur INTEGER CHECK 0..jumlah,
      created_at, created_by, updated_at, updated_by,
      UNIQUE(tanggal, product_id, sesi, pihak))
  -- terjual = jumlah - retur, omzet = terjual * harga (computed)

obral(id TEXT PK, tanggal, product_id, product_name, dapur,
      harga_normal INTEGER, harga_obral INTEGER CHECK >= 0,
      jumlah INTEGER CHECK > 0, catatan TEXT,
      created_at, created_by, updated_at, updated_by)
```

## API (`/api/toksan`, all require an allowed role)

- `GET /me` → `{uid, role, name}`
- `GET /produk` (all, incl. inactive) · `POST /produk` · `PATCH /produk/:id`
- `GET /penjualan?tanggal=` → rows of that date
- `PUT /penjualan` `{tanggal, rows:[{id?, productId, sesi, pihak, jumlah, retur}], hapus:[id]}`
  → atomic batch (D1 batch); validation errors name the row.
- `GET /obral?tanggal=` · `PUT /obral` (same batch shape)
- `GET /rekap?dari=&sampai=` → everything a recap or the trafik page needs:
  per-product totals by dapur, per-day totals, per-sesi and per-pihak splits,
  obral rows, grand totals. Range capped at 366 days.

## Screens (admin shell, sidebar group "Toksan")

1. **Input Harian** `/toksan/input` (landing). Date (default today WIB), product
   search to add rows, table (cards on phone): Produk, Dapur, Harga (auto),
   Jumlah, Retur (typed), Terjual, Total (auto), Sesi chip, Pihak chip, row
   checkbox. Bulk bar: [Pagi][Siang][Sore] [Rijal][Nisaa] apply to ticked rows.
   New rows inherit the last-used sesi. Save is blocked until every row has sesi
   and pihak; missing chips are highlighted. Adding a product+sesi+pihak that
   already exists focuses the existing row. Day total shown live.
2. **Obral** `/toksan/obral`: date, add product, harga normal (auto, read-only),
   harga obral + jumlah typed, total auto.
3. **Rekap** `/toksan/rekap`: tabs Harian / Mingguan / Bulanan, period picker,
   on-screen preview, buttons Export PDF and Export DOCX.
   - Header: logo + YAYASAN LEMBAGA WAKAF AL UMANAA + "TOKO SANTRI — Rekap
     Penjualan <Harian|Mingguan|Bulanan>" + periode.
   - Ringkasan: omzet, terjual, retur (+%), Rijal vs Nisaa omzet, obral total.
   - Per dapur table: No, Produk, Harga, Produksi, Terjual, Retur, Omzet,
     subtotal. Harian splits per sesi; Mingguan adds omzet per hari; Bulanan
     adds omzet per minggu. Obral table. Grand total (penjualan + obral).
   - Footer: "Sukabumi, <tanggal>", "Admin Toksan", name, signature space.
4. **Trafik Produk** `/toksan/trafik`: filters periode (Hari ini / Minggu ini /
   Bulan ini / custom), dapur, pihak. KPI tiles (omzet, terjual, retur %,
   produk aktif), Terlaris and Paling sepi lists (by terjual, bars), omzet per
   day line, Rijal vs Nisaa, sesi split, highest retur products. Plain SVG, no
   new chart dependency.
5. **Produk** `/toksan/produk`: list with search and dapur filter, add/edit
   (nama, dapur, kategori, harga reseller), activate/deactivate.

## Constraints

- Deploy only when the user asks; Worker needs `wrangler d1 create toksan`,
  migrations, secrets `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`, route.
  Migration before Worker before hosting.
- The repo has unrelated uncommitted work; build on a separate branch/worktree.
- A Toksan admin account must be created (who: ask the user before provisioning).

## Left to the builder

Component structure, exact styling (follow existing admin pages: amber
`#FBBF24` accents, Hanken Grotesk), test layout (Worker: node:test like absensi;
frontend: vitest), the cleaning rules for the product seed (report them to the
user before seeding live).
