/**
 * Langganan beberapa data milik satu batch (entries, tugas kurir, dokumen…) yang
 * diterapkan BERSAMAAN saat ganti batch.
 *
 * Tanpa ini setiap sumber mengisi state sendiri-sendiri: tabel tergambar ulang
 * berkali-kali dengan campuran data batch lama & baru, dan halaman terlihat
 * kedip / "geter". Nilai pertama tiap sumber ditahan sampai semuanya masuk
 * (atau `fallbackMs` lewat), lalu diterapkan dalam satu render; setelah itu
 * pembaruan realtime langsung diteruskan.
 */

export interface BatchSource<V> {
  subscribe(onData: (value: V) => void, onError: (error: Error) => void): () => void;
  apply(value: V): void;
  /** Dipakai bila sumber gagal / belum mengirim data saat fallback. */
  empty: V;
  label?: string;
}

/** Bantu inferensi tipe per sumber. */
export function batchSource<V>(source: BatchSource<V>): BatchSource<unknown> {
  return source as BatchSource<unknown>;
}

export function subscribeBatchData(
  sources: BatchSource<unknown>[],
  onLive: () => void,
  fallbackMs = 4000,
): () => void {
  const first = new Map<number, unknown>();
  let live = false;
  // Sumber yang lambat tidak boleh menahan tampilan terlalu lama.
  const timer = setTimeout(() => goLive(), fallbackMs);

  const goLive = () => {
    if (live) return;
    live = true;
    clearTimeout(timer);
    sources.forEach((s, i) => s.apply(first.has(i) ? first.get(i) : s.empty));
    onLive();
  };
  const settle = (i: number, value: unknown) => {
    first.set(i, value);
    if (first.size === sources.length) goLive();
  };

  const unsubscribers = sources.map((s, i) => s.subscribe(
    (value) => {
      if (live) s.apply(value);
      else settle(i, value);
    },
    (error) => {
      console.error(`Gagal memuat ${s.label ?? "data batch"}:`, error);
      if (!live && !first.has(i)) settle(i, s.empty);
    },
  ));

  return () => {
    clearTimeout(timer);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
