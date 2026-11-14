// Angka → kata (Bahasa Indonesia) untuk baris "TERBILANG" di invoice, mis. 1.105.000 → "SATU JUTA SERATUS LIMA RIBU RUPIAH".
const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function words(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${words(n - 10)} belas`;
  if (n < 100) return `${words(Math.floor(n / 10))} puluh ${words(n % 10)}`;
  if (n < 200) return `seratus ${words(n - 100)}`;
  if (n < 1_000) return `${words(Math.floor(n / 100))} ratus ${words(n % 100)}`;
  if (n < 2_000) return `seribu ${words(n - 1_000)}`;
  if (n < 1_000_000) return `${words(Math.floor(n / 1_000))} ribu ${words(n % 1_000)}`;
  if (n < 1_000_000_000) return `${words(Math.floor(n / 1_000_000))} juta ${words(n % 1_000_000)}`;
  if (n < 1_000_000_000_000) return `${words(Math.floor(n / 1_000_000_000))} miliar ${words(n % 1_000_000_000)}`;
  return `${words(Math.floor(n / 1_000_000_000_000))} triliun ${words(n % 1_000_000_000_000)}`;
}

/** Whole rupiah in upper-case words, ending in "RUPIAH". */
export function terbilang(rupiah: number): string {
  const n = Math.max(0, Math.round(rupiah));
  const text = n === 0 ? "nol" : words(n);
  return `${text.replace(/\s+/g, " ").trim()} rupiah`.toUpperCase();
}
