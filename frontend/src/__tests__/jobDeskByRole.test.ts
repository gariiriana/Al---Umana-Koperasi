import { beforeEach, describe, expect, it, vi } from "vitest";

type Clause = { field: string; op: string; value: unknown };
type Listener = (snap: { docs: unknown[] }) => void;

const m = vi.hoisted(() => ({ subscribe: vi.fn() }));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/services/subscriptionManager", () => ({ subscriptionManager: { subscribe: m.subscribe } }));
vi.mock("@/services/developerRecycleBinService", () => ({ archiveAndDelete: vi.fn() }));
vi.mock("@/services/flowNotifications", () => ({
  notifyJobDeskReviewed: vi.fn(), notifyJobDeskSubmitted: vi.fn(), notifyJobDesksAssigned: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: (_c: unknown, ...clauses: Clause[]) => ({ clauses }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: vi.fn(), doc: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(), serverTimestamp: vi.fn(),
  getDocs: vi.fn(), writeBatch: vi.fn(),
  Timestamp: class {},
}));

import { subscribeJobDesksByRole } from "@/services/cateringJobDeskService";

const row = (id: string, data: Record<string, unknown>) => ({
  id, data: () => data, get: (f: string) => data[f], metadata: { hasPendingWrites: false },
});

beforeEach(() => m.subscribe.mockReset().mockReturnValue(() => {}));

describe("subscribeJobDesksByRole", () => {
  it("asks the server only for the PIC's rows and keeps the same result as the old full read", () => {
    const onData = vi.fn();
    subscribeJobDesksByRole("produksi_2", onData);

    const calls = m.subscribe.mock.calls as unknown as [{ clauses: Clause[] }, Listener][];
    expect(calls.map(([q]) => q.clauses)).toEqual([
      [{ field: "assignedRole", op: "in", value: ["produksi_2"] }],
      [{ field: "pic", op: "in", value: ["Shifa"] }],
    ]);

    const byRole = [
      row("a", { assignedRole: "produksi_2", pic: "Shifa", tanggal: "2026-10-14", startTime: "05:30" }),
      row("noDate", { assignedRole: "produksi_2", pic: "Shifa" }),
    ];
    const byPic = [
      row("a", { assignedRole: "produksi_2", pic: "Shifa", tanggal: "2026-10-14", startTime: "05:30" }),
      row("b", { assignedRole: "produksi_1", pic: "Shifa", tanggal: "2026-10-15", startTime: "06:00" }),
    ];
    calls[0][1]({ docs: byRole });
    expect(onData).not.toHaveBeenCalled();
    calls[1][1]({ docs: byPic });

    const result = onData.mock.lastCall?.[0] as { id: string }[];
    expect(result.map((jd) => jd.id)).toEqual(["b", "a"]);
  });

  it("covers both role aliases for the dual-scope Distribusi 2 account", () => {
    subscribeJobDesksByRole("distribusi_2", vi.fn());
    const calls = m.subscribe.mock.calls as unknown as [{ clauses: Clause[] }][];
    expect(calls[0][0].clauses[0].value).toEqual(["distribusi_2", "distribusi_mbg_2"]);
    expect(calls[1][0].clauses[0].value).toEqual(["Wandi", "Distribusi2"]);
  });
});
