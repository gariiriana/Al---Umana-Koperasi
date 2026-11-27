// Halaman Aset Tetap (Rilis 3): Aset Aktif, Aset Tertunda, Aset Dilepas, Penyusutan & Pelepasan/Penjualan.
import { useEffect, useState } from "react";
import { Building2, Calculator, CheckCircle2, Eye, Plus, TrendingDown } from "lucide-react";
import {
  activatePendingAsset,
  applyDepreciation,
  createAsset,
  disposeAsset,
  getAsset,
  listAccounts,
  listAssets,
  listUnits,
} from "@/keuangan/api";
import { formatSen, formatTanggalShort, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, FixedAsset, Unit } from "@/keuangan/types";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, INPUT_CLS, ModalFrame, RupiahInput, UnitBadge } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export function AsetPage() {
  const { showToast } = useToast();
  const [statusTab, setStatusTab] = useState<"aktif" | "tertunda" | "dilepas">("aktif");
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [unitKode, setUnitKode] = useState("");
  const [nama, setNama] = useState("");
  const [tglAkuisisi, setTglAkuisisi] = useState(todayWib());
  const [biaya, setBiaya] = useState(0);
  const [akunAset, setAkunAset] = useState("1-10704");
  const [akunKredit, setAkunKredit] = useState("1-10002");
  const [metode, setMetode] = useState<"garis_lurus" | "saldo_menurun">("garis_lurus");
  const [masaBulan, setMasaBulan] = useState(60);
  const [nonDep, setNonDep] = useState(false);

  const [showDepModal, setShowDepModal] = useState(false);
  const [depBulan, setDepBulan] = useState(todayWib().slice(0, 7));

  const [detail, setDetail] = useState<{ asset: FixedAsset; schedule: { bulan: string; nilai: number; document_id: string | null }[] } | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<FixedAsset | null>(null);
  const [dispTgl, setDispTgl] = useState(todayWib());
  const [dispHarga, setDispHarga] = useState(0);
  const [dispKas, setDispKas] = useState("1-10002");

  const load = async () => {
    setLoading(true);
    try {
      const [list, u, a] = await Promise.all([listAssets({ status: statusTab }), listUnits(), listAccounts()]);
      setAssets(list);
      setUnits(u);
      setAccounts(a.accounts.filter((x) => !x.is_header && !x.arsip));
      if (!unitKode && u[0]) setUnitKode(u[0].kode);
    } catch (e) {
      showToast({ message: keuanganErrorMessage(e), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusTab]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createAsset({
        unit_kode: unitKode,
        nama,
        tgl_akuisisi: tglAkuisisi,
        biaya,
        akun_aset: akunAset,
        akun_kredit: akunKredit,
        non_depresiasi: nonDep,
        metode,
        masa_bulan: masaBulan,
        akun_beban: "6-60303",
        akun_akumulasi: "1-10754",
      });
      showToast({ message: "Aset tetap berhasil didaftarkan.", variant: "success" });
      setShowCreate(false);
      setNama("");
      setBiaya(0);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDepreciate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await applyDepreciation({ sampai_bulan: depBulan });
      showToast({ message: `Penyusutan berhasil diterapkan untuk ${res.appliedCount} periode aset.`, variant: "success" });
      setShowDepModal(false);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposeTarget) return;
    setSaving(true);
    try {
      const res = await disposeAsset(disposeTarget.id, { tanggal: dispTgl, harga_jual: dispHarga, setor_ke: dispKas, akun_selisih: "8-80002" });
      showToast({ message: `Aset dilepas. Laba/Rugi pelepasan: ${formatSen(res.laba_rugi)}.`, variant: "success" });
      setDisposeTarget(null);
      setDetail(null);
      await load();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const asetAccs = accounts.filter((a) => a.kategori === 5);
  const creditAccs = accounts.filter((a) => a.kategori === 3 || a.kategori === 8 || a.kategori === 12);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">Aset Tetap</h1>
          <p className="text-sm text-[#6B7280]">Catat aset tetap, aktivasi aset dari pembelian, terapkan penyusutan bulanan & pelepasan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowDepModal(true)} className={BTN_SECONDARY}>
            <Calculator className="h-4 w-4 text-amber-700" /> Terapkan Penyusutan
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> Tambah Aset Tetap
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-2">
        {(
          [
            ["aktif", "Aset Aktif"],
            ["tertunda", "Aset Tertunda"],
            ["dilepas", "Dijual / Dilepas"],
          ] as ["aktif" | "tertunda" | "dilepas", string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatusTab(k)}
            className={`rounded-xl px-4 py-2 text-sm font-bold cursor-pointer ${
              statusTab === k ? "bg-amber-600 text-white" : "bg-white border border-[#E5E7EB] text-[#374151]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && assets.length === 0 ? (
        <EmptyState icon={Building2} title={`Belum ada aset berstatus ${statusTab}`} description="Tambahkan aset baru atau aktifkan aset dari tagihan pembelian." />
      ) : (
        <div className="rounded-2xl bg-white border border-[#E5E7EB] overflow-x-auto shadow-xs">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-xs uppercase text-[#6B7280]">
              <tr>
                <th className="px-4 py-3 text-left">Nomor / Nama Aset</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Tgl Akuisisi</th>
                <th className="px-4 py-3 text-right">Biaya Perolehan</th>
                <th className="px-4 py-3 text-right">Akum. Penyusutan</th>
                <th className="px-4 py-3 text-right">Nilai Buku</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-amber-50/40">
                  <td className="px-4 py-3">
                    <div className="font-bold text-[#111827]">{a.nama}</div>
                    <div className="text-xs text-[#6B7280]">{a.no} · {a.akun_aset} {a.metode ? `· ${a.metode}` : ""}</div>
                  </td>
                  <td className="px-4 py-3"><UnitBadge kode={a.unit_kode} /></td>
                  <td className="px-4 py-3">{formatTanggalShort(a.tgl_akuisisi)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatSen(a.biaya)}</td>
                  <td className="px-4 py-3 text-right font-mono text-rose-700">{formatSen(a.total_akumulasi)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{formatSen(a.nilai_buku)}</td>
                  <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                    <button type="button" onClick={async () => setDetail(await getAsset(a.id))} className="rounded-lg p-1.5 hover:bg-gray-100 cursor-pointer" title="Jadwal Penyusutan">
                      <Eye className="h-4 w-4" />
                    </button>
                    {a.status === "tertunda" && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await activatePendingAsset(a.id, { metode: "garis_lurus", masa_bulan: 60 });
                            showToast({ message: "Aset diaktifkan.", variant: "success" });
                            await load();
                          } catch (e) {
                            showToast({ message: keuanganErrorMessage(e), variant: "error" });
                          }
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        Aktifkan
                      </button>
                    )}
                    {a.status === "aktif" && (
                      <button
                        type="button"
                        onClick={() => {
                          setDisposeTarget(a);
                          setDispHarga(a.nilai_buku);
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        Jual / Lepas
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalFrame open={showCreate} title="Catat Aset Tetap Baru" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Anak Perusahaan *</label>
              <select required value={unitKode} onChange={(e) => setUnitKode(e.target.value)} className={INPUT_CLS}>
                {units.map((u) => <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Nama Aset *</label>
              <input type="text" required value={nama} onChange={(e) => setNama(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal Akuisisi</label>
              <input type="date" required value={tglAkuisisi} onChange={(e) => setTglAkuisisi(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Biaya Perolehan *</label>
              <RupiahInput valueSen={biaya} onChangeSen={setBiaya} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Akun Aset Tetap</label>
              <select value={akunAset} onChange={(e) => setAkunAset(e.target.value)} className={INPUT_CLS}>
                {asetAccs.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Dikreditkan Dari</label>
              <select value={akunKredit} onChange={(e) => setAkunKredit(e.target.value)} className={INPUT_CLS}>
                {creditAccs.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-[#E5E7EB] pt-3 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={nonDep} onChange={(e) => setNonDep(e.target.checked)} className="h-4 w-4 accent-amber-600" />
              Aset Tidak Disusutkan (mis. Tanah)
            </label>
            {!nonDep && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6B7280] mb-1">Metode Penyusutan</label>
                  <select value={metode} onChange={(e) => setMetode(e.target.value as "garis_lurus" | "saldo_menurun")} className={INPUT_CLS}>
                    <option value="garis_lurus">Garis Lurus (Straight Line)</option>
                    <option value="saldo_menurun">Saldo Menurun (Reducing Balance)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6B7280] mb-1">Masa Manfaat (Bulan)</label>
                  <input type="number" min={1} max={600} value={masaBulan} onChange={(e) => setMasaBulan(Number(e.target.value || 60))} className={INPUT_CLS} />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>{saving ? "Menyimpan..." : "Simpan Aset"}</button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame open={showDepModal} title="Terapkan Penyusutan Bulanan" onClose={() => setShowDepModal(false)} maxWidth="max-w-md">
        <form onSubmit={handleDepreciate} className="space-y-3">
          <p className="text-xs text-[#6B7280]">Membuat jurnal penyusutan untuk seluruh aset aktif yang jadwalnya belum diterapkan hingga bulan yang dipilih.</p>
          <div>
            <label className="block text-xs font-bold text-[#6B7280] mb-1">Sampai Bulan (YYYY-MM)</label>
            <input type="month" required value={depBulan} onChange={(e) => setDepBulan(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowDepModal(false)} className={BTN_SECONDARY}>Batal</button>
            <button type="submit" disabled={saving} className={BTN_PRIMARY}>
              <TrendingDown className="h-4 w-4" /> {saving ? "Memproses..." : "Terapkan Sekarang"}
            </button>
          </div>
        </form>
      </ModalFrame>

      <ModalFrame open={Boolean(detail)} title={detail ? `Jadwal Penyusutan: ${detail.asset.nama}` : ""} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-[#F9FAFB] p-3"><div>Biaya</div><b className="font-mono text-sm">{formatSen(detail.asset.biaya)}</b></div>
              <div className="rounded-xl bg-[#F9FAFB] p-3"><div>Akumulasi</div><b className="font-mono text-sm text-rose-700">{formatSen(detail.asset.total_akumulasi)}</b></div>
              <div className="rounded-xl bg-[#F9FAFB] p-3"><div>Nilai Buku</div><b className="font-mono text-sm">{formatSen(detail.asset.nilai_buku)}</b></div>
            </div>
            <div className="max-h-72 overflow-y-auto border border-[#E5E7EB] rounded-xl">
              <table className="min-w-full text-xs">
                <thead className="bg-[#F9FAFB] text-[#6B7280]">
                  <tr><th className="px-3 py-2 text-left">Bulan</th><th className="px-3 py-2 text-right">Penyusutan</th><th className="px-3 py-2 text-left">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {detail.schedule.map((s) => (
                    <tr key={s.bulan}>
                      <td className="px-3 py-2 font-mono">{s.bulan}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatSen(s.nilai)}</td>
                      <td className="px-3 py-2">{s.document_id ? <span className="text-emerald-700 font-bold">Diterapkan</span> : "Terjadwal"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ModalFrame>

      <ModalFrame open={Boolean(disposeTarget)} title={disposeTarget ? `Jual / Lepas Aset: ${disposeTarget.nama}` : ""} onClose={() => setDisposeTarget(null)} maxWidth="max-w-md">
        {disposeTarget && (
          <form onSubmit={handleDispose} className="space-y-3">
            <div className="text-xs text-[#6B7280]">Nilai buku saat ini: <b className="font-mono text-[#111827]">{formatSen(disposeTarget.nilai_buku)}</b></div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Tanggal Pelepasan</label>
              <input type="date" required value={dispTgl} onChange={(e) => setDispTgl(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#6B7280] mb-1">Harga Jual (0 jika dihapusbukukan)</label>
              <RupiahInput valueSen={dispHarga} onChangeSen={setDispHarga} />
            </div>
            {dispHarga > 0 && (
              <div>
                <label className="block text-xs font-bold text-[#6B7280] mb-1">Setor Ke Kas/Bank</label>
                <select value={dispKas} onChange={(e) => setDispKas(e.target.value)} className={INPUT_CLS}>
                  {accounts.filter((a) => a.kategori === 3).map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDisposeTarget(null)} className={BTN_SECONDARY}>Batal</button>
              <button type="submit" disabled={saving} className={BTN_DANGER}>
                <CheckCircle2 className="h-4 w-4" /> {saving ? "Memproses..." : "Proses Pelepasan"}
              </button>
            </div>
          </form>
        )}
      </ModalFrame>
    </div>
  );
}
