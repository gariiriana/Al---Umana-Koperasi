import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import type { JobDeskSyncState } from "@/hooks/useJobDeskSync";

const jam = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Status sinkron data job desk: baris kecil saat normal, peringatan saat tertinggal dari server. */
export function JobDeskSyncStatus({ state, checkedAt, onSync }: {
  state: JobDeskSyncState;
  checkedAt: number | null;
  onSync: () => void;
}) {
  if (state === "stale") {
    return (
      <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
        <WifiOff className="h-5 w-5 text-red-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-red-800">Data job desk di perangkat ini tertinggal dari server</p>
          <p className="text-xs text-red-700">Submit terbaru dari tim mungkin belum tampil. Klik Sinkronkan; kalau masih muncul, muat ulang halaman.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={onSync}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> Sinkronkan
          </button>
          <button type="button" onClick={() => window.location.reload()}
            className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 cursor-pointer">
            Muat ulang
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
      {state === "checking" ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memeriksa sinkronisasi…
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Tersinkron dengan server{checkedAt ? ` · dicek ${jam(checkedAt)}` : ""}
        </span>
      )}
      <button type="button" onClick={onSync} disabled={state === "checking"}
        className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-950 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer">
        <RefreshCw className="h-3 w-3" /> Sinkronkan
      </button>
    </div>
  );
}
