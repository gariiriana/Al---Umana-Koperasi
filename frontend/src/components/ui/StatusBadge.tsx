import type { HTMLAttributes } from "react";
import type { OrderStatus } from "@/types/order";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: OrderStatus;
}

interface StatusStyle {
  classes: string;
  label: string;
}

const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  PENDING: { classes: "bg-[#FEF3C7] text-[#92400E]", label: "Pending" },
  IN_PRODUCTION: {
    classes: "bg-[#E0E7FF] text-[#3730A3]",
    label: "Dalam Produksi",
  },
  QC: { classes: "bg-[#F3E8FF] text-[#6B21A8]", label: "Quality Control" },
  READY_TO_DELIVER: {
    classes: "bg-[#D1FAE5] text-[#065F46]",
    label: "Siap Dikirim",
  },
  OUT_FOR_DELIVERY: {
    classes: "bg-[#DBEAFE] text-[#1E40AF]",
    label: "Dalam Pengiriman",
  },
  COMPLETED: { classes: "bg-[#D1FAE5] text-[#065F46]", label: "Selesai" },
  DELIVERY_FAILED: { classes: "bg-[#FEE2E2] text-[#991B1B]", label: "Gagal Kirim" },
};

const BASE_CLASSES =
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold " +
  "font-['Hanken_Grotesk',system-ui,sans-serif] whitespace-nowrap";

export function StatusBadge({
  status,
  className,
  children,
  ...rest
}: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  const composed = [BASE_CLASSES, style.classes, className ?? ""].join(" ").trim();

  return (
    <span
      className={composed}
      data-status={status}
      {...rest}
    >
      {children ?? style.label}
    </span>
  );
}
