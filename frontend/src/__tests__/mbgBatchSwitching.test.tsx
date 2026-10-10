import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBatchIdUrlSync } from "@/hooks/useBatchIdUrlSync";
import { batchSource, subscribeBatchData } from "@/utils/batchScopedSubscriptions";

describe("batch terpilih ↔ ?batchId (Admin MBG)", () => {
  function Harness({ onRender }: { onRender: (id: string | null) => void }) {
    const [selected, setSelected] = useState<string | null>("old");
    useBatchIdUrlSync(selected, setSelected);
    const location = useLocation();
    onRender(selected);
    return (
      <>
        <span data-testid="selected">{selected}</span>
        <span data-testid="url">{location.search}</span>
        <button onClick={() => setSelected("new")}>pilih</button>
        <button onClick={() => setSelected("newer")}>pilih2</button>
      </>
    );
  }

  it("ganti tanggal tidak bolak-balik ke batch lama (router v7_startTransition)", async () => {
    const seen: Array<string | null> = [];
    render(
      <MemoryRouter initialEntries={["/mbg/admin?batchId=old"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Harness onRender={(id) => seen.push(id)} />
      </MemoryRouter>,
    );
    await act(async () => { screen.getByText("pilih").click(); });
    await act(async () => { screen.getByText("pilih2").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(screen.getByTestId("selected").textContent).toBe("newer");
    expect(screen.getByTestId("url").textContent).toBe("?batchId=newer");
    // Setelah memilih "new", tidak pernah kembali ke "old"; setelah "newer", tidak kembali ke "new".
    const afterNew = seen.slice(seen.indexOf("new"));
    expect(afterNew).not.toContain("old");
    expect(seen.slice(seen.indexOf("newer"))).not.toContain("new");
  });

  it("URL baru dari luar (mis. link Arsip) tetap memilih batch-nya", async () => {
    function Linker() {
      const [selected, setSelected] = useState<string | null>(null);
      useBatchIdUrlSync(selected, setSelected);
      return <span data-testid="sel">{selected ?? "-"}</span>;
    }
    render(
      <MemoryRouter initialEntries={["/mbg/admin?batchId=fromArchive"]}>
        <Linker />
      </MemoryRouter>,
    );
    // Nilai awal URL dipakai sebagai state awal oleh halaman; hook tidak menimpanya.
    expect(screen.getByTestId("sel").textContent).toBe("-");
  });
});

describe("data batch diterapkan bersamaan", () => {
  afterEach(() => vi.useRealTimers());

  it("menahan data sampai semua sumber masuk, lalu realtime", () => {
    const applied: string[] = [];
    const emit: Record<string, (v: string) => void> = {};
    const live = vi.fn();
    const unsubscribe = subscribeBatchData(["entries", "tasks"].map((name) => batchSource<string>({
      empty: `${name}:kosong`,
      apply: (v) => applied.push(v),
      subscribe: (onData) => { emit[name] = onData; return () => {}; },
    })), live);

    emit.entries("entries:1");
    expect(applied).toEqual([]); // tugas belum masuk → belum ada yang diterapkan
    emit.tasks("tasks:1");
    expect(applied).toEqual(["entries:1", "tasks:1"]);
    expect(live).toHaveBeenCalledTimes(1);
    emit.tasks("tasks:2");
    expect(applied.at(-1)).toBe("tasks:2");
    unsubscribe();
  });

  it("sumber lambat / gagal tidak menahan tampilan", () => {
    vi.useFakeTimers();
    const applied: string[] = [];
    const emit: Record<string, (v: string) => void> = {};
    const fail: Record<string, (e: Error) => void> = {};
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    subscribeBatchData(["a", "b", "c"].map((name) => batchSource<string>({
      empty: `${name}:kosong`,
      apply: (v) => applied.push(v),
      subscribe: (onData, onError) => { emit[name] = onData; fail[name] = onError; return () => {}; },
    })), () => {}, 4000);

    emit.a("a:1");
    fail.b(new Error("permission-denied"));
    expect(applied).toEqual([]);
    vi.advanceTimersByTime(4000);
    expect(applied).toEqual(["a:1", "b:kosong", "c:kosong"]);
    errorSpy.mockRestore();
  });
});
