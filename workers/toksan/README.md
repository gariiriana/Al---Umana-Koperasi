# al-umana-toksan

Worker for Toko Santri (role `toksan`): produk, penjualan harian, obral, rekap.
Route `koperasi-alumana.com/api/toksan/*`, data in D1 `toksan`. Firestore is only
read for `users/{uid}` (role + name), cached 5 minutes per isolate.

Spec: `docs/superpowers/specs/2026-11-14-toksan-design.md`.

## Tests

`npm test` (node:test against a local D1 through wrangler's platform proxy).

## First deploy (order matters)

1. `npx wrangler d1 create toksan` and paste the `database_id` into `wrangler.toml`.
2. `npx wrangler d1 migrations apply toksan --remote`
3. Product seed: `npx wrangler d1 execute toksan --remote --file <seed.sql>`
   (built by `scripts/build_product_seed.py`, reviewed first).
4. `npx wrangler secret put FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`
   (same service account as absensi; it needs Firestore read access).
5. `npx wrangler deploy`
6. Deploy hosting (frontend) after the Worker answers `401` on `/api/toksan/me`.

## Local

`npm run db:migrate:local`, then `npm run dev` (port 8788). With the Auth and
Firestore emulators, use a `.dev.vars` with `FIREBASE_PROJECT_ID=demo-...`,
`AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST`.
