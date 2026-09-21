import { useEffect, useState } from "react";

import { fetchDeliveryFile } from "@/services/deliveryFileService";
import type { KitchenSignature } from "@/types/order";

const readLegacyPhotos = (signatureDataUrl?: string): string[] => {
  const value = signatureDataUrl || "";
  if (!value) return [];
  try {
    return value.startsWith("[") && value.endsWith("]") ? JSON.parse(value) : [value];
  } catch {
    return [value];
  }
};

export function KitchenHandoverPhotos({ signature }: { signature: KitchenSignature }) {
  const [photos, setPhotos] = useState<string[]>(() => readLegacyPhotos(signature.signatureDataUrl));

  useEffect(() => {
    let active = true;
    if (!signature.photoFileIds?.length) {
      setPhotos(readLegacyPhotos(signature.signatureDataUrl));
      return () => {
        active = false;
      };
    }

    Promise.all(signature.photoFileIds.map(fetchDeliveryFile))
      .then((files) => {
        if (active) setPhotos(files.flatMap((file) => (file ? [file.src] : [])));
      })
      .catch((error) => console.error("Gagal memuat foto serah terima dapur:", error));

    return () => {
      active = false;
    };
  }, [signature.photoFileIds, signature.signatureDataUrl]);

  return (
    <div className="flex flex-wrap gap-2 justify-center w-full">
      {photos.map((url, index) => (
        <div
          key={`${signature.kitchenName}-${index}`}
          className="aspect-video w-full flex items-center justify-center bg-neutral-50/30 rounded-lg border border-[#E5E7EB] p-2 max-h-24 overflow-hidden"
        >
          <img
            src={url}
            alt={`Serah terima ${signature.kitchenName} #${index + 1}`}
            className="max-h-full object-contain"
          />
        </div>
      ))}
    </div>
  );
}

