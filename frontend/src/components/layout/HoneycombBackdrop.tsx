import { useId } from "react";

/**
 * Background halaman masuk: sarang lebah hijau-madu, diambil dari logo
 * Al-Umanaa (lebah di dalam hexagon). Statis, tanpa video/animasi.
 */

const R = 30; // jari-jari hexagon (pointy-top)
const W = Math.sqrt(3) * R; // lebar hexagon
const TILE_H = 3 * R;
const PATCH = 640;

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** Sel madu di dekat sudut kanan atas patch, opasitas makin pudar menjauhi sudut. */
function honeyCells(seed: number) {
  const cells: { cx: number; cy: number; opacity: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const cy = R + 1.5 * R * k;
    for (let i = 0; i < 14; i++) {
      const cx = (k % 2 === 0 ? W / 2 : 0) + i * W;
      const dist = Math.hypot(PATCH - cx, cy);
      if (dist > 250) continue;
      const h = (k * 7 + i * 13 + seed * 5) % 6;
      if (h === 0 || (dist > 160 && h < 3)) continue; // sel kosong, biar tidak rata
      const base = 1 - dist / 250;
      cells.push({ cx, cy, opacity: Math.min(0.85, 0.12 + base * (h % 2 ? 0.9 : 0.6)) });
    }
  }
  return cells;
}

type Variant = "dark" | "light";

const COMB_STROKE: Record<Variant, { color: string; opacity: number }> = {
  dark: { color: "#FCE7A6", opacity: 0.16 },
  light: { color: "#C98A12", opacity: 0.2 },
};

function HoneyPatch({ seed, className, variant }: { seed: number; className: string; variant: Variant }) {
  const comb = COMB_STROKE[variant];
  const id = useId().replace(/:/g, "");
  const cells = honeyCells(seed);

  return (
    <svg
      viewBox={`0 0 ${PATCH} ${PATCH}`}
      className={`pointer-events-none absolute h-[min(95vw,640px)] w-[min(95vw,640px)] ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern id={`comb-${id}`} width={W} height={TILE_H} patternUnits="userSpaceOnUse">
          <path
            d={`M${W / 2} 0 L${W} ${R / 2} L${W} ${1.5 * R} L${W / 2} ${2 * R} L0 ${1.5 * R} L0 ${R / 2} Z M${W / 2} ${2 * R} L${W / 2} ${3 * R}`}
            fill="none"
            stroke={comb.color}
            strokeWidth="1"
            strokeOpacity={comb.opacity}
          />
        </pattern>
        <radialGradient id={`fade-${id}`} cx={PATCH} cy="0" r={PATCH * 0.95} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`honey-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD24A" />
          <stop offset="1" stopColor="#E89B0C" />
        </linearGradient>
        <mask id={`mask-${id}`}>
          <rect width={PATCH} height={PATCH} fill={`url(#fade-${id})`} />
        </mask>
      </defs>

      <g mask={`url(#mask-${id})`}>
        <rect width={PATCH} height={PATCH} fill={`url(#comb-${id})`} />
        {cells.map((c) =>
          c.opacity >= 0.45 ? (
            <polygon
              key={`${c.cx}-${c.cy}`}
              points={hexPoints(c.cx, c.cy, R - 3.5)}
              fill={`url(#honey-${id})`}
              fillOpacity={Math.min(1, c.opacity + 0.15)}
            />
          ) : (
            // Sel madu yang belum penuh: cuma garis, biar tidak jadi olive butek.
            <polygon
              key={`${c.cx}-${c.cy}`}
              points={hexPoints(c.cx, c.cy, R - 3.5)}
              fill="none"
              stroke="#F6B81A"
              strokeWidth="1.5"
              strokeOpacity={0.35 + c.opacity}
            />
          ),
        )}
      </g>
    </svg>
  );
}

/**
 * `dark`: halaman masuk (hijau tua + sarang lebah).
 * `light`: area kerja KASMA JOB — background terang tetap, cuma sarang lebah
 * di pojok, supaya teks gelap di semua halaman tetap kebaca.
 */
export function HoneycombBackdrop({
  variant = "dark",
  className = "absolute inset-0",
}: {
  variant?: Variant;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden="true">
      {variant === "dark" && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,#17473A_0%,#0E2E24_45%,#071A14_100%)]" />
          <div className="absolute left-1/2 top-[38%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F6B81A]/10 blur-[110px]" />
        </>
      )}
      <HoneyPatch seed={1} variant={variant} className="right-0 top-0" />
      <HoneyPatch seed={4} variant={variant} className="bottom-0 left-0 rotate-180" />
    </div>
  );
}
