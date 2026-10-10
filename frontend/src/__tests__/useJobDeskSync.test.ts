import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CateringJobDesk } from "@/types/cateringJobDesk";

const m = vi.hoisted(() => {
  class Timestamp {
    constructor(private ms: number) {}
    toMillis() { return this.ms; }
  }
  return { Timestamp, probe: vi.fn(), resync: vi.fn() };
});

vi.mock("firebase/firestore", () => ({
  Timestamp: m.Timestamp,
  collection: () => ({}),
  query: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocsFromServer: () => m.probe(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/services/firestoreResync", () => ({
  resyncFirestore: () => m.resync(),
  pendingResync: () => Promise.resolve(),
  withTimeout: <T,>(p: Promise<T>) => p,
}));

import { useJobDeskSync } from "@/hooks/useJobDeskSync";

const desk = (updatedAt: string) => ({ id: updatedAt, updatedAt }) as CateringJobDesk;
const serverLatest = (iso: string) => ({ docs: [{ get: () => new m.Timestamp(Date.parse(iso)) }] });

const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  m.probe.mockReset();
  m.resync.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

describe("useJobDeskSync", () => {
  it("live saat data listener sama dengan server, tanpa sambung ulang", async () => {
    m.probe.mockResolvedValue(serverLatest("2026-10-07T14:59:09.000Z"));
    const { result } = renderHook(() => useJobDeskSync([desk("2026-10-07T14:59:09.000Z")], true));
    await flush(100);
    expect(result.current.state).toBe("live");
    expect(result.current.checkedAt).not.toBeNull();
    expect(m.resync).not.toHaveBeenCalled();
  });

  it("listener tertinggal → sambung ulang → live setelah submit baru masuk", async () => {
    m.probe.mockResolvedValue(serverLatest("2026-10-07T14:59:09.000Z"));
    const { result, rerender } = renderHook(({ desks }) => useJobDeskSync(desks, true), {
      initialProps: { desks: [desk("2026-10-06T16:28:50.000Z")] },
    });
    await flush(4100); // probe pertama + tunggu 4 dtk: masih tertinggal
    expect(m.resync).toHaveBeenCalledTimes(1);
    rerender({ desks: [desk("2026-10-06T16:28:50.000Z"), desk("2026-10-07T14:59:09.000Z")] });
    await flush(6100);
    expect(result.current.state).toBe("live");
  });

  it("tetap tertinggal setelah sambung ulang → stale", async () => {
    m.probe.mockResolvedValue(serverLatest("2026-10-07T14:59:09.000Z"));
    const { result } = renderHook(() => useJobDeskSync([desk("2026-10-06T16:28:50.000Z")], true));
    await flush(20_000);
    expect(m.resync).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("stale");
  });

  it("server tidak bisa dihubungi dua kali → stale", async () => {
    m.probe.mockRejectedValue(new Error("timeout"));
    const { result } = renderHook(() => useJobDeskSync([desk("2026-10-07T14:59:09.000Z")], true));
    await flush(20_000);
    expect(result.current.state).toBe("stale");
  });

  it("tidak memeriksa sebelum data pertama siap", async () => {
    const { result } = renderHook(() => useJobDeskSync([], false));
    await flush(5000);
    expect(m.probe).not.toHaveBeenCalled();
    expect(result.current.state).toBe("checking");
  });
});
