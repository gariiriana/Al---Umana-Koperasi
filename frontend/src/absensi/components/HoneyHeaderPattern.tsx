import { useId } from "react";

/**
 * Sarang lebah di atas header kuning Absensi (khas logo Al-Umanaa: lebah di dalam hexagon).
 * Garis hexagon putih tipis yang memudar dari pojok kanan atas, plus beberapa sel "madu" penuh.
 * Pasang di dalam header yang `relative overflow-hidden`; konten header harus `relative` supaya di atasnya.
 */

const R = 22; // jari-jari hexagon (pointy-top)
const W = Math.sqrt(3) * R;
const TILE_H = 3 * R;
/** Lebar area pola dari tepi kanan; makin ke kiri makin pudar. */
const SPAN = 900;

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// Sel penuh di dekat pojok kanan atas: kolom dihitung dari tepi kanan, baris dari atas.
const FILLED: { col: number; row: number; opacity: number }[] = [
  { col: 0, row: 0, opacity: 0.5 },
  { col: 1, row: 1, opacity: 0.38 },
  { col: 2, row: 0, opacity: 0.3 },
  { col: 0, row: 2, opacity: 0.28 },
  { col: 3, row: 1, opacity: 0.18 },
  { col: 2, row: 2, opacity: 0.16 },
];

export function HoneyHeaderPattern({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <pattern id={`hp-${id}`} width={W} height={TILE_H} patternUnits="userSpaceOnUse">
          <path
            d={`M${W / 2} 0 L${W} ${R / 2} L${W} ${1.5 * R} L${W / 2} ${2 * R} L0 ${1.5 * R} L0 ${R / 2} Z M${W / 2} ${2 * R} L${W / 2} ${3 * R}`}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.25"
          />
        </pattern>
        {/* Paling jelas di kanan atas, hilang ke kiri bawah supaya teks header tetap terbaca. */}
        <linearGradient id={`hf-${id}`} x1="1" y1="0" x2="0.3" y2="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`hm-${id}`} maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill={`url(#hf-${id})`} />
        </mask>
      </defs>
      {/* Sistem koordinat berpangkal di tepi kanan, jadi pola + sel penuh selalu sejajar di pojok kanan. */}
      <svg x="100%" overflow="visible">
        <rect x={-SPAN} y={0} width={SPAN} height={TILE_H * 5} fill={`url(#hp-${id})`} mask={`url(#hm-${id})`} />
        {FILLED.map(({ col, row, opacity }) => (
          <polygon
            key={`${col}-${row}`}
            // Baris genap: pusat di tengah tile; baris ganjil: di tepi tile (geser setengah sel).
            points={hexPoints(row % 2 === 0 ? -(col * W + W / 2) : -(col * W + W), row * 1.5 * R + R, R - 3)}
            fill="#FFFFFF"
            fillOpacity={opacity}
          />
        ))}
      </svg>
    </svg>
  );
}
