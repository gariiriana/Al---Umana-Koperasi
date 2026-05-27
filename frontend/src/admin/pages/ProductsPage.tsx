import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Plus, Edit, Trash2, ImageOff, Check, X, ArrowUpDown, ChevronLeft, ChevronRight, Filter, FlaskConical, Trash, ArrowLeft, Upload, AlertCircle, RefreshCw } from "lucide-react";

import { db } from "@/lib/firebase";
import { addDoc, collection, doc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

import { listAllItems, deleteItem, patchStock, listCategories, updateItem, createItem, getItem } from "@/services/stockAdminService";
import { uploadFileInChunks, ChunkUploadError } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import type { InventoryItem, InventoryItemInput } from "@/types/inventory";
import { formatIDR } from "@/lib/format";
import { DUMMY_PRODUCTS, clearDemoStorage } from "@/lib/dummyData";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function resolveProductImageURL(ref: string | undefined): string | null {
  if (!ref) return null;
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  const segments = ref.trim().split("/");
  if (segments.length === 0) return null;
  const fileId = segments[segments.length - 1];
  if (!fileId) return null;
  return `${API_BASE_URL}/api/files/product_images/${encodeURIComponent(fileId)}/download`;
}

type SortField = "itemName" | "category" | "price" | "quantity";
type SortOrder = "asc" | "desc";

export function ProductsPage() {
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

  // Demo mode
  const isDemoMode = items.some(
    (item) => item.imageUrl && item.imageUrl.startsWith("http")
  );
  const [loadingDemo, setLoadingDemo] = useState(false);

  // Delete target state
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Availability Prompt state
  const [promptTarget, setPromptTarget] = useState<{ item: InventoryItem; nextQty: number } | null>(null);

  // Drawer (Tambah / Edit Produk)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEditId, setDrawerEditId] = useState<string | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Form fields
  const [fItemName, setFItemName] = useState("");
  const [fQty, setFQty] = useState(0);
  const [fUnit, setFUnit] = useState("pcs");
  const [fPrice, setFPrice] = useState(0);
  const [fAvailable, setFAvailable] = useState(true);
  const [fCategory, setFCategory] = useState("");
  const [fImageURL, setFImageURL] = useState("");

  // Image upload
  const [fImagePreview, setFImagePreview] = useState<string | null>(null);
  const [fSelectedFile, setFSelectedFile] = useState<File | null>(null);
  const [fUploading, setFUploading] = useState(false);
  const [fUploadProgress, setFUploadProgress] = useState(0);
  const [fImageError, setFImageError] = useState<string | null>(null);
  const [fFailedFileId, setFFailedFileId] = useState<string | undefined>(undefined);
  const [fFailedChunk, setFFailedChunk] = useState<number | undefined>(undefined);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${fUploadProgress}%`;
    }
  }, [fUploadProgress]);

  useEffect(() => {
    return () => {
      if (fImagePreview && !fImagePreview.startsWith("http")) {
        URL.revokeObjectURL(fImagePreview);
      }
    };
  }, [fImagePreview]);

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
    } catch (err) {
      console.error("Gagal memuat inventaris:", err);
      setError("Gagal memuat daftar produk inventaris.");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLoadDummy = async () => {
    setLoadingDemo(true);
    try {
      // Write directly to Firestore — bypasses the Go REST API
      // (which returns 501 in dev mode when FIREBASE_PROJECT_ID is unset).
      // Field names mirror the backend repository exactly:
      //   itemName, quantity, unit, price, available, category, imageUrl, updatedAt
      const col = collection(db, "inventory");
      const promises = DUMMY_PRODUCTS.map((dummy) =>
        addDoc(col, {
          itemName: dummy.itemName,
          quantity: dummy.quantity,
          unit: dummy.unit,
          price: dummy.price,
          available: dummy.quantity === 0 ? false : dummy.available,
          category: dummy.category,
          imageUrl: dummy.imageUrl ?? "",
          updatedAt: serverTimestamp(),
        })
      );
      await Promise.all(promises);
      clearDemoStorage();
      await load();
      alert("Data dummy berhasil disimpan ke database Firestore!");
    } catch (err: unknown) {
      console.error("Gagal memuat data dummy:", err);
      alert("Gagal menyimpan data dummy ke Firestore.");
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleClearDemo = async () => {
    setLoading(true);
    try {
      // Items seeded by the dummy loader have Unsplash imageUrl (starts with https://)
      const dummyItems = items.filter(
        (item) => item.imageUrl && item.imageUrl.startsWith("https://images.unsplash.com/")
      );
      // Delete directly from Firestore using the Firebase SDK
      const col = collection(db, "inventory");
      await Promise.all(
        dummyItems.map((item) => deleteDoc(doc(col, item.id)))
      );
      clearDemoStorage();
      await load();
      alert("Data dummy berhasil dihapus dari database.");
    } catch {
      alert("Gagal menghapus data dummy.");
    } finally {
      setLoading(false);
    }
  };

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

  // Delete product image chunks safely from Firestore
  const deleteProductImageFromFirestore = async (imageUrlRef: string) => {
    try {
      const fileId = imageUrlRef.replace("product_images/", "");
      const docRef = doc(db, "product_images", fileId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const totalChunks = data.totalChunks || 0;

        // Cascade delete chunks
        const deletePromises: Promise<void>[] = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkRef = doc(db, "product_images", fileId, "chunks", String(i));
          deletePromises.push(deleteDoc(chunkRef));
        }
        await Promise.all(deletePromises);

        // Delete parent doc
        await deleteDoc(docRef);
      }
    } catch (err) {
      console.warn("Gagal menghapus gambar produk lama di Firestore.", err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      if (deleteTarget.imageUrl) {
        await deleteProductImageFromFirestore(deleteTarget.imageUrl);
      }
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

  // Drawer Action handlers
  const openDrawer = async (item?: InventoryItem) => {
    setDrawerOpen(true);
    setDrawerError(null);
    setFFailedFileId(undefined);
    setFFailedChunk(undefined);
    setFSelectedFile(null);
    setFUploadProgress(0);
    setFUploading(false);

    if (item) {
      setDrawerEditId(item.id);
      setDrawerLoading(true);
      try {
        const freshItem = await getItem(item.id);
        setFItemName(freshItem.itemName);
        setFQty(freshItem.quantity);
        setFUnit(freshItem.unit);
        setFPrice(freshItem.price);
        setFAvailable(freshItem.available);
        setFCategory(freshItem.category);
        setFImageURL(freshItem.imageUrl || "");

        if (freshItem.imageUrl) {
          setFImagePreview(resolveProductImageURL(freshItem.imageUrl));
        } else {
          setFImagePreview(null);
        }
      } catch {
        setDrawerError("Gagal memuat data detail produk.");
      } finally {
        setDrawerLoading(false);
      }
    } else {
      setDrawerEditId(null);
      setFItemName("");
      setFQty(0);
      setFUnit("pcs");
      setFPrice(0);
      setFAvailable(true);
      setFCategory("");
      setFImageURL("");
      setFImagePreview(null);
    }
  };

  const closeDrawer = () => {
    if (fImagePreview && !fImagePreview.startsWith("http")) {
      URL.revokeObjectURL(fImagePreview);
    }
    setDrawerOpen(false);
    setDrawerEditId(null);
    setDrawerError(null);
    setFItemName("");
    setFQty(0);
    setFUnit("pcs");
    setFPrice(0);
    setFAvailable(true);
    setFCategory("");
    setFImageURL("");
    setFImagePreview(null);
    setFSelectedFile(null);
    setFUploading(false);
    setFUploadProgress(0);
    setFFailedFileId(undefined);
    setFFailedChunk(undefined);
  };

  const handleDrawerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFImageError(null);
    setFFailedFileId(undefined);
    setFFailedChunk(undefined);

    const file = e.target.files?.[0];
    if (!file) {
      setFSelectedFile(null);
      return;
    }

    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setFImageError("Format file tidak didukung. Pilih JPEG, PNG, atau WEBP.");
      } else {
        setFImageError("Ukuran file melebihi batas 15 MB.");
      }
      setFSelectedFile(null);
      return;
    }

    setFSelectedFile(file);
    const previewUrl = URL.createObjectURL(file);
    setFImagePreview(previewUrl);
  };

  const handleRemoveImage = async () => {
    if (confirm("Hapus gambar produk ini?")) {
      setFUploading(true);
      try {
        if (fImageURL) {
          await deleteProductImageFromFirestore(fImageURL);
        }
        setFImageURL("");
        setFSelectedFile(null);
        setFImagePreview(null);
      } catch {
        alert("Gagal menghapus gambar.");
      } finally {
        setFUploading(false);
      }
    }
  };

  const handleDrawerUpload = async (isRetry = false) => {
    if (!fSelectedFile) return;

    setFUploading(true);
    setFImageError(null);

    try {
      if (!isRetry && fImageURL) {
        await deleteProductImageFromFirestore(fImageURL);
      }

      let uploadResult;
      if (isRetry && fFailedFileId && fFailedChunk !== undefined) {
        uploadResult = await uploadFileInChunks(fSelectedFile, {
          collection: "product_images",
          resumeFileId: fFailedFileId,
          resumeFromChunk: fFailedChunk,
          onProgress: (p) => setFUploadProgress(p.percent),
        });
      } else {
        uploadResult = await uploadFileInChunks(fSelectedFile, {
          collection: "product_images",
          onProgress: (p) => setFUploadProgress(p.percent),
        });
      }

      const newImageUrl = `product_images/${uploadResult.fileId}`;
      setFImageURL(newImageUrl);
      setFSelectedFile(null);
      setFFailedFileId(undefined);
      setFFailedChunk(undefined);
      alert("Gambar berhasil diunggah! Jangan lupa menyimpan form produk.");
    } catch (err: unknown) {
      console.error("Gagal mengunggah gambar produk:", err);
      if (err instanceof ChunkUploadError && err.code === "WRITE_FAILED") {
        setFFailedFileId(err.fileId);
        setFFailedChunk(err.failedChunkIndex);
        setFImageError(`Unggahan terputus di chunk ${err.failedChunkIndex || 0}. Silakan klik 'Lanjutkan'.`);
      } else {
        const errorObj = err as { message?: string };
        setFImageError(errorObj.message || "Gagal mengunggah gambar.");
      }
    } finally {
      setFUploading(false);
    }
  };

  const handleDrawerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);

    const trimmedName = fItemName.trim();
    const trimmedCategory = fCategory.trim();
    const trimmedUnit = fUnit.trim();

    if (!trimmedName || trimmedName.length > 200) {
      setDrawerError("Nama produk harus di antara 1 dan 200 karakter.");
      return;
    }

    if (!trimmedCategory || trimmedCategory.length > 50) {
      setDrawerError("Kategori produk harus di antara 1 dan 50 karakter.");
      return;
    }

    if (!trimmedUnit || trimmedUnit.length > 50) {
      setDrawerError("Satuan produk harus di antara 1 and 50 karakter.");
      return;
    }

    if (fQty < 0 || fQty > 99999) {
      setDrawerError("Jumlah kuantitas harus di antara 0 dan 99.999");
      return;
    }

    if (fPrice < 0) {
      setDrawerError("Harga produk tidak boleh kurang dari 0.");
      return;
    }

    setDrawerSaving(true);

    const payload: InventoryItemInput = {
      itemName: trimmedName,
      quantity: fQty,
      unit: trimmedUnit,
      price: fPrice,
      // Rule 12.2: quantity 0 forces available false
      available: fQty === 0 ? false : fAvailable,
      category: trimmedCategory,
      imageUrl: fImageURL || undefined,
    };

    try {
      if (drawerEditId) {
        await updateItem(drawerEditId, payload);
      } else {
        await createItem(payload);
      }
      alert("Produk berhasil disimpan");
      closeDrawer();
      await load();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setDrawerError(errorObj.message || "Gagal menyimpan data produk.");
    } finally {
      setDrawerSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <div className="flex items-center gap-2 text-amber-800">
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold">
              Mode Demo Aktif — data produk berikut hanya tersimpan lokal dan juga tampil di halaman pelanggan.
            </span>
          </div>
          <button
            onClick={handleClearDemo}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 hover:text-red-700 transition-colors cursor-pointer"
          >
            <Trash className="h-3.5 w-3.5" />
            Hapus Demo
          </button>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          <button
            id="btn-muat-data-dummy"
            type="button"
            onClick={() => void handleLoadDummy()}
            disabled={loadingDemo}
            className="inline-flex items-center gap-2 min-h-11 px-5 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-sm font-bold text-white shadow-sm transition-all cursor-pointer"
          >
            {loadingDemo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {loadingDemo ? "Memuat…" : "Muat Data Dummy"}
          </button>
          <button
            type="button"
            onClick={() => void openDrawer()}
            className="inline-flex items-center gap-2 min-h-11 px-5 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm transition-all cursor-pointer"
          >
            <Plus className="h-5 w-5" />
            Tambah Produk
          </button>
        </div>
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
          <button
            type="button"
            onClick={() => void openDrawer()}
            className="inline-flex min-h-11 px-6 bg-[#FBBF24] text-[#111827] rounded-2xl items-center font-bold cursor-pointer"
          >
            Tambah Produk Baru
          </button>
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
                          onClick={() => void openDrawer(item)}
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

      {/* ── DRAWER: Tambah / Edit Produk ──────────────────────── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  title="Kembali"
                  onClick={closeDrawer}
                  className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#6B7280] cursor-pointer"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-[#111827]">
                  {drawerEditId ? "Ubah Produk" : "Tambah Produk"}
                </h2>
              </div>
            </div>

            {/* Drawer Body */}
            {drawerLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
              </div>
            ) : (
              <div className="flex-1 p-6 space-y-6">
                {/* Image Upload */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-[#111827] font-['Manrope',system-ui,sans-serif]">Foto Produk</label>
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="h-36 w-36 rounded-2xl overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF] shrink-0">
                      {fImagePreview ? (
                        <img src={fImagePreview} alt="Pratinjau" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-8 w-8" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2 w-full">
                      <div className="flex gap-2">
                        <label className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#E5E7EB] bg-white text-xs font-bold text-[#374151] rounded-xl cursor-pointer hover:bg-[#F9FAFB]">
                          <Upload className="h-4 w-4" />
                          Pilih Berkas
                          <input
                            type="file"
                            accept="image/jpeg, image/png, image/webp"
                            className="hidden"
                            onChange={handleDrawerFileChange}
                            disabled={fUploading}
                          />
                        </label>
                        {fImageURL && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveImage()}
                            disabled={fUploading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#FCA5A5] bg-red-50 text-xs font-bold text-[#DC2626] rounded-xl cursor-pointer hover:bg-red-100"
                          >
                            Hapus Foto
                          </button>
                        )}
                      </div>
                      {fSelectedFile && !fUploading && (
                        <div className="flex gap-2 pt-2">
                          {fFailedChunk !== undefined ? (
                            <button type="button" onClick={() => void handleDrawerUpload(true)}
                              className="px-3 py-1.5 bg-emerald-600 text-xs font-bold text-white rounded-xl flex items-center gap-1 cursor-pointer">
                              <RefreshCw className="h-3.5 w-3.5" /> Lanjutkan (Chunk {fFailedChunk})
                            </button>
                          ) : (
                            <button type="button" onClick={() => void handleDrawerUpload(false)}
                              className="px-3 py-1.5 bg-[#FBBF24] text-xs font-bold text-[#111827] rounded-xl cursor-pointer">
                              Unggah Gambar
                            </button>
                          )}
                        </div>
                      )}
                      {fUploading && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-[#111827]">
                            <span>Mengunggah...</span><span>{fUploadProgress}%</span>
                          </div>
                          <div className="w-full bg-[#E5E7EB] h-1.5 rounded-full overflow-hidden">
                            <div ref={progressBarRef} className="bg-[#FBBF24] h-full transition-all duration-200" />
                          </div>
                        </div>
                      )}
                      {fImageError && <p className="text-xs font-semibold text-[#EF4444]">{fImageError}</p>}
                    </div>
                  </div>
                </div>

                <hr className="border-[#F3F4F6]" />

                {/* Form */}
                <form onSubmit={(e) => void handleDrawerSubmit(e)} className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#4B5563]">Nama Barang</label>
                    <input type="text" required maxLength={200} placeholder="Contoh: Beras Sentra Ramos 5kg"
                       className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                       value={fItemName} onChange={(e) => setFItemName(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#4B5563]">Kategori</label>
                    <input type="text" required list="drawer-cats" placeholder="Pilih atau ketik kategori baru"
                       className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                       value={fCategory} onChange={(e) => setFCategory(e.target.value)} />
                    <datalist id="drawer-cats">
                      {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">Harga (Rupiah)</label>
                      <input type="number" required min={0} placeholder="75000"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={fPrice || ""} onChange={(e) => setFPrice(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">Satuan</label>
                      <input type="text" required placeholder="pcs, kg, karung"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={fUnit} onChange={(e) => setFUnit(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-center">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">Jumlah Stok Awal</label>
                      <input type="number" required min={0} max={99999} placeholder="100"
                        className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                        value={fQty} onChange={(e) => setFQty(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563] block">Status Ketersediaan</label>
                      <div className="pt-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="sr-only peer"
                            checked={fQty === 0 ? false : fAvailable}
                            disabled={fQty === 0}
                            onChange={(e) => setFAvailable(e.target.checked)} />
                          <div className="relative w-11 h-6 bg-[#E5E7EB] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-50" />
                          <span className="text-xs font-semibold text-[#374151]">
                            {fQty === 0 ? "Nonaktif (Stok Kosong)" : fAvailable ? "Aktif" : "Nonaktif"}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {drawerError && (
                    <p className="text-sm text-[#EF4444] bg-red-50 border border-red-200 p-3 rounded-2xl flex gap-1.5 items-start">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{drawerError}</span>
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeDrawer}
                      className="flex-1 min-h-12 border border-[#E5E7EB] hover:bg-[#F9FAFB] text-sm font-bold text-[#374151] rounded-2xl cursor-pointer">
                      Batal
                    </button>
                    <button type="submit" disabled={drawerSaving}
                      className="flex-1 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50">
                      {drawerSaving ? <><Loader2 className="h-5 w-5 animate-spin" />Menyimpan…</> : "Simpan Produk"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default ProductsPage;
