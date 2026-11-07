import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, ImageIcon, MapPinOff, X } from "lucide-react";

import { fetchPhotoUrl, type ReviewBody } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import {
  LEAVE_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  formatLogWaktu,
  formatTanggalPanjang,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, ApprovalList, RequestStatus, ZoneExceptionView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const STATUS_BADGE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border border-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border border-rose-200",
};

const FILTERS = [
  ["pending", "Menunggu"],
  ["approved", "Disetujui"],
  ["rejected", "Ditolak"],
  ["all", "Semua"],
] as const;

type Filter = RequestStatus | "all";
type Item =
  | { type: "request"; key: string; status: RequestStatus; createdAt: number; data: AbsensiRequestView }
  | { type: "zone"; key: string; status: RequestStatus; createdAt: number; data: ZoneExceptionView };

export interface ApprovalBoardProps {
  title: string;
  subtitle?: string;
  load: (filter: Filter) => Promise<ApprovalList>;
  reviewRequest: (id: string, body: ReviewBody) => Promise<unknown>;
  reviewZone: (id: string, body: ReviewBody) => Promise<unknown>;
  /** Asal foto selfie: admin atau kepala unit. */
  photoScope: "admin" | "tim";
  onChanged?: () => Promise<void> | void;
}

function mergeItems(list: ApprovalList): Item[] {
  const items: Item[] = [
    ...(list.requests ?? []).map((data) => ({ type: "request" as const, key: `r-${data.id}`, status: data.status, createdAt: data.createdAt, data })),
    // zoneExceptions bisa kosong kalau Worker belum versi baru.
    ...(list.zoneExceptions ?? []).map((data) => ({ type: "zone" as const, key: `z-${data.id}`, status: data.status, createdAt: data.createdAt, data })),
  ];
  return items.sort((a, b) =>
    Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt - a.createdAt);
}

