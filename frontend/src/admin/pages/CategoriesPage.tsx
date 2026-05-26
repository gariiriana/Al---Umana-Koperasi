import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, Folder, ArrowRight } from "lucide-react";

import { listCategories } from "@/services/stockAdminService";

export function CategoriesPage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const allCategories = await listCategories();
      setCategories(allCategories);
    } catch {
      setError("Gagal memuat kategori.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat kategori…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header and Add Action */}
      <div className="flex items-center gap-3">
        <Link
          to="/admin/products"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-100 text-[#111827]"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827]">
          Daftar Kategori
        </h1>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E5E7EB] space-y-4">
        {error ? (
          <div className="text-center py-6 text-sm text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]">
            {error}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12 text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] space-y-3">
            <p>Belum ada kategori terdaftar pada produk aktif.</p>
            <Link
              to="/admin/products/new"
              className="inline-flex min-h-10 px-5 bg-[#FBBF24] rounded-xl items-center font-bold text-xs text-[#111827]"
            >
              Tambah Produk Pertama
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {categories.map((cat, idx) => (
              <div
                key={idx}
                className="py-3 flex items-center justify-between font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#111827]"
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-[#FBBF24] shrink-0" />
                  <span className="font-bold">{cat}</span>
                </div>
                <Link
                  to={`/admin/products`}
                  onClick={() => {
                    // Navigate to products and filter by category
                    // (we filter inside products page)
                  }}
                  className="text-xs font-semibold text-[#6B7280] hover:text-[#111827] flex items-center gap-1 hover:underline"
                >
                  Lihat Produk
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CategoriesPage;
