import { useNavigate } from "react-router-dom";
import type { Order, OrderStatus } from "@/types/order";

const PIPELINE: { key: OrderStatus; label: string; color: string; track: string; textColor: string }[] = [
  { key: "PENDING",          label: "Menunggu",   color: "#6B7280", track: "#E5E7EB", textColor: "text-[#6B7280]" },
  { key: "IN_PRODUCTION",    label: "Produksi",   color: "#D97706", track: "#FEF3C7", textColor: "text-[#D97706]" },
  { key: "QC",               label: "QA",         color: "#7C3AED", track: "#EDE9FE", textColor: "text-[#7C3AED]" },
  { key: "READY_TO_DELIVER", label: "Siap Kirim", color: "#2563EB", track: "#DBEAFE", textColor: "text-[#2563EB]" },
  { key: "OUT_FOR_DELIVERY", label: "Dikirim",    color: "#EA580C", track: "#FFEDD5", textColor: "text-[#EA580C]" },
  { key: "COMPLETED",        label: "Selesai",    color: "#059669", track: "#D1FAE5", textColor: "text-[#059669]" },
  { key: "DELIVERY_FAILED",  label: "Gagal",      color: "#DC2626", track: "#FEE2E2", textColor: "text-[#DC2626]" },
];

// SVG donut ring: radius 16, circumference ≈ 100.5
const R = 16;
const CIRC = 2 * Math.PI * R; // ≈ 100.53

function DonutRing({ pct, color, track, count }: { pct: number; color: string; track: string; count: number }) {
  const dash = (pct / 100) * CIRC;
  const gap = CIRC - dash;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      {/* Track */}
      <circle cx="22" cy="22" r={R} fill="none" stroke={track} strokeWidth="5" />
      {/* Fill — rotate so it starts at top */}
      <circle
        cx="22"
        cy="22"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={CIRC / 4}
        className="transition-[stroke-dasharray] duration-500 ease-out"
      />
      {/* Count label */}
      <text
        x="22"
        y="22"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="800"
        fontFamily="'Manrope', system-ui, sans-serif"
        fill={count > 0 ? color : "#9CA3AF"}
      >
        {count}
      </text>
    </svg>
  );
}

export interface StatusPipelineProps {
  orders: Order[];
}

export function StatusPipeline({ orders }: StatusPipelineProps) {
  const navigate = useNavigate();
  const counts: Record<string, number> = {};
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
  const total = orders.length;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl px-5 py-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-['Manrope',system-ui,sans-serif] text-xs font-extrabold text-[#374151] uppercase tracking-wider">
          Monitoring Pesanan
        </h3>
        <span className="font-['Manrope'] text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
          {total} total
        </span>
      </div>

      {/* Donut nodes — horizontal flow */}
      <div className="flex items-end justify-between gap-1">
        {PIPELINE.map(({ key, label, color, track, textColor }) => {
          const count = counts[key] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          const isActive = count > 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/admin/orders?status=${key}`)}
              className="group flex flex-col items-center gap-1 flex-1 min-w-0 cursor-pointer bg-transparent border-none outline-none focus:outline-none"
              title={`${label}: ${count} pesanan`}
            >
              {/* Donut ring */}
              <div
                className={`transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? "opacity-100" : "opacity-40"
                }`}
              >
                <DonutRing pct={pct} color={color} track={track} count={count} />
              </div>

              {/* Label */}
              <span
                className={`font-['Manrope',system-ui,sans-serif] text-[10px] font-bold truncate max-w-full text-center leading-tight ${
                  isActive ? textColor : "text-[#9CA3AF]"
                }`}
              >
                {label}
              </span>

              {/* Percent — only shown when active */}
              <span
                className="font-['Manrope'] text-[9px] font-semibold tabular-nums text-[#B0B7C3] min-h-[12px]"
              >
                {isActive ? `${Math.round(pct)}%` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StatusPipeline;
