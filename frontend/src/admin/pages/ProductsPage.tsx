import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Plus, Edit, Trash2, ImageOff, Check, X, ArrowUpDown, ChevronLeft, ChevronRight, Filter, ArrowLeft, Upload, AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { translateCategory } from "@/constants/categories";

import { db } from "@/lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";

import { listAllItems, deleteItem, patchStock, listCategories, updateItem, createItem, getItem, deleteImageFileAndChunks } from "@/services/stockAdminService";
import { uploadFileInChunks, ChunkUploadError } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import type { InventoryItem, InventoryItemInput } from "@/types/inventory";
import { formatIDR } from "@/lib/format";
import { ProductImage } from "@/components/ProductImage";

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

function DetailUploadProgressBar({ progress }: { progress: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = `${progress}%`;
    }
  }, [progress]);
  return (
    <div className="w-full bg-[#E5E7EB] h-1 rounded-full overflow-hidden">
      <div ref={barRef} className="bg-[#FBBF24] h-full transition-all duration-200" />
    </div>
  );
}

type SortField = "itemName" | "category" | "price" | "quantity";
type SortOrder = "asc" | "desc";

const DICTIONARY = {
  id: {
    demoActive: "Mode Demo Aktif — data produk berikut hanya tersimpan lokal dan juga tampil di halaman pelanggan.",
    btnRemoveDemo: "Hapus Demo",
    title: "Daftar Produk Koperasi",
    subtitle: "Kelola inventaris barang koperasi, stok kuantitas, harga, dan gambar.",
    btnLoadDemo: "Muat Data Dummy",
    loadingText: "Memuat…",
    btnAddProduct: "Tambah Produk",
    filterAll: "Semua Kategori",
    showText: "Tampilkan",
    rowsText: "baris",
    loadingDatabase: "Memuat basis data produk…",
    tryAgain: "Coba Lagi",
    noProduct: "Tidak Ada Produk",
    noProductDesc: "Inventaris koperasi kosong atau tidak cocok dengan filter kategori yang dipilih.",
    btnAddNewProduct: "Tambah Produk Baru",
    thPhoto: "Foto",
    thName: "Nama Produk",
    thCategory: "Kategori",
    thPrice: "Harga (IDR)",
    thStockQty: "Stok Qty",
    thActions: "Aksi",
    statusActive: "Aktif",
    statusInactive: "Nonaktif",
    titleEditProduct: "Ubah Produk Koperasi",
    titleAddProduct: "Tambah Produk Koperasi",
    labelProductPhoto: "Foto Produk",
    photoPlaceholder: "Pratinjau produk",
    btnSelectFile: "Pilih Berkas",
    btnDeletePhoto: "Hapus Foto",
    btnResumeChunk: "Lanjutkan (Chunk {chunk})",
    btnUploadImage: "Unggah Gambar",
    uploadingText: "Mengunggah...",
    mimeError: "Format file tidak didukung. Pilih JPEG, PNG, atau WEBP.",
    sizeError: "Ukuran file melebihi batas 15 MB.",
    uploadInterrupt: "Unggah terputus di chunk {chunk}. Silakan klik 'Lanjutkan'.",
    uploadGeneralError: "Gagal mengunggah gambar.",
    uploadSuccess: "Gambar berhasil diunggah! Jangan lupa menyimpan form produk.",
    confirmRemovePhoto: "Hapus gambar produk ini?",
    removePhotoError: "Gagal menghapus gambar.",
    labelProductName: "Nama Barang",
    placeholderProductName: "Contoh: Beras Sentra Ramos 5kg",
    labelCategory: "Kategori",
    placeholderCategory: "Pilih atau ketik kategori baru",
    labelPrice: "Harga (Rupiah)",
    labelUnit: "Satuan Unit",
    placeholderUnit: "Contoh: pcs, kg, karung",
    labelInitialStock: "Jumlah Stok Awal",
    labelAvailabilityStatus: "Status Ketersediaan",
    statusOutOfStock: "Nonaktif (Stok Kosong)",
    statusAvailable: "Aktif (Tersedia)",
    statusUnavailable: "Nonaktif (Habis)",
    btnCancel: "Batal",
    btnSave: "Simpan Produk",
    savingText: "Menyimpan…",
    saveSuccess: "Produk berhasil disimpan",
    saveError: "Gagal menyimpan data produk.",
    loadError: "Gagal memuat daftar produk inventaris.",
    demoLoadSuccess: "Data dummy berhasil disimpan ke database Firestore!",
    demoLoadError: "Gagal menyimpan data dummy ke Firestore.",
    demoClearSuccess: "Data dummy berhasil dihapus dari database.",
    demoClearError: "Gagal menghapus data dummy.",
    deleteProductTitle: "Hapus Produk",
    deleteProductConfirm: "Apakah Anda yakin ingin menghapus produk **{name}** secara permanen? Seluruh gambar terkait produk ini juga akan terhapus.",
    btnDeletePermanently: "Hapus Permanen",
    enableAvailabilityTitle: "Aktifkan Ketersediaan?",
    enableAvailabilityConfirm: "Stok produk **{name}** saat ini diatur menjadi **{qty}**, namun status produk ini sedang Nonaktif (Tidak Tersedia). Apakah Anda ingin mengaktifkan ketersediaan produk ini secara otomatis?",
    btnKeepInactive: "Biarkan Nonaktif",
    btnYesEnable: "Ya, Aktifkan",
    inlineStockTitle: "Jumlah Stok Baru",
    inlineStockConfirmTooltip: "Simpan",
    inlineStockCancelTooltip: "Batal",
    inlineStockTooltip: "Klik untuk ubah stok langsung",
    btnEditTooltip: "Ubah data produk",
    btnDeleteTooltip: "Hapus produk",
    btnAvailabilityTooltip: "Klik untuk mengubah ketersediaan",
    itemsText: "produk",
    showingText: "Menampilkan",
    fromText: "dari",
    loadDetailError: "Gagal memuat data detail produk.",
    btnBackTooltip: "Kembali",
    drawerEditTitle: "Ubah Produk",
    drawerAddTitle: "Tambah Produk",
    placeholderDrawerUnit: "pcs, kg, karung",
    placeholderDrawerPrice: "75000",
    placeholderDrawerQty: "100",
    nameValError: "Nama produk harus di antara 1 dan 200 karakter.",
    categoryValError: "Kategori produk harus di antara 1 dan 50 karakter.",
    unitValError: "Satuan produk harus di antara 1 and 50 karakter.",
    qtyValError: "Jumlah kuantitas harus di antara 0 dan 99.999",
    priceValError: "Harga produk tidak boleh kurang dari 0.",
    labelNormalPrice: "Harga Normal (Rupiah)",
    labelDiscountPercent: "Diskon (%)",
    labelFinalPrice: "Harga Setelah Diskon",
    discountValError: "Diskon harus berupa angka antara 0 dan 100.",
    deleteError: "Gagal menghapus produk dari database.",
    stockUpdateError: "Gagal memperbarui jumlah stok.",
    stockToggleError: "Gagal mengubah ketersediaan produk.",
    productUpdateError: "Gagal memperbarui produk.",
  },
  en: {
    demoActive: "Demo Mode Active — product data below is only stored locally and also appears on storefront.",
    btnRemoveDemo: "Delete Demo",
    title: "Cooperative Product List",
    subtitle: "Manage cooperative inventory items, stock quantities, prices, and images.",
    btnLoadDemo: "Load Dummy Data",
    loadingText: "Loading…",
    btnAddProduct: "Add Product",
    filterAll: "All Categories",
    showText: "Show",
    rowsText: "rows",
    loadingDatabase: "Loading product database…",
    tryAgain: "Try Again",
    noProduct: "No Products",
    noProductDesc: "Cooperative inventory is empty or does not match the selected category filter.",
    btnAddNewProduct: "Add New Product",
    thPhoto: "Photo",
    thName: "Product Name",
    thCategory: "Category",
    thPrice: "Price (IDR)",
    thStockQty: "Stock Qty",
    thActions: "Actions",
    statusActive: "Active",
    statusInactive: "Inactive",
    titleEditProduct: "Edit Cooperative Product",
    titleAddProduct: "Add Cooperative Product",
    labelProductPhoto: "Product Photo",
    photoPlaceholder: "Product preview",
    btnSelectFile: "Choose File",
    btnDeletePhoto: "Delete Photo",
    btnResumeChunk: "Resume (Chunk {chunk})",
    btnUploadImage: "Upload Image",
    uploadingText: "Uploading...",
    mimeError: "Unsupported file format. Choose JPEG, PNG, or WEBP.",
    sizeError: "File size exceeds the 15 MB limit.",
    uploadInterrupt: "Upload interrupted at chunk {chunk}. Please click 'Resume'.",
    uploadGeneralError: "Failed to upload image.",
    uploadSuccess: "Image uploaded successfully! Don't forget to save the product form.",
    confirmRemovePhoto: "Delete this product image?",
    removePhotoError: "Failed to delete image.",
    labelProductName: "Item Name",
    placeholderProductName: "Example: Sentra Ramos Rice 5kg",
    labelCategory: "Category",
    placeholderCategory: "Select or type new category",
    labelPrice: "Price (Rupiah)",
    labelUnit: "Unit",
    placeholderUnit: "Example: pcs, kg, sack",
    labelInitialStock: "Initial Stock Quantity",
    labelAvailabilityStatus: "Availability Status",
    statusOutOfStock: "Inactive (Out of Stock)",
    statusAvailable: "Active (Available)",
    statusUnavailable: "Inactive (Sold Out)",
    btnCancel: "Cancel",
    btnSave: "Save Product",
    savingText: "Saving…",
    saveSuccess: "Product saved successfully",
    saveError: "Failed to save product data.",
    loadError: "Failed to load inventory products list.",
    demoLoadSuccess: "Dummy data saved successfully to Firestore database!",
    demoLoadError: "Failed to save dummy data to Firestore.",
    demoClearSuccess: "Dummy data successfully deleted from database.",
    demoClearError: "Failed to delete dummy data.",
    deleteProductTitle: "Delete Product",
    deleteProductConfirm: "Are you sure you want to delete product **{name}** permanently? All associated images will also be deleted.",
    btnDeletePermanently: "Delete Permanently",
    enableAvailabilityTitle: "Enable Availability?",
    enableAvailabilityConfirm: "The stock of product **{name}** is currently set to **{qty}**, but this product's status is Inactive (Unavailable). Do you want to automatically enable this product's availability?",
    btnKeepInactive: "Keep Inactive",
    btnYesEnable: "Yes, Enable",
    inlineStockTitle: "New Stock Quantity",
    inlineStockConfirmTooltip: "Save",
    inlineStockCancelTooltip: "Cancel",
    inlineStockTooltip: "Click to change stock directly",
    btnEditTooltip: "Edit product details",
    btnDeleteTooltip: "Delete product",
    btnAvailabilityTooltip: "Click to change availability status",
    itemsText: "product(s)",
    showingText: "Showing",
    fromText: "of",
    loadDetailError: "Failed to load product details.",
    btnBackTooltip: "Back",
    drawerEditTitle: "Edit Product",
    drawerAddTitle: "Add Product",
    placeholderDrawerUnit: "pcs, kg, sack",
    placeholderDrawerPrice: "75000",
    placeholderDrawerQty: "100",
    nameValError: "Product name must be between 1 and 200 characters.",
    categoryValError: "Product category must be between 1 and 50 characters.",
    unitValError: "Product unit must be between 1 and 50 characters.",
    qtyValError: "Quantity must be between 0 and 99,999",
    priceValError: "Product price cannot be less than 0.",
    labelNormalPrice: "Normal Price (Rupiah)",
    labelDiscountPercent: "Discount (%)",
    labelFinalPrice: "Price After Discount",
    discountValError: "Discount must be a number between 0 and 100.",
    deleteError: "Failed to delete product from database.",
    stockUpdateError: "Failed to update stock quantity.",
    stockToggleError: "Failed to change product availability.",
    productUpdateError: "Failed to update product.",
  }
} as const;

