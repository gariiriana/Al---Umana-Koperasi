import type { TaskKpiStatus } from "@/utils/taskKpi";

export const KPI_STATUS_STYLE: Record<TaskKpiStatus, { badge: string; bar: string; dot: string }> = {
  proses: { badge: "bg-blue-50 text-blue-700 border-blue-200", bar: "bg-blue-500", dot: "#3B82F6" },
  terpenuhi: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", dot: "#10B981" },
  terlambat: { badge: "bg-red-50 text-red-700 border-red-200", bar: "bg-red-500", dot: "#EF4444" },
};
