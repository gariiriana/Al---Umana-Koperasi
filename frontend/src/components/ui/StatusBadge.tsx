import type { HTMLAttributes } from "react";
import type { OrderStatus } from "@/types/order";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: OrderStatus;
}

interface StatusStyle {
  background: string;
  color: string;
  label: string;
}

const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  PLACING: { background: "#FEF3C7", color: "#92400E", label: "Placing" },
  CONFIRMED: { background: "#DBEAFE", color: "#1E40AF", label: "Confirmed" },
  IN_PRODUCTION: {
    background: "#E0E7FF",
    color: "#3730A3",
    label: "In Production",
  },
  READY: { background: "#D1FAE5", color: "#065F46", label: "Ready" },
  READY_TO_DELIVER: {
    background: "#FDE68A",
    color: "#78350F",
    label: "Ready to Deliver",
  },
  OUT_FOR_DELIVERY: {
    background: "#BFDBFE",
    color: "#1E3A8A",
    label: "Out for Delivery",
  },
  DELIVERED: { background: "#A7F3D0", color: "#064E3B", label: "Delivered" },
  FAILED: { background: "#FEE2E2", color: "#991B1B", label: "Failed" },
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
  const composed = [BASE_CLASSES, className ?? ""].join(" ").trim();

  return (
    <span
      className={composed}
      style={{ backgroundColor: style.background, color: style.color }}
      data-status={status}
      {...rest}
    >
      {children ?? style.label}
    </span>
  );
}