/** Daftar pengajuan cuti/pergantian shift + absen luar zona yang bisa disetujui atau ditolak. */
export function ApprovalBoard({ title, subtitle, load, reviewRequest, reviewZone, photoScope, onChanged }: ApprovalBoardProps) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<Item[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const refresh = useCallback(async (next: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await load(next);
      setItems(mergeItems(res));
      setPendingCount(res.pendingCount);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh(filter);
  }, [filter, refresh]);

  const handleReview = async (item: Item, action: "approve" | "reject") => {
    setBusyKey(item.key);
    setError(null);
    try {
      const body = { action, note: notes[item.key]?.trim() || undefined };
      if (item.type === "request") await reviewRequest(item.data.id, body);
      else await reviewZone(item.data.id, body);
      await refresh(filter);
      await onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">{title}</h2>
          <p className="text-xs font-medium text-neutral-500">
            {pendingCount > 0 ? `${pendingCount} menunggu persetujuan` : subtitle ?? "Tidak ada yang tertunda"}
          </p>
        </div>
        <Button variant="outlined" size="sm" loading={loading} onClick={() => void refresh(filter)}>
          Muat ulang
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-1.5">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition ${
              filter === key ? "bg-amber-400 text-neutral-900 shadow-2xs" : "text-neutral-600 hover:bg-amber-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      {items === null && !error && <p className="py-10 text-center text-sm text-neutral-500">Memuat pengajuan...</p>}

      {items?.length === 0 && (
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-10 text-center">
          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-neutral-800">
            Tidak ada data pada kategori ini
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.key} className="space-y-3 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
              {item.type === "request"
                ? <RequestBody req={item.data} />
                : <ZoneBody zone={item.data} photoScope={photoScope} />}

              {item.status === "pending" ? (
                <div className="space-y-2.5 pt-1">
                  <input
                    type="text"
                    maxLength={300}
                    aria-label={`Catatan untuk ${item.data.employeeName}`}
                    placeholder="Catatan persetujuan / penolakan (opsional)..."
                    value={notes[item.key] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [item.key]: e.target.value }))}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyKey === item.key}
                      leftIcon={<Check className="h-3.5 w-3.5" />}
                      onClick={() => void handleReview(item, "approve")}
                    >
                      Setujui
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyKey === item.key}
                      leftIcon={<X className="h-3.5 w-3.5" />}
                      onClick={() => void handleReview(item, "reject")}
                    >
                      Tolak
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                  <span>
                    Diproses oleh <strong className="text-neutral-700">{item.data.reviewerName ?? "Admin"}</strong>
                    {item.data.reviewedAt ? ` · ${formatLogWaktu(item.data.reviewedAt)}` : ""}
                  </span>
                  {item.data.reviewNote && <span className="italic text-neutral-600">Catatan: "{item.data.reviewNote}"</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Header({ name, unitName, badge, status }: { name: string; unitName?: string | null; badge: React.ReactNode; status: RequestStatus }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">{name}</span>
        {badge}
        {unitName && (
          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-600">{unitName}</span>
        )}
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[status]}`}>{REQUEST_STATUS_LABEL[status]}</span>
    </div>
  );
}

function RequestBody({ req }: { req: AbsensiRequestView }) {
  return (
    <>
      <Header
        name={req.employeeName}
        unitName={req.unitName}
        status={req.status}
        badge={
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-800">
            {req.kind === "pergantian_shift"
              ? "Pergantian Shift"
              : req.leaveSubtype || `Permohonan ${LEAVE_TYPE_LABEL[req.leaveType ?? "cuti"]}`}
          </span>
        }
      />
      <p className="-mt-1.5 text-xs font-bold text-neutral-600">
        {req.startDate === req.endDate
          ? formatTanggalPanjang(req.startDate)
          : `${formatTanggalPanjang(req.startDate)} – ${formatTanggalPanjang(req.endDate)}`}
      </p>
      {req.kind === "pergantian_shift" ? (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-2.5 text-xs font-semibold text-amber-950">
          <p>{req.fromShift} → {req.toShift}</p>
          {req.partnerName && <p className="mt-0.5 text-amber-800">Rekan pengganti: {req.partnerName}</p>}
        </div>
      ) : (
        (req.partnerName || req.attachmentName) && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {req.partnerName && (
              <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-amber-900">Karyawan pengganti: {req.partnerName}</span>
            )}
            {req.attachmentName && (
              <span className="rounded-xl bg-neutral-100 px-3 py-1.5 text-neutral-700">Dokumen pendukung: {req.attachmentName}</span>
            )}
          </div>
        )
      )}
      <p className="rounded-2xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-700">
        <span className="font-bold text-neutral-900">Alasan:</span> "{req.reason}"
      </p>
    </>
  );
}

function ZoneBody({ zone, photoScope }: { zone: ZoneExceptionView; photoScope: "admin" | "tim" }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<"idle" | "loading" | "missing">("idle");
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const showPhoto = async () => {
    if (!zone.photoId) return;
    setPhotoState("loading");
    try {
      const url = await fetchPhotoUrl(zone.photoId, photoScope);
      setPhotoUrl(url);
      setPhotoState(url ? "idle" : "missing");
    } catch {
      setPhotoState("missing");
    }
  };

  return (
    <>
      <Header
        name={zone.employeeName}
        unitName={zone.unitName}
        status={zone.status}
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-extrabold text-rose-700">
            <MapPinOff className="h-3 w-3" aria-hidden="true" />
            {zone.kind === "pulang" ? "Clock Out" : "Clock In"} di luar zona
          </span>
        }
      />
      <p className="-mt-1.5 text-xs font-bold text-neutral-600">
        {formatLogWaktu(zone.at)} WIB
        {zone.distanceM !== null ? ` · sekitar ${Math.round(zone.distanceM)} m dari zona` : ""}
      </p>
      <p className="rounded-2xl bg-neutral-50 px-3.5 py-2.5 text-xs text-neutral-700">
        <span className="font-bold text-neutral-900">Alasan:</span> "{zone.reason}"
      </p>
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <a
          href={`https://www.google.com/maps?q=${zone.lat},${zone.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Lihat lokasi (±{Math.round(zone.accuracy)} m)
        </a>
        {zone.photoId && !photoUrl && (
          <button
            type="button"
            onClick={() => void showPhoto()}
            disabled={photoState === "loading"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {photoState === "loading" ? "Memuat..." : photoState === "missing" ? "Foto sudah terhapus" : "Lihat selfie"}
          </button>
        )}
      </div>
      {photoUrl && (
        <img src={photoUrl} alt={`Selfie ${zone.employeeName}`} className="max-h-72 rounded-2xl border border-neutral-200 object-contain" />
      )}
    </>
  );
}
