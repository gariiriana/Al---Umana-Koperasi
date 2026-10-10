import type { TaskKpiStatus } from "@/utils/taskKpi";

export const KPI_STATUS_STYLE: Record<TaskKpiStatus, { pill: string; dot: string; text: string }> = {
  proses: { pill: "bg-[#EFF6FF] text-[#1D4ED8]", dot: "#3B82F6", text: "text-[#1D4ED8]" },
  terpenuhi: { pill: "bg-[#ECFDF5] text-[#047857]", dot: "#10B981", text: "text-[#047857]" },
  terlambat: { pill: "bg-[#FEF2F2] text-[#B91C1C]", dot: "#EF4444", text: "text-[#B91C1C]" },
};

/** Persen gaya Indonesia: 77,8% */
export const fmtPct = (n: number | null) =>
  n == null ? "–" : `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

/** "admin_mbg" → "Admin MBG", "co_mo_katering" → "Co MO Katering" */
export const roleLabel = (role: string) =>
  role.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bMbg/g, "MBG").replace(/\bMo\b/g, "MO");

export const fmtNum = (n: number | null) =>
  n == null ? "–" : n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
