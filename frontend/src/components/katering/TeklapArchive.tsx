// ============================================================================
// Arsip Teklap — job desk yang sudah disimpan MO, tersusun per tanggal
// Tiap tanggal = satu lembar tugas; klik untuk lihat per PIC & download PDF
// ============================================================================

import { useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import type { CateringJobDesk } from "@/types/cateringJobDesk";
import {
  PIC_ACCOUNT_DETAILS, compareJobDeskTime, extractDateOnly, formatIndoTime, getHariFromDate,
  type PicShortName,
} from "@/types/cateringJobDesk";
import { exportJobDesksPdf, formatJobDeskDate } from "@/utils/jobDeskPdfExporter";
import { SidePanel } from "@/components/ui/SidePanel";
import { PeriodSelect } from "@/components/ui/PeriodSelect";
import { getJakartaDate } from "@/utils/date";
import { monthLabel as monthKeyLabel } from "@/utils/taskKpi";

type DivisionFilter = "all" | "katering" | "mbg";
type DayState = "tuntas" | "berjalan" | "belum";

interface DaySheet {
  date: string;
  hari: string;
  desks: CateringJobDesk[];
  pics: string[];
  katering: number;
  mbg: number;
  selesai: number;
  tidakSelesai: number;
  approved: number;
  rejected: number;
  menungguReview: number;
  state: DayState;
}

const DAY_STATE: Record<DayState, { label: string; pill: string; dot: string }> = {
  tuntas: { label: "Tuntas", pill: "bg-[#ECFDF5] text-[#047857]", dot: "#10B981" },
  berjalan: { label: "Berjalan", pill: "bg-[#FFFBEB] text-[#B45309]", dot: "#F59E0B" },
  belum: { label: "Belum dikerjakan", pill: "bg-[#F3F4F6] text-[#4B5563]", dot: "#9CA3AF" },
};

const PIC_STATUS: Record<CateringJobDesk["status"], { label: string; cls: string }> = {
  pending: { label: "Belum", cls: "text-[#6B7280]" },
  complete: { label: "Selesai", cls: "text-[#047857]" },
  incomplete: { label: "Tidak selesai", cls: "text-[#B91C1C]" },
};

const REVIEW_STATUS: Record<CateringJobDesk["reviewStatus"], { label: string; cls: string }> = {
  not_submitted: { label: "–", cls: "text-[#D1D5DB]" },
  pending_review: { label: "Menunggu review", cls: "text-[#B45309]" },
  approved: { label: "Disetujui", cls: "text-[#047857]" },
  rejected: { label: "Ditolak", cls: "text-[#B91C1C]" },
};

/**
 * Status pengerjaan efektif. Data lama (sebelum ada tombol submit PIC) langsung di-approve
 * CO_MO dengan status tetap "pending" — itu dihitung selesai, bukan belum dikerjakan.
 */
const picStatus = (jd: CateringJobDesk): CateringJobDesk["status"] =>
  jd.status === "pending" && jd.reviewStatus === "approved" ? "complete" : jd.status;

const picName = (pic: string) => PIC_ACCOUNT_DETAILS[pic as PicShortName]?.name ?? pic;
const byPicThenTime = (a: CateringJobDesk, b: CateringJobDesk) =>
  (a.pic || "").localeCompare(b.pic || "") || compareJobDeskTime(a.startTime, b.startTime);

const inputCls = "rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]";

function buildSheets(desks: CateringJobDesk[]): DaySheet[] {
  const byDate = new Map<string, CateringJobDesk[]>();
  for (const jd of desks) {
    const date = extractDateOnly(jd.tanggal);
    if (!date) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), jd]);
  }
  return [...byDate.entries()]
    .map(([date, list]) => {
      const total = list.length;
      const approved = list.filter((d) => d.reviewStatus === "approved").length;
      const pending = list.filter((d) => picStatus(d) === "pending").length;
      return {
        date,
        hari: list[0]?.hari || getHariFromDate(date),
        desks: [...list].sort(byPicThenTime),
        pics: [...new Set(list.map((d) => d.pic).filter(Boolean))].sort(),
        katering: list.filter((d) => (d.division ?? "katering") === "katering").length,
        mbg: list.filter((d) => d.division === "mbg").length,
        selesai: list.filter((d) => picStatus(d) === "complete").length,
        tidakSelesai: list.filter((d) => picStatus(d) === "incomplete").length,
        approved,
        rejected: list.filter((d) => d.reviewStatus === "rejected").length,
        menungguReview: list.filter((d) => d.reviewStatus === "pending_review").length,
        state: (approved === total ? "tuntas" : pending === total ? "belum" : "berjalan") as DayState,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function StatePill({ state }: { state: DayState }) {
  const s = DAY_STATE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${s.pill}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function TeklapArchive({ jobDesks }: { jobDesks: CateringJobDesk[] }) {
  const today = getJakartaDate();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [division, setDivision] = useState<DivisionFilter>("all");
  const [search, setSearch] = useState("");
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobDesks.filter((jd) => {
      if (!extractDateOnly(jd.tanggal).startsWith(month)) return false;
      if (division !== "all" && (jd.division ?? "katering") !== division) return false;
      if (!q) return true;
      return [jd.kegiatan, jd.keterangan, jd.pic, jd.keyId, jd.orderLabel, jd.mbgInstitutionName]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [jobDesks, month, division, search]);

  const sheets = useMemo(() => buildSheets(filtered), [filtered]);
  const openSheet = sheets.find((s) => s.date === openDate) ?? null;
  const totals = useMemo(() => ({
    hari: sheets.length,
    tugas: filtered.length,
    tuntas: sheets.filter((s) => s.state === "tuntas").length,
  }), [sheets, filtered]);

  const downloadPdf = async (key: string, desks: CateringJobDesk[]) => {
    setExporting(key);
    try { await exportJobDesksPdf(desks, { groupByPic: true }); }
    catch (err) { console.error("Export PDF arsip teklap gagal:", err); alert("Gagal membuat PDF."); }
    finally { setExporting(null); }
  };

  return (
    <div className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#111827]">Arsip Teklap</h2>
          <p className="text-sm text-[#6B7280]">
            {monthKeyLabel(month)} · {totals.hari} hari · {totals.tugas} tugas · {totals.tuntas} hari tuntas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelect value={month} onChange={setMonth} today={today} label="Bulan" />
          <div className="inline-flex rounded-lg border border-[#E5E7EB] bg-white p-0.5">
            {([["all", "Semua"], ["katering", "Katering"], ["mbg", "MBG"]] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setDivision(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${division === key ? "bg-[#111827] text-white" : "text-[#374151] hover:bg-[#F3F4F6]"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kegiatan, PIC, Key ID" className={`${inputCls} w-full pl-9 sm:w-60`} />
          </label>
        </div>
      </div>

      {/* Daftar per tanggal */}
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        {sheets.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-[#111827]">Belum ada job desk di {monthKeyLabel(month)}</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              {search || division !== "all" ? "Coba ubah filter atau kata kunci." : "Job desk yang disimpan dari tab Susun Job Desk akan masuk ke arsip ini."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {sheets.map((s) => {
              const done = s.selesai + s.tidakSelesai;
              return (
                <li key={s.date} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-[#F9FAFB]">
                  <button type="button" onClick={() => setOpenDate(s.date)} className="min-w-0 flex-1 text-left cursor-pointer">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#111827]">{s.hari}, {formatJobDeskDate(s.date)}</p>
                      <StatePill state={s.state} />
                      {s.rejected > 0 && <span className="text-xs font-semibold text-[#B91C1C]">{s.rejected} ditolak</span>}
                    </div>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {s.desks.length} tugas · {s.pics.map(picName).join(", ")}
                      {s.katering > 0 && s.mbg > 0 ? ` · Katering ${s.katering}, MBG ${s.mbg}` : s.mbg > 0 ? " · MBG" : " · Katering"}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex h-1.5 w-40 overflow-hidden rounded-full bg-[#F3F4F6]">
                        <div className="bg-[#10B981]" style={{ width: `${(s.approved / s.desks.length) * 100}%` }} />
                        <div className="bg-[#FBBF24]" style={{ width: `${((done - s.approved) / s.desks.length) * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-[#6B7280]">
                        {done}/{s.desks.length} dikerjakan · {s.approved} disetujui
                        {s.menungguReview > 0 && ` · ${s.menungguReview} menunggu review`}
                      </span>
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setOpenDate(s.date)}
                      className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] cursor-pointer">
                      Lihat
                    </button>
                    <button type="button" disabled={exporting === s.date} onClick={() => downloadPdf(s.date, s.desks)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-40 cursor-pointer">
                      <FileDown className="h-3.5 w-3.5" /> {exporting === s.date ? "Membuat…" : "PDF"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Lembar tugas satu tanggal */}
      <SidePanel open={!!openSheet} onClose={() => setOpenDate(null)} wide
        title={openSheet ? `${openSheet.hari}, ${formatJobDeskDate(openSheet.date)}` : ""}
        subtitle={openSheet ? `${openSheet.desks.length} tugas · ${openSheet.selesai + openSheet.tidakSelesai} dikerjakan · ${openSheet.approved} disetujui CO_MO` : ""}
        footer={openSheet && (
          <div className="flex justify-end">
            <button type="button" disabled={exporting === openSheet.date} onClick={() => downloadPdf(openSheet.date, openSheet.desks)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FBBF24] px-4 py-2 text-sm font-bold text-[#111827] hover:bg-[#F59E0B] disabled:opacity-40 cursor-pointer">
              <FileDown className="h-4 w-4" /> {exporting === openSheet.date ? "Membuat PDF…" : "Download PDF"}
            </button>
          </div>
        )}>
        {openSheet && (
          <div className="space-y-5">
            {openSheet.pics.map((pic) => {
              const rows = openSheet.desks.filter((d) => d.pic === pic);
              return (
                <section key={pic}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#111827]">
                      {picName(pic)} <span className="font-normal text-[#6B7280]">· {rows.length} tugas</span>
                    </h3>
                    <button type="button" disabled={exporting === `${openSheet.date}-${pic}`} onClick={() => downloadPdf(`${openSheet.date}-${pic}`, rows)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-40 cursor-pointer">
                      <FileDown className="h-3.5 w-3.5" /> PDF {pic}
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                    <table className="w-full min-w-[560px] table-fixed text-sm">
                      <colgroup>
                        <col className="w-16" /><col className="w-[34%]" /><col /><col className="w-24" /><col className="w-32" />
                      </colgroup>
                      <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                        <tr>
                          {["Jam", "Kegiatan", "Keterangan", "Status PIC", "Review"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-[#6B7280]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3F4F6]">
                        {rows.map((jd) => (
                          <tr key={jd.id} className="align-top">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#374151]">{formatIndoTime(jd.startTime)}</td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-[#111827]">{jd.kegiatan || jd.title || "-"}</p>
                              <p className="font-mono text-[11px] text-[#9CA3AF]">{jd.keyId}</p>
                            </td>
                            <td className="px-3 py-2 text-[#374151] whitespace-pre-wrap">
                              {(jd.keterangan || jd.description || "-").split(" | ").join("\n")}
                              {jd.incompleteReason && <p className="mt-1 text-xs text-[#B91C1C]">Alasan: {jd.incompleteReason}</p>}
                              {jd.reviewStatus === "rejected" && jd.rejectionRemark && <p className="mt-1 text-xs text-[#B91C1C]">Remark CO_MO: {jd.rejectionRemark}</p>}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-2 text-xs font-semibold ${PIC_STATUS[picStatus(jd)]?.cls ?? ""}`}>{PIC_STATUS[picStatus(jd)]?.label ?? jd.status}</td>
                            <td className={`whitespace-nowrap px-3 py-2 text-xs font-semibold ${REVIEW_STATUS[jd.reviewStatus]?.cls ?? ""}`}>{REVIEW_STATUS[jd.reviewStatus]?.label ?? jd.reviewStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
