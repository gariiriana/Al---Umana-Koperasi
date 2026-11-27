// Modal Transaksi Kas & Bank (Terima Uang, Kirim Uang, Transfer Uang + Transfer Antar Unit + Pajak & Pemotongan).
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { createDocument, deleteDocument, getDocument, updateDocument } from "@/keuangan/api";
import { DOC_TYPE_LABELS, formatSen, keuanganErrorMessage, todayWib } from "@/keuangan/format";
import type { Account, Contact, Tax, Unit } from "@/keuangan/types";
import { AttachmentSection, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT_CLS, ModalFrame, RupiahInput, ShareDocModal } from "@/keuangan/components/KeuanganUi";
import { useToast } from "@/contexts/ToastContext";

export type CashTxMode = "receive_money" | "send_money" | "transfer_money";

interface LineDraft {
  account_kode: string;
  deskripsi: string;
  jumlah: number; // sen
  tax_id: string;
}

export function CashTxModal({
  open,
  mode,
  editDocId,
  defaultCashKode,
  accounts,
  units,
  contacts,
  taxes,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: CashTxMode;
  editDocId?: string | null;
  defaultCashKode?: string;
  accounts: Account[];
  units: Unit[];
  contacts: Contact[];
  taxes: Tax[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => !a.is_header && !a.arsip && (a.kategori === 3 || a.kategori === 9)),
    [accounts],
  );
  const lawanAccounts = useMemo(
    () => accounts.filter((a) => !a.is_header && !a.arsip && a.kategori !== 3 && a.sistem === 0),
    [accounts],
  );

  const [no, setNo] = useState("");
  const [tanggal, setTanggal] = useState(todayWib());
  const [unitKode, setUnitKode] = useState(units[0]?.kode || "");
  const [cashKode, setCashKode] = useState(defaultCashKode || "");
  const [toCashKode, setToCashKode] = useState("");
  const [unitAsal, setUnitAsal] = useState("");
  const [unitTujuan, setUnitTujuan] = useState("");
  const [transferAmount, setTransferAmount] = useState(0);
  const [contactId, setContactId] = useState("");
  const [memo, setMemo] = useState("");
  const [hargaTermasukPajak, setHargaTermasukPajak] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([{ account_kode: "", deskripsi: "", jumlah: 0, tax_id: "" }]);
  const [withAcc, setWithAcc] = useState("");
  const [withMode, setWithMode] = useState<"nominal" | "persen">("nominal");
  const [withNilai, setWithNilai] = useState(0);
  const [attachments, setAttachments] = useState<{ id: string; filename: string; mime: string; size: number }[]>([]);
  const [shareDoc, setShareDoc] = useState<{ id: string; no: string; total: number } | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!editDocId) {
      setNo("");
      setTanggal(todayWib());
      const defAcc = cashAccounts.find((c) => c.kode === defaultCashKode) || cashAccounts[0];
      setCashKode(defAcc?.kode || "");
      const defUnit = defAcc?.unit_kode || units[0]?.kode || "";
      setUnitKode(defUnit);
      setToCashKode(cashAccounts.find((c) => c.kode !== defAcc?.kode)?.kode || "");
      setUnitAsal(defAcc?.unit_kode || units[0]?.kode || "");
      setUnitTujuan(units[0]?.kode || "");
      setTransferAmount(0);
      setContactId("");
      setMemo("");
      setHargaTermasukPajak(false);
      setLines([{ account_kode: "", deskripsi: "", jumlah: 0, tax_id: "" }]);
      setWithAcc("");
      setWithNilai(0);
      setAttachments([]);
      setLocked(false);
      return;
    }

    setLoading(true);
    getDocument(editDocId)
      .then((res) => {
        const d = res.document;
        setNo(d.no);
        setTanggal(d.tanggal);
        setUnitKode(d.unit_kode);
        setContactId(d.contact_id || "");
        setMemo(d.memo || "");
        setHargaTermasukPajak(Boolean(d.harga_termasuk_pajak));
        setLocked(Boolean(d.locked));
        setAttachments(res.attachments);
        if (d.type === "transfer_money") {
          setCashKode(String(d.data?.transfer_dari || ""));
          setToCashKode(String(d.data?.setor_ke || ""));
          setUnitAsal(String(d.data?.unit_asal || d.unit_kode));
          setUnitTujuan(String(d.data?.unit_tujuan || d.unit_kode));
          setTransferAmount(d.total);
        } else {
          setCashKode(String(d.data?.setor_ke || d.data?.bayar_dari || ""));
          setLines(
            res.lines.map((l) => ({
              account_kode: l.account_kode,
              deskripsi: l.deskripsi || "",
              jumlah: l.jumlah,
              tax_id: l.tax_id || "",
            })),
          );
          if (res.withholdings[0]) {
            setWithAcc(res.withholdings[0].account_kode);
            setWithMode(res.withholdings[0].mode === "persen" ? "persen" : "nominal");
            setWithNilai(res.withholdings[0].nilai);
          } else {
            setWithAcc("");
            setWithNilai(0);
          }
        }
      })
      .catch((e) => showToast({ message: keuanganErrorMessage(e), variant: "error" }))
      .finally(() => setLoading(false));
  }, [open, editDocId, defaultCashKode, cashAccounts, units, showToast]);

  const selectedFromAcc = cashAccounts.find((c) => c.kode === cashKode);
  const selectedToAcc = cashAccounts.find((c) => c.kode === toCashKode);
  const effectiveUnitAsal = selectedFromAcc?.unit_kode || unitAsal;
  const effectiveUnitTujuan = selectedToAcc?.unit_kode || unitTujuan;
  const isInterUnitTransfer = mode === "transfer_money" && effectiveUnitAsal && effectiveUnitTujuan && effectiveUnitAsal !== effectiveUnitTujuan;

  const totalBaris = lines.reduce((s, l) => s + (l.jumlah || 0), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let payload: Record<string, unknown>;
      if (mode === "transfer_money") {
        payload = {
          type: "transfer_money",
          no: no.trim() || undefined,
          tanggal,
          transfer_dari: cashKode,
          setor_ke: toCashKode,
          unit_asal: effectiveUnitAsal,
          unit_tujuan: effectiveUnitTujuan,
          jumlah: transferAmount,
          memo,
          attachment_ids: attachments.map((a) => a.id),
        };
      } else {
        const cleanLines = lines.filter((l) => l.account_kode && l.jumlah > 0);
        if (cleanLines.length === 0) {
          showToast({ message: "Minimal 1 baris transaksi wajib diisi.", variant: "error" });
          setSaving(false);
          return;
        }
        payload = {
          type: mode,
          no: no.trim() || undefined,
          tanggal,
          unit_kode: selectedFromAcc?.unit_kode || unitKode,
          ...(mode === "receive_money" ? { setor_ke: cashKode } : { bayar_dari: cashKode }),
          contact_id: contactId || null,
          harga_termasuk_pajak: hargaTermasukPajak,
          memo,
          lines: cleanLines.map((l) => ({
            account_kode: l.account_kode,
            deskripsi: l.deskripsi,
            jumlah: l.jumlah,
            tax_id: l.tax_id || null,
          })),
          withholdings:
            mode === "send_money" && withAcc && withNilai > 0
              ? [{ account_kode: withAcc, mode: withMode, nilai: withNilai }]
              : [],
          attachment_ids: attachments.map((a) => a.id),
        };
      }

      if (editDocId) {
        await updateDocument(editDocId, payload);
        showToast({ message: "Transaksi diperbarui.", variant: "success" });
      } else {
        await createDocument(payload);
        showToast({ message: `${DOC_TYPE_LABELS[mode]} tersimpan.`, variant: "success" });
      }
      onSaved();
      onClose();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editDocId || !window.confirm("Hapus transaksi ini? Jurnal dan saldo laporan akan diperbarui.")) return;
    setSaving(true);
    try {
      await deleteDocument(editDocId);
      showToast({ message: "Transaksi dihapus.", variant: "success" });
      onSaved();
      onClose();
    } catch (err) {
      showToast({ message: keuanganErrorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalFrame open={open} title={`${editDocId ? "Detail / Ubah" : "Buat"} ${DOC_TYPE_LABELS[mode]}`} onClose={onClose} maxWidth="max-w-4xl">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-[#6B7280]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Memuat dokumen...
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {locked && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800">
                Periode transaksi ini sudah dikunci / ditutup buku sehingga hanya bisa dilihat.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">Tanggal</label>
                <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} disabled={locked} required className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4B5563] mb-1">Nomor Transaksi (opsional)</label>
                <input type="text" placeholder="Otomatis" value={no} onChange={(e) => setNo(e.target.value)} disabled={locked} className={INPUT_CLS} />
              </div>
              {mode !== "transfer_money" && (
                <div>
                  <label className="block text-xs font-bold text-[#4B5563] mb-1">Kontak (opsional)</label>
                  <select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={locked} className={INPUT_CLS}>
                    <option value="">— Tanpa Kontak —</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama_tampilan}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {mode === "transfer_money" ? (
              <div className="space-y-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#4B5563] mb-1">Transfer Dari (Kas/Bank)</label>
                    <select value={cashKode} onChange={(e) => setCashKode(e.target.value)} disabled={locked} required className={INPUT_CLS}>
                      <option value="">— Pilih Akun —</option>
                      {cashAccounts.map((a) => (
                        <option key={a.kode} value={a.kode}>
                          {a.kode} — {a.nama} ({a.unit_kode || "Bersama"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B5563] mb-1">Setor Ke (Kas/Bank)</label>
                    <select value={toCashKode} onChange={(e) => setToCashKode(e.target.value)} disabled={locked} required className={INPUT_CLS}>
                      <option value="">— Pilih Akun —</option>
                      {cashAccounts.map((a) => (
                        <option key={a.kode} value={a.kode}>
                          {a.kode} — {a.nama} ({a.unit_kode || "Bersama"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B5563] mb-1">Unit Asal</label>
                    {selectedFromAcc?.unit_kode ? (
                      <input readOnly value={`${selectedFromAcc.unit_kode} (Pemilik Akun)`} className={`${INPUT_CLS} bg-gray-100`} />
                    ) : (
                      <select value={unitAsal} onChange={(e) => setUnitAsal(e.target.value)} disabled={locked} required className={INPUT_CLS}>
                        {units.map((u) => (
                          <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B5563] mb-1">Unit Tujuan</label>
                    {selectedToAcc?.unit_kode ? (
                      <input readOnly value={`${selectedToAcc.unit_kode} (Pemilik Akun)`} className={`${INPUT_CLS} bg-gray-100`} />
                    ) : (
                      <select value={unitTujuan} onChange={(e) => setUnitTujuan(e.target.value)} disabled={locked} required className={INPUT_CLS}>
                        {units.map((u) => (
                          <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                {isInterUnitTransfer && (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                    <ArrowRightLeft className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      <strong>Transfer Antar Unit ({effectiveUnitAsal} → {effectiveUnitTujuan}):</strong> Worker akan otomatis mencatat 4 baris jurnal melalui{" "}
                      <code>1-10150 Piutang Antar Unit</code> dan <code>2-20150 Hutang Antar Unit</code> agar neraca tiap unit tetap seimbang dan tereliminasi di laporan gabungan.
                    </span>
                  </div>
                )}
                <div className="max-w-xs">
                  <label className="block text-xs font-bold text-[#4B5563] mb-1">Jumlah Transfer (Rp)</label>
                  <RupiahInput valueSen={transferAmount} onChangeSen={setTransferAmount} disabled={locked} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#4B5563] mb-1">
                      {mode === "receive_money" ? "Setor Ke (Kas/Bank)" : "Bayar Dari (Kas/Bank)"}
                    </label>
                    <select
                      value={cashKode}
                      onChange={(e) => {
                        setCashKode(e.target.value);
                        const acc = cashAccounts.find((c) => c.kode === e.target.value);
                        if (acc?.unit_kode) setUnitKode(acc.unit_kode);
                      }}
                      disabled={locked}
                      required
                      className={INPUT_CLS}
                    >
                      <option value="">— Pilih Akun —</option>
                      {cashAccounts.map((a) => (
                        <option key={a.kode} value={a.kode}>
                          {a.kode} — {a.nama} ({a.unit_kode || "Bersama"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B5563] mb-1">Anak Perusahaan</label>
                    {selectedFromAcc?.unit_kode ? (
                      <input readOnly value={`${selectedFromAcc.unit_kode} (Pemilik Akun Kas)`} className={`${INPUT_CLS} bg-gray-100`} />
                    ) : (
                      <select value={unitKode} onChange={(e) => setUnitKode(e.target.value)} disabled={locked} required className={INPUT_CLS}>
                        {units.map((u) => (
                          <option key={u.kode} value={u.kode}>{u.kode} — {u.nama}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-[#374151]">
                    {mode === "receive_money" ? "Terima Dari (Akun Pendapatan/Lawan)" : "Pembayaran Untuk (Akun Beban/Lawan)"}
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#4B5563] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hargaTermasukPajak}
                      onChange={(e) => setHargaTermasukPajak(e.target.checked)}
                      disabled={locked}
                    />
                    Harga sudah termasuk pajak
                  </label>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F9FAFB] text-xs text-[#6B7280]">
                      <tr>
                        <th className="px-3 py-2 text-left">Akun</th>
                        <th className="px-3 py-2 text-left">Deskripsi</th>
                        <th className="px-3 py-2 text-left">Pajak</th>
                        <th className="px-3 py-2 text-right">Jumlah (Rp)</th>
                        {!locked && <th className="w-10"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="p-2 min-w-[180px]">
                            <select
                              value={line.account_kode}
                              onChange={(e) => setLines(lines.map((r, i) => (i === idx ? { ...r, account_kode: e.target.value } : r)))}
                              disabled={locked}
                              className={INPUT_CLS}
                            >
                              <option value="">— Pilih Akun —</option>
                              {lawanAccounts.map((a) => (
                                <option key={a.kode} value={a.kode}>
                                  {a.kode} — {a.nama}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 min-w-[140px]">
                            <input
                              type="text"
                              value={line.deskripsi}
                              onChange={(e) => setLines(lines.map((r, i) => (i === idx ? { ...r, deskripsi: e.target.value } : r)))}
                              disabled={locked}
                              placeholder="Keterangan"
                              className={INPUT_CLS}
                            />
                          </td>
                          <td className="p-2 min-w-[130px]">
                            <select
                              value={line.tax_id}
                              onChange={(e) => setLines(lines.map((r, i) => (i === idx ? { ...r, tax_id: e.target.value } : r)))}
                              disabled={locked}
                              className={INPUT_CLS}
                            >
                              <option value="">Tanpa Pajak</option>
                              {taxes.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.nama}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 min-w-[140px]">
                            <RupiahInput
                              valueSen={line.jumlah}
                              onChangeSen={(v) => setLines(lines.map((r, i) => (i === idx ? { ...r, jumlah: v } : r)))}
                              disabled={locked}
                            />
                          </td>
                          {!locked && (
                            <td className="p-2 text-center">
                              {lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                                  className="text-red-500 hover:text-red-700 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!locked && (
                  <button
                    type="button"
                    onClick={() => setLines([...lines, { account_kode: "", deskripsi: "", jumlah: 0, tax_id: "" }])}
                    className={BTN_SECONDARY}
                  >
                    <Plus className="h-4 w-4" /> Tambah Baris
                  </button>
                )}

                {mode === "send_money" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl bg-[#F9FAFB] p-3 border border-[#E5E7EB]">
                    <div>
                      <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Pemotongan (opsional)</label>
                      <select value={withAcc} onChange={(e) => setWithAcc(e.target.value)} disabled={locked} className={INPUT_CLS}>
                        <option value="">Tidak ada pemotongan</option>
                        {lawanAccounts.map((a) => (
                          <option key={a.kode} value={a.kode}>
                            {a.kode} — {a.nama}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Jenis Potongan</label>
                      <select value={withMode} onChange={(e) => setWithMode(e.target.value as "nominal" | "persen")} disabled={locked} className={INPUT_CLS}>
                        <option value="nominal">Nominal (Rp)</option>
                        <option value="persen">Persen (basis poin, mis. 200 = 2%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Nilai</label>
                      {withMode === "nominal" ? (
                        <RupiahInput valueSen={withNilai} onChangeSen={setWithNilai} disabled={locked} />
                      ) : (
                        <input type="number" value={withNilai} onChange={(e) => setWithNilai(Number(e.target.value || 0))} disabled={locked} className={INPUT_CLS} />
                      )}
                    </div>
                  </div>
                )}

                <div className="text-right text-sm font-bold text-[#111827]">
                  Total Input Baris: <span className="text-amber-700">{formatSen(totalBaris)}</span>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-[#4B5563] mb-1">Memo / Keterangan</label>
              <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} disabled={locked} className={INPUT_CLS} placeholder="Keterangan transaksi..." />
            </div>

            <AttachmentSection
              documentId={editDocId || undefined}
              attachments={attachments}
              onUploaded={(att) => setAttachments((prev) => [...prev, att])}
              onDeleted={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              disabled={locked}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                {editDocId && !locked && (
                  <button type="button" onClick={handleDelete} disabled={saving} className={BTN_DANGER}>
                    <Trash2 className="h-4 w-4" /> Hapus
                  </button>
                )}
                {editDocId && (
                  <button
                    type="button"
                    onClick={() => setShareDoc({ id: editDocId, no, total: mode === "transfer_money" ? transferAmount : totalBaris })}
                    className={BTN_SECONDARY}
                  >
                    <Share2 className="h-4 w-4" /> Bagikan WA / Link
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className={BTN_SECONDARY}>
                  Tutup
                </button>
                {!locked && (
                  <button type="submit" disabled={saving} className={BTN_PRIMARY}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Simpan Transaksi
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </ModalFrame>

      {shareDoc && (
        <ShareDocModal
          documentId={shareDoc.id}
          docNo={shareDoc.no}
          docLabel={DOC_TYPE_LABELS[mode]}
          amountSen={shareDoc.total}
          onClose={() => setShareDoc(null)}
        />
      )}
    </>
  );
}
