import { useRef, useState } from "react";
import { Camera, RotateCcw, Upload as UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  uploadFileInChunks,
  ChunkUploadError,
  type UploadProgress,
} from "@/services/chunkUploadService";
import { confirmDelivery } from "@/services/orderService";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/delivery/SignaturePad";

export interface ProofCaptureProps {
  orderId: string;
  customerName: string;
  onComplete?: () => void;
}

interface ProgressState {
  fraction: number;
  label: string;
}

const ACCEPT_PHOTO = "image/jpeg,image/png";

export function ProofCapture({
  orderId,
  customerName,
  onComplete,
}: ProofCaptureProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFile = (file: File) => {
    if (!ACCEPT_PHOTO.split(",").includes(file.type)) {
      setError("Photo must be JPEG or PNG.");
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);
  };

  const upload = async (file: File, label: string): Promise<string> => {
    const result = await uploadFileInChunks(file, {
      orderId,
      onProgress: (p: UploadProgress) =>
        setProgress({ fraction: p.fraction, label }),
    });
    return result.fileId;
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(false);

    if (!photo) {
      setError("Photo proof is required.");
      return;
    }
    const sigFile = padRef.current?.toFile();
    if (!sigFile || !padRef.current?.hasStrokes()) {
      setError("Signature is required (at least one stroke).");
      return;
    }

    setSubmitting(true);
    try {
      const photoId = await upload(photo, "Uploading photo…");
      const sigId = await upload(sigFile, "Uploading signature…");
      setProgress({ fraction: 1, label: "Confirming delivery…" });
      await confirmDelivery(orderId, [photoId, sigId]);
      setSuccess(true);
      setProgress(null);
      onComplete?.();
    } catch (err) {
      if (err instanceof ChunkUploadError) {
        setError(`Upload failed (${err.code}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setProgress(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827] mb-1">
        Proof of delivery
      </h3>
      <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mb-4">
        Capture both a photo and the PIC's signature for{" "}
        <span className="font-semibold text-[#111827]">{customerName}</span>.
      </p>

      <div className="space-y-4">
        {/* Photo capture */}
        <div>
          <label className="block mb-1.5 text-xs font-medium text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]">
            Photo proof (JPEG or PNG)
          </label>
          <div className="flex items-start gap-3">
            <label
              className="cursor-pointer inline-flex items-center justify-center rounded-full bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] px-5 py-2 text-sm font-semibold font-['Hanken_Grotesk',system-ui,sans-serif] gap-2 transition-colors"
            >
              <Camera className="h-4 w-4" />
              {photo ? "Replace photo" : "Capture photo"}
              <input
                type="file"
                accept={ACCEPT_PHOTO}
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            {photoPreview && (
              <img
                src={photoPreview}
                alt="Photo preview"
                className="h-20 w-20 object-cover rounded-lg border border-[#E5E7EB]"
              />
            )}
          </div>
        </div>

        {/* Signature pad */}
        <div>
          <label className="block mb-1.5 text-xs font-medium text-[#374151] font-['Hanken_Grotesk',system-ui,sans-serif]">
            PIC signature
          </label>
          <SignaturePad ref={padRef} />
        </div>

        {/* Progress */}
        {progress && (
          <div className="rounded-lg bg-[#F3F4F6] p-3">
            <p className="text-xs text-[#6B7280] mb-1 font-['Hanken_Grotesk',system-ui,sans-serif]">
              {progress.label}
            </p>
            <div className="h-2 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
              <div
                className="h-full bg-[#FBBF24] transition-[width] duration-200"
                style={{ width: `${Math.round(progress.fraction * 100)}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-4 py-3 text-sm text-[#991B1B] flex items-center justify-between gap-3 font-['Hanken_Grotesk',system-ui,sans-serif]">
            <span>{error}</span>
            <Button
              type="button"
              variant="outlined"
              size="sm"
              onClick={handleSubmit}
              leftIcon={<RotateCcw className="h-3 w-3" />}
            >
              Retry
            </Button>
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-[#D1FAE5] border border-[#A7F3D0] px-4 py-3 text-sm text-[#065F46] font-['Hanken_Grotesk',system-ui,sans-serif]">
            Delivery confirmed. Order marked as DELIVERED.
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            loading={submitting}
            onClick={handleSubmit}
            leftIcon={<UploadIcon className="h-4 w-4" />}
          >
            Submit proof
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default ProofCapture;
