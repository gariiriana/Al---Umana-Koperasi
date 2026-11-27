// Halaman Kontak (Pelanggan, Supplier, Karyawan, Lainnya & Grup Kontak — PRD 01-dasar.md).
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Users } from "lucide-react";
import { createContact, deleteContact, listContactGroups, listContacts, saveContactGroup, updateContact } from "@/keuangan/api";
import { keuanganErrorMessage } from "@/keuangan/format";
import type { Contact, ContactGroup } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, ModalFrame } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

const TABS = [
  { key: "semua", label: "Semua" },
  { key: "pelanggan", label: "Pelanggan" },
  { key: "supplier", label: "Supplier" },
  { key: "karyawan", label: "Karyawan" },
  { key: "lainnya", label: "Lainnya" },
];

export function KontakPage() {
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [tab, setTab] = useState("semua");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({
    nama_tampilan: "",
    tipe: ["pelanggan"] as string[],
    grup_id: "",
    nama_lengkap: "",
    perusahaan: "",
    email: "",
    hp: "",
    npwp: "",
    alamat_tagih: "",
    info: "",
  });

  const load = async () => {
    try {
      const [c, g] = await Promise.all([listContacts({ tipe: tab === "semua" ? undefined : tab }), listContactGroups()]);
      setContacts(c);
      setGroups(g);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    }
  };

  useEffect(() => {
    load();
  }, [tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.nama_tampilan.toLowerCase().includes(q) ||
        c.perusahaan.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.hp.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      nama_tampilan: "",
      tipe: [tab === "semua" ? "pelanggan" : tab],
      grup_id: "",
      nama_lengkap: "",
      perusahaan: "",
      email: "",
      hp: "",
      npwp: "",
      alamat_tagih: "",
      info: "",
    });
    setModalOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      nama_tampilan: c.nama_tampilan,
      tipe: c.tipe,
      grup_id: c.grup_id || "",
      nama_lengkap: c.nama_lengkap || "",
      perusahaan: c.perusahaan || "",
      email: c.email || "",
      hp: c.hp || "",
      npwp: c.npwp || "",
      alamat_tagih: c.alamat_tagih || "",
      info: c.info || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await updateContact(editing.id, { ...form, grup_id: form.grup_id || null });
        showToast({ message: "Kontak diperbarui.", variant: "success" });
      } else {
        await createContact({ ...form, grup_id: form.grup_id || null });
        showToast({ message: "Kontak ditambahkan.", variant: "success" });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleAddGroup = async () => {
    const nama = window.prompt("Nama Grup Kontak baru:");
    if (!nama?.trim()) return;
    try {
      await saveContactGroup(nama.trim());
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const handleDelete = async (c: Contact) => {
    if (!window.confirm(`Hapus kontak ${c.nama_tampilan}?`)) return;
    try {
      await deleteContact(c.id);
      showToast({ message: "Kontak dihapus.", variant: "success" });
      setModalOpen(false);
      load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    }
  };

  const toggleType = (t: string) => {
    setForm((prev) => ({
      ...prev,
      tipe: prev.tipe.includes(t) ? prev.tipe.filter((x) => x !== t) : [...prev.tipe, t],
    }));
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Kontak</h1>
          <p className="text-sm text-[#6B7280]">Pelanggan, supplier, karyawan, dan pihak terkait transaksi.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleAddGroup} className={BTN_SECONDARY}>
            <Users className="h-4 w-4" /> + Grup Kontak
          </button>
          <button type="button" onClick={openCreate} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> Buat Kontak Baru
          </button>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="rounded-2xl bg-white border border-[#E5E7EB] p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold cursor-pointer transition ${
                tab === t.key ? "bg-[#FBBF24] text-[#111827]" : "bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px]">
          <Search className="h-4 w-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kontak..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLS} pl-9`}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-xs font-bold text-[#6B7280] border-b border-[#E5E7EB]">
            <tr>
              <th className="px-4 py-3 text-left">Nama Tampilan</th>
              <th className="px-4 py-3 text-left">Tipe</th>
              <th className="px-4 py-3 text-left">Perusahaan</th>
              <th className="px-4 py-3 text-left">Email & HP</th>
              <th className="px-4 py-3 text-left">Alamat</th>
              <th className="px-4 py-3 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#6B7280]">Belum ada kontak.</td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-bold text-[#111827]">{c.nama_tampilan}</td>
                  <td className="px-4 py-2.5 space-x-1">
                    {c.tipe.map((t) => (
                      <span key={t} className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 capitalize">
                        {t}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#4B5563]">{c.perusahaan || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-[#4B5563]">
                    <div>{c.email || "—"}</div>
                    <div>{c.hp || ""}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[#6B7280] max-w-xs truncate">{c.alamat_tagih || "—"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                    <button type="button" onClick={() => openEdit(c)} className="text-xs font-bold text-amber-700 hover:underline cursor-pointer">
                      Ubah
                    </button>
                    {!c.tx_count && (
                      <button type="button" onClick={() => handleDelete(c)} className="text-red-500 hover:text-red-700 cursor-pointer">
                        <Trash2 className="inline h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ModalFrame open={modalOpen} title={editing ? `Ubah Kontak` : "Kontak Baru"} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Tampilan</label>
            <input type="text" required value={form.nama_tampilan} onChange={(e) => setForm({ ...form, nama_tampilan: e.target.value })} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Tipe Kontak</label>
            <div className="flex flex-wrap gap-2">
              {["pelanggan", "supplier", "karyawan", "lainnya"].map((t) => (
                <label key={t} className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize cursor-pointer">
                  <input type="checkbox" checked={form.tipe.includes(t)} onChange={() => toggleType(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Grup Kontak</label>
              <select value={form.grup_id} onChange={(e) => setForm({ ...form, grup_id: e.target.value })} className={INPUT_CLS}>
                <option value="">— Tanpa Grup —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Nama Perusahaan / Lembaga</label>
              <input type="text" value={form.perusahaan} onChange={(e) => setForm({ ...form, perusahaan: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">No. HP / WhatsApp</label>
              <input type="text" value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">NPWP</label>
            <input type="text" value={form.npwp} onChange={(e) => setForm({ ...form, npwp: e.target.value })} className={INPUT_CLS} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#4B5563] mb-1">Alamat Penagihan</label>
            <textarea rows={2} value={form.alamat_tagih} onChange={(e) => setForm({ ...form, alamat_tagih: e.target.value })} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
            {editing && !editing.tx_count && (
              <button type="button" onClick={() => handleDelete(editing)} className={BTN_DANGER}>Hapus</button>
            )}
            <button type="button" onClick={() => setModalOpen(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" className={BTN_PRIMARY}>Simpan Kontak</button>
          </div>
        </form>
      </ModalFrame>
    </div>
  );
}
