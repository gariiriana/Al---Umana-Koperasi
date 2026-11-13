# Absensi: late clock out for a forgotten shift (Design)

Date: 2026-11-14. Status: draft, awaiting the user's approval. Triggered by a real case: Pak Joko forgot to clock out and found the shift already closed the next morning.

## Why

Today a shift that stays open for 20 hours (`OPEN_SHIFT_MAX_MS`) is marked `lupa_pulang` by the hourly cron (and by `toShiftView` on read). After that the employee cannot clock out at all. Example: clock in 1 Des 07:00, forget, and from 2 Des 03:00 the shift is gone ("Tidak clock out"). Worse, on 2 Des the Beranda shows only a fresh Clock In button. The broken shift from yesterday is not shown, so the employee never notices.

The user wants the attendance data to come in first, with the admin deciding afterwards: "tujuan kita tuh si data absen masuk dulu aja ... nanti tergantung keputusan si admin absensinya". The raw data must never be rewritten: "kalau 24 jam udah 24 jam aja".

## Goals

- An employee who forgot to clock out can still clock out **until 23:59 WIB of the next calendar day** (H+1) after the shift's `work_date`. The time stored is the real server time, even if the shift is 24+ hours long.
- On H+1 the Beranda shows two cards: yesterday's shift (Clock In done, Clock Out active) and today's (Clock In locked until yesterday is closed). The server already refuses a new clock in while a shift is open (`SUDAH_CLOCK_IN`); this rule stays.
- A clock out is **late** when the day has changed ("sudah ganti hari"), not after a fixed number of hours (user, 2026-11-14: "bukan batasan clockout itu 20 jam, tapi transisi masa hari"):
  - Normal shift (clock in before 20:00 WIB): late if the clock out happens on a later WIB date than the clock in. Masuk Senin 07:00 → pulang Senin 23:50 is normal; pulang Selasa 00:01 is late.
  - Night shift (clock in at 20:00 WIB or later, e.g. Shift Malam 23:00–07:00): clocking out the next morning is normal; late only after 12:00 WIB the next day. The system has no per-person shift schedule, so clock-in time is the only signal. The user approved this exception.
- A late clock out shows a pop-up ("Sudah ganti hari, absensi <hari, tgl> belum di-clock out") that asks for a short reason. The clock out is saved immediately with the real time and goes to admin as **pending** (menunggu persetujuan), like an absen luar zona.
- Admin absensi or the employee's kepala unit can only **Setujui** or **Tolak**:
  - Setujui: the full duration (e.g. 24 jam) counts toward jam kerja.
  - Tolak: the shift counts as "Tidak clock out". Only the clock in is shown, and the duration does not count.
- While pending, the shift's duration **counts in the rekap, with a mark**. Rekap screen and Excel/Docx export show these rows as "perlu direview".
- A pending (or rejected) review never blocks the employee. Once yesterday's clock out is done, today's Clock In and Clock Out work normally, whatever the review status and however long the admin takes. A later rejection changes only yesterday's shift. Pending items can stack: 1 Des pending, 2 Des pending, 3 Des pending, each its own approval item, each with its clock-in and clock-out data already in admin.
- After H+1 ends the shift becomes `lupa_pulang` as today: clock in only, clock out empty for good ("wasalam"). Ustadzah Santi follows up with the employee outside the app.

## Non-goals

- No editing or correcting the clock-out time (the user rejected "jam pulang sebenarnya" because the data would no longer match reality).
- No way to rescue a shift after H+1.
- No change to clock in, late-arrival reason (08:00 rule), Silah or zone rules.

## Anti-goals

- Changing a stored `pulang_at`/`masuk_at` because of a review.
- An employee clocking in today without first seeing that yesterday's shift is still open.
- A pending late clock out silently looking like a normal shift in the rekap or export.

## Approaches considered

1. **New `late_clockout_exceptions` table, mirroring `silah_exceptions` (picked).** Holds reason, status pending/approved/rejected, reviewer, note. Reuses the existing approval board, notifications, pending counts and rekap marking. Needs migration 0009 before deploy.
2. **Reuse `zone_exceptions` with a new kind.** Rejected: a late clock out can also be outside the zone, so one clock out would need two approvals in the same table, and the `zm`/`zp` joins key on kind.
3. **New columns on `shifts`.** Simpler queries, but the approval board, pending count and review endpoints are all built per exception table, so each would need special-casing.

The user picked 1 ("gassss").

## Design

### Data (migration `0009_late_clockout_exceptions.sql`)

Same shape as `silah_exceptions`: `id, shift_id (unique), uid, work_date, at (clock-out time), reason, photo_id (the clock-out selfie), status pending|approved|rejected, reviewed_by, reviewed_at, review_note, created_at`, plus indexes on `(status, created_at)` and `(uid, created_at)`. Join it into `ZONE_COLUMNS`/`ZONE_JOINS` as `lx` so every shift read carries `lateOut: { id, status, reason } | null`.

### Worker rules

