# Clock Out Telat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee who forgot to clock out still clock out until 23:59 WIB the next day; a clock out after the day changed needs a reason and goes to admin as pending (Setujui / Tolak), visible in approvals, rekap and export.

**Architecture:** One pure rule module in `workers/absensi/shared/time.js` decides "expired" and "late" for both Worker and frontend. A new D1 table `late_clockout_exceptions` mirrors `silah_exceptions`; it is joined into every shift read as `lateOut`, and a rejected review is applied in `toShiftView` (status `lupa_pulang`, no duration) without touching the stored shift. Frontend reuses the Silah/zone patterns: a notice modal before the flow, an ApprovalBoard section, and the existing `zoneNotes`/`worstZoneStatus` rekap marking.

**Tech Stack:** Cloudflare Worker + D1 (`node --test`, wrangler platform proxy), React + Vite + Vitest + Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-14-clock-out-telat-design.md`

## Global Constraints

- All times WIB (UTC+7). Server time is the only clock that counts; the frontend rule is only for showing the pop-up early.
- A shift is closable until 23:59:59 WIB of `work_date + 1`; from `work_date + 2` 00:00 WIB it is `lupa_pulang` for good.
- Late clock out: clock in before 20:00 WIB → late when the clock-out WIB date is after the clock-in WIB date. Clock in at 20:00 WIB or later → late only after 12:00 WIB of the next day (12:00 exactly is still on time, 12:01 late; same convention as `isLateClockIn`).
- Late reason: 3–300 chars after whitespace collapse (`LATE_REASON_MIN`/`LATE_REASON_MAX`), body field `lateOutReason`, missing → `ALASAN_CLOCK_OUT_TELAT` (422).
- Review is only `approve` / `reject`. Never write to `shifts.pulang_at`/`masuk_at` because of a review.
- Approvers: admin absensi (all) + kepala unit (own unit, not self), via existing `canReview`.
- Pending never blocks the employee; only an *open* shift blocks the next clock in (existing `SUDAH_CLOCK_IN`).
- UI copy is Indonesian. Pop-up title: "Sudah ganti hari".
- Do not commit or deploy unless the user asks in that request. Deploy order when asked: D1 migration 0009 → Worker → hosting.

## Review Focus

1. Night shift (clock in 23:00, clock out 07:00 next day) must not get the pop-up or a pending item → test in Task 1 and Task 4.
2. Stacked pendings: 1 Des, 2 Des, 3 Des late clock outs each create their own item and none blocks the next day's clock in → test in Task 4.
3. Old app without `lateOutReason` doing a late clock out gets `ALASAN_CLOCK_OUT_TELAT` *before* the challenge is consumed (so after "Perbarui" the retry works) → test in Task 4.
4. Rejected late clock out shows "Tidak clock out" in employee Riwayat, admin Rekap and export, counts in `tidakClockOut`, not in `totalMenit` → tests in Task 3 and Task 5.
5. Late clock out that is also outside the zone produces two separate pending items, each reviewable alone → test in Task 4.

---

### Task 1: Shared expiry and lateness rules

**Files:**
- Modify: `workers/absensi/shared/constants.js`, `workers/absensi/shared/constants.d.ts` (remove `OPEN_SHIFT_MAX_MS`, add the two constants)
- Modify: `workers/absensi/shared/time.js`, `workers/absensi/shared/time.d.ts`
- Test: `workers/absensi/test/shared.test.mjs`

**Interfaces:**
- Produces: `NIGHT_SHIFT_FROM_MINUTE_WIB = 20 * 60`, `NIGHT_SHIFT_OUT_UNTIL_MINUTE_WIB = 12 * 60`;
  `isShiftExpired(workDate: string, nowMs: number): boolean` (true when `workDateWIB(nowMs) > addDays(workDate, 1)`);
  `isLateClockOut(masukAt: number, nowMs: number): boolean`.

- [ ] **Step 1: Write failing tests** in `shared.test.mjs`, `describe("clock-out rules")`, with `wib(y,m,d,h,min)` as in `shifts.test.mjs`:
  - `isShiftExpired("2026-12-01", wib(2026,12,2,23,59))` → false; `wib(2026,12,3,0,0)` → true.
  - normal shift masuk `wib(2026,12,1,7,0)`: out `wib(2026,12,1,23,59)` → false; `wib(2026,12,2,0,1)` → true.
  - night shift masuk `wib(2026,12,1,23,0)`: out `wib(2026,12,2,7,0)` → false; `wib(2026,12,2,12,0)` → false; `wib(2026,12,2,12,1)` → true.
  - masuk exactly `wib(2026,12,1,20,0)` counts as night; `wib(2026,12,1,19,59)` does not (out at `wib(2026,12,2,6,0)` → false vs true).
- [ ] **Step 2:** `cd workers/absensi && npm test` → new tests FAIL (not exported).
- [ ] **Step 3:** Implement both functions in `time.js` (use `minuteOfDayWIB`, `workDateWIB`, `addDays`), add constants, update both `.d.ts` files. Remove `OPEN_SHIFT_MAX_MS` from constants (its users are fixed in Task 2 and Task 6; the build will fail until then, so do Task 2 right after).
- [ ] **Step 4:** Run the new `shared.test.mjs` cases → PASS.

### Task 2: Stale shifts by date instead of 20 hours

**Files:**
- Modify: `workers/absensi/src/shifts.js:6-11` (stale check), `workers/absensi/src/cron.js`, `workers/absensi/src/db.js` (`markStaleShifts`)
- Test: `workers/absensi/test/shifts.test.mjs`, `workers/absensi/test/cron.test.mjs`, `workers/absensi/test/admin.test.mjs:109`

**Interfaces:**
- Consumes: `isShiftExpired` (Task 1).
- Produces: `markStaleShifts(db, beforeWorkDate: string): Promise<number>` sets `lupa_pulang` where `status='terbuka' AND work_date < beforeWorkDate`; cron passes `addDays(workDateWIB(nowMs), -1)`.

- [ ] **Step 1: Replace the two 20h tests in `shifts.test.mjs`** with:
  - "open shift from 2 days ago reads as lupa_pulang before cron ran": row work_date `2026-10-26` masuk 07:00, now `wib(2026,10,28,0,0)` → `s.open === null`, `s.last.status === "lupa_pulang"`, pulang → `BELUM_CLOCK_IN`, masuk → insert.
  - "open shift can still clock out until 23:59 the next day": same row, now `wib(2026,10,27,23,59)` → pulang action `close`, masuk code `SUDAH_CLOCK_IN`.
- [ ] **Step 2: Update `cron.test.mjs`**: "old" shift `workDate: "2026-10-25"` (T0 is 27 Okt) → `lupa_pulang`; add "yesterday" shift for a second employee `workDate: "2026-10-26"` → stays `terbuka`; `stale: 1`. Update `admin.test.mjs:109` to `markStaleShifts(env.DB, "<date that marks the intended shift>")`.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement: `toShiftView` uses `isShiftExpired(row.work_date, nowMs)`; cron and `markStaleShifts` as in Interfaces.
- [ ] **Step 5:** `npm test` (whole Worker suite) → PASS.

### Task 3: Table, queries and shift view for late clock outs

**Files:**
- Create: `workers/absensi/migrations/db/0009_late_clockout_exceptions.sql`
- Modify: `workers/absensi/src/db.js` (`ZONE_COLUMNS`, `ZONE_JOINS`, new section after Silah, `countPendingApprovals`, `deleteShiftsForReset`, `resetShiftPulangForSimulasi`)
- Modify: `workers/absensi/src/shifts.js` (`toShiftView`), `workers/absensi/src/requests.js` (`toLateOutExceptionView`)
- Test: `workers/absensi/test/shifts.test.mjs`, `workers/absensi/test/db.test.mjs`

**Interfaces:**
- Produces (db.js): `insertLateOutException(db, { id, shiftId, uid, workDate, at, reason, photoId, createdAt })`, `getLateOutException(db, id)`, `listLateOutExceptions(db, { status, teamOf, limit = 200 })`, `reviewLateOutException(db, id, { status, reviewedBy, reviewedAt, reviewNote }) → changes`. Same SELECT shape as `SILAH_EX_SELECT` (adds `employee_name`, `reviewer_name`, `unit_name`).
- Produces (columns): `lx.id AS late_out_id, lx.status AS late_out_status, lx.reason AS late_out_reason, lx.at AS late_out_at` via `LEFT JOIN late_clockout_exceptions lx ON lx.shift_id = s.id`.
- Produces (view): `ShiftView.lateOut: { id, status, reason, at } | null`. When `lateOut.status === "rejected"`: `status: "lupa_pulang"`, `pulangAt: null`, `durationMin: null` (raw clock-out time stays in `lateOut.at` and in the `shifts` row).
- Produces (requests.js): `toLateOutExceptionView(row)` = `toSilahExceptionView` fields plus `masukAt: number` (add `s.masuk_at AS masuk_at` to the SELECT by joining `shifts s ON s.id = x.shift_id`).

- [ ] **Step 1:** Write the migration: columns as `silah_exceptions` in `0008`, table `late_clockout_exceptions`, `UNIQUE INDEX ... (shift_id)`, indexes `(status, created_at DESC)` and `(uid, created_at DESC)`. Header comment in Indonesian like 0008: "Clock out lewat pergantian hari ... Ditolak = shift itu dihitung tidak clock out."
- [ ] **Step 2: Failing tests** in `shifts.test.mjs`: `toShiftView` on a `selesai` row with `late_out_id/status/reason/at` → `lateOut` filled, status `selesai`, duration computed for `pending` and `approved`; for `rejected` → `status "lupa_pulang"`, `pulangAt null`, `durationMin null`, `lateOut.at` = raw pulang. Row without columns → `lateOut: null` (update the existing "toShiftView maps columns" expectation to include `lateOut: null`).
- [ ] **Step 3: Failing test** in `db.test.mjs`: insert a shift + late exception, `countPendingApprovals` counts it, `deleteShiftsForReset` and `resetShiftPulangForSimulasi` delete it.
- [ ] **Step 4:** Run → FAIL. Implement. Run whole Worker suite → PASS.

### Task 4: Worker clock-out flow, review endpoints, lists

**Files:**
- Modify: `workers/absensi/src/handlers/karyawan.js` (`absen`, new `parseLateOutReason`, `checkLateClockOut`, `recordLateClockOut`)
- Modify: `workers/absensi/src/approval.js` (`reviewLateOutAs`)
- Modify: `workers/absensi/src/handlers/admin.js` (approval list ~l.151, rekap row mapping ~l.137, Hari Ini ~l.106, `reviewLateOutAdmin`), `workers/absensi/src/handlers/tim.js` (list ~l.23, `reviewTimLateOut`), `workers/absensi/src/worker.js` (routes)
- Create test: `workers/absensi/test/late-clockout.test.mjs` (copy the `signedBody`/`absen` harness from `absen.test.mjs`; units/kepala unit setup from `unit-approval.test.mjs`)

**Interfaces:**
- Consumes: Task 1 `isLateClockOut`, Task 3 db functions and `toLateOutExceptionView`.
- Produces routes: `PATCH /admin/clockout-telat/:id`, `PATCH /tim/clockout-telat/:id` (same regex style as `/silah/`), body `{ action: "approve"|"reject", note? }`, returns `toLateOutExceptionView`.
- Produces list field: `lateOutExceptions: LateOutExceptionView[]` on `GET /admin/pengajuan` and `GET /tim/persetujuan`.
- Produces: rekap rows and Hari Ini rows carry `lateOut`.
- Notifications: to `approverRecipients` → kind `pengajuan_baru`, title `"Clock Out Terlambat Perlu Persetujuan"`, body `` `${name} clock out pukul ${jamWIB(now)} WIB untuk absensi ${tanggal clock in}: "${reason}"` ``. To the employee on review → `pengajuan_disetujui` / `pengajuan_ditolak`, title `"Clock Out Terlambat Disetujui|Ditolak"`, mirror `reviewSilahAs`.

- [ ] **Step 1: Failing tests** (`late-clockout.test.mjs`), each with its own employee:
  1. Clock in `T0` (27 Okt 07:00), clock out 27 Okt 23:00 → 200, no exception (`/admin/pengajuan?status=all` has 0 `lateOutExceptions`).
  2. Clock in 27 Okt 07:00; at 28 Okt 07:00 options for `masuk` → 409 `SUDAH_CLOCK_IN`; `/absen` pulang without `lateOutReason` → 422 `ALASAN_CLOCK_OUT_TELAT` and the same `challengeId` still works on retry with `lateOutReason: "  Lupa   pencet "` → 200, `status.last.lateOut` = `{ status: "pending", reason: "Lupa pencet", at: <now> }`, `durationMin` = 1440; then clock in 28 Okt → 200.
  3. Stacked: three consecutive days each clocked out late next morning → three pending items, every next-day clock in → 200.
  4. Night shift: clock in 27 Okt 23:00, clock out 28 Okt 07:00 without reason → 200, no exception; another night-shift employee clocks out 28 Okt 12:30 without reason → 422.
  5. At 29 Okt 00:00 a shift from 27 Okt can no longer be closed (`BELUM_CLOCK_IN`) and reads `lupa_pulang`.
  6. Review: admin approves → 200, second review → 409 `SUDAH_DIPROSES`, employee gets a notification; kepala unit of another unit → 403; self → 403; reject → rekap row for that date has `status "lupa_pulang"`, `pulangAt null`, `durationMin null`, `lateOut.status "rejected"`.
  7. Late clock out outside the zone with both `outsideReason` and `lateOutReason` → one `zoneExceptions` item (kind pulang) and one `lateOutExceptions` item.
  8. Pending count badge (`countPendingApprovals` via the list's `pendingCount`) includes late items.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `parseLateOutReason(body)` like `parseSilahReason` (field `lateOutReason`, only for kind `pulang`). `checkLateClockOut(ctx, employee, kind, now, reason)` runs *before* `consumeChallenge`: loads the open shift via `recentShifts`/`shiftStatus`; if kind is `pulang`, an open shift exists and `isLateClockOut(open.masukAt, now)` and no reason → throw `ALASAN_CLOCK_OUT_TELAT` 422; returns `open` or null. After `closeShift` + selfie insert, when late: `insertLateOutException` (photoId = clock-out selfie) and notify approvers. `reviewLateOutAs` copies `reviewSilahAs`.
- [ ] **Step 4:** Whole Worker suite → PASS.

### Task 5: Frontend types, API, labels, rekap and export

**Files:**
- Modify: `frontend/src/absensi/types.ts` (`ShiftView.lateOut`, `RekapRow.lateOut`, `HariIniRow.lateOut`, `LateOutExceptionView`, `ApprovalList.lateOutExceptions?`, `AbsenBody.lateOutReason?`)
- Modify: `frontend/src/absensi/api.ts` (`reviewAdminLateOut`, `reviewTeamLateOut`)
- Modify: `frontend/src/absensi/logic/format.ts` (`LATE_OUT_STATUS_LABEL`, `zoneNotes`, `worstZoneStatus`, `rejectedLabel`)
- Modify: `frontend/src/absensi/messages.ts` (`ALASAN_CLOCK_OUT_TELAT`)
- Test: `frontend/src/__tests__/absensi/rekapExport.test.ts`, `frontend/src/__tests__/absensi/messages.test.ts`

**Interfaces:**
- Produces: `LATE_OUT_STATUS_LABEL: Record<RequestStatus, string>` = `{ pending: "Perlu review · clock out telat", approved: "Clock out telat · disetujui", rejected: "Clock out telat · ditolak" }`.
- `zoneNotes` appends `` `${LATE_OUT_STATUS_LABEL[s]} (${reason})` `` when `lateOut` exists; `worstZoneStatus` includes `lateOut.status`; `rejectedLabel` returns `"Clock out telat ditolak"` when `lateOut.status === "rejected"` and Silah is not rejected.
- Message: `ALASAN_CLOCK_OUT_TELAT: "Sudah ganti hari. Perbarui aplikasi lalu isi alasan clock out terlambat."`
- `reviewAdminLateOut(id, body)` → `PATCH /admin/clockout-telat/:id`; `reviewTeamLateOut` → `/tim/clockout-telat/:id`.

- [ ] **Step 1: Failing tests** in `rekapExport.test.ts`: a pending late row → item `zoneStatus "pending"`, `statusLabel` contains "Perlu verifikasi", notes contain "Perlu review · clock out telat (Lupa pencet)", duration "24 jam" counted in summary `totalMenit`; a rejected row (as the Worker sends it: `status "lupa_pulang"`, `pulangAt null`) → `tidakClockOut` +1, notes contain "Clock out telat · ditolak", Excel/Docx rows include the same note. `messages.test.ts`: the new code has a message.
- [ ] **Step 2:** `cd frontend && npx vitest run src/__tests__/absensi/rekapExport.test.ts src/__tests__/absensi/messages.test.ts` → FAIL. Implement. Re-run → PASS.

### Task 6: Beranda two cards, "Sudah ganti hari" pop-up, flow

**Files:**
- Modify: `frontend/src/absensi/logic/buttonState.ts` (drop `OPEN_SHIFT_MAX_MS`, add `carryOver`)
- Create: `frontend/src/absensi/components/LateOutNoticeModal.tsx` (pattern of `SilahNoticeModal`)
- Create: `frontend/src/absensi/components/CarryOverCard.tsx`
- Modify: `frontend/src/absensi/components/ClockButtons.tsx` (`terkunci` state), `frontend/src/absensi/flow/useClockFlow.ts`, `frontend/src/absensi/pages/BerandaPage.tsx`
- Test: `frontend/src/__tests__/absensi/buttonState.test.ts`, `frontend/src/__tests__/absensi/clockFlow.test.tsx`, create `frontend/src/__tests__/absensi/clockOutTelat.test.tsx`

**Interfaces:**
- Consumes: `isLateClockOut`, `isShiftExpired` (Task 1); `ShiftView` (Task 5).
- Produces: `ButtonView.clockIn.state: "aktif" | "selesai" | "terkunci"`; `ButtonView.carryOver: { workDate: string; masukAt: number; late: boolean } | null`. When the open shift's `workDate` < today: `carryOver` set, `clockIn = { state: "terkunci", label: "Selesaikan clock out <formatTanggalPendek> dulu" }`, `clockOut = { state: "nonaktif", label: "Clock in dulu" }`, `shiftDateLabel: null`. Normalisation uses `isShiftExpired` instead of 20 h.
- `useClockFlow.start(kind, opts?: { silahReason?: string; lateOutReason?: string })`; `lateOutReason` is sent only for `pulang`, kept on "Coba lagi", cleared on `cancel`/new `start`.
- `LateOutNoticeModal` props: `{ open: boolean; workDate: string; masukAt: number; onSubmit(reason: string): void; onClose(): void }`. Title "Sudah ganti hari"; text "Absensi <hari, tanggal> (clock in <jam>) belum di-clock out. Clock out sekarang akan tercatat jam <sekarang> dan menunggu persetujuan admin absensi / kepala unit."; reason field 3–300 with presets ("Lupa menekan clock out", "Lembur sampai lewat tengah malam", "HP mati / tidak ada sinyal").
- `CarryOverCard` props: `{ carryOver: NonNullable<ButtonView["carryOver"]>; onClockOut(): void }`: heading "Absensi <hari, tgl>", Clock In ✓ jam, active Clock Out pill (same styles as `ClockButtons`).
- Beranda: when `view.carryOver`, render `CarryOverCard` above the clock card; its Clock Out opens `LateOutNoticeModal` if `carryOver.late` (recheck with `isLateClockOut(masukAt, now)` at tap time) else `flow.start("pulang")`; today's `ClockButtons` gets `activeShift={null}`.

- [ ] **Step 1: Failing tests** in `buttonState.test.ts`: open shift from yesterday 07:00 at today 07:00 → `carryOver.late === true`, clock in `terkunci`; night shift 23:00 → 07:00 next day → `carryOver.late === false`; open shift from 2 days ago → no carryOver, clock in `aktif` (replace the 20 h cases). `clockOutTelat.test.tsx` (render Beranda like `silahMasuk.test.tsx`): carry-over card visible with "Absensi" + yesterday's date; today's Clock In disabled; tapping carry-over Clock Out shows "Sudah ganti hari"; submit reason → flow reaches map step and the eventual `absen` call includes `lateOutReason`. `clockFlow.test.tsx`: `lateOutReason` is not sent for `masuk`, survives retry.
- [ ] **Step 2:** Run those three files → FAIL. Implement. Re-run → PASS.

### Task 7: Approval board section and Riwayat note

**Files:**
- Modify: `frontend/src/absensi/components/ApprovalBoard.tsx` (item type `lateOut`, `LateOutBody`, prop `reviewLateOut`)
- Modify: `frontend/src/absensi/admin/PersetujuanTab.tsx`, `frontend/src/absensi/pages/TimPage.tsx` (pass `reviewAdminLateOut` / `reviewTeamLateOut`)
- Test: `frontend/src/__tests__/absensi/adminTabs.test.tsx`

**Interfaces:**
- Consumes: Task 5 types and API.
- `ApprovalBoardProps.reviewLateOut: (id: string, body: ReviewBody) => Promise<unknown>`; items keyed `l-${id}`; `lateOutExceptions ?? []` (old Worker).
- `LateOutBody` shows: badge "Clock out terlambat", `formatTanggalPanjang(workDate)`, "clock in HH:MM · clock out <formatLogWaktu(at)> WIB", duration (`formatDurasi`), `Alasan: "<reason>"`, selfie (same `useSelfie` as `SilahBody`).
- Riwayat needs no code: it already renders `zoneNotes(selectedShift)`; cover with the test below.

- [ ] **Step 1: Failing test** in `adminTabs.test.tsx`: Persetujuan tab with one pending `lateOutExceptions` item shows "Clock out terlambat", the reason, and Setujui calls `PATCH /admin/clockout-telat/<id>` with `{ action: "approve" }`. Add a case to `riwayat.test.tsx`: a shift with pending `lateOut` shows "Perlu review · clock out telat".
- [ ] **Step 2:** Run → FAIL. Implement. Re-run → PASS.

### Task 8: Full verification and spec touch-up

- [ ] **Step 1:** In the spec, change the `toShiftView` bullet to "rejected → `pulangAt: null` in the view; the raw time stays in `lateOut.at` and in `shifts`".
- [ ] **Step 2:** `cd workers/absensi && npm test` → all pass.
- [ ] **Step 3:** `cd frontend && npx vitest run src/__tests__/absensi` → all pass; `npx tsc -b` → no errors; `npx eslint src/absensi src/__tests__/absensi` → clean.
- [ ] **Step 4:** Local smoke (optional, if the user wants to see it): `npm run db:migrate:local` + `npm run dev` in `workers/absensi` and the app via the `run` skill; fake the clock is not possible there, so rely on tests for the day change.
- [ ] **Step 5:** Report to the user; commit/deploy only on their request (deploy order in Global Constraints).