export function ProductsPage() {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const t = DICTIONARY[lang];

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

  // Delete target state
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);

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
  const [fQty, setFQty] = useState<number | "">("");
  const [fUnit, setFUnit] = useState("pcs");
  const [fPrice, setFPrice] = useState<number | "">("");
  const [fNormalPrice, setFNormalPrice] = useState<number | "">("");
  const [fDiscountPercent, setFDiscountPercent] = useState<number>(0);
  const [fAvailable, setFAvailable] = useState(true);
  const [fCategory, setFCategory] = useState("");
  const [fImageURL, setFImageURL] = useState("");

  // Multi-image fields
  const [fDetailImageUrls, setFDetailImageUrls] = useState<string[]>([]);
  const [fDetailImagePreviews, setFDetailImagePreviews] = useState<string[]>([]);

  interface DetailUploadTask {
    file: File;
    progress: number;
    fileId?: string;
    failedChunk?: number;
    error?: string;
    previewUrl: string;
  }
  const [detailUploadTasks, setDetailUploadTasks] = useState<DetailUploadTask[]>([]);

  // Auto-calculate fPrice when fNormalPrice or fDiscountPercent changes
  useEffect(() => {
    if (fNormalPrice !== "") {
      const finalPrice = Math.round(Number(fNormalPrice) * (1 - fDiscountPercent / 100));
      setFPrice(finalPrice >= 0 ? finalPrice : 0);
    } else {
      setFPrice("");
    }
  }, [fNormalPrice, fDiscountPercent]);

  // Image upload (Main Photo)
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
      fDetailImagePreviews.forEach(p => {
        if (p && !p.startsWith("http")) URL.revokeObjectURL(p);
      });
      detailUploadTasks.forEach(t => {
        if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
      });
    };
  }, [fImagePreview, fDetailImagePreviews, detailUploadTasks]);

  // Upload detail file directly in chunks
  const uploadDetailFileDirectly = async (file: File, taskIndex: number, isRetry = false) => {
    setDetailUploadTasks(prev => prev.map((t, idx) => idx === taskIndex ? { ...t, error: undefined, failedChunk: undefined } : t));

    try {
      let uploadResult;
      const currentTask = detailUploadTasks[taskIndex];
      if (isRetry && currentTask?.fileId && currentTask?.failedChunk !== undefined) {
        uploadResult = await uploadFileInChunks(file, {
          collection: "product_images",
          resumeFileId: currentTask.fileId,
          resumeFromChunk: currentTask.failedChunk,
          onProgress: (p) => {
            setDetailUploadTasks(prev => prev.map((t, idx) => idx === taskIndex ? { ...t, progress: p.percent } : t));
          },
        });
      } else {
        uploadResult = await uploadFileInChunks(file, {
          collection: "product_images",
          onProgress: (p) => {
            setDetailUploadTasks(prev => prev.map((t, idx) => idx === taskIndex ? { ...t, progress: p.percent } : t));
          },
        });
      }

      const newImageUrl = `product_images/${uploadResult.fileId}`;
      const resolvedUrl = resolveProductImageURL(newImageUrl) || "";

      // Append to detail arrays
      setFDetailImageUrls(prev => [...prev, newImageUrl]);
      setFDetailImagePreviews(prev => [...prev, resolvedUrl]);

      // Remove from tasks
      setDetailUploadTasks(prev => prev.filter((_, idx) => idx !== taskIndex));
    } catch (err: unknown) {
      console.error("Gagal mengunggah gambar detail:", err);
      if (err instanceof ChunkUploadError && err.code === "WRITE_FAILED") {
        setDetailUploadTasks(prev => prev.map((t, idx) => idx === taskIndex ? {
          ...t,
          fileId: err.fileId,
          failedChunk: err.failedChunkIndex,
          error: t.error || "Unggah terputus. Coba lanjutkan."
        } : t));
      } else {
        const errorObj = err as { message?: string };
        setDetailUploadTasks(prev => prev.map((t, idx) => idx === taskIndex ? {
          ...t,
          error: errorObj.message || "Gagal mengunggah."
        } : t));
      }
    }
  };

  // Handle adding detail image files
  const handleDetailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (fDetailImageUrls.length + detailUploadTasks.length >= 5) {
      showToast({ message: "Maksimal 5 foto tambahan yang diperbolehkan.", variant: "error" });
      return;
    }

    const file = files[0];
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        showToast({ message: t.mimeError, variant: "error" });
      } else {
        showToast({ message: t.sizeError, variant: "error" });
      }
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const newTask: DetailUploadTask = {
      file,
      progress: 0,
      previewUrl
    };

    setDetailUploadTasks(prev => {
      const next = [...prev, newTask];
      const taskIndex = next.length - 1;
      setTimeout(() => {
        void uploadDetailFileDirectly(file, taskIndex);
      }, 0);
      return next;
    });
  };

  // Make detail image the main photo
  const makeMainPhoto = (index: number) => {
    const mainUrl = fImageURL;
    const mainPreview = fImagePreview;

    const secUrl = fDetailImageUrls[index];
    const secPreview = fDetailImagePreviews[index];

    // Swap main and secondary
    setFImageURL(secUrl);
    setFImagePreview(secPreview);

    const nextUrls = [...fDetailImageUrls];
    const nextPreviews = [...fDetailImagePreviews];

    if (mainUrl) {
      nextUrls[index] = mainUrl;
      nextPreviews[index] = mainPreview || "";
    } else {
      nextUrls.splice(index, 1);
      nextPreviews.splice(index, 1);
    }

    setFDetailImageUrls(nextUrls);
    setFDetailImagePreviews(nextPreviews);
  };

  // Delete/remove a secondary photo and clean chunks from Firestore
  const handleRemoveDetailImage = async (index: number) => {
    const url = fDetailImageUrls[index];
    if (confirm(t.confirmRemovePhoto)) {
      const nextUrls = [...fDetailImageUrls];
      const nextPreviews = [...fDetailImagePreviews];
      nextUrls.splice(index, 1);
      nextPreviews.splice(index, 1);
      setFDetailImageUrls(nextUrls);
      setFDetailImagePreviews(nextPreviews);

      try {
        if (url) {
          await deleteImageFileAndChunks(url);
        }
      } catch (err) {
        console.error("Gagal menghapus chunks gambar detail:", err);
      }
    }
  };

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
      setError(DICTIONARY[lang].loadError);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, lang]);

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
      showToast({ message: t.deleteError, variant: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllProducts = async () => {
    const confirmMsg = lang === "id" 
      ? "Apakah Anda yakin ingin menghapus SELURUH produk (termasuk semua foto tambahan) dari database secara permanen?"
      : "Are you sure you want to permanently delete ALL products (including all additional photos) from the database?";
      
    if (confirm(confirmMsg)) {
      setDeletingAll(true);
      try {
        // Fetch all items from database to delete everything globally, ignoring active filters
        const allItems = await listAllItems();
        await Promise.all(allItems.map(async (item) => {
          await deleteItem(item.id);
        }));
        
        showToast({ 
          message: lang === "id" ? "Semua produk berhasil dihapus secara permanen!" : "All products successfully deleted permanently!", 
          variant: "success" 
        });
        
        await load();
      } catch (err) {
        console.error("Gagal menghapus semua produk:", err);
        showToast({ 
          message: lang === "id" ? "Gagal menghapus semua produk." : "Failed to delete all products.", 
          variant: "error" 
        });
      } finally {
        setDeletingAll(false);
      }
    }
  };

  const handleSeedUMKMData = async () => {
    const confirmMsg = lang === "id"
      ? "Apakah Anda yakin ingin memuat data produk dummy khas UMKM Indonesia ke database Firestore?"
      : "Are you sure you want to load Indonesian UMKM dummy product data into the Firestore database?";
      
    if (confirm(confirmMsg)) {
      setSeedingDemo(true);
      try {
        const dummySeeds = [
          {
            itemName: "Bakso Sapi Urat Solo",
            category: "Makanan",
            price: 18000,
            discountPercent: 10,
            quantity: 50,
            unit: "porsi",
            available: true,
            imageUrl: "https://upload.wikimedia.org/wikipedia/commons/2/27/Bakso_Daging_Sapi.jpg",
            detailImageUrls: [
              "https://upload.wikimedia.org/wikipedia/commons/c/c1/Indonesian_bakso%2C_with_noodle_and_bean_sprouts%2C_April_2018_%2801%29.jpg",
              "https://upload.wikimedia.org/wikipedia/commons/5/55/Bakso_khas_Solo.jpg"
            ]
          },
          {
            itemName: "Nasi Goreng Spesial UMKM",
            category: "Makanan",
            price: 15000,
            discountPercent: 0,
            quantity: 40,
            unit: "porsi",
            available: true,
            imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Nasi_goreng-1.JPG",
            detailImageUrls: [
              "https://upload.wikimedia.org/wikipedia/commons/8/8b/Nasi-Goreng.jpg",
              "https://upload.wikimedia.org/wikipedia/commons/3/30/Nasi_goren_%28fried_rice%29_%288618224811%29.jpg"
            ]
          },
          {
            itemName: "Es Teh Manis Jumbo",
            category: "Minuman",
            price: 5000,
            discountPercent: 0,
            quantity: 100,
            unit: "gelas",
            available: true,
            imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/6b/ES_TEH_MANIS.jpg",
            detailImageUrls: []
          },
          {
            itemName: "Keripik Singkong Balado",
            category: "Camilan",
            price: 12000,
            discountPercent: 15,
            quantity: 30,
            unit: "bungkus",
            available: true,
            imageUrl: "https://upload.wikimedia.org/wikipedia/commons/8/84/Keripik_singkong_balado_cassava_chips.JPG",
            detailImageUrls: [
              "https://upload.wikimedia.org/wikipedia/commons/9/97/Keripik_Singkong_Pedas.jpg"
            ]
          },
          {
            itemName: "Es Jeruk Peras Segar",
            category: "Minuman",
            price: 7000,
            discountPercent: 0,
            quantity: 60,
            unit: "gelas",
            available: true,
            imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/66/Es_jeruk.jpg",
            detailImageUrls: [
              "https://upload.wikimedia.org/wikipedia/commons/4/4d/Es_Jeruk_Barokah.jpg"
            ]
          },
          {
            itemName: "Kerupuk Uyel Putih Kaleng",
            category: "Camilan",
            price: 2000,
            discountPercent: 0,
            quantity: 80,
            unit: "pcs",
            available: true,
            imageUrl: "https://upload.wikimedia.org/wikipedia/commons/f/fc/Kerupuk_putih.jpg",
            detailImageUrls: [
              "https://upload.wikimedia.org/wikipedia/commons/a/a1/Kroepoek.jpg"
            ]
          }
        ];

        await Promise.all(dummySeeds.map(payload => createItem(payload)));
        
        showToast({
          message: lang === "id" ? "Berhasil memuat data produk UMKM!" : "Successfully seeded UMKM products data!",
          variant: "success"
        });
        
        await load();
      } catch (err) {
        console.error("Gagal melakukan seeding produk UMKM:", err);
        showToast({
          message: lang === "id" ? "Gagal memuat data produk UMKM." : "Failed to seed UMKM products.",
          variant: "error"
        });
      } finally {
        setSeedingDemo(false);
      }
    }
  };

  const handleInlineStockSave = async (item: InventoryItem, newQty: number) => {
    if (newQty < 0 || newQty > 99999) {
      showToast({ message: t.qtyValError, variant: "error" });
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
      showToast({ message: t.stockUpdateError, variant: "error" });
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
      showToast({ message: t.productUpdateError, variant: "error" });
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
      showToast({ message: t.stockToggleError, variant: "error" });
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
        const discountPct = freshItem.discountPercent ?? 0;
        setFDiscountPercent(discountPct);
        const normPrice = discountPct > 0 
          ? Math.round(freshItem.price / (1 - discountPct / 100))
          : freshItem.price;
        setFNormalPrice(normPrice);
        setFPrice(freshItem.price);
        setFAvailable(freshItem.available);
        setFCategory(freshItem.category);
        setFImageURL(freshItem.imageUrl || "");

        if (freshItem.imageUrl) {
          setFImagePreview(resolveProductImageURL(freshItem.imageUrl));
        } else {
          setFImagePreview(null);
        }

        const detailUrls = freshItem.detailImageUrls || [];
        setFDetailImageUrls(detailUrls);
        setFDetailImagePreviews(detailUrls.map(url => resolveProductImageURL(url) || ""));
      } catch {
        setDrawerError(t.loadDetailError);
      } finally {
        setDrawerLoading(false);
      }
    } else {
      setDrawerEditId(null);
      setFItemName("");
      setFQty("");
      setFUnit("pcs");
      setFDiscountPercent(0);
      setFNormalPrice("");
      setFPrice("");
      setFAvailable(true);
      setFCategory("");
      setFImageURL("");
      setFImagePreview(null);
      setFDetailImageUrls([]);
      setFDetailImagePreviews([]);
      setDetailUploadTasks([]);
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
    setFQty("");
    setFUnit("pcs");
    setFNormalPrice("");
    setFDiscountPercent(0);
    setFPrice("");
    setFAvailable(true);
    setFCategory("");
    setFImageURL("");
    setFImagePreview(null);
    setFSelectedFile(null);
    setFUploading(false);
    setFUploadProgress(0);
    setFFailedFileId(undefined);
    setFFailedChunk(undefined);
    setFDetailImageUrls([]);
    setFDetailImagePreviews([]);
    setDetailUploadTasks([]);
  };

  const uploadFileDirectly = async (file: File, isRetry = false) => {
    setFUploading(true);
    setFImageError(null);

    try {
      if (!isRetry && fImageURL) {
        await deleteProductImageFromFirestore(fImageURL);
      }

      let uploadResult;
      if (isRetry && fFailedFileId && fFailedChunk !== undefined) {
        uploadResult = await uploadFileInChunks(file, {
          collection: "product_images",
          resumeFileId: fFailedFileId,
          resumeFromChunk: fFailedChunk,
          onProgress: (p) => setFUploadProgress(p.percent),
        });
      } else {
        uploadResult = await uploadFileInChunks(file, {
          collection: "product_images",
          onProgress: (p) => setFUploadProgress(p.percent),
        });
      }

      const newImageUrl = `product_images/${uploadResult.fileId}`;
      setFImageURL(newImageUrl);
      setFSelectedFile(file);
      setFFailedFileId(undefined);
      setFFailedChunk(undefined);
    } catch (err: unknown) {
      console.error("Gagal mengunggah gambar produk:", err);
      if (err instanceof ChunkUploadError && err.code === "WRITE_FAILED") {
        setFFailedFileId(err.fileId);
        setFFailedChunk(err.failedChunkIndex);
        setFImageError(t.uploadInterrupt.replace("{chunk}", String(err.failedChunkIndex || 0)));
      } else {
        const errorObj = err as { message?: string };
        setFImageError(errorObj.message || t.uploadGeneralError);
      }
    } finally {
      setFUploading(false);
    }
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
        setFImageError(t.mimeError);
      } else {
        setFImageError(t.sizeError);
      }
      setFSelectedFile(null);
      return;
    }

    setFSelectedFile(file);
    const previewUrl = URL.createObjectURL(file);
    setFImagePreview(previewUrl);
    void uploadFileDirectly(file);
  };

  const handleRemoveImage = async () => {
    if (confirm(t.confirmRemovePhoto)) {
      setFUploading(true);
      try {
        if (fImageURL) {
          await deleteProductImageFromFirestore(fImageURL);
        }
        setFImageURL("");
        setFSelectedFile(null);
        setFImagePreview(null);
      } catch {
        showToast({ message: t.removePhotoError, variant: "error" });
      } finally {
        setFUploading(false);
      }
    }
  };

  const handleDrawerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawerError(null);

    const trimmedName = fItemName.trim();
    const trimmedCategory = fCategory.trim();
    const trimmedUnit = fUnit.trim();

    if (!trimmedName || trimmedName.length > 200) {
      setDrawerError(t.nameValError);
      return;
    }

    if (!trimmedCategory || trimmedCategory.length > 50) {
      setDrawerError(t.categoryValError);
      return;
    }

    if (!trimmedUnit || trimmedUnit.length > 50) {
      setDrawerError(t.unitValError);
      return;
    }

    if (fQty !== "" && (fQty < 0 || fQty > 99999)) {
      setDrawerError(t.qtyValError);
      return;
    }

    if (fPrice !== "" && fPrice < 0) {
      setDrawerError(t.priceValError);
      return;
    }

    if (fDiscountPercent < 0 || fDiscountPercent > 100) {
      setDrawerError(t.discountValError);
      return;
    }

    setDrawerSaving(true);

    const payload: InventoryItemInput = {
      itemName: trimmedName,
      quantity: fQty === "" ? 0 : fQty,
      unit: trimmedUnit,
      price: fPrice === "" ? 0 : fPrice,
      discountPercent: fDiscountPercent,
      // Rule 12.2: quantity 0 forces available false
      available: (fQty === "" || fQty === 0) ? false : fAvailable,
      category: trimmedCategory,
      imageUrl: fImageURL || undefined,
      detailImageUrls: fDetailImageUrls,
    };

    try {
      if (drawerEditId) {
        await updateItem(drawerEditId, payload);
      } else {
        await createItem(payload);
      }
      showToast({ message: t.saveSuccess, variant: "success" });
      closeDrawer();
      await load();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setDrawerError(errorObj.message || t.saveError);
    } finally {
      setDrawerSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-xl sm:text-2xl font-extrabold text-[#111827]">
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] mt-0.5">
            {t.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {items.length > 0 && (
            <button
              type="button"
              disabled={deletingAll || seedingDemo}
              onClick={() => void handleDeleteAllProducts()}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-[11px] sm:text-xs font-bold text-white shadow-sm transition-all cursor-pointer whitespace-nowrap flex-nowrap"
              title={lang === "id" ? "Hapus Semua Produk" : "Delete All Products"}
            >
              {deletingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span>{lang === "id" ? "Hapus Semua" : "Delete All"}</span>
            </button>
          )}
          <button
            type="button"
            disabled={deletingAll || seedingDemo}
            onClick={() => void handleSeedUMKMData()}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-[11px] sm:text-xs font-bold text-white shadow-sm transition-all cursor-pointer whitespace-nowrap flex-nowrap"
            title={lang === "id" ? "Muat Data Dummy UMKM" : "Load UMKM Dummy Data"}
          >
            {seedingDemo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>{lang === "id" ? "Muat UMKM" : "Load UMKM"}</span>
          </button>
          <button
            type="button"
            disabled={deletingAll || seedingDemo}
            onClick={() => void openDrawer()}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 h-9 sm:h-10 px-2.5 sm:px-4 rounded-lg bg-[#FBBF24] hover:bg-[#F59E0B] text-[11px] sm:text-xs font-bold text-[#111827] shadow-sm transition-all cursor-pointer whitespace-nowrap flex-nowrap"
          >
            <Plus className="h-4 w-4" />
            {t.btnAddProduct}
          </button>
        </div>
      </div>

      {/* Filter and Pagesize Toolbar */}
      <div className="bg-white rounded-lg p-2.5 shadow-xs flex flex-row items-center justify-between gap-3 border border-[#E5E7EB]">
        {/* Category Filter */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Filter className="h-3.5 w-3.5 text-[#6B7280] shrink-0" />
          <select
            title="Pilih Kategori"
            className="bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-2 py-1 text-[11px] font-semibold text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] w-full max-w-[160px] sm:max-w-[200px]"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">{t.filterAll}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {translateCategory(cat, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Page Size selector */}
        <div className="flex items-center gap-1 text-[11px] text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] shrink-0">
          <span className="hidden sm:inline">{t.showText}</span>
          <select
            title="Jumlah Baris"
            className="bg-[#F3F4F6] border border-[#E5E7EB] rounded-md px-1 py-0.5 font-bold text-[#374151] focus:outline-none"
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
          <span>{t.rowsText}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#6B7280]">
          <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
          <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">{t.loadingDatabase}</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-950 p-6 rounded-lg text-center space-y-3 font-['Hanken_Grotesk',system-ui,sans-serif]">
          <p>{error}</p>
          <button onClick={load} className="inline-flex min-h-10 px-5 bg-[#FBBF24] rounded-lg items-center font-bold text-[#111827]">
            {t.tryAgain}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center space-y-4 shadow-sm border border-[#E5E7EB]">
          <ImageOff className="h-16 w-16 mx-auto text-[#9CA3AF]" />
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.noProduct}</h2>
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-sm mx-auto">
            {t.noProductDesc}
          </p>
          <button
            type="button"
            onClick={() => void openDrawer()}
            className="inline-flex min-h-10 px-5 bg-[#FBBF24] text-[#111827] rounded-lg items-center font-bold cursor-pointer"
          >
            {t.btnAddNewProduct}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mobile view cards (2-column compact grid) */}
          <div className="md:hidden grid grid-cols-2 gap-3">
            {paginatedItems.map((item) => {
              const isEditingThis = editingStockId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-lg border border-[#E5E7EB] p-3 shadow-xs flex flex-col justify-between font-['Hanken_Grotesk',system-ui,sans-serif]"
                >
                  <div className="space-y-2">
                    {/* Thumbnail preview - top aligned, full width */}
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF] shrink-0">
                      <ProductImage imageUrl={item.imageUrl} alt={item.itemName} className="h-full w-full object-cover" fallbackClassName="h-5 w-5 text-[#9CA3AF]" />
                    </div>
                    
                    {/* Info text */}
                    <div className="min-w-0">
                      <p className="font-['Manrope',system-ui,sans-serif] font-bold text-xs text-[#111827] line-clamp-2 min-h-[32px] leading-tight" title={item.itemName}>
                        {item.itemName}
                      </p>
                      <span className="inline-block text-[9px] font-semibold text-[#6B7280] bg-[#F3F4F6] px-1.5 py-0.5 rounded-md mt-1">
                        {translateCategory(item.category, lang) || "-"}
                      </span>
                      {item.discountPercent && item.discountPercent > 0 ? (
                        <div className="mt-1 flex flex-col">
                          <span className="text-[9px] text-neutral-400 line-through leading-none">
                            {formatIDR(Math.round(item.price / (1 - item.discountPercent / 100)))}
                          </span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="font-extrabold text-xs text-[#EE4D2D]">
                              {formatIDR(item.price)}
                            </span>
                            <span className="bg-[#FFEAEB] text-[#EE4D2D] text-[8px] font-black px-0.5 rounded-sm">
                              -{item.discountPercent}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="font-extrabold text-xs text-[#111827] mt-1.5">
                          {formatIDR(item.price)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 mt-2 border-t border-[#F3F4F6]">
                    {/* Availability switch / badge */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="text-[#6B7280] font-semibold">Status:</span>
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        className={
                          "rounded-md border px-1.5 py-0.5 text-[9px] font-bold cursor-pointer transition-all " +
                          (item.available
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                            : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100")
                        }
                        title={t.btnAvailabilityTooltip}
                      >
                        {item.available ? t.statusActive : t.statusInactive}
                      </button>
                    </div>

                    {/* Stock inline editor */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="text-[#6B7280] font-semibold">Stok:</span>
                      {isEditingThis ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            title={t.inlineStockTitle}
                            placeholder="0"
                            className="w-10 bg-[#F3F4F6] border border-[#D1D5DB] rounded px-1 py-0.5 text-center text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                            value={editingQty}
                            min={0}
                            max={99999}
                            onChange={(e) => setEditingQty(Number(e.target.value))}
                          />
                          <button
                            onClick={() => handleInlineStockSave(item, editingQty)}
                            className="p-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                            title={t.inlineStockConfirmTooltip}
                            disabled={savingStockId === item.id}
                          >
                            {savingStockId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            onClick={() => setEditingStockId(null)}
                            className="p-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 cursor-pointer"
                            title={t.inlineStockCancelTooltip}
                            disabled={savingStockId === item.id}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditingStockId(item.id);
                            setEditingQty(item.quantity);
                          }}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#F9FAFB] hover:bg-[#F3F4F6] border border-[#E5E7EB] rounded cursor-pointer font-bold text-[10px] text-neutral-800"
                          title={t.inlineStockTooltip}
                        >
                          <span>{item.quantity}</span>
                          <span className="text-[8px] text-[#6B7280] font-normal">{item.unit || "pcs"}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-2 border-t border-[#F3F4F6] mt-2">
                    <button
                      onClick={() => void openDrawer(item)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 border border-[#E5E7EB] hover:bg-amber-50 hover:text-[#FBBF24] hover:border-amber-200 rounded-lg cursor-pointer text-[10px] font-bold text-[#4B5563] transition-all"
                      title={t.btnEditTooltip}
                    >
                      <Edit className="h-3 w-3" />
                      <span>Ubah</span>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 border border-[#E5E7EB] hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-lg cursor-pointer text-[10px] font-bold text-[#4B5563] transition-all"
                      title={t.btnDeleteTooltip}
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-[#E5E7EB] overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px] table-fixed">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-xs font-extrabold text-[#4B5563] uppercase font-['Manrope',system-ui,sans-serif]">
                  <th className="p-4 w-[8%]">{t.thPhoto}</th>
                  <th className="p-4 w-[28%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("itemName")}>
                    <div className="flex items-center gap-1">{t.thName} <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[16%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("category")}>
                    <div className="flex items-center gap-1">{t.thCategory} <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[14%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("price")}>
                    <div className="flex items-center gap-1">{t.thPrice} <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[16%] cursor-pointer select-none hover:bg-neutral-100" onClick={() => handleSort("quantity")}>
                    <div className="flex items-center gap-1">{t.thStockQty} <ArrowUpDown className="h-3 w-3" /></div>
                  </th>
                  <th className="p-4 w-[18%]">{t.thActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs font-medium text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif]">
                {paginatedItems.map((item) => {
                  const isEditingThis = editingStockId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                      {/* Photo Thumbnail */}
                      <td className="p-4">
                        <div className="h-12 w-12 rounded-xl overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF]">
                          <ProductImage imageUrl={item.imageUrl} alt={item.itemName} className="h-full w-full object-cover" fallbackClassName="h-5 w-5 text-[#9CA3AF]" />
                        </div>
                      </td>

                      {/* Name */}
                      <td className="p-4 font-bold text-sm truncate" title={item.itemName}>
                        {item.itemName}
                      </td>

                      {/* Category */}
                      <td className="p-4 truncate">
                        {translateCategory(item.category, lang) || "-"}
                      </td>

                      {/* Price */}
                      <td className="p-4">
                        <div className="flex flex-col font-['Hanken_Grotesk']">
                          {item.discountPercent && item.discountPercent > 0 ? (
                            <>
                              <span className="text-[10px] text-neutral-400 line-through leading-none">
                                {formatIDR(Math.round(item.price / (1 - item.discountPercent / 100)))}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-extrabold text-xs text-[#EE4D2D]">
                                  {formatIDR(item.price)}
                                </span>
                                <span className="bg-[#FFEAEB] text-[#EE4D2D] text-[9px] font-black px-1 rounded-sm">
                                  -{item.discountPercent}%
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="font-bold text-xs text-[#111827]">
                              {formatIDR(item.price)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Inline Stock adjustment */}
                      <td className="p-4">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              title={t.inlineStockTitle}
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
                              title={t.inlineStockConfirmTooltip}
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
                              title={t.inlineStockCancelTooltip}
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
                            title={t.inlineStockTooltip}
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
                          title={t.btnAvailabilityTooltip}
                        >
                          {item.available ? t.statusActive : t.statusInactive}
                        </button>

                        <button
                          onClick={() => void openDrawer(item)}
                          className="p-2 text-[#4B5563] hover:text-[#FBBF24] hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded-full cursor-pointer transition-all"
                          title={t.btnEditTooltip}
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="p-2 text-[#4B5563] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-full cursor-pointer transition-all"
                          title={t.btnDeleteTooltip}
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
              <span>{t.showingText} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, items.length)} {t.fromText} {items.length} {t.itemsText}</span>
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
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.deleteProductTitle}</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                {t.deleteProductConfirm.replace("{name}", deleteTarget.itemName)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-2xl cursor-pointer"
              >
                {t.btnCancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={deletingId === deleteTarget.id}
                className="flex-1 min-h-10 bg-red-600 hover:bg-red-700 text-xs font-bold text-white rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {deletingId === deleteTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t.btnDeletePermanently
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
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.enableAvailabilityTitle}</h3>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                {t.enableAvailabilityConfirm
                  .replace("{name}", promptTarget.item.itemName)
                  .replace("{qty}", String(promptTarget.nextQty))}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => confirmEnableAvailability(false)}
                disabled={savingStockId === promptTarget.item.id}
                className="flex-1 min-h-10 border border-[#E5E7EB] hover:bg-[#F3F4F6] text-xs font-bold text-[#374151] rounded-2xl cursor-pointer"
              >
                {t.btnKeepInactive}
              </button>
              <button
                onClick={() => confirmEnableAvailability(true)}
                disabled={savingStockId === promptTarget.item.id}
                className="flex-1 min-h-10 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {savingStockId === promptTarget.item.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t.btnYesEnable
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
                  title={t.btnBackTooltip}
                  onClick={closeDrawer}
                  className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#6B7280] cursor-pointer"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-[#111827]">
                  {drawerEditId ? t.drawerEditTitle : t.drawerAddTitle}
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
                {/* Image Upload Gallery */}
                <div className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  <div>
                    <label className="text-sm font-bold text-[#111827] font-['Manrope',system-ui,sans-serif] block">
                      {lang === "id" ? "Foto Produk" : "Product Photos"}
                    </label>
                    <span className="text-[11px] text-[#6B7280] font-normal block mt-0.5">
                      {lang === "id" ? "Atur 1 Foto Utama dan maksimal 5 Foto Tambahan." : "Configure 1 Main Photo and up to 5 Additional Photos."}
                    </span>
                  </div>

                  {/* Horizontal Grid: Main photo and details side-by-side */}
                  <div className="flex flex-col sm:flex-row gap-5 items-start">
                    {/* Foto Utama Slot */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <span className="text-xs font-bold text-[#374151]">
                        {lang === "id" ? "Foto Utama" : "Main Photo"}
                      </span>
                      <div className="relative h-32 w-32 rounded-2xl overflow-hidden bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#FBBF24] transition-all flex items-center justify-center shadow-xs group">
                        {fImagePreview ? (
                          <>
                            <ProductImage imageUrl={fImagePreview} alt="Utama" className="h-full w-full object-cover" fallbackClassName="h-8 w-8 text-[#9CA3AF]" />
                            <div className="absolute top-1.5 left-1.5 bg-[#FBBF24] text-[#111827] text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs uppercase tracking-wider">
                              Utama
                            </div>
                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <label className="p-2 bg-white/90 hover:bg-white text-neutral-800 rounded-full cursor-pointer transition-all shadow-md">
                                <Upload className="h-4 w-4" />
                                <input
                                  type="file"
                                  accept="image/jpeg, image/png, image/webp"
                                  className="hidden"
                                  onChange={handleDrawerFileChange}
                                  disabled={fUploading}
                                  title="Pilih Foto Utama"
                                  placeholder="Pilih Berkas"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => void handleRemoveImage()}
                                className="p-2 bg-red-600/90 hover:bg-red-600 text-white rounded-full cursor-pointer transition-all shadow-md"
                                title="Hapus Foto Utama"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <label className="flex flex-col items-center justify-center cursor-pointer h-full w-full border-2 border-dashed border-[#D1D5DB] hover:border-[#FBBF24] rounded-2xl transition-all gap-1.5 text-neutral-500 hover:text-[#FBBF24]">
                            <Upload className="h-5 w-5 animate-pulse" />
                            <span className="text-[10px] font-bold text-center px-2">
                              {lang === "id" ? "Pilih Utama" : "Choose Main"}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg, image/png, image/webp"
                              className="hidden"
                              onChange={handleDrawerFileChange}
                              disabled={fUploading}
                              title="Pilih Foto Utama"
                              placeholder="Pilih Berkas"
                            />
                          </label>
                        )}
                      </div>
                      
                      {/* Main photo upload progress */}
                      {fUploading && (
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-[9px] font-bold text-[#111827]">
                            <span>{t.uploadingText}</span><span>{fUploadProgress}%</span>
                          </div>
                          <div className="w-full bg-[#E5E7EB] h-1 rounded-full overflow-hidden">
                            <div ref={progressBarRef} className="bg-[#FBBF24] h-full transition-all duration-200" />
                          </div>
                        </div>
                      )}
                      
                      {fFailedChunk !== undefined && fSelectedFile && !fUploading && (
                        <button
                          type="button"
                          onClick={() => void uploadFileDirectly(fSelectedFile, true)}
                          className="w-32 py-1 px-1.5 bg-emerald-600 text-[9px] font-bold text-white rounded-lg flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          <span>Resume {fFailedChunk}</span>
                        </button>
                      )}

                      {fImageError && <p className="text-[10px] font-semibold text-[#EF4444] max-w-[128px] leading-tight">{fImageError}</p>}
                    </div>

                    {/* Foto Tambahan Slots */}
                    <div className="flex flex-col gap-2 w-full">
                      <span className="text-xs font-bold text-[#374151]">
                        {lang === "id" ? "Foto Tambahan" : "Detail Photos"} ({fDetailImageUrls.length}/5)
                      </span>
                      
                      <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-3 gap-2.5 w-full">
                        {/* 1. Existing detail images */}
                        {fDetailImagePreviews.map((preview, index) => (
                          <div key={index} className="relative h-20 w-20 rounded-xl overflow-hidden bg-[#F9FAFB] border border-[#E5E7EB] hover:border-amber-400 transition-all flex items-center justify-center shadow-2xs group shrink-0">
                            <ProductImage imageUrl={preview} alt="Detail" className="h-full w-full object-cover" fallbackClassName="h-6 w-6 text-[#9CA3AF]" />
                            
                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1 select-none text-[8px] font-bold text-white">
                              <button
                                type="button"
                                onClick={() => makeMainPhoto(index)}
                                className="w-full py-0.5 px-1 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] rounded-md transition-all shadow-xs shrink-0 cursor-pointer"
                              >
                                {lang === "id" ? "Jadi Utama" : "Set Main"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemoveDetailImage(index)}
                                className="w-full py-0.5 px-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-all shadow-xs shrink-0 cursor-pointer flex items-center justify-center gap-0.5"
                              >
                                <Trash2 className="h-2 w-2" />
                                <span>{lang === "id" ? "Hapus" : "Delete"}</span>
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* 2. Ongoing upload tasks */}
                        {detailUploadTasks.map((task, index) => (
                          <div key={index} className="relative h-20 w-20 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex flex-col items-center justify-center p-1.5 shrink-0 text-center">
                            {task.error ? (
                              <div className="w-full flex flex-col items-center justify-center gap-1">
                                <span className="text-[7px] text-[#EF4444] leading-tight line-clamp-2 font-semibold">
                                  {task.error}
                                </span>
                                <div className="flex gap-1">
                                  {task.failedChunk !== undefined && (
                                    <button
                                      type="button"
                                      onClick={() => void uploadDetailFileDirectly(task.file, index, true)}
                                      className="p-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer"
                                      title="Resume upload"
                                    >
                                      <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDetailUploadTasks(prev => prev.filter((_, idx) => idx !== index))}
                                    className="p-1 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="w-full space-y-1">
                                <div className="flex justify-between text-[8px] font-bold text-[#111827] px-0.5">
                                  <span>{lang === "id" ? "Unggah..." : "Uploading..."}</span>
                                  <span>{task.progress}%</span>
                                </div>
                                <DetailUploadProgressBar progress={task.progress} />
                              </div>
                            )}
                          </div>
                        ))}

                        {/* 3. Dotted "Tambah Foto" placeholder */}
                        {fDetailImageUrls.length + detailUploadTasks.length < 5 && (
                          <label className="h-20 w-20 border-2 border-dashed border-[#D1D5DB] hover:border-[#FBBF24] rounded-xl flex flex-col items-center justify-center bg-white hover:bg-amber-50/20 text-[#6B7280] hover:text-[#FBBF24] cursor-pointer transition-all gap-1 select-none shrink-0">
                            <Plus className="h-4 w-4" />
                            <span className="text-[9px] font-bold text-center">
                              {lang === "id" ? "+ Foto" : "+ Photo"}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg, image/png, image/webp"
                              className="hidden"
                              onChange={handleDetailFileChange}
                              disabled={fDetailImageUrls.length + detailUploadTasks.length >= 5}
                              title="Pilih Foto Tambahan"
                              placeholder="Pilih Berkas"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-[#F3F4F6]" />

                {/* Form */}
                <form onSubmit={(e) => void handleDrawerSubmit(e)} className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#4B5563]">{t.labelProductName}</label>
                    <input type="text" required maxLength={200} placeholder={t.placeholderProductName}
                       className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                       value={fItemName} onChange={(e) => setFItemName(e.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#4B5563]">{t.labelCategory}</label>
                    <input type="text" required list="drawer-cats" placeholder={t.placeholderCategory}
                       className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                       value={fCategory} onChange={(e) => setFCategory(e.target.value)} />
                    <datalist id="drawer-cats">
                      {categories.map((c) => <option key={c} value={c} label={translateCategory(c, lang)} />)}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">{t.labelNormalPrice}</label>
                      <input type="number" required min={0} placeholder="75000"
                         className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                         value={fNormalPrice || ""} onChange={(e) => setFNormalPrice(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">{t.labelDiscountPercent}</label>
                      <input type="number" required min={0} max={100} placeholder="0"
                         className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                         value={fDiscountPercent} onChange={(e) => setFDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">{t.labelFinalPrice}</label>
                      <input type="text" readOnly
                         title={t.labelFinalPrice}
                         placeholder="Rp 0"
                         className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#9CA3AF] font-bold cursor-not-allowed"
                         value={fPrice ? formatIDR(fPrice) : "Rp 0"} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-center">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">{t.labelUnit}</label>
                      <input type="text" required placeholder={t.placeholderDrawerUnit}
                         className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                         value={fUnit} onChange={(e) => setFUnit(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563]">{t.labelInitialStock}</label>
                      <input type="number" required min={0} max={99999} placeholder={t.placeholderDrawerQty}
                         className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                         value={fQty || ""} onChange={(e) => setFQty(Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#4B5563] block">{t.labelAvailabilityStatus}</label>
                      <div className="pt-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" className="sr-only peer"
                             checked={fQty === 0 ? false : fAvailable}
                             disabled={fQty === 0}
                             onChange={(e) => setFAvailable(e.target.checked)} />
                          <div className="relative w-11 h-6 bg-[#E5E7EB] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-50" />
                          <span className="text-[10px] font-semibold text-[#374151] truncate max-w-[80px]">
                            {fQty === 0 ? t.statusOutOfStock : fAvailable ? t.statusActive : t.statusInactive}
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
                      {t.btnCancel}
                    </button>
                    <button type="submit" disabled={drawerSaving || fUploading}
                       className="flex-1 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50">
                      {drawerSaving ? <><Loader2 className="h-5 w-5 animate-spin" />{t.savingText}</> : fUploading ? <><Loader2 className="h-5 w-5 animate-spin" />{t.uploadingText}</> : t.btnSave}
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
