// ============================================================================
// Modal Buat Task — Super Admin memberi task ke satu personel
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getJakartaDate } from "@/utils/date";
import { useEscapeLayer } from "@/hooks/useEscapeLayer";
import { deadlineMillis, formatDeadline } from "@/utils/taskKpi";

export interface TaskAssignee {
  uid: string;
  displayName: string;
  role: string;
}

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  people: TaskAssignee[];
  defaultAssigneeId?: string | null;
  roleLabel: (role: string) => string;
  onCreate: (input: { assignee: TaskAssignee; title: string; instructions: string; deadline: string }) => Promise<void>;
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return getJakartaDate(d);
};

const inputCls = "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]";

export function CreateTaskModal({ open, onClose, people, defaultAssigneeId, roleLabel, onCreate }: CreateTaskModalProps) {
  const today = getJakartaDate();
  const [assigneeId, setAssigneeId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("17:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAssigneeId(defaultAssigneeId ?? ""); setTitle(""); setInstructions("");
    setDate(getJakartaDate()); setTime("17:00"); setError("");
  }, [open, defaultAssigneeId]);

  const groups = useMemo(() => {
    const m = new Map<string, TaskAssignee[]>();
    for (const p of [...people].sort((a, b) => a.displayName.localeCompare(b.displayName, "id"))) m.set(p.role, [...(m.get(p.role) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => roleLabel(a).localeCompare(roleLabel(b), "id"));
  }, [people, roleLabel]);

  useEscapeLayer(open, () => { if (!busy) onClose(); });

  if (!open) return null;

  const deadline = date && time ? `${date}T${time}` : "";
  const isPast = deadline !== "" && deadlineMillis(deadline) <= Date.now();
  const assignee = people.find((p) => p.uid === assigneeId);
  const canSubmit = !!assignee && title.trim() !== "" && instructions.trim() !== "" && deadline !== "" && !isPast && !busy;

  const quick = [
    { label: "Hari ini 17:00", date: today, time: "17:00" },
    { label: "Besok 17:00", date: addDays(today, 1), time: "17:00" },
    { label: "3 hari lagi", date: addDays(today, 3), time: "17:00" },
    { label: "1 minggu", date: addDays(today, 7), time: "17:00" },
  ];

  const submit = async () => {
    if (!canSubmit || !assignee) return;
    setBusy(true);
    try {
      await onCreate({ assignee, title: title.trim(), instructions: instructions.trim(), deadline });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat task.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 sm:p-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <div role="dialog" aria-modal="true" aria-label="Buat task"
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <h2 className="text-base font-bold text-[#111827]">Buat Task</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F3F4F6] cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-sm font-medium text-[#374151]">Untuk</span>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={`${inputCls} mt-1 cursor-pointer`}>
              <option value="">Pilih personel…</option>
              {groups.map(([role, members]) => (
                <optgroup key={role} label={roleLabel(role)}>
                  {members.map((p) => <option key={p.uid} value={p.uid}>{p.displayName}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#374151]">Judul task</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Rekap stok bahan kering minggu ini" className={`${inputCls} mt-1`} />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#374151]">Instruksi</span>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4}
              placeholder="Jelaskan apa yang harus dikerjakan dan hasil yang diharapkan" className={`${inputCls} mt-1 resize-none`} />
          </label>

          <div>
            <span className="text-sm font-medium text-[#374151]">Deadline (WIB)</span>
            <div className="mt-1 grid grid-cols-[1fr_120px] gap-2">
              <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="Tanggal deadline" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} aria-label="Jam deadline" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quick.map((q) => {
                const active = q.date === date && q.time === time;
                return (
                  <button key={q.label} type="button" onClick={() => { setDate(q.date); setTime(q.time); }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${active ? "border-[#111827] bg-[#111827] text-white" : "border-[#E5E7EB] text-[#374151] hover:bg-[#F3F4F6]"}`}>
                    {q.label}
                  </button>
                );
              })}
            </div>
            {deadline && (
              <p className={`mt-2 text-xs ${isPast ? "text-[#B91C1C] font-medium" : "text-[#6B7280]"}`}>
                {isPast ? "Deadline sudah lewat, pilih waktu yang akan datang." : `Harus disubmit sebelum ${formatDeadline(deadline)}`}
              </p>
            )}
          </div>

          {error && <p className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[#E5E7EB] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6] cursor-pointer">Batal</button>
          <button type="button" onClick={submit} disabled={!canSubmit}
            className="rounded-lg bg-[#FBBF24] px-4 py-2 text-sm font-bold text-[#111827] hover:bg-[#F59E0B] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            {busy ? "Mengirim…" : "Kirim Task"}
          </button>
        </footer>
      </div>
    </div>
  );
}
