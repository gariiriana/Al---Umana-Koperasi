import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Edit, Trash2, Tag, AlertCircle, X, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { listPromos, savePromo, deletePromo, type Promo } from "@/services/promoService";
import { formatIDR } from "@/lib/format";

export function PromosPage() {
  const { lang } = useLanguage();
  const { showToast } = useToast();

  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [fCode, setFCode] = useState("");
  const [fDiscountType, setFDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [fValue, setFValue] = useState<number | "">("");
  const [fMinPurchase, setFMinPurchase] = useState<number | "">("");
  const [fMaxDiscount, setFMaxDiscount] = useState<number | "">("");
  const [fActive, setFActive] = useState(true);
  const [fDescription, setFDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPromos();
      setPromos(data);
    } catch (err) {
      console.error(err);
      setError(lang === "id" ? "Gagal memuat daftar promo." : "Failed to load promos list.");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAddForm = () => {
    setEditCode(null);
    setFCode("");
    setFDiscountType("percentage");
    setFValue("");
    setFMinPurchase("");
    setFMaxDiscount("");
    setFActive(true);
    setFDescription("");
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (p: Promo) => {
    setEditCode(p.code);
    setFCode(p.code);
    setFDiscountType(p.discountType);
    setFValue(p.value);
    setFMinPurchase(p.minPurchase || "");
    setFMaxDiscount(p.maxDiscount || "");
    setFActive(p.active);
    setFDescription(p.description || "");
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const codeTrim = fCode.trim().toUpperCase();
    if (!codeTrim) {
      setFormError(lang === "id" ? "Kode promo wajib diisi." : "Promo code is required.");
      return;
    }
    if (!fValue || Number(fValue) <= 0) {
      setFormError(lang === "id" ? "Nilai diskon harus lebih dari 0." : "Discount value must be greater than 0.");
      return;
    }
    if (fDiscountType === "percentage" && Number(fValue) > 100) {
      setFormError(lang === "id" ? "Persentase diskon tidak boleh melebihi 100%." : "Discount percentage cannot exceed 100%.");
      return;
    }

    setSaving(true);
    try {
      await savePromo({
        code: codeTrim,
        discountType: fDiscountType,
        value: Number(fValue),
        minPurchase: Number(fMinPurchase) || 0,
        maxDiscount: fMaxDiscount ? Number(fMaxDiscount) : undefined,
        active: fActive,
        description: fDescription,
      });

      showToast({
        message: lang === "id" ? "Promo berhasil disimpan." : "Promo saved successfully.",
        variant: "success",
      });
      setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
      const errMessage = err instanceof Error ? err.message : String(err);
      setFormError(errMessage || (lang === "id" ? "Gagal menyimpan promo." : "Failed to save promo."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(lang === "id" ? `Hapus promo ${code}?` : `Delete promo ${code}?`)) return;
    try {
      await deletePromo(code);
      showToast({
        message: lang === "id" ? "Promo berhasil dihapus." : "Promo deleted successfully.",
        variant: "success",
      });
      await load();
    } catch (err) {
      console.error(err);
      showToast({
        message: lang === "id" ? "Gagal menghapus promo." : "Failed to delete promo.",
        variant: "error",
      });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto font-['Hanken_Grotesk']">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-['Manrope'] text-xl sm:text-2xl font-extrabold text-[#111827]">
            {lang === "id" ? "Kelola Promo & Diskon" : "Manage Promos & Discounts"}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            {lang === "id" ? "Buat dan aktifkan kode promo untuk potongan belanja pelanggan." : "Create and manage promo codes for customer checkout discount."}
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-[#FBBF24] hover:bg-[#F59E0B] text-xs font-bold text-[#111827] rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          {lang === "id" ? "Tambah Promo" : "Add Promo"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        </div>
      ) : promos.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-12 text-center text-neutral-500">
          <Tag className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
          <p className="font-bold text-sm text-[#111827]">{lang === "id" ? "Belum Ada Promo" : "No Promos Available"}</p>
          <p className="text-xs text-[#6B7280] mt-1">{lang === "id" ? "Silakan klik tombol di atas untuk membuat promo baru." : "Click the button above to create a new promo code."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promos.map((p) => (
            <div key={p.code} className="bg-white border border-[#E5E7EB] rounded-3xl p-5 relative overflow-hidden flex flex-col justify-between shadow-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-extrabold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1">
                      {p.code}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}>
                      {p.active ? (lang === "id" ? "Aktif" : "Active") : (lang === "id" ? "Nonaktif" : "Inactive")}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditForm(p)}
                      title="Edit Promo"
                      className="p-1.5 hover:bg-neutral-100 rounded-lg text-[#4B5563] transition"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void handleDelete(p.code)}
                      title="Delete Promo"
                      className="p-1.5 hover:bg-red-50 rounded-lg text-[#DC2626] transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#6B7280] mt-1">
                  {p.description || (lang === "id" ? "Tidak ada deskripsi." : "No description.")}
                </p>

                <div className="pt-2 border-t border-[#F3F4F6] grid grid-cols-2 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-[#6B7280]">{lang === "id" ? "Jenis Potongan" : "Discount Type"}:</span>
                    <p className="font-bold text-[#111827]">{p.discountType === "percentage" ? (lang === "id" ? "Persentase" : "Percentage") : (lang === "id" ? "Nominal Tetap" : "Fixed Amount")}</p>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">{lang === "id" ? "Besar Potongan" : "Value"}:</span>
                    <p className="font-bold text-[#111827]">{p.discountType === "percentage" ? `${p.value}%` : formatIDR(p.value)}</p>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">{lang === "id" ? "Min. Pembelian" : "Min. Spend"}:</span>
                    <p className="font-bold text-[#111827]">{formatIDR(p.minPurchase || 0)}</p>
                  </div>
                  {p.discountType === "percentage" && p.maxDiscount && (
                    <div>
                      <span className="text-[#6B7280]">{lang === "id" ? "Maks. Potongan" : "Max Discount"}:</span>
                      <p className="font-bold text-[#111827]">{formatIDR(p.maxDiscount)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-[#E5E7EB] shadow-2xl relative">
            <button
              aria-label={lang === "id" ? "Tutup form" : "Close form"}
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 p-1 hover:bg-neutral-100 rounded-full transition"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="font-['Manrope'] text-lg font-extrabold text-[#111827] mb-4">
              {editCode ? (lang === "id" ? "Ubah Promo" : "Edit Promo") : (lang === "id" ? "Tambah Promo Baru" : "Add New Promo")}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold text-[#4B5563]">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block">{lang === "id" ? "Kode Promo (Uppercase)" : "Promo Code (Uppercase)"}</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. DISKON10"
                  disabled={!!editCode}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] disabled:opacity-50"
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value.toUpperCase())}
                />
              </div>

              <div className="space-y-1">
                <label className="block">{lang === "id" ? "Jenis Potongan" : "Discount Type"}</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={fDiscountType === "percentage"}
                      onChange={() => setFDiscountType("percentage")}
                      className="text-amber-600 focus:ring-amber-400"
                    />
                    <span>{lang === "id" ? "Persentase (%)" : "Percentage (%)"}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={fDiscountType === "fixed"}
                      onChange={() => setFDiscountType("fixed")}
                      className="text-amber-600 focus:ring-amber-400"
                    />
                    <span>{lang === "id" ? "Nominal Tetap (Rp)" : "Fixed Amount (Rp)"}</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="promo-value" className="block">{fDiscountType === "percentage" ? (lang === "id" ? "Persentase (%)" : "Percentage (%)") : (lang === "id" ? "Potongan (Rupiah)" : "Discount (Rupiah)")}</label>
                  <input
                    id="promo-value"
                    type="number"
                    required
                    min={1}
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    value={fValue}
                    onChange={(e) => setFValue(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="promo-min-purchase" className="block">{lang === "id" ? "Min. Belanja (Rupiah)" : "Min. Purchase (Rupiah)"}</label>
                  <input
                    id="promo-min-purchase"
                    type="number"
                    min={0}
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    value={fMinPurchase}
                    onChange={(e) => setFMinPurchase(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>

              {fDiscountType === "percentage" && (
                <div className="space-y-1">
                  <label htmlFor="promo-max-discount" className="block">{lang === "id" ? "Maksimal Potongan Rupiah (Opsional)" : "Max Discount Amount in IDR (Optional)"}</label>
                  <input
                    id="promo-max-discount"
                    type="number"
                    min={0}
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    value={fMaxDiscount}
                    onChange={(e) => setFMaxDiscount(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="promo-description" className="block">{lang === "id" ? "Deskripsi" : "Description"}</label>
                <textarea
                  id="promo-description"
                  rows={2}
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="inline-flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={fActive}
                    onChange={(e) => setFActive(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="relative w-11 h-6 bg-[#E5E7EB] rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="text-xs font-bold text-[#374151]">
                    {lang === "id" ? "Promo Aktif" : "Active"}
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 min-h-11 bg-[#FBBF24] hover:bg-[#F59E0B] font-bold text-xs text-[#111827] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 mt-4"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {lang === "id" ? "Simpan Promo" : "Save Promo"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default PromosPage;
