import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, PackageCheck } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { buildCourierTaskList, type CourierTaskCard } from "@/lib/courierTasks";
import { subscribeMyMbgTasks, subscribeRecentMbgBatchDates } from "@/services/courierTaskService";
import { subscribeCourierOrders } from "@/services/realtimeService";
import { getJakartaDate } from "@/utils/date";
import type { MbgDeliveryTask } from "@/types/mbg";
import type { Order } from "@/types/order";

const BADGE: Record<CourierTaskCard["kind"], { text: string; className: string }> = {
  mbg: { text: "MBG", className: "bg-emerald-100 text-emerald-800" },
  katering: { text: "KATERING", className: "bg-orange-100 text-orange-800" },
};

function longToday(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
}

function TaskCard({ card }: { card: CourierTaskCard }) {
  const badge = BADGE[card.kind];
  return (
    <li>
      <Link
        to={card.href}
        aria-label={`${badge.text} ${card.title}, ${card.detail}, ${card.statusLabel}`}
        className={`flex min-h-[88px] items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm transition-colors active:bg-[#FEF3C7] hover:border-[#FBBF24] ${card.done ? "border-[#E5E7EB] opacity-70" : "border-[#E5E7EB]"}`}
      >
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${badge.className}`}>{badge.text}</span>
          <p className="mt-1 truncate text-lg font-bold text-[#111827]">{card.title}</p>
          <p className="line-clamp-2 text-sm text-[#4B5563]">{card.detail}</p>
          <p className={`mt-1 text-sm font-semibold ${card.done ? "text-emerald-700" : "text-[#B45309]"}`}>{card.statusLabel}</p>
        </div>
        <ChevronRight className="h-7 w-7 shrink-0 text-[#9CA3AF]" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Halaman utama semua kurir (katering & MBG): satu daftar tugas hari ini.
 * Kartu membuka halaman antar yang sudah ada, langsung ke tugasnya.
 */
export function TugasSayaPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const uid = user?.uid ?? "";
  const today = getJakartaDate();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [batchDates, setBatchDates] = useState<Record<string, string> | null>(null);
  const [mbgTasks, setMbgTasks] = useState<MbgDeliveryTask[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    return subscribeCourierOrders(uid, setOrders, (error) => {
      showToast({ message: `Gagal memuat pesanan katering: ${error.message}`, variant: "error" });
      setOrders([]);
    });
  }, [uid, showToast]);

  useEffect(() => subscribeRecentMbgBatchDates(today, setBatchDates, (error) => {
    showToast({ message: `Gagal memuat batch MBG: ${error.message}`, variant: "error" });
    setBatchDates({});
  }), [today, showToast]);

  const batchKey = batchDates ? Object.keys(batchDates).sort().join(",") : null;
  useEffect(() => {
    if (!uid || batchKey === null) return;
    return subscribeMyMbgTasks(uid, batchKey ? batchKey.split(",") : [], setMbgTasks, (error) => {
      showToast({ message: `Gagal memuat tugas MBG: ${error.message}`, variant: "error" });
      setMbgTasks([]);
    });
  }, [uid, batchKey, showToast]);

  const cards = useMemo(() => buildCourierTaskList({
    uid, today, orders: orders ?? [], mbgTasks: mbgTasks ?? [], batchDates: batchDates ?? {},
  }), [uid, today, orders, mbgTasks, batchDates]);

  const loading = orders === null || mbgTasks === null;
  const todo = cards.filter((card) => !card.done);
  const done = cards.filter((card) => card.done);

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-5 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <header>
        <h1 className="text-2xl font-bold text-[#111827]">Tugas Saya</h1>
        <p className="mt-0.5 text-sm text-[#6B7280]">{longToday(today)}</p>
      </header>

      {loading ? (
        <p role="status" className="rounded-2xl bg-white p-6 text-center text-base text-[#6B7280]">Memuat tugas...</p>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-6 py-10 text-center">
          <PackageCheck className="h-12 w-12 text-[#D1D5DB]" aria-hidden="true" />
          <p className="text-xl font-bold text-[#111827]">Belum ada tugas hari ini</p>
          <p className="text-sm text-[#6B7280]">Tugas baru akan muncul di sini dan kamu dapat notifikasi.</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="tugas-belum">
            <h2 id="tugas-belum" className="mb-2 text-base font-bold text-[#111827]">
              Belum selesai <span className="ml-1 rounded-full bg-[#FBBF24] px-2 py-0.5 text-sm">{todo.length}</span>
            </h2>
            {todo.length === 0 ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-4 text-center text-base font-semibold text-emerald-800">Semua tugas sudah selesai 👍</p>
            ) : (
              <ul className="space-y-3">{todo.map((card) => <TaskCard key={card.key} card={card} />)}</ul>
            )}
          </section>
          {done.length > 0 && (
            <section aria-labelledby="tugas-selesai">
              <h2 id="tugas-selesai" className="mb-2 text-base font-bold text-[#6B7280]">Selesai hari ini</h2>
              <ul className="space-y-3">{done.map((card) => <TaskCard key={card.key} card={card} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default TugasSayaPage;
