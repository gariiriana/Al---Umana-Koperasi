import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BarList, LineChart } from "@/toksan/components/Charts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const barWidths = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("li div[style]")].map((el) => el.style.width);

describe("BarList", () => {
  it("scales bars to its own largest value by default", () => {
    const { container } = render(<BarList items={[{ name: "A", value: 50 }, { name: "B", value: 100 }]} emptyText="-" />);
    expect(barWidths(container)).toEqual(["50%", "100%"]);
  });

  it("uses a shared max so a 'paling sepi' list is not drawn as nearly full", () => {
    const { container } = render(<BarList items={[{ name: "coco pandan", value: 93 }]} max={717} emptyText="-" />);
    expect(parseFloat(barWidths(container)[0])).toBeCloseTo(12.97, 1);
  });
});

describe("LineChart", () => {
  const points = [
    { tanggal: "2026-11-09", omzet: 3_000_000 },
    { tanggal: "2026-11-10", omzet: 2_000_000 },
    { tanggal: "2026-11-11", omzet: 4_000_000 },
  ];

  it("draws at the container's real width so labels stay readable on a phone", () => {
    class FakeResizeObserver {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width: 300 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    render(<LineChart points={points} label="Omzet" />);
    expect(screen.getByRole("img", { name: "Omzet" }).getAttribute("viewBox")).toBe("0 0 300 220");
  });

  it("falls back to a 640 wide drawing without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<LineChart points={points} label="Omzet" />);
    expect(screen.getByRole("img", { name: "Omzet" }).getAttribute("viewBox")).toBe("0 0 640 220");
  });
});
