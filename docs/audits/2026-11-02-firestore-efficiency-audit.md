# Firestore efficiency, storage and security audit

**Date:** 2026-11-02 · **Firebase project:** `al-umana-koperasi` (Spark, no billing)
**Status:** Phase 1 (audit) complete. Phase 2 (plan) below is a proposal awaiting approval. **No application code, rules, indexes or data were changed.**

## How the audit was done

- **Static review** of every Firestore read and write path in `frontend/src` (about 40 files with listeners, queries or gets), the full `firestore.rules` (915 lines), `firebase.json`, and the two Cloudflare Workers that touch Firestore (`workers/push`, `workers/invoice-api`). The `absensi` module stores its data in Cloudflare D1, not Firestore, so it is out of scope.
- **Production metrics** from Cloud Monitoring for the last 14 days. These cost no Firestore reads.
- **Read-only REST probes** against production: aggregation counts and sums per collection, plus small document samples to size payloads. Cost: about 190 billed reads, under 0.4% of one day's quota. The probes printed only counts, byte sizes and field names, never document contents.
- **Baseline tests:** 63 unit test files with 301 tests pass. 6 security-rules test files with 39 tests pass on the Firestore emulator.

"Measured" in this document means one of those sources. "Estimate" means a calculation from measured numbers; the basis is given each time.

---

## 1. Summary

| # | Finding | Severity | Basis |
| --- | --- | --- | --- |
| 1 | Stored data is **704 MiB of the 1 GiB Spark limit**. It grew 53.6 MiB in the last 7 days (7.7 MiB/day on average, 9–14 MiB on working days). At that pace the limit is about 3–6 weeks away, between late November and mid-December 2026. | Critical, time-bound | measured (`storage/data_and_index_storage_bytes`) |
| 2 | **Courier proof photos are stored twice.** They are inline in `mbg_pm_entries` (a delivered row averages 230 KB, 99.5% of it base64) and mirrored into `mbg_delivery_tasks.schoolProofs`. 6 of 8 sampled task docs are 994–1,020 KB, at the 1 MiB document cap, so new mirror writes fail silently. | Critical | measured; [mbgDeliveryService.ts:240](../../frontend/src/services/mbgDeliveryService.ts#L240) |
| 3 | **99.5% of reads are queries and listeners**, not single-document gets. Opening a page "cold" re-reads whole collections: `mbg_pm_batches` (326 docs) on about 10 pages, open orders (321 docs) in the Sidebar for every katering role, `orders` (477 docs) on 6 pages, and daily reports (56 docs × 40 KB). Firestore re-bills a listener in full when it was disconnected for more than 30 minutes, so this repeats each time staff reopen the app after a break. | High | measured counts and code |
| 4 | **Three queries return wrong data.** The MO order list uses `limit(200)` without `orderBy`, so about 58% of the 477 orders are randomly missing. The Produksi archive search uses `limit(300)` without `orderBy`, so it searches about 7% of 4,352 rows and downloads about 20 MB per search. The Distribution page's delivery-document list fails in production because a composite index is missing. | High (correctness) | code; production query returned `FAILED_PRECONDITION` |
| 5 | **Security rules call `get(users/{uid})` on nearly every request.** Per Firebase pricing, a listener is re-billed for rule evaluation when it starts, on every result update, and every time the device goes offline and back online. The app forces a reconnect every 10 minutes and after any 30 s in the background. Each concurrent listener gets about 15–22 rule LIST evaluations per hour. The billed share of these dependent reads can't be separated with the available metrics. | High (unmeasured share) | measured `rules/evaluation_count`; pricing docs |
| 6 | **No PDFs are stored in Firestore.** PDFs and DOCX files are generated on the device and downloaded. The only upload that accepts PDFs (absensi leave attachments) stores just the file name, in D1. | Info: the brief assumed otherwise | code |
| 7 | **Base64 is encoding, not encryption.** Confidentiality rests on rules, TLS and Google's encryption at rest. The rules are default-deny and mostly tight, with gaps: any signed-in user, including customers, can create documents in `developer_recycle_bin`; client-written base64 fields have no size or type limits; all order staff can list every user (including customers' phone numbers and addresses) and read every notification; and the offline cache isn't cleared when another account signs in on a shared phone. | Medium | full rules review |
| 8 | **The push Worker polls every minute.** That is about 1,440 billed queries a day (about 3% of the read quota) even when nothing is pending. The app already triggers delivery through `/api/push/kick`. | Medium | measured `api/request_count`; [wrangler.toml](../../workers/push/wrangler.toml) |

---

## 2. Stack and Firestore initialization

