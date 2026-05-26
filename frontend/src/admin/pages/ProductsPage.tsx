import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, Edit, Trash2, ImageOff, Check, X, ArrowUpDown, ChevronLeft, ChevronRight, Filter } from "lucide-react";

import { listAllItems, deleteItem, patchStock, listCategories, updateItem } from "@/services/stockAdminService";
import type { InventoryItem } from "@/types/inventory";
import { formatIDR } from "@/lib/format";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function resolveProductImageURL(ref: string | undefined): string | null {
  if (!ref) return null;
  const segments = ref.trim().split("/");
  if (segments.length === 0) return null;
  const fileId = segments[segments.length - 1];
  if (!fileId) return null;
  return `${API_BASE_URL}/api/files/product_images/${encodeURIComponent(fileId)}/download`;
}

type SortField = "itemName" | "category" | "price" | "quantity";
type SortOrder = "asc" | "desc";

export function ProductsPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("itemName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Pagination
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Inline Stock Edit states
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState<number>(0);
  const [savingStockId, setSavingStockId] = useState<string | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Availability Prompt state
  const [promptTarget, setPromptTarget] = useState<{ item: InventoryItem; nextQty: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allItems, allCategories] = await Promise.all([
        listAllItems(selectedCategory ? { category: selectedCategory } : {}),
        listCategories(),
      ]);
      setItems(allItems);
      setCategories(allCategories);
    } catch {
      setError("Gagal memuat daftar produk inventaris.");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Perform sort and pagination locally
  const sortedItems = [...items].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (typeof valA === "string") {
      valA = valA.toLowerCase();
      valB = (valB as string).toLowerCase();
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    if (typeof valA === "number") {
      return sortOrder === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    }

    return 0;
  });

  const totalPages = Math.ceil(sortedItems.length / pageSize);
  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteItem(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      alert("Gagal menghapus produk dari database.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleInlineStockSave = async (item: InventoryItem, newQty: number) => {
    if (newQty < 0 || newQty > 99999) {
      alert("Jumlah stok harus di antara 0 dan 99.999");
      return;
    }

    setSavingStockId(item.id);
    try {
      // Rule 12.2: quantity 0 forces available false
      if (newQty === 0) {
        await patchStock(item.id, 0);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: 0, available: false } : i))
        );
        setEditingStockId(null);
      } 
      // Rule 12.6: setting quantity > 0 while unavailable prompts to confirm enabling availability
      else if (!item.available) {
        setPromptTarget({ item, nextQty: newQty });
      } 
      // Normal stock patch
      else {
        await patchStock(item.id, newQty);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
        );
        setEditingStockId(null);
      }
    } catch {
      alert("Gagal memperbarui jumlah stok.");
    } finally {
      setSavingStockId(null);
    }
  };

  const confirmEnableAvailability = async (enable: boolean) => {
    if (!promptTarget) return;
    const { item, nextQty } = promptTarget;
    setSavingStockId(item.id);

    try {
      if (enable) {
        // Full update to flip availability switch as well
        await updateItem(item.id, {
          itemName: item.itemName,
          price: item.price,
          unit: item.unit,
          quantity: nextQty,
          available: true,
          category: item.category,
          imageUrl: item.imageUrl,
        });
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQty, available: true } : i))
        );
      } else {
        // Just patch stock, keep availability false
        await patchStock(item.id, nextQty);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: nextQty } : i))
        );
      }
      setEditingStockId(null);
    } catch {
      alert("Gagal memperbarui produk.");
    } finally {
      setSavingStockId(null);
      setPromptTarget(null);
    }
  };

  const handleToggleAvailability = async (item: InventoryItem) => {
    const nextAvailable = !item.available;
    try {
      await updateItem(item.id, {
        itemName: item.itemName,
        price: item.price,
        unit: item.unit,
        quantity: item.quantity,
        available: nextAvailable,
        category: item.category,
        imageUrl: item.imageUrl,
      });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, available: nextAvailable } : i))
      );
    } catch {
      alert("Gagal mengubah ketersediaan produk.");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Daftar Produk Koperasi
          </h1>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            Kelola inventaris barang koperasi, stok kuantitas, harga, dan gambar.
          </p>
        </div>
        <Link
          to="/admin/products/new"
          className="inline-flex items-center gap-2 min-h-11 px-5 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm transition-all"
        >
          <Plus className="h-5 w-5" />
          Tambah Produk
        </Link>
      </div>

      {/* Filter and Pagesize Toolbar */}
      <div className="bg-white rounded-3xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#6B7280]" />
          <select
            title="Pilih Kategori"
            className="bg-[#F3F4F6] border border-[#E5E7EB] rounded-2xl px-4 py-2 text-xs font-semibold text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Semua Kategori</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Page Size selector */}
        <div className="flex items-center gap-2 text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
          <span>Tampilkan</span>
          <select
            title="Jumlah Baris"
            className="bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl px-2 py-1 font-bold text-[#374151] focus:outline-none"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>baris</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#6B7280]">
          <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
          <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat basis data produk…</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-950 p-6 rounded-3xl text-center space-y-3 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <p>{error}</p>
          <button onClick={load} className="inline-flex min-h-11 px-6 bg-[#FBBF24] rounded-2xl items-center font-bold text-[#111827]">
            Coba Lagi
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-[32px] p-12 text-center space-y-4 shadow-sm border border-[#E5E7EB]">
          <ImageOff className="h-16 w-16 mx-auto text-[#9CA3AF]" />
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Tidak Ada Produk</h2>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-sm mx-auto">
            Inventaris koperasi kosong atau tidak cocok dengan filter kategori yang dipilih.
          </p>
          <Link to="/admin/products/new" className="inline-flex min-h-11 px-6 bg-[#FBBF24] text-[#111827] rounded-2xl items-center font-bold">
            Tambah Produk Baru
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-[#E5E7EB] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px] table-fixed">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-xs font-extrabold text-[#4B5563] uppercase font-['Manrope',system-ui,sans-serif]">
                  <th className="p-4 w-[8%]">Foto</th>
                  <th className="p-4 w-[28%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("itemName")}>
                    <div className="flex items-center gap-1">Nama Produk <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[16%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("category")}>
                    <div className="flex items-center gap-1">Kategori <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[14%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("price")}>
                    <div className="flex items-center gap-1">Harga (IDR) <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[16%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("quantity")}>
                    <div className="flex items-center gap-1">Stok Qty <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[18%]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs font-medium text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {paginatedItems.map((item) => {
                  const imageHref = resolveProductImageURL(item.imageUrl);
                  const isEditingThis = editingStockId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                      {/* Photo Thumbnail */}
                      <td className="p-4">
                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF]">
                          {imageHref ? (
                            <img src={imageHref} alt={item.itemName} className="h-full w-full object-cover" />
                          ) : (
                            <ImageOff className="h-5 w-5" />
                          )}
                        </div>
                      </td>

                      {/* Name */}
                      <td className="p-4 font-bold text-sm truncate" title={item.itemName}>
                        {item.itemName}
                      </td>

                      {/* Category */}
                      <td className="p-4 truncate">
                        {item.category || "-"}
                      </td>

                      {/* Price */}
                      <td className="p-4 font-bold">
                        {formatIDR(item.price)}
                      </td>

                      {/* Inline Stock adjustment */}
                      <td className="p-4">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              title="Jumlah Stok Baru"
                              placeholder="0"
                              className="w-16 bg-[#F3F4F6] border border-[#D1D5DB] rounded-xl px-2 py-1 text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                              value={editingQty}
                              min={0}
                              max={99999}
                              onChange={(e) => setEditingQty(Number(e.target.value))}
                            />
                            <button
                              onClick={() => handleInlineStockSave(item, editingQty)}
                              className="p-1 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                              title="Simpan"
                              disabled={savingStockId === item.id}
                            >
                              {savingStockId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => setEditingStockId(null)}
                              className="p-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 cursor-pointer"
                              title="Batal"
                              disabled={savingStockId === item.id}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingStockId(item.id);
                              setEditingQty(item.quantity);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded-2xl cursor-pointer hover:border-neutral-400 font-bold transition-all text-neutral-800"
                            title="Klik untuk ubah stok langsung"
                          >
                            <span>{item.quantity}</span>
                            <span className="text-[10px] text-[#6B7280] font-semibold">{item.unit || "pcs"}</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 flex items-center gap-2">
                        {/* Toggle availability switch */}
                        <button
                          onClick={() => handleToggleAvailability(item)}
                          className={
                            "rounded-full border px-2.5 py-0.5 text-[10px] font-bold cursor-pointer transition-all " +
                            (item.available
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                              : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100")
                          }
                          title="Klik untuk mengubah ketersediaan"
                        >
                          {item.available ? "Aktif" : "Nonaktif"}
                        </button>

                        <button
                          onClick={() => navigate(`/admin/products/${item.id}/edit`)}
                          className="p-2 text-[#4B5563] hover:text-[#FBBF24] hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded-full cursor-pointer transition-all"
                          title="Ubah data produk"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-2 text-[#4B5563] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-full cursor-pointer transition-all"
                          title="Hapus produk"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] px-2 pt-2">
              <span>Menampilkan {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, items.length)} dari {items.length} produk</span>
              <div className="flex items-center gap-1">
                <button
                  title="Halaman Sebelumnya"
                  onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 rounded-full border border-[#E5E7EB] bg-white flex items-center justify-center text-[#111827] enabled:hover:bg-[#F3F4F6] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-bold px-2 text-[#111827]">{currentPage} / {totalPages}</span>
                <button
                  title="Halaman Selanjutnya"
                  onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 rounded-full border border-[#E5E7EB] bg-white flex items-center justify-center text-[#111827] enabled:hover:bg-[#F3F4F6] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal (Requirement 15.5) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="space-y-1">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Hapus Produk</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Apakah Anda yakin ingin menghapus produk **{deleteTarget.itemName}** secara permanen? Seluruh gambar terkait produk ini juga akan terhapus.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-2xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deletingId === deleteTarget.id}
                className="flex-1 min-h-10 bg-red-600 hover:bg-red-700 text-xs font-bold text-white rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {deletingId === deleteTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Hapus Permanen"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Availability Change Confirm dialog Modal (Requirement 12.6) */}
      {promptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <div className="space-y-1">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">Aktifkan Ketersediaan?</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                Stok produk **{promptTarget.item.itemName}** saat ini diatur menjadi **{promptTarget.nextQty}**, namun status produk ini sedang Nonaktif (Tidak Tersedia).
                Apakah Anda ingin mengaktifkan ketersediaan produk ini secara otomatis?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => confirmEnableAvailability(false)}
                disabled={savingStockId === promptTarget.item.id}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-2xl cursor-pointer"
              >
                Biarkan Nonaktif
              </button>
              <button
                onClick={() => confirmEnableAvailability(true)}
                disabled={savingStockId === promptTarget.item.id}
                className="flex-1 min-h-10 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {savingStockId === promptTarget.item.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Ya, Aktifkan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductsPage;
