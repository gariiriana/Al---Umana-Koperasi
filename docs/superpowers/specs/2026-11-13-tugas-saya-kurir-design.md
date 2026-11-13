# Tugas Saya: every courier takes both Katering and MBG tasks (Design)

Date: 2026-11-13. Status: approved in chat. First "gas" was for Rahmat only with a per-user flag. The user then widened it: "untuk semua akun kurir katering ataupun kurir mbg sekarang mereka bisa menerima penugasan kurir katering ataupun kurir mbg". This is a small change, so the design is the short form.

## Why

Couriers work as one pool now. Admin MBG (Wandi) already assigns catering couriers to MBG runs. Rahmat (`kurir`) has 6 `mbg_delivery_tasks` dated 2026-09-26 to 2026-11-03, all still `waiting`, because role `kurir` has no Kurir MBG screen. In the other direction, `kurir_mbg` accounts cannot be picked for catering orders and cannot open them. The user wants every courier to take both kinds of task, with a UI that is very easy to use, plus a picture tutorial they can forward to the couriers.

## Goals

- Every `kurir` (incl. `kurir_katering` alias) and every `kurir_mbg` account sees all its Katering and MBG tasks on one screen, **Tugas Saya**, which opens right after login.
- Tapping a task opens the existing documentation flow for that task (`/distribusi/delivery?order=<id>`, `/mbg/delivery?batch=<batchId>`). Couriers learn no new photo flow.
- Catering dispatch (Handover, Delivery Scheduler) can assign `kurir_mbg` accounts. MBG dispatch already lists `kurir`.
- A picture tutorial (phone-sized PNGs, Indonesian, numbered steps) the user can forward on WhatsApp.

## Non-goals

- No change to the photo or proof flows themselves, or to how dispatchers assign.
- No per-user flag. Access follows role.
- No tightening of existing over-broad rules (e.g. every `kurir` already counts as `isKurirMbg()`); recorded only.

## Anti-goals

- A task assigned to a courier that the courier cannot see or open (today's failure in both directions).
- A courier having to remember which menu to check.

## Constraints and facts found

- `firestore.rules`: `isCateringCourier()` allows only `kurir`/`kurir_katering`. It gates order reads (`isAssignedCateringCourier`) and courier order updates. Add `kurir_mbg`. Everything else a courier writes (`courier_locations`, `delivery_files`, `notifications`, MBG tasks and entries) already admits both roles.
- Catering assignment notifications go to the courier uid (`assignCourier`, `reassignCourier`), MBG ones to courier/kenek uids (`notifyMbgCourierTasks`). Both reach either role unchanged. The role broadcast "Masakan siap diantar" goes to `kurir_mbg` only; add `kurir`.
- Menus live in `ROLE_PERMISSIONS` (`constants/roles.ts`) and in route `allowedRoles` (`AppRouter.tsx`); both must change together.
- Spark quota (50k reads/day): Tugas Saya reads must be bounded. Catering reuses `subscribeCourierOrders(uid)`, which is deduplicated by `subscriptionManager` and already open in the Sidebar. MBG reads only batches dated yesterday/today/tomorrow and only this courier's tasks in them. Task docs can approach 1 MiB because they mirror school photos.

## Approaches considered

- **A. One "Tugas Saya" screen (picked).** A combined task list is the landing page. Each card links into the existing page. No task can be missed, at the cost of one new page.
- **B. Two menus with pending-count badges.** Cheaper, but it repeats today's failure whenever a courier forgets the second menu.

The user asked for a recommendation and approved A.

## Design

1. **Roles:** `kurir` and `kurir_mbg` get the menu `/kurir/tugas` (Tugas Saya, home), `/distribusi/delivery` (label "Antar Katering", short "Katering"), `/mbg/delivery` (label "Antar MBG", short "MBG"). Other roles keep their current labels.
2. **Page `/kurir/tugas`, "Tugas Saya":**
   - Large cards, one per task, labeled **MBG** (green) or **KATERING** (orange). MBG shows the date, number of schools, portions, "sebagai Kenek" when relevant, and status. Katering shows the recipient, date and time, address, and status.
   - Unfinished tasks first, earliest first. Then "Selesai hari ini".
   - Katering scope: active assigned orders of any date, plus orders delivered today. MBG scope: the courier's tasks in batches dated yesterday, today and tomorrow (Jakarta).
   - Empty state: a large "Belum ada tugas hari ini".
3. **Deep links:** `DeliveryPage` opens the order from `?order=`, and `MbgDeliveryPage` selects the batch from `?batch=`.
4. **Dispatch pickers:** Handover and Delivery Scheduler list `kurir_mbg` too.
5. **Tutorial:** after the build, render the real screens with demo data (emulator) at phone size and compose numbered tutorial PNGs.

## Left to the builder

- Card layout within the existing design system (amber header, rounded cards, Hanken Grotesk).
- Status wording beyond the ones fixed in the plan.