- **Frontend:** React 18.3.1, TypeScript 5.6, Vite 6.4.2, vite-plugin-pwa 1.3.0 in prompt mode (users stay on the old build until they tap "Perbarui"), React Router 6. Firebase JS SDK 11.10.0 provides Auth, Firestore and Analytics. The **Storage SDK is initialized but never used** ([firebase.ts:33](../../frontend/src/lib/firebase.ts#L33), [:55](../../frontend/src/lib/firebase.ts#L55)). Exports use jsPDF 4.2.1, jspdf-autotable, docx 9.7.1 and xlsx.
- **No data-fetching library.** TanStack Query is not installed.
- **Firestore init** ([firebase.ts:58-62](../../frontend/src/lib/firebase.ts#L58)): `persistentLocalCache` with `persistentMultipleTabManager` (IndexedDB, multi-tab) at the SDK's default cache size.
- **[subscriptionManager.ts](../../frontend/src/services/subscriptionManager.ts):** shares one Firestore listener among identical queries, counts references, replays the last snapshot to late subscribers, and backs off on errors. It **tears the listener down as soon as the last subscriber leaves** ([:280-294](../../frontend/src/services/subscriptionManager.ts#L280)), so navigating between pages that use the same query re-creates it. Close to half of the listener call sites (27 of 57) call `onSnapshot` directly and skip the manager: delivery, purchasing, sub-purchasing, notifications, KPI tasks, orders (single doc and payment queue), cart, Control Center, AuthContext, storefront and recycle bin.
- **[firestoreResync.ts](../../frontend/src/services/firestoreResync.ts):** forces `disableNetwork()` then `enableNetwork()` every 10 minutes while the app is visible, after 30 s or more in the background, on `online`, and on back-forward-cache restore. It was added to recover listeners that stall silently on phones.
- **[useJobDeskSync.ts](../../frontend/src/hooks/useJobDeskSync.ts):** a 1-document server probe every 2 minutes on job-desk pages. It forces a resync when it finds the screen stale.
- **Server side:** Cloudflare Workers `al-umana-push` (FCM, cron every minute), `al-umana-invoice-api` (public invoices and checkout `POST /api/orders`) and `absensi` (D1). Workers use a service account, so they bypass rules. The Go backend in `backend/` isn't deployed for this project.

---

## 3. Collections and payloads (measured 2026-11-02)

| Collection | Docs | Typical doc (sample) | Base64 share | Notes |
| --- | ---: | --- | --- | --- |
| `notifications` | 5,096 | 0.5 KB | 0 | Queries are bounded (`limit` 30 or 15). |
| `mbg_pm_entries` | 4,352 | **230 KB** with photos (n=12, max 246 KB); about 1 KB without; one unfiltered sample doc was 646 KB | 99.5% | 1,253–1,309 rows carry each of the 4 photo fields (5,170 photos). 2,281 rows (52%) are backups. |
| `developer_recycle_bin` | 1,279 | about 1 KB; the 77 that hold archived photos are 157–173 KB | — | 1,215 come from `mbg_pm_entries`, mostly import replacements. |
| `chunks` (collection group) | 787 | up to about 700 KB | 100% | Chunks of `delivery_files` and `product_images`. |
| `mbg_nutrition` | 645 | 0.7 KB | 0 | |
| `delivery_files` | 622 files | — | — | `sum(fileSize)` = 36.3 MB raw, about 48 MB once stored as base64. |
| `orders` | 477 | 1.2 KB | ~0 | `eventDate` is an ISO string on 100% of docs. `createdAt` is mixed: 235 strings, 0 Timestamps, 242 another type or missing. 321 are "open" (not finished). |
| `catering_jobdesks` | 379 | 0.7 KB | 0 | `tanggal` is ISO on 100% of docs. |
| `mbg_pm_batches` | 326 | 0.4 KB | 0 | 98 are backups. `tanggal` is ISO on 100% of docs; 108 have `tanggal ≥ 2026-10-19`. |
| `inventory` | 225 | 0.3 KB | 0 | Public read. |
| `product_images` | 165 files | — | — | `sum(fileSize)` = 14.3 MB raw, about 19 MB as base64. |
| `mbg_delivery_tasks` | 74 | **994–1,020 KB** in 6 of 8 sampled | ~100% | The `schoolProofs` photo mirror. Statuses: waiting 64, handover_done 5, delivering 5, delivered 0. |
| `users` | 70 | — | 1 doc | One inline base64 avatar (67 KB). |
| `mbg_daily_reports` | 56 | 39.5 KB | 0 | Read in full on 4 pages. |
| `mbg_bahan_documentation` | 3 | 582 KB (max 991 KB) | 99% | Legacy inline photos from before b978f63. |
| Others | small | | | `ad_hoc_tasks` 0, `mbg_cooking_sessions` 0, `mbg_bahan_photos` 0, `reviews` 0, `payment_proofs` 0, `mbg_purchase_orders` 2, `mbg_sub_purchasing_tasks` 1. |

**Where the 704 MiB goes (estimates):**

- Entry photos: about 290 MB (5,170 photos × about 57 KB). This is a lower bound, because older rows may hold larger photos.
- Task mirrors: about 50–70 MB (from the 8-doc sample).
- `delivery_files` chunks: about 48 MB.
- `product_images` chunks: about 19 MB.
- Recycle-bin photo archives: about 13 MB.

The remainder is index entries, per-document overhead and sampling error. There are no index exemptions, so every base64 field, including each `schoolProofs.{entry}.{field}` subfield, gets an ascending and a descending index entry, each truncated to 1,500 bytes.

**Daily growth estimate:** about 31 delivered rows × 230 KB ≈ 7 MB of entry photos, plus up to about 1 MiB of mirror per task (5–8 tasks a day). That is consistent with the measured 9–14 MiB per working day, and it means the mirror is roughly half of storage growth on delivery days.

---

## 4. Read paths

### 4.1 Listeners mounted on every staff page

These persist across navigation.

| Listener | Query | Docs on cold attach | Where |
| --- | --- | ---: | --- |
| Own profile | `users/{uid}` | 1 | [AuthContext.tsx:144](../../frontend/src/contexts/AuthContext.tsx#L144) |
| Notification list | `recipientId == uid` and `== role`, `orderBy createdAt desc`, `limit 30` (2 listeners) | ≤ 60 | [notificationService.ts:101](../../frontend/src/services/notificationService.ts#L101) |
| Unread count | the same two recipients, `read == false`, `limit 15` (2 more listeners) | ≤ 30 | [notificationService.ts:180](../../frontend/src/services/notificationService.ts#L180) |
| Past-deadline dot (katering roles) | `orders` where `status not-in` finished statuses | **321** | [Sidebar.tsx:151](../../frontend/src/components/layout/Sidebar.tsx#L151) → [realtimeService.ts:222](../../frontend/src/services/realtimeService.ts#L222) |

### 4.2 Listeners that grow with the data or carry large payloads

| Function | Query | Size today | Used by |
| --- | --- | --- | --- |
| `subscribeBatches` [mbgAdminService.ts:133](../../frontend/src/services/mbgAdminService.ts#L133) | Whole collection; backups filtered on the device | 326 docs | MO Job Desk, MBG Admin, Archive, Cooking, Delivery, Distribution, Persiapan, Production, Purchasing (+Archive, +Recap), Sub-purchasing |
| `subscribeOrders()` [realtimeService.ts:187](../../frontend/src/services/realtimeService.ts#L187) | Whole collection | 477 docs | Dashboard, Delivery Scheduler, Handover, Orders, Production History, Tracking |
| `subscribeOrders(…, 200)` | `limit(200)` **without `orderBy`**, so the first 200 by document ID | 200 of 477, random | MO Job Desk [MoJobDeskPage.tsx:443](../../frontend/src/pages/katering/MoJobDeskPage.tsx#L443) |
| `subscribeAllDailyReports` [mbgProductionService.ts:253](../../frontend/src/services/mbgProductionService.ts#L253) | Whole collection | 56 × 39.5 KB ≈ 2.2 MB | MO Job Desk, Persiapan (only to build a "has report" set), Cooking, Production |
| `subscribeAllEntries(limit 300)` [mbgAdminService.ts:346](../../frontend/src/services/mbgAdminService.ts#L346) | `limit(300)` **without `orderBy`** | 300 random rows, about 20 MB (estimate: about 70 KB average) | Production archive search [MbgProductionPage.tsx:366](../../frontend/src/pages/mbg/MbgProductionPage.tsx#L366). Re-subscribes on every keystroke. |
| `subscribeAllJobDesks` [cateringJobDeskService.ts:318](../../frontend/src/services/cateringJobDeskService.ts#L318) | `orderBy tanggal desc`, `limit 300` | 300 | MO Job Desk, CO-MO Review |
| `subscribeJobDesksByRole` [:382](../../frontend/src/services/cateringJobDeskService.ts#L382) | `assignedRole in […]` plus `pic in […]`, no date bound | grows with history | Operational Job Desk |
| `subscribeKurirTasks` [mbgDeliveryService.ts:57](../../frontend/src/services/mbgDeliveryService.ts#L57) | `batchId ==` returns **every courier's** tasks; filtered on the device | about 1 MB per task | Courier MBG page |
| `subscribeDeliveryTasks` [mbgDistributionService.ts:43](../../frontend/src/services/mbgDistributionService.ts#L43) | `batchId ==` | about 1 MB per task | Distribution |
| `subscribeEntries` / `subscribeEntriesConfirmed` | `batchId ==` | about 7 MB per delivered 31-row batch | 8 pages |
| `subscribeAllBahanDocumentation` [mbgBahanService.ts:82](../../frontend/src/services/mbgBahanService.ts#L82) | Whole collection | 3 × 582 KB ≈ 1.7 MB | Bahan documentation section |
| `subscribeAllBahanChecklist` [:307](../../frontend/src/services/mbgBahanService.ts#L307), `subscribeAllDeliveryDocuments` [mbgDeliveryService.ts:419](../../frontend/src/services/mbgDeliveryService.ts#L419), `subscribeCustomTkpiEntries`, `subscribeCustomRecipes` | Whole collections | small today | Persiapan, Delivery, Production, Admin, Purchasing |
| `subscribeAllAdHocTasks` [performanceService.ts:51](../../frontend/src/services/performanceService.ts#L51) | Whole collection; docs may hold previews up to 250k chars | 0 today | Super Admin Control Center |
| `users` [SuperAdminControlCenterPage.tsx:71](../../frontend/src/pages/SuperAdminControlCenterPage.tsx#L71) | Whole collection | 70 | Super Admin |
| `subscribeRecycleBin` [developerRecycleBinService.ts:136](../../frontend/src/services/developerRecycleBinService.ts#L136) | `limit 1000`; each doc embeds the full original | up to 1,000 docs | Developer Control Center |
| `reviews` [TestimoniPage.tsx:116](../../frontend/src/storefront/pages/TestimoniPage.tsx#L116) | Whole collection (public page) | 0 today | Storefront |

`TrackingPage` reads every order and filters on the device for `OUT_FOR_DELIVERY` and the current courier. Rules don't filter query results, so a courier account running this unfiltered query would be rejected.

### 4.3 One-time reads that download photos without needing them

- `recalculateBatchTotals`, `moveBatchToBackup`, `restoreBatchFromBackup`, `copyFromBatch`, `cleanDuplicateBatchEntries` and `replaceBatchEntries` all read every entry of a batch, photos included, just to sum numbers or flip flags ([mbgAdminService.ts:484-813](../../frontend/src/services/mbgAdminService.ts#L484)).
- Regenerating a PDF from an archived document reads the batch's entries **and** its tasks, so the photos download twice ([MbgDeliveryPage.tsx:713](../../frontend/src/pages/mbg/MbgDeliveryPage.tsx#L713), [MbgDistributionPage.tsx:811](../../frontend/src/pages/mbg/MbgDistributionPage.tsx#L811), [:908](../../frontend/src/pages/mbg/MbgDistributionPage.tsx#L908)).
- `countRecycleBinRecords` reads 250 full archive docs just to count them ([developerRecycleBinService.ts:250](../../frontend/src/services/developerRecycleBinService.ts#L250)).
- Chunked files are rebuilt from the server on every view, in every session. Each view is one parent read plus one read per chunk. The helper is written five times: [deliveryFileService.ts](../../frontend/src/services/deliveryFileService.ts), OrdersPage, ProductionHistoryPage, TestimoniPage, and [useProductImage.ts](../../frontend/src/hooks/useProductImage.ts) (whose cache lives in memory only).

### 4.4 Estimated cost of a cold page open

A cold open is the first open of the day, or any open after more than 30 minutes away. The estimates come from the listener inventory and the measured collection sizes. They exclude rule-dependent reads and still need to be confirmed by measurement.

| Page (role) | Docs read | Download |
| --- | ---: | --- |
| MO Job Desk (`mo_katering`): job desks 300 + orders 200 + batches 326 + daily reports 56 + Sidebar 321 + notifications ≤ 91, plus entries of future batches | ~1,300 + entries | ~2.5 MB + entries |
| Orders, Dashboard, Handover, Delivery Scheduler, Production History, Tracking: orders 477 + Sidebar 321 + notifications | ~900 | ~1 MB |
| Courier MBG delivery: batches 326 + one batch's entries + all of its tasks + documents | ~370 | **~12–15 MB per delivered batch** |
| Distribution MBG: the same plus courier list | ~370 | ~12–15 MB |
| Persiapan MBG: batches 326 + daily reports 56 + checklists + bahan documents | ~390 | ~4 MB |
| Production archive search | 300 per search | ~20 MB |
| Developer Control Center (recycle bin) | up to 1,000 | ≥ 13 MB |

With at most 8 concurrent connections measured, this reopen pattern is consistent with the observed 10k–27k reads on typical days. Spark also caps outbound data at **10 GiB a month**. Cloud Monitoring exposes no egress metric for this project, so egress is unmeasured, but the photo payloads above make it a plausible next limit.

---

## 5. How base64 is written and read

| Data | Encoding (max side / quality / format) | Stored in | Read by |
| --- | --- | --- | --- |
| MBG courier proofs (4 per school) | `compressImageBase64` 640 px / 0.65 / JPEG [mbgDeliveryService.ts:166](../../frontend/src/services/mbgDeliveryService.ts#L166) | inline in `mbg_pm_entries.photo*Url` **and** mirrored to `mbg_delivery_tasks.schoolProofs.{entryId}.photo*Url` | every entries or tasks listener |
| Rotated proof | 640 px / **0.8** / JPEG [rotatePhoto.ts:2](../../frontend/src/utils/rotatePhoto.ts#L2): re-encoding a 0.65 JPEG makes it larger and loses quality | entry only | — |
| Catering proofs, handover photos, signatures | 1280 px / 0.8 in [ProofCapture.tsx:62](../../frontend/src/components/delivery/ProofCapture.tsx#L62), then 1024 px / 0.75 in [chunkUploadService.ts:421](../../frontend/src/services/chunkUploadService.ts#L421) | `delivery_files/{id}/chunks/{i}` (512 KB slices as base64 strings) | parent read + N chunk reads on every view |
| Product images | chunk protocol, 1024 px / 0.75 JPEG, **no white fill** | `product_images/{id}/chunks` | `useProductImage` (memory cache per session) |
| KPI task evidence | preview up to 250k chars (1920→640 px ladder); original up to 10 MB as `Bytes` | `ad_hoc_tasks.evidencePhoto` + `evidence_chunks` | 0 docs today |
| Bahan documentation | 480 px / 0.5 JPEG | `mbg_bahan_photos`, one photo per doc (since b978f63); 3 legacy inline docs | per batch |
| Cooking photos | 600 px / 0.6 | inline array `mbg_cooking_sessions.photos` | 0 docs today |
| PO photo, PO item photos, sub-purchasing item photos | 1000 px / 0.7 · 800 px / 0.75 · 800 px / 0.75 | inline arrays inside a single doc | 3 docs today |
| Staff and customer avatar | **none**: raw `readAsDataURL` of a file up to 1 MB | `users.photoURL` | users listeners; 1 doc today |
| Invoice signature | PNG data URL | `orders.invoiceSignatureData` | 3 docs |

**Problems:**

1. There are 7 separate compressors with different settings, and only `evidencePhoto` enforces a byte budget.
2. `chunkUploadService.compressImage` doesn't paint a white background, so transparent product PNGs come out black. This is the same bug fixed for PDF logos in b978f63. It also doesn't keep the original when the original is smaller.
3. Avatars aren't compressed. A 1 MB file becomes about 1.37 MB of base64, which is over the 1 MiB document limit, so the save fails.
4. Inline photo arrays (purchase orders, sub-purchasing, cooking) will reach 1 MiB at about 10–20 photos per doc.
5. 640 px may be too small to read the text on *surat jalan* (delivery note) photos. This needs a visual check with real samples, which I didn't do because the photos contain personal data.
6. Rules don't limit the size or type of base64 fields written by clients.

**PDF:** nothing is stored. Generated file size grows for three reasons:

- Photos are re-encoded at JPEG 0.92 from 0.65 sources ([mbgDeliveryReportPdfExporter.ts:57](../../frontend/src/utils/mbgDeliveryReportPdfExporter.ts#L57), [cateringDeliveryReceiptPdfExporter.ts:48](../../frontend/src/utils/cateringDeliveryReceiptPdfExporter.ts#L48)).
- None of the 12 `new jsPDF({...})` calls sets `compress: true`.
- A few page-level helpers convert images to PNG.

Word exports use `docx` 9.7.1, whose `ImageRun` accepts only `jpg | png | gif | bmp`. **WebP photos would therefore need converting during Word export.**

---

## 6. Caching today

- **Firestore's persistent cache** (IndexedDB) is the only cache that survives a reload. Listeners show cached results first, then server changes, and can resume within 30 minutes.
- **subscriptionManager** shares identical listeners while they are active. It doesn't keep a listener alive after the last subscriber leaves.
- **`useProductImage`** keeps an unbounded in-memory map of assembled images, which is lost on reload.
- **`catalogService`** keeps a demo-product cache in localStorage.

**Gaps:**

1. Immutable attachments (chunks, photos) are re-downloaded every session, because `getDoc` and `getDocs` go to the server whenever the device is online.
2. Listeners are torn down on every navigation.
3. The cache is shared by every account on a device and is never cleared: no call to `clearIndexedDbPersistence` or `terminate`.

---

## 7. Security rules review

I read `firestore.rules` in full.

**Strengths:**

- Default deny, with a separate developer break-glass role.
- Explicit rules per collection.
- Field-level `affectedKeys().hasOnly` limits on role updates.
- KPI submissions must carry the server time.
- Chunk writes are checked against the file's owner.
- Push device IDs are a hash of the token.
- Checkout pricing moved to a server Worker.

**Findings:**

1. **Role lookups go through `get(users/{uid})`** ([firestore.rules:38-235](../../firestore.rules#L38)). Each evaluation bills a dependent read. For listeners that happens on attach, on every result update and on every offline-to-online transition. Firebase Auth custom claims would remove these reads, but they need a trusted service to set them (for example a service-account Worker) and a token refresh after each role change.
2. **`developer_recycle_bin` accepts creates from any signed-in user** whose `deletedBy == uid` ([:283](../../firestore.rules#L283)). Customers can therefore write documents up to 1 MiB each, which is a storage-exhaustion path while storage is near the cap. Restrict creates to staff roles and validate the document shape.
3. **No size or type validation on client-written base64**: `mbg_pm_entries` photo fields ([:736](../../firestore.rules#L736)), `schoolProofs`, `users.photoURL` ([:499](../../firestore.rules#L499)), cart items (any shape, [:420](../../firestore.rules#L420)), bahan photos, cooking and purchase-order photos.
4. **`users` get and list for every order-staff role, couriers included** ([:480-485](../../firestore.rules#L480)). This exposes customers' phone numbers and saved addresses. Limiting it is a data-minimization choice for you.
5. **`notifications` are readable by any order-staff role** ([:606](../../firestore.rules#L606)). They could be limited to the recipient and the recipient's role.
6. Public reads on `product_images`, `inventory`, `promos` and `reviews` are intentional. Testimonial photos live in `delivery_files`, which only staff and the uploader can read, so public visitors can't see them. That is a feature bug, not a leak.
7. **Offline cache isn't cleared when the account changes.** On a shared phone, the next user's first snapshots can show the previous user's cached documents.

**Encryption.** Firestore already encrypts data at rest and TLS protects it in transit. Application-level AES-256-GCM would only add protection against people who can read the database directly (project owners and service accounts). Every authorized client would still need the keys, released by a server, so access would still depend on Firebase Auth. It would also break developer repair tools and recycle-bin restore, and photos would have to be decrypted before every PDF or DOCX export.

**Recommendation: don't add application-level encryption now.** Revisit it only for a concrete requirement such as regulated personal data with its own key-custody policy. If it is ever adopted:

- a random data key per file, used with AES-GCM via WebCrypto;
- that data key wrapped by a key-encryption key held as a Worker secret;
- an unwrap endpoint authorized by the Firebase ID token and role;
- keys never stored in Firestore next to the ciphertext, and never in frontend code.

---

## 8. Indexes

- **Configuration isn't in the repo.** `firebase.json` has no `indexes` entry and there is no `firestore.indexes.json`. Live: one composite index (`notifications`: `recipientId` ASC, `createdAt` DESC, `__name__` DESC) and **no field overrides**.
- **Missing index, failing in production:** `mbg_delivery_documents` (`batchId` ASC, `createdAt` DESC), used by `subscribeBatchDeliveryDocuments` on the Distribution page. A REST query of that shape returned `FAILED_PRECONDITION: The query requires an index`. The listener has no error callback, so the failure is silent.
- **Unused functions that would fail for lack of an index:** `subscribeDeliveryDocuments`, `subscribeMySubPurchasingTasks` and `getJobDesksByOrder`.
- **No exemptions for large fields.** Every base64 field is indexed. Exempting them reduces index storage and write latency. Spark allows 200 single-field configurations; about 20 are needed. None of these fields is used in a filter or `orderBy`.
- **Deploy safety:** export the live indexes into `firestore.indexes.json` before the first `firebase deploy --only firestore:indexes`. Otherwise the CLI will propose deleting the `notifications` index.

---

## 9. Production measurements (Cloud Monitoring)

**Reads per quota day** (the quota day starts at 14:00 WIB):

| Day | Reads | Writes | Deletes | Max concurrent listeners | Max connections |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10-19 | 33,846 | 473 | 0 | 47 | 4 |
| 10-22 | 27,145 | 778 | 0 | 40 | 4 |
| 10-24 | 2,384 | 98 | 0 | 7 | 2 |
| 10-26 | **93,115** | 476 | 66 | 63 | 6 |
| 10-27 | **51,342** | 951 | 72 | 81 | 7 |
| 10-28 | 22,081 | 942 | 32 | 64 | 7 |
| 10-29 | 22,364 | 419 | 1 | 76 | 4 |
| 10-30 | 13,289 | 130 | 0 | 67 | 8 |
| 10-31 | 10,527 | 182 | 1 | 42 | 4 |
| 11-01 | 12,096 | 82 | 0 | 60 | 3 |

- **Read types:** `QUERY` is more than 99.5% every day; `LOOKUP` is 13–234 a day.
- **Storage:** 650.6 MiB on 10-26, rising to 704.2 MiB on 11-02.
- **Rule evaluations (LIST):** 3.4k–27.4k a day. Hour by hour on 10-28 and 10-29, each concurrent listener received about 15–22 evaluations per working hour.
  - In some hours, LIST plus GET evaluations exceeded `read_count`. For example, at 12:00 WIB on 10-29 there were 857 reads against 1,197 evaluations.
  - So `read_count` probably excludes rule-dependent reads, and the quota actually consumed may be higher than the metric shows. This is unverified.
- **`RunQuery` requests:** about 1,500–3,100 a day with a mean of about 0 results. This is the push Worker cron.

---

## 10. Other defects found during the audit

1. **MO order list:** a random 200 of 477 orders (§4.2).
2. **Production archive search:** covers about 7% of rows (§4.2).
3. **Distribution delivery-document list:** missing index (§8).
4. **Delivery-task docs are at 1 MiB.** Mirror writes fail with only a `console.warn`. Deleting one of these tasks will probably fail too, because the recycle-bin record wraps the original document plus metadata and would exceed 1 MiB.
5. **No delivery task has ever reached `delivered`** (64 waiting, 5 handover_done, 5 delivering). This may be the intended workflow; please confirm.
6. **Product images:** a transparent PNG becomes a JPEG with a black background.
7. **Avatars** larger than about 750 KB can't be saved.
8. **Testimonial photos** are unreadable for public visitors.
9. **Firebase Storage SDK** is initialized but unused, which adds bundle weight and contradicts the no-Storage policy.

---

## Phase 2: optimization plan (proposal, awaiting approval)

### Target architecture

1. **Separate MBG proof photos from row metadata.**
   - `mbg_pm_entries` keeps about 1 KB of metadata plus small photo descriptors (version, size, description, time, location).
   - The photo bytes move to **`mbg_pm_entry_photos/{entryId}`**: one document per school row holding up to 4 proofs, about 230 KB, well under 1 MiB.
   - Photos are read only when a school card is opened, a photo is edited, or a PDF is generated. Tasks stop mirroring photos.
   - *Why one document per row rather than per photo:* the delivery report needs all 4 photos for every school. Per row costs 1 read per school; per photo would cost 4. The encoder's byte budget keeps the 4 photos under about 900 KB.
2. **Every growing query gets a bound, an order and an index.**
   - Date windows on `tanggal` and `eventDate` (both 100% ISO strings).
   - Cursor pagination (`orderBy` + `limit` + `startAfter`) for archives and history.
   - `limit(1)` existence queries for indicator dots.
   - Server-side filters instead of filtering on the device (courier tasks by `petugasId` or `kenekId`).
   - **Never `limit()` without `orderBy`.**
3. **One image pipeline** with presets per purpose, byte budgets, a white background for transparency, and no re-encode when the image is already within budget. WebP is optional.
4. **Firestore's persistent cache stays the only cache.** Add a 60 s listener linger, cache-first reads for immutable attachments, and clearing the cache when the account changes. **TanStack Query isn't recommended:** the app is driven by realtime listeners, Firestore already caches and invalidates listener data, and a second cache would duplicate it and add invalidation and auth-switch bugs.
5. **A versioned `firestore.indexes.json`** with base64 index exemptions and the required composite indexes.
6. **Fewer forced reconnects** and a slower push cron.
7. **Rules hardening** with emulator tests.
8. **Monitoring:** a repo script that reads Cloud Monitoring, plus an opt-in read meter in the client.

### Work items in priority order

Each item can be deployed on its own.

#### P0: quick fixes, low risk

| ID | Change | Files | Effect |
| --- | --- | --- | --- |
| P0.1 | MO orders: replace `limit(200)` with an `eventDate` window (for example today −7 days onward), ordered by `eventDate` | `realtimeService.ts`, `MoJobDeskPage.tsx` | Correct list; about 80–100 docs today instead of a random 200 |
| P0.2 | Production archive search: query per batch or with an indexed filter, debounce the input, and stop re-subscribing on every keystroke | `MbgProductionPage.tsx`, `mbgAdminService.ts` | Full coverage; far fewer reads and MB |
| P0.3 | Distribution delivery documents: drop `orderBy` and sort on the device (4 docs), and add error callbacks. Alternative: add the composite index | `mbgDeliveryService.ts` | The list works |
| P0.4 | **Stop copying photos into `schoolProofs`.** Keep the descriptive fields. Every reader already uses `entry photo ‖ task mirror` ([MbgDeliveryPage.tsx:214](../../frontend/src/pages/mbg/MbgDeliveryPage.tsx#L214), [:758](../../frontend/src/pages/mbg/MbgDeliveryPage.tsx#L758), [MbgDistributionPage.tsx:2024](../../frontend/src/pages/mbg/MbgDistributionPage.tsx#L2024), [mbgDeliveryReportPdfExporter.ts:602](../../frontend/src/utils/mbgDeliveryReportPdfExporter.ts#L602)). Deletes must keep clearing legacy mirror fields, or the fallback would bring a deleted photo back | `mbgDeliveryService.ts` | Roughly halves photo storage growth on delivery days (estimate); unblocks task writes |
| P0.5 | Push cron from `* * * * *` to `*/5 * * * *` *(your decision)* | `workers/push/wrangler.toml` | About −1,150 reads a day; up to 5 minutes' extra delay, only for missed kicks |
| P0.6 | Sidebar dot: a bounded existence query (`limit(1)` to `limit(20)`, with a composite index) whose predicate reproduces `isOrderPastDeadline` | `Sidebar.tsx`, `realtimeService.ts` | 321 → ≤ 20 docs per cold open |
| P0.7 | `countRecycleBinRecords` uses `getCountFromServer` | `developerRecycleBinService.ts` | 250 → 1–2 reads |
| P0.8 | Remove the unused Storage SDK initialization | `lib/firebase.ts` | Smaller bundle |

#### P1: separate photos from entry metadata

This is the main architectural change. It runs as expand, switch, migrate, then contract, because the PWA prompt mode keeps old builds in use for days.

- **A. Expand.** Add the new collection, its rules and index exemptions. Readers accept both the old inline format and the new one, and so do `hasCompleteMbgProof` and the PDF/DOCX exporters (through one photo service). Deploy hosting and rules together, as in the bahan incident.
- **B. Switch writers.** New uploads write the photo doc and the entry descriptor in one `writeBatch`. Old builds keep writing inline photos, and readers keep supporting that. Optionally, after a cut-off date you choose, rules reject new inline photo writes, which forces old builds to update.
- **C. Migrate** (script, at night, one batch at a time, idempotent). Copy the inline photos into the new docs, taking the entry's photo first and the legacy task mirror only when the entry has none. Verify them byte for byte, then remove the inline fields from that batch only. One batch at a time is deliberate: **copying everything first would temporarily add about 290 MB and could cross 1 GiB.** Removing the inline fields is **destructive, so it needs your explicit approval.** An optional local JSON backup first would cost about 4.4k reads at night.
- **D. Remove existing mirrors** from the 74 task docs, freeing an estimated 50–70 MB. **Needs your explicit approval.**

**Result:**

- Listing a delivered 31-row batch drops from about 7 MB to about 34 KB.
- Courier and distribution pages stop downloading about 1 MB per task.
- Each opened school costs 1 extra read; PDF generation reads one photo doc per school.

#### P2: bound the remaining listeners

- **`subscribeBatches`:** operational pages use `tanggal ≥ today − N`; archive pages paginate 20 at a time. Backups get their own `isBackup == true` query. Excluding them on the server needs `isBackup: false` written on active batches (a non-destructive backfill of 228 docs), or the device filter can stay inside the window.
- **`subscribeOrders()`:** windowed `eventDate` queries on operational pages; cursor pagination on `eventDate` for history pages. `createdAt` has mixed types, so it can't be used for ordering.
- **`subscribeAllDailyReports`:** read only the batches on screen, or add a `hasDailyReport` flag to the batch doc when a report is saved.
- **`subscribeJobDesksByRole`:** add `tanggal ≥ today − N`, which needs composite indexes on (`assignedRole`, `tanggal`) and (`pic`, `tanggal`).
- **`subscribeKurirTasks`:** filter on the server with `batchId ==` and `petugasId == uid`, plus a second query on `kenekId == uid`.
- **Recycle bin:** pages of 50 using a cursor; store summary fields when archiving; never load `originalData` for the list.
- **Bahan documentation:** list metadata only. The 3 legacy docs migrate on their next save.

#### P3: listener lifecycle and reconnect policy

- `subscriptionManager` keeps a listener alive for 60 s after its last subscriber leaves.
- `firestoreResync`: periodic resync from 10 to 30 minutes, or replace it with a probe-based resync like `useJobDeskSync` *(your decision)*. Raise the background threshold from 30 s to 2–5 minutes. Measure the effect with rule evaluations per listener-hour.
- Merge the notification-list and unread-count listeners (4 → 2).

#### P4: attachment caching

- **One shared `chunkedFileService`** replaces the 5 duplicated helpers. It reads cache-first, because completed chunked files never change, and falls back to the server on a miss or an incomplete set.
- Photo docs from P1 are read cache-first, keyed by the `version` in the entry descriptor.
- Optionally raise Firestore `cacheSizeBytes` above the SDK default *(your decision: it costs device storage)*.
- Clear persistence when a **different** user signs in on the device. The same user signing in again keeps the cache.

#### P5: image pipeline

- **`utils/imagePipeline.ts`:**
  - decodes with `createImageBitmap`, which respects EXIF orientation;
  - has presets: proof photo, document photo (larger for *surat jalan* legibility), product image, avatar (256 px), thumbnail;
  - steps down quality until the image fits its preset's byte budget;
  - paints a white background behind transparency;
  - skips re-encoding when the image is already within budget and size.
- **WebP** is used only where the browser can encode it **and** the export path converts it back to JPEG for DOCX *(your decision)*.
- Fix avatars.
- Measure before and after on a fixed set of your sample photos (size, plus a visual check of legibility).

#### P6: PDF exports

This has no Firestore effect; it reduces download and sharing size.

- Embed the stored JPEGs as they are, without re-encoding at 0.92.
- Turn on `compress: true`.
- Measure file sizes before and after on emulator data.

#### P7: indexes

1. Generate `firestore.indexes.json` from live.
2. Add `"indexes"` to `firebase.json`.
3. Add exemptions for: `mbg_pm_entries.photo*Url` (4 fields), `mbg_delivery_tasks.schoolProofs`, `chunks.data` (collection group), `evidence_chunks.data`, `ad_hoc_tasks.evidencePhoto`, `mbg_bahan_photos` photo field, `mbg_bahan_documentation.items`, `mbg_cooking_sessions.photos`, `mbg_purchase_orders.photos` and `.items`, `mbg_sub_purchasing_tasks.items`, `users.photoURL`, `orders.invoiceSignatureData` and `.kitchenSignatures`, `developer_recycle_bin.originalData`, and the new `mbg_pm_entry_photos` payload.
4. Add the composite indexes required by P0–P2.

#### P8: rules hardening

All with emulator tests.

- Recycle-bin creates limited to staff, with required fields and a size limit.
- Size and type limits on base64 fields, and rules for the new photo collection.
- *(Your decision)* Tighten `users` list and `notifications` read, after confirming with tests that no screen depends on them.
- *(Optional, larger)* Role custom claims to remove the `get(users)` dependent reads.

#### P9: monitoring

- **`scripts/firestore-usage.mjs`** in the repo: read-only, uses the existing firebase-tools login. Reports per quota day: reads, writes, deletes, peak listeners, rule evaluations, storage, and the projected date of reaching 1 GiB.
- **An opt-in client read meter**, shown to the developer role or enabled with a localStorage flag. Per query key it records:
  - number of listener attaches;
  - documents delivered by the server versus served from cache;
  - approximate bytes;
  - time to the first snapshot;
  - attachment downloads.

  It shows a panel in the Developer Control Center and logs only collection paths and field names, never values. It approximates billed reads and can't see rule-dependent reads.

#### P10: storage retention *(your decision)*

Set a policy for photos older than N months: export them to your own archive, then delete them from Firestore. On Spark this is needed eventually, because delivery photos keep growing linearly (an estimated ~5–7 MiB a day even after P0.4). For reference only, not a recommendation: Blaze keeps the same free tier and charges per GiB above it.

### Expected effect

All of these are estimates from measured counts and must be confirmed by measurement.

| Item | Before (measured basis) | After (estimate) |
| --- | --- | --- |
| MO Job Desk cold open | ~1,300 docs + entries, ~2.5 MB | ~350–450 docs, < 1 MB |
| Sidebar dot | 321 docs per cold open | ≤ 20 |
| `subscribeBatches` per cold attach | 326 | ~30–110, depending on the window |
| Courier or distribution batch view | ~12–15 MB | ~0.1 MB list + ~0.23 MB per opened school |
| Production archive search | 300 random rows, ~20 MB, ~7% coverage | per-batch or indexed, full coverage, < 0.5 MB |
| Storage growth | 9–14 MiB per working day | roughly halved by P0.4; further reduced by P5 |
| Push cron | ~1,440 reads a day | ~290 (every 5 minutes) |
| Rule re-evaluations | 15–22 LIST per listener-hour | measured after P3 |

Daily read totals depend on how often staff reopen the app, so each phase will be compared on equivalent weekdays.

### Measurement plan

1. Before each deploy, record 3 comparable weekdays: `read_count`, rule LIST and GET evaluations, peak listeners, and storage per day (P9 script).
2. Run a controlled night-time test. Night hours are near zero apart from the cron. One device opens each key page cold, and reads are recorded per minute. The emulator can't measure billing, so this has to run against production.
3. Record client read-meter numbers per page before and after, using a dev build against the emulator.

### Risks

- **Mixed client versions** during format changes, because of PWA prompt mode. Mitigation: expand, switch, migrate, contract; readers support both formats; rules accept both until the contract step.
- **Rules and hosting must be deployed together** for new collections. Precedent: the bahan incident on 2026-10-31.
- **Migration pacing:** about 2.6k writes and 1.3k–4.4k reads, spread out so storage never spikes.
- **Date windows hide older records**, so every windowed screen needs an explicit "older" path through pagination.
- **Index deploys can delete indexes** created in the console if the file is incomplete. Export the live indexes first.
- **Fewer forced reconnects can bring back stale screens** on some phones. Keep probe-based recovery and measure.
- **WebP breaks DOCX export** unless photos are converted during export.
- **Clearing the cache on an account change** costs one cold load for the new user.

### Decisions needed from you

1. **Scope:** approve P0 as a whole, or pick items.
2. **P1 design:** one photo doc per row (recommended) or one per photo. Rollout: read both formats now and switch writers later; and do you want a forced-update cut-off date?
3. **Destructive steps, each approved separately:** removing inline photos after they are copied (P1-C); removing task mirrors (P1-D); purging recycle-bin photo archives; a photo retention policy (P10).
4. **Reconnect policy:** resync every 10 or 30 minutes, or probe-only; background threshold 30 s or 5 minutes.
5. **Push cron:** every 5 minutes?
6. **Photos:** keep JPEG with a byte budget, or WebP with DOCX conversion; and the resolution for *surat jalan* photos.
7. **Rules:** tighten `users` list and `notifications` read? Add custom claims?
8. **Cache:** clear the offline cache when the account changes? Raise `cacheSizeBytes`?

---

## Appendix: measurement scripts

All are read-only. They live in the session scratchpad: `D:\Temp\claude\d--Documents-Al-umana\02f72b7d-4e00-4b12-8642-f20bf8823f0e\scratchpad\audit\`

- `monitor.mjs`, `monitor2.mjs`, `hourly.mjs`: Cloud Monitoring; 0 Firestore reads.
- `probe.mjs` (148 reads), `probe2.mjs` (31 reads), `shapes.mjs` (~12 reads): aggregations and samples. Output is sizes and counts only.
