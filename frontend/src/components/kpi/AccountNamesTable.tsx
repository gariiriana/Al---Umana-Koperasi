// ============================================================================
// Akun & Nama — Super Admin mengisi "atas nama siapa" tiap akun role
// Akun dipakai per role (mis. "distributor"), jadi nama orangnya disimpan
// terpisah di users/{uid}.holderName tanpa mengubah nama akun / login.
// ============================================================================

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface AccountRow {
  uid: string;
  displayName: string;
  email?: string;
  role: string;
  holderName?: string;
}

const inputCls = "rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]";
const th = "px-4 py-2.5 text-left text-xs font-semibold text-[#6B7280]";

export function AccountNamesTable({ accounts, roleLabel, onSave }: {
  accounts: AccountRow[];
  roleLabel: (role: string) => string;
  onSave: (uid: string, holderName: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  const emptyCount = accounts.filter((a) => !a.holderName?.trim()).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts
      .filter((a) => !onlyEmpty || !a.holderName?.trim())
      .filter((a) => !q || [a.holderName, a.displayName, a.email, roleLabel(a.role)].some((v) => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => roleLabel(a.role).localeCompare(roleLabel(b.role), "id") || a.displayName.localeCompare(b.displayName, "id"));
  }, [accounts, search, onlyEmpty, roleLabel]);

  const save = async (a: AccountRow) => {
    const value = drafts[a.uid];
    if (value === undefined || value.trim() === (a.holderName ?? "").trim()) return;
    setSavingId(a.uid);
    try {
      await onSave(a.uid, value);
      setDrafts((d) => {
        const next = { ...d };
        delete next[a.uid];
        return next;
      });
    } catch {
      // Pesan error ditampilkan halaman induk; ketikan tetap ada supaya bisa dicoba lagi.
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#6B7280]">
          Isi nama orang yang memegang tiap akun. Nama ini dipakai di KPI, task, Excel, dan menu akun.
          {emptyCount > 0 && <span className="ml-1 font-semibold text-[#B45309]">{emptyCount} akun belum diberi nama.</span>}
        </p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[#374151] cursor-pointer">
            <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} className="accent-[#111827]" />
            Belum diberi nama
          </label>
          <label className="relative flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari akun / nama" className={`${inputCls} w-full pl-9 sm:w-48`} />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
        <table className="w-full">
          <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
            <tr>
              <th className={th}>Role</th>
              <th className={`${th} hidden sm:table-cell`}>Akun</th>
              <th className={th}>Atas nama</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {rows.map((a) => {
              const value = drafts[a.uid] ?? a.holderName ?? "";
              const changed = drafts[a.uid] !== undefined && drafts[a.uid].trim() !== (a.holderName ?? "").trim();
              return (
                <tr key={a.uid}>
                  <td className="px-4 py-2.5 align-middle">
                    <p className="text-sm font-semibold text-[#111827]">{roleLabel(a.role)}</p>
                    <p className="text-xs text-[#6B7280] sm:hidden">{a.displayName}</p>
                  </td>
                  <td className="hidden px-4 py-2.5 align-middle sm:table-cell">
                    <p className="text-sm text-[#111827]">{a.displayName}</p>
                    {a.email && <p className="text-xs text-[#6B7280]">{a.email}</p>}
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <div className="flex gap-2">
                      <input value={value} maxLength={60} placeholder="Contoh: Dwi Saputra"
                        aria-label={`Atas nama untuk akun ${a.displayName}`}
                        onChange={(e) => setDrafts((d) => ({ ...d, [a.uid]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") void save(a); }}
                        className={`${inputCls} w-full min-w-0`} />
                      <button type="button" onClick={() => void save(a)} disabled={!changed || savingId === a.uid}
                        className="shrink-0 rounded-lg bg-[#FBBF24] px-3 py-2 text-xs font-bold text-[#111827] hover:bg-[#F59E0B] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                        {savingId === a.uid ? "…" : "Simpan"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={3} className="px-6 py-10 text-center text-sm text-[#6B7280]">Tidak ada akun yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
