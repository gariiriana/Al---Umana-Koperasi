import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, ImageOff, Upload, AlertCircle, RefreshCw } from "lucide-react";

import { db } from "@/lib/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { getItem, createItem, updateItem, listCategories } from "@/services/stockAdminService";
import { uploadFileInChunks, ChunkUploadError } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import type { InventoryItemInput } from "@/types/inventory";

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

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields (Requirement 10.1)
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState("pcs");
  const [price, setPrice] = useState<number>(0);
  const [available, setAvailable] = useState(true);
  const [category, setCategory] = useState("");
  const [imageURL, setImageURL] = useState("");

  // Categories autocomplete options (Requirement 13.1)
  const [categoriesList, setCategoriesList] = useState<string[]>([]);

  // Image upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);

  // Resume chunked upload states
  const [failedFileId, setFailedFileId] = useState<string | undefined>(undefined);
  const [failedChunkIndex, setFailedChunkIndex] = useState<number | undefined>(undefined);

  // Ref for imperatively setting progress bar width (avoids JSX inline style lint warning)
  const progressBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${uploadProgress}%`;
    }
  }, [uploadProgress]);

  const loadData = useCallback(async () => {
    try {
      const cats = await listCategories();
      setCategoriesList(cats);

      if (isEdit && id) {
        const item = await getItem(id);
        setItemName(item.itemName);
        setQuantity(item.quantity);
        setUnit(item.unit);
        setPrice(item.price);
        setAvailable(item.available);
        setCategory(item.category);
        setImageURL(item.imageUrl || "");

        if (item.imageUrl) {
          const remoteUrl = resolveProductImageURL(item.imageUrl);
          setImagePreview(remoteUrl);
        }
      }
    } catch {
      setError("Gagal memuat data produk atau daftar kategori.");
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clean up object URL preview on unmount
  useEffect(() => {
    return () => {
      if (imagePreview && !imagePreview.startsWith("http")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    setFailedFileId(undefined);
    setFailedChunkIndex(undefined);

    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate MIME & size before any write (Requirement 11.2 & 11.3)
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setImageError("Format file tidak didukung. Pilih JPEG, PNG, atau WEBP.");
      } else {
        setImageError("Ukuran file melebihi batas 15 MB.");
      }
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    // Create 300x300 preview (Requirement 11.10)
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  // Delete product image chunks safely from Firestore (Requirement 11.11 / 11.9)
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

  const handleUploadImage = async (isRetry = false) => {
    if (!selectedFile) return;

    setUploadingImage(true);
    setImageError(null);

    try {
      // If we are replacing an existing image, cascade-delete previous proof first (Requirement 11.9)
      if (!isRetry && imageURL) {
        await deleteProductImageFromFirestore(imageURL);
      }

      let uploadResult;
      if (isRetry && failedFileId && failedChunkIndex !== undefined) {
        // Resume from failed chunk
        uploadResult = await uploadFileInChunks(selectedFile, {
          collection: "product_images",
          resumeFileId: failedFileId,
          resumeFromChunk: failedChunkIndex,
          onProgress: (p) => setUploadProgress(p.percent),
        });
      } else {
        // Normal chunk upload
        uploadResult = await uploadFileInChunks(selectedFile, {
          collection: "product_images",
          onProgress: (p) => setUploadProgress(p.percent),
        });
      }

      const newImageUrl = `product_images/${uploadResult.fileId}`;
      setImageURL(newImageUrl);
      setSelectedFile(null);
      setFailedFileId(undefined);
      setFailedChunkIndex(undefined);
      alert("Gambar berhasil diunggah! Jangan lupa menyimpan form produk.");
    } catch (err: unknown) {
      console.error("Gagal mengunggah gambar produk:", err);
      if (err instanceof ChunkUploadError && err.code === "WRITE_FAILED") {
        setFailedFileId(err.fileId);
        setFailedChunkIndex(err.failedChunkIndex);
        setImageError(`Unggahan terputus di chunk ${err.failedChunkIndex || 0}. Silakan klik 'Lanjutkan'.`);
      } else {
        const errorObj = err as { message?: string };
        setImageError(errorObj.message || "Gagal mengunggah gambar.");
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (confirm("Hapus gambar produk ini?")) {
      setUploadingImage(true);
      try {
        if (imageURL) {
          // Permanently clean from Firestore (Requirement 11.11)
          await deleteProductImageFromFirestore(imageURL);
        }
        setImageURL("");
        setSelectedFile(null);
        setImagePreview(null);
      } catch {
        alert("Gagal menghapus gambar.");
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend validations matching Requirement 10.1 & 13.3
    const trimmedName = itemName.trim();
    const trimmedCategory = category.trim();
    const trimmedUnit = unit.trim();

    if (!trimmedName || trimmedName.length > 200) {
      setError("Nama produk harus di antara 1 dan 200 karakter.");
      return;
    }

    if (!trimmedCategory || trimmedCategory.length > 50) {
      setError("Kategori produk harus di antara 1 dan 50 karakter.");
      return;
    }

    if (!trimmedUnit || trimmedUnit.length > 50) {
      setError("Satuan produk harus di antara 1 and 50 karakter.");
      return;
    }

    if (quantity < 0 || quantity > 99999) {
      setError("Jumlah kuantitas harus di antara 0 dan 99.999");
      return;
    }

    if (price < 0) {
      setError("Harga produk tidak boleh kurang dari 0.");
      return;
    }

    setSaving(true);

    const payload: InventoryItemInput = {
      itemName: trimmedName,
      quantity,
      unit: trimmedUnit,
      price,
      // Rule 12.2: quantity 0 forces available false
      available: quantity === 0 ? false : available,
      category: trimmedCategory,
      imageUrl: imageURL || undefined,
    };

    try {
      if (isEdit && id) {
        await updateItem(id, payload);
      } else {
        await createItem(payload);
      }
      alert("Produk berhasil disimpan");
      navigate("/admin/products");
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj.message || "Gagal menyimpan data produk.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk',system-ui,sans-serif]">Memuat data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header Back Button */}
      <div className="flex items-center gap-3">
        <Link
          to="/admin/products"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-neutral-100 text-[#111827]"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#111827]">
          {isEdit ? "Ubah Produk Koperasi" : "Tambah Produk Koperasi"}
        </h1>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E5E7EB] space-y-6">
        {/* Photo Uploader Component */}
        <div className="space-y-3">
          <label className="text-sm font-bold text-[#111827] font-['Manrope',system-ui,sans-serif]">
            Foto Produk
          </label>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Image Preview Window (Requirement 11.10 - 300x300 px max) */}
            <div className="h-44 w-44 rounded-3xl overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF] shrink-0 max-w-[300px] max-h-[300px]">
              {imagePreview ? (
                <img src={imagePreview} alt="Pratinjau produk" className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-10 w-10" />
              )}
            </div>

            <div className="flex-1 space-y-3 w-full">
              <div className="flex gap-2">
                <label className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#E5E7EB] bg-white text-xs font-bold text-[#374151] rounded-xl cursor-pointer hover:bg-[#F9FAFB]">
                  <Upload className="h-4 w-4" />
                  Pilih Berkas
                  <input
                    type="file"
                    accept="image/jpeg, image/png, image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploadingImage}
                  />
                </label>

                {imageURL && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={uploadingImage}
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#FCA5A5] bg-red-50 text-xs font-bold text-[#DC2626] rounded-xl cursor-pointer hover:bg-red-100"
                  >
                    Hapus Foto
                  </button>
                )}
              </div>

              {selectedFile && (
                <div className="space-y-2">
                  {uploadingImage ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-[#111827]">
                        <span>Mengunggah...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-[#E5E7EB] h-1.5 rounded-full overflow-hidden">
                        <div ref={progressBarRef} className="bg-[#FBBF24] h-full transition-all duration-200" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {failedChunkIndex !== undefined ? (
                        <button
                          type="button"
                          onClick={() => handleUploadImage(true)}
                          className="px-3 py-1.5 bg-emerald-600 text-xs font-bold text-white rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Lanjutkan (Chunk {failedChunkIndex})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUploadImage(false)}
                          className="px-3 py-1.5 bg-[#FBBF24] text-xs font-bold text-[#111827] rounded-xl cursor-pointer"
                        >
                          Unggah Gambar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {imageError && (
                <p className="text-xs font-semibold text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]">
                  {imageError}
                </p>
              )}
            </div>
          </div>
        </div>

        <hr className="border-[#F3F4F6]" />

        {/* Core Metadata Form fields */}
        <form onSubmit={handleSubmit} className="space-y-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
          {/* Item Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#4B5563]">Nama Barang</label>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="Contoh: Beras Sentra Ramos 5kg"
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />
          </div>

          {/* Category Dropdown Autocomplete + Free text input (Requirement 13.1, 13.2, 13.3) */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#4B5563]">Kategori</label>
            <input
              type="text"
              required
              list="categories-datalist"
              placeholder="Pilih atau ketik kategori baru"
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="categories-datalist">
              {categoriesList.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {/* Price & Unit fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#4B5563]">Harga (Rupiah)</label>
              <input
                type="number"
                required
                min={0}
                placeholder="Contoh: 75000"
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#4B5563]">Satuan Unit</label>
              <input
                type="text"
                required
                placeholder="Contoh: pcs, kg, karung"
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          {/* Stock Quantity Stepper / Direct Input */}
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#4B5563]">Jumlah Stok Awal</label>
              <input
                type="number"
                required
                min={0}
                max={99999}
                placeholder="Contoh: 100"
                className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>

            {/* Availability Boolean Toggle */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#4B5563] block">Status Ketersediaan</label>
              <div className="pt-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={quantity === 0 ? false : available}
                    disabled={quantity === 0}
                    onChange={(e) => setAvailable(e.target.checked)}
                  />
                  <div className="relative w-11 h-6 bg-[#E5E7EB] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-50"></div>
                  <span className="text-sm font-semibold text-[#374151]">
                    {quantity === 0 ? "Nonaktif (Stok Kosong)" : available ? "Aktif (Tersedia)" : "Nonaktif (Habis)"}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[#EF4444] bg-red-50 border border-red-200 p-4 rounded-2xl flex gap-1.5 items-start">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <Link
              to="/admin/products"
              className="flex-1 min-h-12 border border-[#E5E7EB] hover:bg-[#F9FAFB] text-sm font-bold text-[#374151] rounded-2xl flex items-center justify-center"
            >
              Batal
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-12 bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                "Simpan Produk"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProductFormPage;
