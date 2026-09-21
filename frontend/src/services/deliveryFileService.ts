import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export interface DeliveryFileData {
  src: string;
  description: string;
}

/** Reassemble a file stored by the delivery_files chunk protocol. */
export async function fetchDeliveryFile(fileId: string): Promise<DeliveryFileData | null> {
  const cleanId = fileId.replace("delivery_files/", "");
  if (!cleanId) return null;

  const parentSnap = await getDoc(doc(db, "delivery_files", cleanId));
  if (!parentSnap.exists()) return null;

  const meta = parentSnap.data();
  const totalChunks = Number(meta.totalChunks) || 0;
  const chunks = await Promise.all(
    Array.from({ length: totalChunks }, (_, index) =>
      getDoc(doc(db, "delivery_files", cleanId, "chunks", String(index))),
    ),
  );
  const src = chunks.map((chunk) => (chunk.exists() ? chunk.data().data || "" : "")).join("");
  return src ? { src, description: meta.description || "" } : null;
}

