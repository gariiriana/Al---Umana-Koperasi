# Absensi Worker (`al-umana-absensi`)

Clock in / clock out karyawan, terpisah dari KASMA JOB dan tanpa Firestore. Datanya ada di Cloudflare D1 (`absensi` dan `absensi_foto`). Login memakai Firebase Auth dengan custom claim `absensi_role` (`absen_karyawan` / `admin_absensi`). Spec: [`docs/superpowers/specs/2026-10-27-absensi-design.md`](../../docs/superpowers/specs/2026-10-27-absensi-design.md).

## Jalankan di localhost

Semua langkah di bawah memakai Firebase Auth Emulator (project `demo-alumana`) dan D1 `--local`. Tidak ada yang menyentuh project atau domain live.

**Terminal 1: emulator Firebase** (dari root repo)

```bash
firebase emulators:start --only auth,firestore --project demo-alumana
```

**Terminal 2: Worker**

```bash
cd workers/absensi
cp .dev.vars.example .dev.vars   # sekali saja
npm run db:migrate:local
npm run dev                      # http://127.0.0.1:8787
```

**Terminal 3: frontend**

```bash
cd frontend
node scripts/copy-face-models.mjs   # npx vite tidak memicu predev, jadi jalankan manual
npx vite --mode emulator
```

Buka `http://localhost:5174/masuk`. Pakai `localhost`, bukan `127.0.0.1` atau IP LAN, karena passkey lokal terikat ke RP ID `localhost`. Vite meneruskan `/api/absensi/*` ke Worker di port 8787.

**Seed akun** (Terminal 4, dari `workers/absensi`)

```bash
node scripts/seed-admin.mjs --email admin@absensi.test --password rahasia123 --name "Admin Absensi"
node scripts/seed-employees.mjs --file "D:/Users/Downloads/absensi-akun-karyawan.json"
```

Kedua script menolak jalan kalau project bukan `demo-*`. Email yang sudah ada dilewati, jadi aman dijalankan ulang. Password tidak dicetak ke log. File akun karyawan berisi password, jadi simpan di luar repo.

### Uji manual

1. Login sebagai admin lewat pintu **Absensi**, buka tab **Area**, lalu klik sudut-sudut gedung (minimal 3 titik) dan **Simpan**.
2. Buka jendela **InPrivate** untuk akun karyawan. Satu profil browser hanya punya satu sesi Absensi.
3. Lokasi palsu untuk laptop (hanya build dev), di DevTools Console:

   ```js
   localStorage.setItem("absensi:devGps", "-6.97352,106.86516,10")
   ```

4. Passkey memakai Windows Hello. Selfie memakai webcam laptop.
5. Aktivasi, lalu Clock In, Clock Out, cek riwayat, dan export rekap dari akun admin.

### Uji otomatis

```bash
cd workers/absensi && npm test          # aturan Worker + D1 lokal
cd frontend && npx vitest run           # komponen dan alur
cd frontend && npm run e2e:absensi      # Edge + passkey virtual; stack lokal harus sudah jalan
```

## Rilis produksi (belum dijalankan)

Urutannya penting. Jalankan hanya kalau pemilik repo memintanya.

1. `npx wrangler d1 create absensi` dan `npx wrangler d1 create absensi_foto`, lalu isi `database_id` di `wrangler.toml`.
2. `npx wrangler secret put FIREBASE_CLIENT_EMAIL` dan `npx wrangler secret put FIREBASE_PRIVATE_KEY`. Isinya service account dengan izin Firebase Authentication Admin.
3. `npx wrangler d1 migrations apply absensi --remote` dan `npx wrangler d1 migrations apply absensi_foto --remote`.
4. Deploy Worker: `npm run deploy` (route `koperasi-alumana.com/api/absensi/*`).
5. Deploy hosting frontend. **Guard pintu KASMA JOB (Task 10) harus sudah live** sebelum ada akun absensi di produksi. Login KASMA JOB versi lama otomatis membuat profil `pelanggan` di Firestore untuk akun yang belum dikenal.
6. Seed admin dan 21 akun karyawan ke produksi. Script di `scripts/` sengaja hanya untuk emulator, jadi seed produksi butuh langkah terpisah yang disetujui dulu.
7. Admin menggambar area SPPG Sukabumi Gunungguruh Kebonmanggu di peta satelit, lalu uji lapangan di lokasi dengan satu karyawan.
8. Sebelum produksi, cek ulang syarat pemakaian tile Esri World Imagery.
