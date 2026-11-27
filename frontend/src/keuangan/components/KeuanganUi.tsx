// Komponen UI bersama Modul Keuangan Al-Umanaa (gaya Al-Umanaa amber/abu tua).
import { useState, type ReactNode } from "react";
import { Check, Copy, Download, ExternalLink, FileSpreadsheet, FileText, Loader2, Paperclip, Share2, Trash2, Upload, X } from "lucide-react";
import { attachmentUrl, createOrGetPublicLink, deleteAttachment, uploadAttachmentFile } from "@/keuangan/api";
import { formatSen, keuanganErrorMessage, parseRupiahToSen, senToInputString } from "@/keuangan/format";
import type { ReportFilter, Unit } from "@/keuangan/types";
import { useToast } from "@/contexts/ToastContext";

export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 px-4 py-2 text-sm font-bold text-white shadow-xs transition-colors cursor-pointer";
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] disabled:opacity-50 px-3.5 py-2 text-sm font-semibold text-[#374151] transition-colors cursor-pointer";
export const BTN_DANGER =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-3.5 py-2 text-sm font-semibold text-red-700 transition-colors cursor-pointer";
export const INPUT_CLS =
  "w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-transparent";

/** Input nominal uang Rupiah yang menyimpan state sebagai INTEGER sen (rupiah x 100). */
export function RupiahInput({
  valueSen,
  onChangeSen,
  placeholder = "0",
  disabled = false,
  className = "",
}: {
  valueSen: number;
  onChangeSen: (sen: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");

  const display = focused ? raw : valueSen ? formatSen(valueSen, { prefix: "" }) : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={display}
      onFocus={() => {
        setFocused(true);
        setRaw(senToInputString(valueSen));
      }}
      onChange={(e) => {
        setRaw(e.target.value);
        onChangeSen(parseRupiahToSen(e.target.value));
      }}
      onBlur={() => setFocused(false)}
      className={`${INPUT_CLS} text-right font-mono ${className}`}
    />
  );
}

export function UnitBadge({ kode }: { kode?: string | null }) {
  if (!kode) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
        Bersama
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
      {kode}
    </span>
  );
}

export function ModalFrame({
  open,
  title,
  onClose,
  maxWidth = "max-w-3xl",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5 overflow-y-auto">
      <div className={`w-full ${maxWidth} rounded-2xl bg-white shadow-2xl border border-[#E5E7EB] my-auto max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-base sm:text-lg font-extrabold text-[#111827]">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#6B7280] hover:bg-gray-100 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Bar filter standar semua Laporan Keuangan (sesuai PRD 07-laporan.md). */
export function ReportFilterBar({
  filter,
  onChange,
  onRefresh,
  units,
  loading,
  singleDateMode = false,
  allowCompare = true,
  onExportPdf,
  onExportExcel,
  onExportCsv,
  extra,
}: {
  filter: ReportFilter;
  onChange: (next: ReportFilter) => void;
  onRefresh: () => void;
  units: Unit[];
  loading?: boolean;
  singleDateMode?: boolean;
  allowCompare?: boolean;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onExportCsv?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {!singleDateMode && (
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal Awal</label>
            <input
              type="date"
              value={filter.dari || ""}
              onChange={(e) => onChange({ ...filter, dari: e.target.value })}
              className={INPUT_CLS}
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-[#6B7280] mb-1">
            {singleDateMode ? "Per Tanggal" : "Tanggal Akhir"}
          </label>
          <input
            type="date"
            value={filter.sampai || ""}
            onChange={(e) => onChange({ ...filter, sampai: e.target.value })}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan</label>
          <select
            value={filter.unit_kode || ""}
            onChange={(e) => onChange({ ...filter, unit_kode: e.target.value || undefined })}
            className={INPUT_CLS}
          >
            <option value="">Semua Unit (Gabungan)</option>
            {units.map((u) => (
              <option key={u.kode} value={u.kode}>
                {u.kode} — {u.nama}
              </option>
            ))}
          </select>
        </div>

        {allowCompare && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Bandingkan</label>
              <select
                value={filter.banding_periode || "none"}
                onChange={(e) =>
                  onChange({
                    ...filter,
                    banding_periode: e.target.value as ReportFilter["banding_periode"],
                    banding_jumlah: e.target.value === "none" ? 0 : filter.banding_jumlah || 1,
                  })
                }
                className={INPUT_CLS}
              >
                <option value="none">Tidak dibandingkan</option>
                <option value="mingguan">Mingguan</option>
                <option value="bulanan">Bulanan</option>
                <option value="triwulan">Triwulan</option>
                <option value="semi_tahunan">Semi-Tahunan</option>
                <option value="tahunan">Tahunan</option>
              </select>
            </div>
            {filter.banding_periode && filter.banding_periode !== "none" && (
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Jml Periode</label>
                <input
                  type="number"
                  min={1}
                  max={filter.banding_periode === "tahunan" ? 3 : 11}
                  value={filter.banding_jumlah || 1}
                  onChange={(e) => onChange({ ...filter, banding_jumlah: Math.max(1, Number(e.target.value || 1)) })}
                  className={`${INPUT_CLS} w-24`}
                />
              </div>
            )}
          </>
        )}

        {extra}

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button type="button" onClick={onRefresh} disabled={loading} className={BTN_PRIMARY}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Tampilkan
          </button>
          {onExportPdf && (
            <button type="button" onClick={onExportPdf} className={BTN_SECONDARY} title="Ekspor PDF">
              <FileText className="h-4 w-4 text-red-600" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          )}
          {onExportExcel && (
            <button type="button" onClick={onExportExcel} className={BTN_SECONDARY} title="Ekspor Excel">
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          )}
          {onExportCsv && (
            <button type="button" onClick={onExportCsv} className={BTN_SECONDARY} title="Ekspor CSV">
              <Download className="h-4 w-4 text-slate-600" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Modal Bagikan Dokumen via WhatsApp + Tautan Publik (Opsi a). */
export function ShareDocModal({
  documentId,
  docNo,
  docLabel,
  amountSen,
  onClose,
}: {
  documentId: string | null;
  docNo: string;
  docLabel: string;
  amountSen: number;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [linkUrl, setLinkUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const link = await createOrGetPublicLink(documentId);
      const fullUrl = `${window.location.origin}/f/${link.token}`;
      setLinkUrl(fullUrl);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (!documentId) return null;

  const waText = encodeURIComponent(
    `Assalamu'alaikum,\nBerikut tautan bukti ${docLabel} *${docNo}* senilai *${formatSen(amountSen)}*:\n${linkUrl}\n\nKoperasi & Unit Usaha Al-Umanaa`,
  );

  return (
    <ModalFrame open={Boolean(documentId)} title={`Bagikan ${docNo}`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-[#4B5563]">
          Buat tautan publik read-only agar penerima dapat melihat bukti transaksi dan mengunduh PDF tanpa login.
        </p>
        {!linkUrl ? (
          <button type="button" onClick={generateLink} disabled={loading} className={BTN_PRIMARY}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Buat Tautan Publik
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input readOnly value={linkUrl} className={`${INPUT_CLS} bg-gray-50 font-mono text-xs`} />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(linkUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={BTN_SECONDARY}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                Salin
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
              >
                <Share2 className="h-4 w-4" /> Bagikan ke WhatsApp
              </a>
              <a href={linkUrl} target="_blank" rel="noreferrer" className={BTN_SECONDARY}>
                <ExternalLink className="h-4 w-4" /> Buka Tautan
              </a>
            </div>
          </div>
        )}
      </div>
    </ModalFrame>
  );
}

/** Komponen unggah dan daftar lampiran terkompresi di D1. */
export function AttachmentSection({
  documentId,
  attachments,
  onUploaded,
  onDeleted,
  disabled,
}: {
  documentId?: string;
  attachments: { id: string; filename: string; mime: string; size: number }[];
  onUploaded: (att: { id: string; filename: string; mime: string; size: number }) => void;
  onDeleted: (id: string) => void;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadAttachmentFile(file, documentId);
      onUploaded(att);
      showToast({ message: `Lampiran ${att.filename} tersimpan (${Math.round(att.size / 1024)} KB).`, variant: "success" });
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAttachment(id);
      onDeleted(id);
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4B5563]">
          <Paperclip className="h-3.5 w-3.5" /> Lampiran Nota (Foto dikompres ≤ 80 KB, PDF ≤ 300 KB)
        </span>
        {!disabled && (
          <label className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#D1D5DB] px-2.5 py-1 text-xs font-semibold text-[#374151] hover:bg-gray-100 cursor-pointer">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Unggah
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} disabled={uploading} />
          </label>
        )}
      </div>
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-[#E5E7EB] px-2.5 py-1.5 text-xs">
              <a href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="text-amber-700 hover:underline truncate font-semibold">
                {a.filename} ({Math.round(a.size / 1024)} KB)
              </a>
              {!disabled && (
                <button type="button" onClick={() => handleDelete(a.id)} className="text-red-500 hover:text-red-700 cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
