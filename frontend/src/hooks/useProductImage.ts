import { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

// A global cache to avoid refetching the same image multiple times during a session
const imageCache: Record<string, string> = {};

export function useProductImage(imageUrlRef: string | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!imageUrlRef) {
      setSrc(null);
      setError(false);
      return;
    }

    let fileId = "";
    let isFirestoreChunk = false;

    // Check if it's a Firestore chunk reference or a backend chunk download URL
    if (
      imageUrlRef.startsWith("product_images/") ||
      imageUrlRef.includes("/api/files/product_images/")
    ) {
      isFirestoreChunk = true;
      const segments = imageUrlRef.trim().split("/");
      if (imageUrlRef.includes("/api/files/product_images/")) {
        const idx = segments.indexOf("product_images");
        if (idx !== -1 && idx + 1 < segments.length) {
          fileId = segments[idx + 1];
        }
      } else {
        fileId = segments[segments.length - 1];
      }
    }

    // If it's already a full HTTP/HTTPS URL and NOT a local backend chunk download URL,
    // or if it's a blob/data URL, use it directly.
    if (
      !isFirestoreChunk &&
      (imageUrlRef.startsWith("http://") ||
        imageUrlRef.startsWith("https://") ||
        imageUrlRef.startsWith("blob:") ||
        imageUrlRef.startsWith("data:"))
    ) {
      setSrc(imageUrlRef);
      setError(false);
      return;
    }

    if (isFirestoreChunk && !fileId) {
      setSrc(null);
      setError(true);
      return;
    }

    if (!isFirestoreChunk) {
      // Treat as standard fileId fallback
      const segments = imageUrlRef.trim().split("/");
      fileId = segments[segments.length - 1];
      if (!fileId) {
        setSrc(null);
        setError(true);
        return;
      }
    }

    // Check cache first
    if (imageCache[fileId]) {
      setSrc(imageCache[fileId]);
      setError(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    async function loadFromFirestore() {
      try {
        const chunksQuery = query(
          collection(db, "product_images", fileId, "chunks"),
          orderBy("index", "asc")
        );
        const chunksSnap = await getDocs(chunksQuery);
        if (chunksSnap.empty) {
          throw new Error("No chunks found");
        }

        let combined = "";
        chunksSnap.forEach((doc) => {
          combined += doc.data().data || "";
        });

        if (isMounted) {
          imageCache[fileId] = combined;
          setSrc(combined);
        }
      } catch (err) {
        console.error("Error loading image from Firestore chunks:", err);
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadFromFirestore();

    return () => {
      isMounted = false;
    };
  }, [imageUrlRef]);

  return { src, loading, error };
}
