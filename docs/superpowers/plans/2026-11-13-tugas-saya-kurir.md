# Tugas Saya (all couriers take Katering + MBG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `kurir` and `kurir_mbg` account can be assigned and can work both catering orders and MBG deliveries, from one "Tugas Saya" home screen.

**Architecture:** Access stays role-based. Both courier roles get the same three menus. A new page merges two bounded live sources (courier orders by uid; this courier's MBG tasks in batches dated yesterday..tomorrow) through a pure card-model module. Cards deep-link into the existing pages. One rules helper widens so `kurir_mbg` can read and update its own catering orders.

**Tech Stack:** React 18 + TypeScript + Vite, react-router-dom, Firebase Web SDK (Firestore), Tailwind, vitest + @testing-library/react, @firebase/rules-unit-testing (emulator).

**Spec:** `docs/superpowers/specs/2026-11-13-tugas-saya-kurir-design.md`

## Global Constraints

- Courier roles: `COURIER_ROLES = ["kurir", "kurir_mbg"]` (`kurir_katering` is normalized to `kurir` in AuthContext).
- Courier menu, in order: `/kurir/tugas` "Tugas Saya" (short "Tugas"), `/distribusi/delivery` "Antar Katering" (short "Katering"), `/mbg/delivery` "Antar MBG" (short "MBG"). Home for both roles: `/kurir/tugas`.
- Other roles keep "Delivery" / "Kurir MBG" labels unchanged.
- Badges: MBG = green (`bg-emerald-100 text-emerald-800`), KATERING = orange (`bg-orange-100 text-orange-800`).
- Copy is Indonesian. Empty state: "Belum ada tugas hari ini".
- Reads bounded (Spark 50k/day): no unbounded collection listeners on the new page.
- Commit messages: no double quotes (user runs PS 5.1).

## Review Focus

- A courier assigned as **kenek** (not petugas) must see the MBG task. Tested in Task 3 (`includes kenek tasks`).
- A catering order delivered **yesterday** must not appear under "Selesai hari ini". Tested in Task 3.
- An MBG task in a batch dated **two days ago** (stale `waiting`) must not appear. Tested in Task 3.
- `?order=` for an order that is not the courier's, or no longer active, must leave the list view as-is with no crash. Tested in Task 5.
- `kurir_mbg` must not read another courier's order. Tested in Task 1.

---

### Task 1: Rules: `kurir_mbg` may work its own catering orders

**Files:**
- Modify: `firestore.rules` (`isCateringCourier`, ~line 242)
- Test: `frontend/src/__tests__/courierRules.test.ts`

- [ ] **Step 1: Write the failing test** in `courierRules.test.ts`. Seed an order `mbgOrder` `{ assignedCourierId: 'mbg', customerId: 'customer', status: 'READY_TO_DELIVER' }`. Add `it('lets kurir_mbg accounts read and deliver their own catering orders only')`:
  - `assertSucceeds(getDoc(orders/mbgOrder))` as `mbg`
  - `assertFails(getDoc(orders/mine))` as `mbg`
  - `assertSucceeds(getDocs(query(orders, where('assignedCourierId','==','mbg'))))` with size 1
  - `assertSucceeds(updateDoc(orders/mbgOrder, { status: 'OUT_FOR_DELIVERY', deliveryStartedAt, kitchenSignatures: [{…}], updatedAt }))`
- [ ] **Step 2: Run** `npm run test:rules` inside `npx firebase-tools emulators:exec --only firestore` from `frontend/`. Expected: the new test FAILS.
- [ ] **Step 3: Implement.** `isCateringCourier()` → `getUserRole() in ['kurir', 'kurir_katering', 'kurir_mbg']`.
- [ ] **Step 4: Run the rules suite again.** Expected: all PASS.
- [ ] **Step 5: Commit.** `feat(rules): kurir MBG bisa mengerjakan pesanan katering miliknya`

### Task 2: Courier menus, home and routes

**Files:**
- Modify: `frontend/src/constants/roles.ts`, `frontend/src/components/layout/navItems.ts`, `frontend/src/components/layout/MobileNav.tsx`, `frontend/src/components/layout/Sidebar.tsx:154-162`, `frontend/src/router/AppRouter.tsx` (`/distribusi/delivery`, `/mbg/delivery`), `frontend/src/storefront/layouts/StorefrontLayout.tsx:174`
- Test: `frontend/src/__tests__/mbgRoleMenus.test.ts`, new `frontend/src/__tests__/courierMenus.test.ts`

**Interfaces:**
- Produces: `COURIER_ROLES: readonly string[]` and `isCourierRole(role?: string | null): boolean` in `constants/roles.ts`. `NavItem.shortLabel?: string`.

- [ ] **Step 1: Write the failing tests.** `courierMenus.test.ts`: for `kurir` and `kurir_mbg`, `navItemsForRole(role).map(i => i.label)` equals `["Tugas Saya", "Antar Katering", "Antar MBG"]`; `ROLE_DEFAULT_REDIRECT[role] === "/kurir/tugas"`; `mobileTabsForRole(role).tabs.map(t => t.shortLabel)` equals `["Tugas", "Katering", "MBG"]`. `navItemsForRole("admin_mbg")` still contains "Kurir MBG". In `mbgRoleMenus.test.ts`, change `menu("kurir_mbg")` to expect `["Tugas Saya", "Antar Katering", "Antar MBG"]`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/courierMenus.test.ts src/__tests__/mbgRoleMenus.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `roles.ts`: both roles → `["/kurir/tugas", "/distribusi/delivery", "/mbg/delivery"]`, redirect `/kurir/tugas`. Export `COURIER_ROLES` and `isCourierRole`.
  - `navItems.ts`: add `{ to: "/kurir/tugas", label: "Tugas Saya", icon: ListChecks }` as the first `SIDEBAR_NAV_ITEMS` entry, plus `MOBILE_SHORT_LABELS["/kurir/tugas"] = "Tugas"`. In `navItemsForRole`, when `isCourierRole(role)`, map the items through `COURIER_NAV_LABELS` (`label` and `shortLabel` for the three paths). Other roles get no `shortLabel`.
  - `MobileNav`: show `shortLabel ?? MOBILE_SHORT_LABELS[to] ?? label`.
  - `Sidebar`: run the past-deadline courier subscription when `isCourierRole(userRole)`. Add `kurir_mbg` to `isRelevantRole`.
  - `AppRouter`: `/distribusi/delivery` allows `["kurir", "kurir_mbg"]`. `/mbg/delivery` adds `"kurir"`.
  - `StorefrontLayout`: when `isCourierRole(profile.role)`, link to `/kurir/tugas`.
- [ ] **Step 4: Run the same tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(kurir): menu kurir gabungan Tugas Saya, Antar Katering, Antar MBG`

### Task 3: Card model `lib/courierTasks.ts`

**Files:**
- Create: `frontend/src/lib/courierTasks.ts`
- Modify: `frontend/src/lib/deliveryAssignment.ts` (move `getOrderDeadline` here from `DeliveryPage.tsx:435`, then export it and import it back in `DeliveryPage`), `frontend/src/utils/date.ts` (move `formatTanggal` here; `flowNotifications.ts` re-exports it)
- Test: `frontend/src/__tests__/courierTasks.test.ts`

**Interfaces:**
- Produces:
```ts
export type CourierTaskKind = 'mbg' | 'katering';
export interface CourierTaskCard {
  key: string;            // `mbg:<taskId>` | `katering:<orderId>`
  kind: CourierTaskKind;
  title: string;          // MBG: formatTanggal(tanggal); Katering: recipientName || institutionName || customerName || 'Pesanan'
  detail: string;         // MBG: `${n} sekolah · ${porsi} porsi` (+ ' · sebagai Kenek'); Katering: `${formatTanggal(eventDate)} · ${deliveryTime} · ${deliveryAddress}` (empty parts dropped)
  statusLabel: string;
  done: boolean;
  sortTime: number;
  href: string;           // `/mbg/delivery?batch=<batchId>` | `/distribusi/delivery?order=<orderId>`
}
export interface CourierTaskInput {
  uid: string; today: string;                  // today = getJakartaDate()
  orders: Order[]; mbgTasks: MbgDeliveryTask[];
  batchDates: Record<string, string>;          // batchId -> tanggal
}
export function buildCourierTaskList(input: CourierTaskInput): CourierTaskCard[];
export const MBG_STATUS_LABEL: Record<MbgDeliveryStatus, string>;   // waiting 'Belum serah terima', handover_done 'Sudah serah terima', delivering 'Sedang diantar', delivered 'Selesai'
export function kateringStatusLabel(status: OrderStatus): string;   // READY/READY_TO_DELIVER 'Siap diambil', OUT_FOR_DELIVERY 'Sedang diantar', PENDING/IN_PRODUCTION/QC 'Masih diproduksi', DELIVERED/COMPLETED 'Selesai'
```

- [ ] **Step 1: Write the failing tests** (`today = '2026-11-13'`):
  - `includes kenek tasks`: a task with `kenekId: uid` produces a card whose detail ends with `sebagai Kenek`.
  - `drops MBG batches outside yesterday..tomorrow`: batch `2026-11-11` → no card; `2026-11-12`, `-13` and `-14` → cards.
  - `drops tasks of other couriers` (MBG and katering).
  - `katering: active any date plus delivered today only`: READY on `2026-11-20` → card; COMPLETED with `deliveredAt` `2026-11-12T10:00:00Z` → none; with `2026-11-13T03:00:00Z` → `done: true`.
  - `sorts unfinished first, then by sortTime`: the expected key order is asserted.
  - `href`: `/mbg/delivery?batch=b1` and `/distribusi/delivery?order=o1`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/courierTasks.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Use `isMbgTaskAssignedTo` and `isAssignedToCourier`/`isActiveCourierAssignment`. MBG `sortTime = Date.parse(`${tanggal}T07:00:00+07:00`)`. Katering `sortTime = getOrderDeadline(order)`. The delivered-today check is `getJakartaDate(new Date(deliveredAt)) === today`. The MBG window is `addDays(today, -1) <= tanggal <= addDays(today, 1)`.
- [ ] **Step 4: Run** the new test plus `deliveryAssignment.test.ts` and `pushNotifications.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(kurir): model kartu tugas gabungan katering + MBG`

### Task 4: Service + Tugas Saya page + route

**Files:**
- Create: `frontend/src/services/courierTaskService.ts`, `frontend/src/pages/kurir/TugasSayaPage.tsx`
- Modify: `frontend/src/router/AppRouter.tsx` (lazy import + route `/kurir/tugas`, `allowedRoles={["kurir", "kurir_mbg"]}`, pageTitle "Tugas Saya")
- Test: `frontend/src/__tests__/tugasSayaPage.test.tsx`

**Interfaces:**
- Consumes: `buildCourierTaskList`, `CourierTaskCard` (Task 3), `subscribeCourierOrders` (`services/realtimeService.ts`).
- Produces:
```ts
export function subscribeRecentMbgBatchDates(today: string, onData: (dates: Record<string, string>) => void, onError?: (e: Error) => void): Unsubscribe;
// query mbg_pm_batches where tanggal in [today-1, today, today+1]; drops isBackup and status 'DRAFT'
export function subscribeMyMbgTasks(uid: string, batchIds: string[], onData: (tasks: MbgDeliveryTask[]) => void, onError?: (e: Error) => void): Unsubscribe;
// batchIds empty -> onData([]) and a no-op unsubscribe; else two listeners (batchId in ids && petugasId == uid; same with kenekId), merged by id
```

- [ ] **Step 1: Write the failing page test** (mock `@/contexts/AuthContext`, `@/contexts/ToastContext`, `@/lib/firebase`, `@/utils/date` → `'2026-11-13'`, `@/services/realtimeService`, `@/services/courierTaskService`; wrap in `MemoryRouter`):
  - Renders an MBG card and a KATERING card. Their links have `href` `/mbg/delivery?batch=b1` and `/distribusi/delivery?order=o1`.
  - A finished order appears under the heading "Selesai hari ini".
  - No tasks → text "Belum ada tugas hari ini".
- [ ] **Step 2: Run** `npx vitest run src/__tests__/tugasSayaPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the service with `subscriptionManager.subscribe`, and the page:
  - Header: "Tugas Saya" with today's long date.
  - Section "Belum selesai (n)" above "Selesai hari ini".
  - Each card is a `<Link>` at least 88px tall, with the badge, title, detail, status and a chevron.
  - "Memuat tugas..." until both sources have answered once. Errors go to a toast.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Verify the live query shape** read-only via REST `:runQuery`: `mbg_delivery_tasks`, `batchId IN [<3 recent ids>] AND kenekId == <Rahmat uid>`. Expected: 200 with no "requires an index" error. If an index is required, add `{batchId ASC, petugasId ASC}` and `{batchId ASC, kenekId ASC}` to `firestore.indexes.json`.
- [ ] **Step 6: Commit.** `feat(kurir): halaman Tugas Saya untuk semua kurir`

### Task 5: Deep links into the existing pages

**Files:**
- Modify: `frontend/src/pages/DeliveryPage.tsx` (after `myDeliveries`), `frontend/src/pages/mbg/MbgDeliveryPage.tsx:64-117`
- Test: `frontend/src/__tests__/mbgDeliveryPage.test.tsx`, new `frontend/src/__tests__/deliveryPageDeepLink.test.tsx`

- [ ] **Step 1: Write the failing tests.**
  - MBG: with `window.history.pushState({}, '', '/mbg/delivery?batch=batch2')`, two batches, and sessionStorage holding `batch`, the page selects `batch2` and stores it in sessionStorage.
  - Katering: with `?order=o1` and `o1` READY_TO_DELIVER assigned to the user, the page shows the start step. With `?order=nope`, it shows the list.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Read `new URLSearchParams(window.location.search)` (no router hook, so existing tests keep rendering without a router).
  - MBG: the `batch` param wins over sessionStorage when it is among the active batches.
  - Katering: open the requested order once (a ref guard) through the existing `open(o)`.
- [ ] **Step 4: Run** both test files. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(kurir): kartu Tugas Saya langsung membuka tugasnya`

### Task 6: Dispatch pickers + cooked broadcast

**Files:**
- Modify: `frontend/src/pages/HandoverPage.tsx:167`, `frontend/src/pages/DeliverySchedulerPage.tsx:140` (roles `["kurir", "kurir_katering", "kurir_mbg"]`), `frontend/src/services/flowNotifications.ts:144,160` (add `"kurir"` next to `"kurir_mbg"`)
- Test: `frontend/src/__tests__/pushNotifications.test.ts`

- [ ] **Step 1: Write the failing test:** `notifyMbgCooking('b', 'cooked')` sends to recipients that include both `kurir_mbg` and `kurir`. Follow the existing mocks in that file.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the three edits.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(kurir): kurir MBG bisa dipilih untuk pesanan katering`

### Task 7: Full verification

- [ ] `npx vitest run` (all unit tests). Expected: PASS, apart from failures that already exist, which are listed and checked against `main`.
- [ ] Run the rules suite in the emulator. Expected: PASS.
- [ ] `npm run lint` and `npm run build`. Expected: exit 0.

### Task 8: Picture tutorial

- [ ] Seed the Auth + Firestore emulators with one `kurir_mbg` demo courier, one MBG batch with a task (today), and one catering order READY_TO_DELIVER assigned to them.
- [ ] Run `vite --mode emulator`. Screenshot Tugas Saya, Antar MBG (from the card) and Antar Katering (from the card) at 393×852 @3x.
- [ ] Compose 3–4 portrait tutorial PNGs (numbered steps, arrows, short Indonesian captions) and view each before delivering.
