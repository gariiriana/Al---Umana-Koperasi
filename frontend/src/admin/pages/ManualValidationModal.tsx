import React, { useState } from "react";
import { X, Upload, AlertCircle } from "lucide-react";
import { uploadFileInChunks } from "@/services/chunkUploadService";
import { validateImageUpload } from "@/lib/validators";
import { Button } from "@/components/ui/Button";

interface ManualValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { contactPhone: string; screenshotFileIds: string[]; notes: string }) => Promise<void>;
  orderId: string;
}

export function ManualValidationModal({ isOpen, onClose, onConfirm, orderId }: ManualValidationModalProps) {
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateImageUpload(file.type, file.size);
    if (!validation.accepted) {
      if (validation.reason === "mime") {
        setError("Format file tidak didukung. Pilih JPEG, PNG, atau WEBP.");
      } else {
        setError("Ukuran file melebihi batas 15 MB.");
      }
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactPhone.trim()) {
      setError("Nomor telepon yang dihubungi wajib diisi.");
      return;
    }
    if (!notes.trim()) {
      setError("Catatan bukti komunikasi wajib diisi.");
      return;
    }
    if (!photoFile) {
      setError("Screenshot bukti chat wajib diunggah.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setUploading(true);

    try {
      // Upload screenshot first
      const uploadResult = await uploadFileInChunks(photoFile, {
        orderId: orderId,
        onProgress: (p) => setUploadProgress(Math.round(p.fraction * 100)),
      });

      // Confirm manual validation
      await onConfirm({
        contactPhone: contactPhone.trim(),
        screenshotFileIds: [uploadResult.fileId],
        notes: notes.trim(),
      });

      // Reset & close
      setContactPhone("");
      setNotes("");
      setPhotoFile(null);
      setPhotoPreview(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan validasi manual");
    } finally {
      setUploading(false);
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#E5E7EB] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F3F4F6]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            Validasi Manual Admin
          </h3>
          <button title="Tutup" aria-label="Tutup"
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#4B5563] p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[#374151]">
              Nomor Telepon Hubungan WA/Telepon
            </label>
            <input
              type="text"
              placeholder="e.g. 08123456789"
              className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[#374151]">
              Catatan Validasi
            </label>
            <textarea
              placeholder="e.g. Pembeli mengkonfirmasi pesanan via chat WhatsApp karena tidak bisa mengakses tautan"
              rows={3}
              className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Screenshot Uploader */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[#374151]">
              Screenshot Bukti Komunikasi
            </label>
            <div className="flex flex-col items-center justify-center border border-dashed border-[#D1D5DB] rounded-lg p-5 bg-[#F9FAFB] hover:bg-neutral-50 transition relative cursor-pointer min-h-[100px] text-center">
              <input title="Pilih Berkas Screenshot" placeholder="Screenshot" aria-label="Pilih Berkas Screenshot"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={submitting}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="h-6 w-6 text-[#9CA3AF] mb-1.5" />
              <span className="text-xs font-bold text-[#4B5563]">
                {photoFile ? "Ganti Screenshot" : "Pilih Berkas Screenshot"}
              </span>
              <span className="text-[10px] text-[#9CA3AF] mt-0.5">JPEG, PNG, atau WebP (Maks 15MB)</span>
            </div>

            {photoPreview && (
              <div className="mt-2 flex items-center justify-center relative">
                <img
                  src={photoPreview}
                  alt="Screenshot preview"
                  className="h-28 w-auto object-contain rounded-lg border border-[#E5E7EB]"
                />
              </div>
            )}
          </div>

          {/* Upload progress */}
          {uploading && uploadProgress > 0 && (
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-[10px] text-[#6B7280]">
                <span>Mengunggah bukti chat...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-150"
                  ref={(el) => { if (el) el.style.width = `${uploadProgress}%`; }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-[#F3F4F6]">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              className="flex-1 bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-xl"
            >
              {submitting ? "Memproses..." : "Konfirmasi Validasi"}
            </Button>
            <Button
              type="button"
              variant="outlined"
              onClick={onClose}
              disabled={submitting}
              className="px-4 border border-[#D1D5DB] rounded-xl hover:bg-neutral-50"
            >
              Batal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ManualValidationModal;
