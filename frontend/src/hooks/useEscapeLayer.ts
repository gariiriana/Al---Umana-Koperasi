import { useEffect, useRef } from "react";

// Lapisan (panel / modal) yang sedang terbuka, urut dari bawah ke atas.
// Esc hanya menutup lapisan paling atas, jadi modal di atas panel tidak ikut
// menutup panel di belakangnya.
const openLayers: symbol[] = [];

/** Daftarkan panel/modal ke tumpukan Esc selama `open`. */
export function useEscapeLayer(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const id = Symbol("layer");
    openLayers.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openLayers[openLayers.length - 1] === id) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openLayers.splice(openLayers.indexOf(id), 1);
    };
  }, [open]);
}
