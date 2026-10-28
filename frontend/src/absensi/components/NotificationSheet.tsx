import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, CheckCircle2, FileText, X, XCircle } from "lucide-react";

import { getNotifications, markNotificationsRead } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { formatLogWaktu } from "@/absensi/logic/format";
import type { AbsensiNotificationView } from "@/absensi/types";

export function NotificationBellButton({ variant = "header" }: { variant?: "header" | "plain" }) {
  const { me, reloadMe } = useAbsensiSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AbsensiNotificationView[]>([]);
  const [unread, setUnread] = useState<number>(me?.unreadNotifications ?? 0);

  useEffect(() => {
    if (typeof me?.unreadNotifications === "number") {
      setUnread(me.unreadNotifications);
    }
  }, [me?.unreadNotifications]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications();
      setItems(res.notifications);
      setUnread(res.unreadCount);
    } catch {
      // Abaikan kegagalan jaringan sementara pada drawer notifikasi.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleMarkAll = async () => {
    try {
      const res = await markNotificationsRead();
      setUnread(res.unreadCount);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
      void reloadMe();
    } catch {
      // Abaikan jika offline.
    }
  };

  const handleSelect = async (notif: AbsensiNotificationView) => {
    if (notif.readAt === null) {
      try {
        const res = await markNotificationsRead(notif.id);
        setUnread(res.unreadCount);
        setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, readAt: Date.now() } : n)));
        void reloadMe();
      } catch {
        // Lanjutkan navigasi meski gagal tandai baca.
      }
    }
    setOpen(false);
    if (me?.role === "admin_absensi") {
      navigate("/absensi/admin/persetujuan");
    } else {
      navigate("/absensi/persetujuan");
    }
  };

  const btnStyle = variant === "header"
    ? "relative flex h-10 w-10 items-center justify-center rounded-full bg-white/30 text-neutral-900 shadow-xs backdrop-blur-xs transition hover:bg-white/50"
    : "relative flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 transition hover:bg-amber-50";

  return (
    <>
      <button
        type="button"
        aria-label="Notifikasi"
        onClick={() => setOpen(true)}
        className={btnStyle}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white shadow-xs">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Daftar Notifikasi"
          className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 bg-gradient-to-r from-amber-50 to-white px-5 py-4">
              <div>
                <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
                  Notifikasi
                </h2>
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-neutral-500">
                  {unread > 0 ? `${unread} belum dibaca` : "Semua sudah dibaca"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleMarkAll()}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-200"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Baca semua
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Tutup notifikasi"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
              {loading && items.length === 0 && (
                <p className="p-6 text-center text-sm text-neutral-500">Memuat notifikasi...</p>
              )}
              {!loading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                    <Bell className="h-6 w-6" />
                  </div>
                  <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-neutral-800">
                    Belum ada notifikasi
                  </p>
                  <p className="text-xs text-neutral-500">
                    Pemberitahuan pengajuan cuti dan pergantian shift akan muncul di sini.
                  </p>
                </div>
              )}

              {items.map((notif) => {
                const isUnread = notif.readAt === null;
                const Icon = notif.kind === "pengajuan_disetujui"
                  ? CheckCircle2
                  : notif.kind === "pengajuan_ditolak"
                    ? XCircle
                    : FileText;
                const iconTone = notif.kind === "pengajuan_disetujui"
                  ? "bg-emerald-100 text-emerald-700"
                  : notif.kind === "pengajuan_ditolak"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-800";

                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => void handleSelect(notif)}
                    className={`flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-amber-50/50 ${
                      isUnread ? "bg-amber-50/35" : "bg-white"
                    }`}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-neutral-900">
                          {notif.title}
                        </p>
                        {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{notif.body}</p>
                      <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
                        {formatLogWaktu(notif.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

