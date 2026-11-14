// Grafik ringan untuk Trafik Produk: SVG/HTML polos, satu sumbu, hover tooltip, warna tetap per entitas.
import { useEffect, useId, useRef, useState } from "react";
import { formatAngka, formatRupiah, formatTanggal } from "@/toksan/format";

/** Single-series mark color (amber-600: passes 3:1 on white). */
export const MARK = "#D97706";
/** Fixed categorical order, validated with the dataviz validator (light surface). */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

const shortRupiah = (n: number) => {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000) return `Rp${Math.round(n / 1_000).toLocaleString("id-ID")} rb`;
  return formatRupiah(n);
};

/** `max` lets two lists share one scale (Paling sepi is drawn against the Terlaris top value). */
export function BarList({ items, emptyText, max: sharedMax }: { items: { name: string; value: number }[]; emptyText: string; max?: number }) {
  if (items.length === 0) return <p className="py-4 text-sm text-[#6B7280]">{emptyText}</p>;
  const max = Math.max(sharedMax ?? 0, ...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={item.name} title={`${item.name}: ${formatAngka(item.value)} terjual`} className="group grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-lg px-1 py-1 hover:bg-[#FFFBEB]">
          <span className="text-xs font-semibold text-[#9CA3AF]">{i + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#111827]">{item.name}</p>
            <div className="mt-1 h-2 rounded-full bg-[#F3F4F6]">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: MARK }} />
            </div>
          </div>
          <span className="text-right text-sm font-bold text-[#111827]">{formatAngka(item.value)}</span>
        </li>
      ))}
    </ol>
  );
}

export function SplitBar({ parts, unit = "terjual" }: { parts: { label: string; value: number; color: string; detail?: string }[]; unit?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <p className="text-sm text-[#6B7280]">Belum ada data.</p>;
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full bg-white">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} title={`${p.label}: ${formatAngka(p.value)} ${unit}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-sm text-[#374151]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
            <span className="font-semibold text-[#111827]">{p.label}</span>
            <span>{Math.round((p.value / total) * 100)}%</span>
            {p.detail && <span className="text-[#6B7280]">· {p.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEFAULT_W = 640;
const MIN_W = 280;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 64 };

export function LineChart({ points, label }: { points: { tanggal: string; omzet: number }[]; label: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real container width (1 unit = 1 px) so 11px labels stay 11px on a phone.
  const [W, setW] = useState(DEFAULT_W);
  const figureRef = useRef<HTMLElement>(null);
  const drawn = points.length >= 2;
  useEffect(() => {
    const el = figureRef.current;
    if (!drawn || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      if (width > 0) setW(Math.max(MIN_W, width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawn]);
  if (!drawn) return <p className="text-sm text-[#6B7280]">Grafik muncul kalau periode lebih dari satu hari.</p>;

  const max = Math.max(...points.map((p) => p.omzet), 1);
  const niceMax = Math.ceil(max / 4 / 50_000) * 50_000 * 4 || max;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / niceMax) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.omzet).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);
  const labelEvery = Math.ceil(points.length / 7);
  const active = hover === null ? null : points[hover];

  return (
    <figure ref={figureRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E5E7EB" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6B7280">{shortRupiah(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
          <text key={p.tanggal} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6B7280">{Number(p.tanggal.slice(8))}</text>
        ))}
        <path d={path} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && active && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(active.omzet)} r={5} fill={MARK} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        {points.map((p, i) => (
          <rect
            key={p.tanggal}
            x={x(i) - (W - PAD.left - PAD.right) / (points.length - 1) / 2}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / (points.length - 1)}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {active && (
        <figcaption className="pointer-events-none absolute right-2 top-0 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs shadow">
          <span className="text-[#6B7280]">{formatTanggal(active.tanggal)}</span>
          <span className="ml-2 font-bold text-[#111827]">{formatRupiah(active.omzet)}</span>
        </figcaption>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-[#6B7280]">Lihat tabel</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead><tr className="text-[#6B7280]"><th className="py-1 font-semibold">Tanggal</th><th className="py-1 text-right font-semibold">Omzet</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.tanggal} className="border-t border-[#F3F4F6]"><td className="py-1">{formatTanggal(p.tanggal)}</td><td className="py-1 text-right">{formatRupiah(p.omzet)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