- New "still closable" rule: an open shift becomes stale when `now >= start of (work_date + 2 days) WIB`, not after 20 hours. Put this in one shared helper (e.g. `shared/time.js` `shiftClosableUntil(workDate)`) used by `toShiftView`, the cron (`markStaleShifts` by `work_date`), and the frontend `buttonState`.
- `OPEN_SHIFT_MAX_MS` (20 h) is removed. New constants in `shared/constants.js`: `NIGHT_SHIFT_FROM_MINUTE_WIB = 20 * 60` and `NIGHT_SHIFT_OUT_UNTIL_MINUTE_WIB = 12 * 60`. One pure shared helper `isLateClockOut(masukAt, nowMs)` holds the rule from Goals, used by the Worker and by the frontend (to show the pop-up before the selfie).
- `/absen` with kind `pulang`: if `isLateClockOut(masuk_at, now)`, require `lateOutReason` (same length rules as the other reasons). Missing reason → error code `ALASAN_CLOCK_OUT_TELAT` (old app versions get a clear message). After `closeShift`, insert the exception and notify `approverRecipients` ("Clock Out Terlambat Perlu Persetujuan", body with name, clock-in date, clock-out time and reason).
- Review: `PATCH /admin/clockout-telat/:id` and `/tim/clockout-telat/:id`, via a `reviewLateOutAs` in `approval.js` that copies `reviewSilahAs` (canReview, `SUDAH_DIPROSES`, notify the employee).
- `toShiftView`: if `lateOut.status === 'rejected'`, report `status: 'lupa_pulang'`, `pulangAt: null`, `durationMin: null`; the raw clock-out time stays in `lateOut.at` and in `shifts` for the audit trail. Approved and pending stay `selesai` with the real duration.
- `countPendingApprovals` and the admin/tim approval lists include the new table.
- Test-account reset helpers in `db.js` (which delete zone/silah rows for a reset shift) also delete the new rows.

### Employee screens

- Beranda (`buttonState` + `ClockButtons`): when the open shift's `work_date` is before today, render two cards. Card 1: "Absensi <hari, tgl>", Clock In ✓ jam, Clock Out button. Card 2: today, Clock In disabled with "Selesaikan clock out <tgl> dulu". For a late clock out (`isLateClockOut`) the flow first shows the "Sudah ganti hari" pop-up with the reason field, then the selfie (reuse `LateReasonForm`'s pattern).
- On H+1, a shift that is already `lupa_pulang` (H+1 passed) shows nothing new (today's behaviour).
- Riwayat: the shift shows "Clock out telat · menunggu / disetujui / ditolak".

### Admin screens and export

- Persetujuan tab / `ApprovalBoard`: a new section "Clock Out Terlambat" with employee, shift date, clock-in time, clock-out time, duration, reason, selfie, and Setujui / Tolak.
- Rekap (`rekapData.ts`): pending → violet "Perlu review" badge (same style as zone pending), note "Clock out telat (alasan) · menunggu", duration shown and counted. Approved → note "Clock out telat · disetujui". Rejected → status "Tidak clock out", duration "-", note "Clock out telat ditolak oleh <nama>", and it counts in `tidakClockOut`, not in `totalMenit`.
- Excel and Docx export use the same notes and status labels, so pending rows are visible as needing review.

## Calls made by Claude (user may override)

- Approvers are admin absensi + kepala unit, as for zone and Silah.
- A reason is mandatory for a late clock out.
- Night-shift cut-offs: clock in from 20:00 WIB counts as night shift; its normal clock out runs until 12:00 WIB the next day. (Live data 2–14 Nov: no clock in after 16:00 yet, 10 shifts already "Tidak clock out", 3 clocked out the next day.)
- The two-card view shows whenever an open shift is from an earlier date, including a night shift clocking out at 07:00 (no pop-up there). Today's Clock In is locked there anyway.
- A late clock out on the employee's Silah day is allowed (clock out is always allowed on Silah).
- A late clock out outside the zone creates two separate approvals (zone + late), each reviewed on its own.

## Left to the builder

- Exact copy text, error-message wording in `errorMessage.ts`/`messages.ts`.
- Whether the Hari Ini tab shows yesterday's shift closed late today (nice to have).

## Rollout

- Apply migration 0009 to D1 first and confirm it with `wrangler d1 migrations list absensi --remote`. A Worker without the table fails every shift read, because the joins reference it.
- Then deploy the Worker and, right after, hosting, at a quiet hour (midday; not near midnight or the morning clock-in). Between the two, the old app is wrong in two ways:
  - It does not know `ALASAN_CLOCK_OUT_TELAT` and shows the generic error.
  - It still uses the 20 h rule. A forgotten shift past 20 h shows Clock In as active, but the server refuses with `SUDAH_CLOCK_IN`.
  The forced "Perbarui" modal moves users to the new app.
- The new app also handles server/phone clock disagreement. If the server answers `ALASAN_CLOCK_OUT_TELAT` to a clock out that the phone thought was on time (e.g. tap at 23:58, sent after 00:00), the app asks for the reason and resends the same request. The map and selfie are not repeated.
- Shifts already `lupa_pulang` in the database stay as they are; the new window only applies to shifts open at deploy time.
