import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Selaraskan batch terpilih dengan `?batchId=` tanpa saling menimpa.
 *
 * Router berjalan dengan `v7_startTransition`, jadi URL baru terlihat satu render
 * SETELAH state. Versi lama punya dua efek (URL→state dan state→URL) yang di render
 * itu saling mengembalikan nilai lama — pilihan bolak-balik antara batch lama & baru
 * dan halaman Admin MBG "geter" saat ganti tanggal / buat batch.
 *
 * `synced` mencatat nilai yang sudah selaras; URL hanya memilih batch bila URL itu
 * benar-benar baru (mis. dibuka dari Arsip), bukan karena masih tertinggal.
 */
export function useBatchIdUrlSync(
  selectedBatchId: string | null,
  setSelectedBatchId: (id: string) => void,
): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlBatchId = searchParams.get("batchId");
  const synced = useRef(urlBatchId);

  useEffect(() => {
    if (!urlBatchId || urlBatchId === synced.current) return;
    synced.current = urlBatchId;
    setSelectedBatchId(urlBatchId);
  }, [urlBatchId, setSelectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId || selectedBatchId === synced.current) return;
    synced.current = selectedBatchId;
    setSearchParams({ batchId: selectedBatchId }, { replace: true });
  }, [selectedBatchId, setSearchParams]);

  return urlBatchId;
}
