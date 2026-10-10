// ============================================================================
// KPI Task Super Admin — status, rekap bulanan & penilaian otomatis
// KPI hanya dihitung dari task yang dibuat Super Admin (koleksi ad_hoc_tasks).
// Semua deadline disimpan sebagai waktu lokal WIB "YYYY-MM-DDTHH:mm".
// ============================================================================

export type TaskKpiStatus = "proses" | "terpenuhi" | "terlambat";

/** Bentuk minimal task yang dibutuhkan untuk menghitung KPI. */
export interface KpiTask {
  deadline?: string;
  submittedAt?: unknown;
}

export const KPI_STATUS_LABEL: Record<TaskKpiStatus, string> = {
  proses: "Proses",
  terpenuhi: "Terpenuhi",
  terlambat: "Terlambat",
};

/** Bobot komponen nilai KPI — ketepatan waktu paling diprioritaskan. */
export const KPI_WEIGHTS = { ketepatan: 0.7, penyelesaian: 0.2, keterlambatan: 0.1 } as const;

/** Keterlambatan ≥ 72 jam membuat skor komponen keterlambatan = 0. */
const MAX_LATE_HOURS = 72;

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTHS_ID_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Deadline WIB → epoch millis. Deadline lama tanpa jam dianggap 23:59 WIB. */
export function deadlineMillis(deadline?: string): number {
  if (!deadline) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return Date.parse(`${deadline}T23:59:59+07:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(deadline)) return Date.parse(`${deadline}:00+07:00`);
  return NaN;
}

/** Firestore Timestamp / Date / millis → epoch millis (NaN kalau belum ada). */
export function toMillis(value: unknown): number {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return NaN;
}

export const isSubmitted = (task: KpiTask) => !Number.isNaN(toMillis(task.submittedAt));

export function taskKpiStatus(task: KpiTask, now: number): TaskKpiStatus {
  const due = deadlineMillis(task.deadline);
  if (isSubmitted(task)) return toMillis(task.submittedAt) <= due ? "terpenuhi" : "terlambat";
  return now > due ? "terlambat" : "proses";
}

/** Menit keterlambatan: submit − deadline, atau sekarang − deadline kalau belum submit. */
export function lateMinutes(task: KpiTask, now: number): number {
  const due = deadlineMillis(task.deadline);
  const end = isSubmitted(task) ? toMillis(task.submittedAt) : now;
  return Math.max(0, Math.round((end - due) / 60000));
}

/** "YYYY-MM" bulan deadline (task masuk rekap bulan deadline-nya). */
export const taskMonthKey = (task: KpiTask) => (Number.isNaN(deadlineMillis(task.deadline)) ? null : task.deadline!.slice(0, 7));

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS_ID[m - 1] ?? ""} ${y}`;
}

/** Deadline WIB → "15 Okt 2026 17:00 WIB". */
export function formatDeadline(deadline?: string): string {
  if (!deadline || Number.isNaN(deadlineMillis(deadline))) return "-";
  const [date, time = "23:59"] = deadline.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_ID_SHORT[m - 1]} ${y} ${time} WIB`;
}

/** Waktu (millis) → "15 Okt 2026 17:05 WIB". */
export function formatWib(ms: number): string {
  if (Number.isNaN(ms)) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return `${Number(p("day"))} ${MONTHS_ID_SHORT[Number(p("month")) - 1]} ${p("year")} ${p("hour")}:${p("minute")} WIB`;
}

/** 135 → "2 jam 15 menit", 3000 → "2 hari 2 jam". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "-";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours > 0) return mins > 0 ? `${hours} jam ${mins} menit` : `${hours} jam`;
  return `${mins} menit`;
}

export interface KpiSummary {
  total: number;
  proses: number;
  terpenuhi: number;
  terlambat: number;
  /** Terlambat tapi sudah submit */
  terlambatSubmit: number;
  /** Deadline lewat, belum submit */
  belumSubmit: number;
  /** Task yang sudah jatuh tempo / sudah submit (dasar penilaian) */
  dinilai: number;
  /** Persentase dari total task (Proses / Terpenuhi / Terlambat) */
  pctProses: number;
  pctTerpenuhi: number;
  pctTerlambat: number;
  /** Ketepatan waktu = terpenuhi ÷ dinilai × 100, null kalau belum ada yang dinilai */
  ketepatanWaktu: number | null;
  /** Rata-rata menit keterlambatan dari semua task terlambat */
  avgLateMinutes: number;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function summarizeTasks(tasks: KpiTask[], now: number): KpiSummary {
  let proses = 0, terpenuhi = 0, terlambatSubmit = 0, belumSubmit = 0, lateTotal = 0;
  for (const task of tasks) {
    const status = taskKpiStatus(task, now);
    if (status === "proses") proses++;
    else if (status === "terpenuhi") terpenuhi++;
    else {
      if (isSubmitted(task)) terlambatSubmit++; else belumSubmit++;
      lateTotal += lateMinutes(task, now);
    }
  }
  const terlambat = terlambatSubmit + belumSubmit;
  const total = tasks.length;
  const dinilai = terpenuhi + terlambat;
  return {
    total, proses, terpenuhi, terlambat, terlambatSubmit, belumSubmit, dinilai,
    pctProses: pct(proses, total), pctTerpenuhi: pct(terpenuhi, total), pctTerlambat: pct(terlambat, total),
    ketepatanWaktu: dinilai > 0 ? pct(terpenuhi, dinilai) : null,
    avgLateMinutes: terlambat > 0 ? Math.round(lateTotal / terlambat) : 0,
  };
}

export interface KpiComponent {
  label: string;
  bobot: number;
  skor: number;
  keterangan: string;
}

export interface KpiAssessment {
  /** 0–100, null kalau belum ada task yang bisa dinilai */
  nilai: number | null;
  grade: "A" | "B" | "C" | "D" | "-";
  predikat: string;
  komponen: KpiComponent[];
  kesimpulan: string;
  rekomendasi: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Angka gaya Indonesia untuk teks: 66,7 */
export const fmtId = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

function gradeOf(nilai: number): Pick<KpiAssessment, "grade" | "predikat"> {
  if (nilai >= 90) return { grade: "A", predikat: "Sangat Baik" };
  if (nilai >= 75) return { grade: "B", predikat: "Baik" };
  if (nilai >= 60) return { grade: "C", predikat: "Cukup" };
  return { grade: "D", predikat: "Perlu Pembinaan" };
}

/**
 * Penilaian KPI otomatis per orang per bulan.
 * Nilai = 70% Ketepatan Waktu + 20% Penyelesaian + 10% Skor Keterlambatan.
 */
export function assessKpi(summary: KpiSummary, name: string, periode: string): KpiAssessment {
  const s = summary;
  if (s.dinilai === 0) {
    const kesimpulan = s.total === 0
      ? `Selama ${periode}, ${name} belum menerima task dari Super Admin.`
      : `Selama ${periode}, ${name} menerima ${s.total} task dari Super Admin dan semuanya masih dalam proses (belum jatuh tempo).`;
    return {
      nilai: null, grade: "-", predikat: "Belum Dapat Dinilai", komponen: [], kesimpulan,
      rekomendasi: "Penilaian akan muncul otomatis setelah ada task yang disubmit atau melewati deadline.",
    };
  }

  const ketepatan = s.ketepatanWaktu ?? 0;
  const penyelesaian = pct(s.terpenuhi + s.terlambatSubmit, s.dinilai);
  const avgLateHours = Math.min(s.avgLateMinutes / 60, MAX_LATE_HOURS);
  const keterlambatan = s.terlambat === 0 ? 100 : round1(Math.max(0, 100 - (avgLateHours / MAX_LATE_HOURS) * 100));
  const nilai = round1(
    ketepatan * KPI_WEIGHTS.ketepatan + penyelesaian * KPI_WEIGHTS.penyelesaian + keterlambatan * KPI_WEIGHTS.keterlambatan,
  );
  const { grade, predikat } = gradeOf(nilai);

  const komponen: KpiComponent[] = [
    { label: "Ketepatan Waktu", bobot: KPI_WEIGHTS.ketepatan, skor: ketepatan, keterangan: `${s.terpenuhi} dari ${s.dinilai} task disubmit sebelum deadline` },
    { label: "Penyelesaian", bobot: KPI_WEIGHTS.penyelesaian, skor: penyelesaian, keterangan: `${s.terpenuhi + s.terlambatSubmit} dari ${s.dinilai} task sudah disubmit` },
    {
      label: "Keterlambatan", bobot: KPI_WEIGHTS.keterlambatan, skor: keterlambatan,
      keterangan: s.terlambat === 0 ? "Tidak ada task terlambat" : `Rata-rata terlambat ${formatDuration(s.avgLateMinutes)} (≥ ${MAX_LATE_HOURS} jam = 0)`,
    },
  ];

  const parts = [
    `Selama ${periode}, ${name} menerima ${s.total} task dari Super Admin.`,
    `Dari ${s.dinilai} task yang sudah jatuh tempo, ${s.terpenuhi} diselesaikan tepat waktu (${fmtId(ketepatan)}%)`
      + (s.terlambatSubmit > 0 ? `, ${s.terlambatSubmit} disubmit terlambat` : "")
      + (s.belumSubmit > 0 ? `, ${s.belumSubmit} belum disubmit padahal deadline sudah lewat` : "")
      + ".",
  ];
  if (s.terlambat > 0) parts.push(`Rata-rata keterlambatan ${formatDuration(s.avgLateMinutes)}.`);
  if (s.proses > 0) parts.push(`${s.proses} task masih berjalan dan belum dihitung.`);
  parts.push(`Nilai KPI ${fmtId(nilai)} (${grade} — ${predikat}).`);

  const saran: string[] = [];
  if (grade === "A") saran.push("Sangat disiplin terhadap deadline. Pertahankan, dan layak dipercaya dengan task yang lebih besar.");
  else if (grade === "B") saran.push("Umumnya tepat waktu. Perhatikan task yang terlambat agar tidak berulang.");
  else if (grade === "C") saran.push("Ketepatan waktu perlu ditingkatkan. Disarankan evaluasi prioritas kerja dan beban task bersama atasan.");
  else saran.push("Sering melewati deadline. Perlu pembinaan dan pendampingan, serta evaluasi apakah beban dan deadline task sudah realistis.");
  if (s.belumSubmit > 0) saran.push(`Masih ada ${s.belumSubmit} task lewat deadline yang belum disubmit — segera selesaikan.`);
  if (s.terlambat > 0 && s.avgLateMinutes < 120) saran.push("Keterlambatan umumnya tipis (kurang dari 2 jam); submit lebih awal akan langsung menaikkan nilai.");

  return { nilai, grade, predikat, komponen, kesimpulan: parts.join(" "), rekomendasi: saran.join(" ") };
}
