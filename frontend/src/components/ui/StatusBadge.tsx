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
  PLACING: { classes: "bg-[#FEF3C7] text-[#92400E]", label: "Placing" },
  AWAITING_PAYMENT_PROOF: {
    classes: "bg-[#FEF3C7] text-[#92400E]",
    label: "Awaiting Payment Proof",
  },
  AWAITING_PAYMENT_APPROVAL: {
    classes: "bg-[#FED7AA] text-[#9A3412]",
    label: "Awaiting Payment Approval",
  },
  PAYMENT_REJECTED: {
    classes: "bg-[#FEE2E2] text-[#991B1B]",
    label: "Payment Rejected",
  },
  CONFIRMED: { classes: "bg-[#DBEAFE] text-[#1E40AF]", label: "Confirmed" },
  IN_PRODUCTION: {
    classes: "bg-[#E0E7FF] text-[#3730A3]",
    label: "In Production",
  },
  READY: { classes: "bg-[#D1FAE5] text-[#065F46]", label: "Ready" },
  READY_TO_DELIVER: {
    classes: "bg-[#FDE68A] text-[#78350F]",
    label: "Ready to Deliver",
  },
  OUT_FOR_DELIVERY: {
    classes: "bg-[#BFDBFE] text-[#1E3A8A]",
    label: "Out for Delivery",
  },
  DELIVERED: { classes: "bg-[#A7F3D0] text-[#064E3B]", label: "Delivered" },
  COMPLETED: { classes: "bg-[#D1FAE5] text-[#065F46]", label: "Completed" },
  FAILED: { classes: "bg-[#FEE2E2] text-[#991B1B]", label: "Failed" },
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
