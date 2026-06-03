import { motion } from "motion/react";
import type { Order, OrderStatus } from "@/types/order";

const STATUSES: { key: OrderStatus; label: string; color: string; bg: string }[] = [
  { key: "PENDING",            label: "Menunggu",     color: "text-gray-600",   bg: "bg-gray-100" },
  { key: "IN_PRODUCTION",      label: "Diproduksi",   color: "text-amber-700",  bg: "bg-amber-50" },
  { key: "QC",                 label: "Uji QC",       color: "text-purple-700", bg: "bg-purple-50" },
  { key: "READY_TO_DELIVER",   label: "Siap Kirim",   color: "text-blue-700",   bg: "bg-blue-50" },
  { key: "OUT_FOR_DELIVERY",   label: "Pengiriman",   color: "text-orange-700", bg: "bg-orange-50" },
  { key: "COMPLETED",          label: "Selesai",      color: "text-emerald-700", bg: "bg-emerald-50" },
  { key: "DELIVERY_FAILED",    label: "Gagal Kirim",  color: "text-red-700",    bg: "bg-red-50" },
];

export interface StatusPipelineProps {
  orders: Order[];
}

export function StatusPipeline({ orders }: StatusPipelineProps) {
  const counts: Record<string, number> = {};
  for (const o of orders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
      {STATUSES.map(({ key, label, color, bg }, i) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: i * 0.04 }}
        >
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-3.5 h-full flex flex-col gap-2">
            <span className={`self-start inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${bg} ${color} font-['Manrope',system-ui,sans-serif]`}>
              {label}
            </span>
            <p
              className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]"
              data-testid={`pipeline-count-${key}`}
            >
              {counts[key] ?? 0}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default StatusPipeline;
