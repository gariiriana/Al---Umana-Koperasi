/**
 * Laporan 2 Minggu: fungsi murni yang menyusun isi laporan (format "Lampiran 2 minggu format baru")
 * dari data admin MBG (batch + entri), menu Produksi MBG (Arsip Gizi), dan foto dokumentasi.
 * Dipakai halaman MbgLaporan2MingguPage serta exporter Word dan PDF.
 */
import {
  KECAMATAN,
  LAPORAN_SCHOOLS,
  POSYANDU_ADDRESSES,
  TIM_PELAKSANA,
  type TimMember,
} from '@/constants/mbgLaporanMaster';

// ---------------------------------------------------------------------------
// Tanggal
// ---------------------------------------------------------------------------

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const pad2 = (n: number) => String(n).padStart(2, '0');
export const addDays = (date: string, days: number) => {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Senin dari minggu tanggal itu (Minggu ikut minggu sebelumnya). */
export function mondayOf(date: string): string {
  const day = toUtc(date).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/** Senin–Jumat minggu pertama dan kedua (10 hari kerja). */
export function reportDates(monday: string): string[] {
  return [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((n) => addDays(monday, n));
}

/** "09 November 2026" */
export function formatTanggal(date: string): string {
  const d = toUtc(date);
  return `${pad2(d.getUTCDate())} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Senin, 09 November 2026" */
export function formatHariTanggal(date: string): string {
  return `${HARI[toUtc(date).getUTCDay()]}, ${formatTanggal(date)}`;
}

/** "Sen" */
export function hariPendek(date: string): string {
  return HARI[toUtc(date).getUTCDay()].slice(0, 3);
}

/** "09 Nov" */
export function tanggalPendek(date: string): string {
  const d = toUtc(date);
  return `${pad2(d.getUTCDate())} ${BULAN[d.getUTCMonth()].slice(0, 3)}`;
}

/** Awal dan akhir periode; tahun ditulis dua kali bila periodenya melewati tahun baru. */
function periodParts(dates: string[]): [string, string] {
  const first = toUtc(dates[0]);
  const last = toUtc(dates[dates.length - 1]);
  const start = first.getUTCFullYear() === last.getUTCFullYear()
    ? `${pad2(first.getUTCDate())} ${BULAN[first.getUTCMonth()]}`
    : formatTanggal(dates[0]);
  return [start, formatTanggal(dates[dates.length - 1])];
}

/** "09 November s/d 20 November 2026" (baris Periode di judul). */
export function periodHeader(dates: string[]): string {
  if (dates.length === 0) return '';
  const [a, b] = periodParts(dates);
  return `${a} s/d ${b}`;
}

/** "09 November - 20 November 2026" (dalam kalimat Sasaran dan Pelaksanaan). */
export function periodRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const [a, b] = periodParts(dates);
  return `${a} - ${b}`;
}

// ---------------------------------------------------------------------------
// Data sumber
// ---------------------------------------------------------------------------

/** Field entri admin MBG yang dipakai laporan (dibaca tanpa foto). */
export interface LaporanEntry {
  institutionName: string;
  institutionType?: string;
  qtSiswaBalita?: number;
  qtBumil?: number;
  qtBusui?: number;
  qtBumilBusui?: number;
  qtGuruKader?: number;
  qtGuruL?: number;
  qtGuruP?: number;
  qtTendikL?: number;
  qtTendikP?: number;
  qtPorsiKecilL?: number;
  qtPorsiKecilP?: number;
  qtPorsiBesarL?: number;
  qtPorsiBesarP?: number;
  jumlah?: number;
  isSekolahLibur?: boolean;
  sortOrder?: number;
}

/** Nama hidangan per jenis porsi dari laporan harian Produksi MBG (Arsip Gizi). */
export interface PortionMenus {
  kecil?: string[];
  besar?: string[];
  balita?: string[];
  bumilBusui?: string[];
}

export interface LaporanDayData {
  tanggal: string;
  /** null = admin MBG belum membuat data PM untuk tanggal itu. */
  batchId: string | null;
  entries: LaporanEntry[];
  /** null = Produksi MBG belum menyimpan laporan harian (menu) untuk batch itu. */
  menus: PortionMenus | null;
}

/** Batch yang dipakai untuk satu tanggal: bukan backup, dan yang totalnya paling besar. */
export function pickBatch<T extends { isBackup?: boolean; totalJumlah?: number }>(batches: T[]): T | null {
  const live = batches.filter((b) => !b.isBackup);
  if (live.length === 0) return null;
  return live.reduce((best, b) => ((b.totalJumlah || 0) > (best.totalJumlah || 0) ? b : best));
}

// ---------------------------------------------------------------------------
// Pencocokan nama
// ---------------------------------------------------------------------------

const nameKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '');
const SCHOOL_INDEX = new Map<string, number>();
LAPORAN_SCHOOLS.forEach((s, i) => s.aliases.concat(s.name).forEach((a) => SCHOOL_INDEX.set(nameKey(a), i)));

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isOrganoleptik = (e: LaporanEntry) => /organoleptik/i.test(e.institutionName || '');
const isPosyandu = (e: LaporanEntry) => e.institutionType === 'posyandu';
const schoolIndex = (e: LaporanEntry) => SCHOOL_INDEX.get(nameKey(e.institutionName || ''));

export function cempakaNumber(name: string): number | null {
  const m = /^(?:posyandu\s+)?cempaka\s+(\d+)$/i.exec((name || '').trim());
  return m ? Number(m[1]) : null;
}

const bumil = (e: LaporanEntry) => (e.qtBumil != null || e.qtBusui != null ? n(e.qtBumil) : 0);
const busui = (e: LaporanEntry) => (e.qtBumil != null || e.qtBusui != null ? n(e.qtBusui) : n(e.qtBumilBusui));

function schoolsAndPosyandu(entries: LaporanEntry[]) {
  const named = entries.filter((e) => (e.institutionName || '').trim() && !isOrganoleptik(e));
  const schools = named.filter((e) => !isPosyandu(e));
  const rank = (e: LaporanEntry) => schoolIndex(e) ?? LAPORAN_SCHOOLS.length;
  schools.sort((a, b) => rank(a) - rank(b) || n(a.sortOrder) - n(b.sortOrder));
  const posyandu = named.filter(isPosyandu);
  posyandu.sort(
    (a, b) => (cempakaNumber(a.institutionName) ?? 999) - (cempakaNumber(b.institutionName) ?? 999) || n(a.sortOrder) - n(b.sortOrder),
  );
  return { schools, posyandu };
}

const schoolName = (e: LaporanEntry) => {
  const i = schoolIndex(e);
  return i == null ? e.institutionName.trim() : LAPORAN_SCHOOLS[i].name;
};
const posyanduName = (e: LaporanEntry) => {
  const c = cempakaNumber(e.institutionName);
  return c != null ? `Posyandu Cempaka ${c}` : e.institutionName.trim();
};

// ---------------------------------------------------------------------------
// 1). Penerima Manfaat (hari pertama periode)
// ---------------------------------------------------------------------------

export interface PesertaDidikRow {
  no: number;
  nama: string;
  alamat: string;
  /** Jumlah siswa dari admin MBG; null = sekolah tidak ada di data hari itu. */
  jumlah: number | null;
  kelas: { kelas: string; l: number | null; p: number | null }[];
}

export interface PtkRow {
  no: number;
  nama: string;
  kecamatan: string;
  alamat: string;
  jumlah: number | null;
  l: number | null;
  p: number | null;
}

export interface PosyanduRow {
  no: number;
  nama: string;
  alamat: string;
  bumil: number | null;
  busui: number | null;
  l: number | null;
  p: number | null;
  total: number | null;
}

export interface PenerimaManfaat {
  /** Tanggal batch yang dipakai (hari pertama periode yang ada datanya). */
  tanggal: string;
  pesertaDidik: PesertaDidikRow[];
  ptk: PtkRow[];
  posyandu: PosyanduRow[];
}

/** L/P guru+tendik; null bila admin MBG belum mengisi rinciannya sama sekali. */
function ptkLp(e: LaporanEntry): [number | null, number | null] {
  const fields = [e.qtGuruL, e.qtGuruP, e.qtTendikL, e.qtTendikP];
  if (fields.every((f) => f == null)) return [null, null];
  return [n(e.qtGuruL) + n(e.qtTendikL), n(e.qtGuruP) + n(e.qtTendikP)];
}

export function buildPenerimaManfaat(day: LaporanDayData): PenerimaManfaat {
  const { schools, posyandu } = schoolsAndPosyandu(day.entries);
  const byIndex = new Map<number, LaporanEntry>();
  const extraSchools: LaporanEntry[] = [];
  for (const e of schools) {
    const i = schoolIndex(e);
    if (i == null) extraSchools.push(e);
    else if (!byIndex.has(i)) byIndex.set(i, e);
  }

  const pesertaDidik: PesertaDidikRow[] = LAPORAN_SCHOOLS.map((s, i) => {
    const e = byIndex.get(i);
    return {
      no: i + 1,
      nama: s.name,
      alamat: s.address,
      jumlah: e ? n(e.qtSiswaBalita) : null,
      kelas: s.kelas.map(([kelas, l, p]) => ({ kelas, l, p })),
    };
  });
  const ptk: PtkRow[] = LAPORAN_SCHOOLS.map((s, i) => {
    const e = byIndex.get(i);
    const [l, p] = e ? ptkLp(e) : [null, null];
    return { no: i + 1, nama: s.name, kecamatan: KECAMATAN, alamat: s.ptkAddress, jumlah: e ? n(e.qtGuruKader) : null, l, p };
  });
  // Sekolah baru yang belum ada di Word: L/P per kelas tidak diketahui, pakai L/P porsi dari aplikasi.
  for (const e of extraSchools) {
    pesertaDidik.push({
      no: pesertaDidik.length + 1,
      nama: e.institutionName.trim(),
      alamat: '',
      jumlah: n(e.qtSiswaBalita),
      kelas: [{ kelas: '-', l: n(e.qtPorsiKecilL) + n(e.qtPorsiBesarL), p: n(e.qtPorsiKecilP) + n(e.qtPorsiBesarP) }],
    });
    const [l, p] = ptkLp(e);
    ptk.push({ no: ptk.length + 1, nama: e.institutionName.trim(), kecamatan: KECAMATAN, alamat: '', jumlah: n(e.qtGuruKader), l, p });
  }

  const posyanduByNo = new Map<number, LaporanEntry>();
  const extraPosyandu: LaporanEntry[] = [];
  for (const e of posyandu) {
    const c = cempakaNumber(e.institutionName);
    if (c != null && c >= 1 && c <= POSYANDU_ADDRESSES.length && !posyanduByNo.has(c)) posyanduByNo.set(c, e);
    else extraPosyandu.push(e);
  }
  const posRow = (no: number, nama: string, alamat: string, e: LaporanEntry | undefined): PosyanduRow => {
    if (!e) return { no, nama, alamat, bumil: null, busui: null, l: null, p: null, total: null };
    const hasLp = e.qtPorsiKecilL != null || e.qtPorsiKecilP != null;
    return {
      no,
      nama,
      alamat,
      bumil: bumil(e),
      busui: busui(e),
      l: hasLp ? n(e.qtPorsiKecilL) : null,
      p: hasLp ? n(e.qtPorsiKecilP) : null,
      total: n(e.qtSiswaBalita) + bumil(e) + busui(e),
    };
  };
  const posyanduRows = POSYANDU_ADDRESSES.map((alamat, i) => posRow(i + 1, `Posyandu Cempaka ${i + 1}`, alamat, posyanduByNo.get(i + 1)));
  for (const e of extraPosyandu) posyanduRows.push(posRow(posyanduRows.length + 1, posyanduName(e), '', e));

  return { tanggal: day.tanggal, pesertaDidik, ptk, posyandu: posyanduRows };
}

// ---------------------------------------------------------------------------
// 2). Jenis Menu MBG (per hari)
// ---------------------------------------------------------------------------

export interface MenuBlock {
  /** Kelompok penerima, mis. "Balita, TK, SD Kelas 1-3". */
  label: string;
  items: string[];
}

export interface MenuDay {
  tanggal: string;
  hariTanggal: string;
  /** Kosong = Produksi MBG belum mengisi menu hari itu (ditandai di laporan). */
  menu: MenuBlock[];
  sekolah: { nama: string; jumlah: number }[];
  posyandu: { nama: string; jumlah: number }[];
}

const FRUITS = new Set([
  'JERUK', 'KELENGKENG', 'LENGKENG', 'KLENGKENG', 'PISANG', 'ANGGUR', 'APEL', 'PIR', 'MELON', 'SEMANGKA',
  'PEPAYA', 'SALAK', 'MANGGA', 'NANAS', 'JAMBU', 'DUKU', 'RAMBUTAN', 'MANGGIS', 'ALPUKAT', 'KIWI',
  'BELIMBING', 'SAWO', 'MARKISA', 'KURMA', 'STROBERI', 'LECI', 'SIRSAK', 'NANGKA',
]);

/** "Nasi Liwet (Beras Putih (Premium))" → "Nasi Liwet"; "Tahu Goreng Kecil" → "Tahu Goreng"; "Tempe Goreng - Ummisari" → "Tempe Goreng". */
export function cleanMenuItem(item: string): string {
  let s = item;
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(/\([^()]*\)/g, ' ');
  }
  s = s.replace(/\s+-\s+.*$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+(Kecil|Besar)$/i, '');
  return s;
}

/** Buah ditulis nama buahnya saja ("Jeruk Medan D Polos" → "Jeruk"); "Buah Naga Merah" → "Buah Naga". */
function fruitName(item: string): string {
  const words = item.split(' ');
  if (words[0]?.toUpperCase() === 'BUAH' && words.length > 1) return words.slice(0, 2).join(' ');
  return FRUITS.has((words[0] || '').toUpperCase()) ? words[0] : item;
}

function cleanList(list: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of list || []) {
    const item = cleanMenuItem(raw);
    if (item && !out.includes(item)) out.push(item);
  }
  // Buah biasanya hidangan terakhir; hanya hidangan terakhir yang dipendekkan supaya "Pisang Goreng" di tengah tidak ikut.
  if (out.length > 0) out[out.length - 1] = fruitName(out[out.length - 1]);
  return out;
}

type PortionKey = 'kecil' | 'besar' | 'balita' | 'bumilBusui';
/** Urutan blok: blok yang memuat porsi lebih awal di daftar ini tampil lebih dulu. */
const BLOCK_ORDER: PortionKey[] = ['kecil', 'besar', 'balita', 'bumilBusui'];

function blockLabel(keys: Set<PortionKey>): string {
  const parts: string[] = [];
  if (keys.has('balita')) parts.push('Balita');
  if (keys.has('kecil') && keys.has('besar')) parts.push('TK, SD Kelas 1-6, SMP, SMA');
  else if (keys.has('kecil')) parts.push('TK, SD Kelas 1-3');
  else if (keys.has('besar')) parts.push('SD Kelas 4-6, SMP, SMA');
  if (keys.has('bumilBusui')) parts.push('Bumil/Busui');
  return parts.join(', ');
}

/** Blok "Menu Ompreng": porsi dengan hidangan yang sama digabung satu blok. */
export function buildMenuBlocks(menus: PortionMenus | null): MenuBlock[] {
  if (!menus) return [];
  const groups: { keys: Set<PortionKey>; items: string[] }[] = [];
  for (const key of BLOCK_ORDER) {
    const items = cleanList(menus[key]);
    if (items.length === 0) continue;
    const same = groups.find((g) => g.items.length === items.length && g.items.every((x, i) => x === items[i]));
    if (same) same.keys.add(key);
    else groups.push({ keys: new Set([key]), items });
  }
  return groups.map((g) => ({ label: blockLabel(g.keys), items: g.items }));
}

export function buildMenuDay(day: LaporanDayData): MenuDay {
  const { schools, posyandu } = schoolsAndPosyandu(day.entries.filter((e) => !e.isSekolahLibur));
  return {
    tanggal: day.tanggal,
    hariTanggal: formatHariTanggal(day.tanggal),
    menu: buildMenuBlocks(day.menus),
    sekolah: schools.map((e) => ({ nama: schoolName(e), jumlah: n(e.qtSiswaBalita) + n(e.qtGuruKader) })),
    posyandu: posyandu.map((e) => ({ nama: posyanduName(e), jumlah: n(e.qtSiswaBalita) + bumil(e) + busui(e) })),
  };
}

// ---------------------------------------------------------------------------
// 4). Dokumentasi
// ---------------------------------------------------------------------------

export const PHOTO_SECTIONS = [
  { key: 'persiapan', label: 'Persiapan' },
  { key: 'pemorsian', label: 'Pemorsian' },
  { key: 'menu', label: 'Menu' },
  { key: 'distribusi', label: 'Distribusi Serah Terima' },
  { key: 'penerima', label: 'Penerima Manfaat' },
] as const;

export type PhotoSectionKey = (typeof PHOTO_SECTIONS)[number]['key'];

export const isPhotoSection = (v: unknown): v is PhotoSectionKey => PHOTO_SECTIONS.some((s) => s.key === v);

export interface LaporanPhotoRef {
  tanggal: string;
  section: PhotoSectionKey;
  url: string;
  order: number;
}

export interface DokumentasiDay {
  tanggal: string;
  hariTanggal: string;
  sections: { key: PhotoSectionKey; label: string; photos: { url: string; caption: string }[] }[];
}

/** Foto per tanggal, lalu per bagian (urutan Persiapan → Penerima Manfaat); nomor foto berurutan per tanggal. */
export function buildDokumentasi(dates: string[], photos: LaporanPhotoRef[]): DokumentasiDay[] {
  const out: DokumentasiDay[] = [];
  for (const tanggal of dates) {
    let no = 0;
    const sections = PHOTO_SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      photos: photos
        .filter((p) => p.tanggal === tanggal && p.section === s.key)
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ url: p.url, caption: `Foto ${++no} – ${s.label}` })),
    })).filter((s) => s.photos.length > 0);
    if (sections.length > 0) out.push({ tanggal, hariTanggal: formatHariTanggal(tanggal), sections });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Laporan lengkap + peringatan
// ---------------------------------------------------------------------------

export interface LaporanWarning {
  tanggal: string;
  kind: 'tanpa-data' | 'tanpa-menu' | 'hari-pertama-kosong';
  text: string;
}

export interface LaporanModel {
  dates: string[];
  periodHeader: string;
  periodRange: string;
  penerima: PenerimaManfaat | null;
  menuDays: MenuDay[];
  tim: readonly TimMember[];
  dokumentasi: DokumentasiDay[];
  warnings: LaporanWarning[];
}

export function laporanWarnings(days: LaporanDayData[]): LaporanWarning[] {
  const out: LaporanWarning[] = [];
  if (days.length > 0 && !days[0].batchId) {
    const first = days.find((d) => d.batchId);
    out.push({
      tanggal: days[0].tanggal,
      kind: 'hari-pertama-kosong',
      text: first
        ? `Data PM ${formatHariTanggal(days[0].tanggal)} belum ada, tabel Penerima Manfaat memakai data ${formatHariTanggal(first.tanggal)}.`
        : 'Belum ada data PM di periode ini, tabel Penerima Manfaat kosong.',
    });
  }
  for (const d of days) {
    if (!d.batchId) {
      out.push({ tanggal: d.tanggal, kind: 'tanpa-data', text: `${formatHariTanggal(d.tanggal)}: belum ada data PM dari Admin MBG, hari ini tidak masuk laporan.` });
    } else if (buildMenuBlocks(d.menus).length === 0) {
      out.push({ tanggal: d.tanggal, kind: 'tanpa-menu', text: `${formatHariTanggal(d.tanggal)}: menu belum diisi Produksi MBG, di laporan ditandai "MENU BELUM DIISI".` });
    }
  }
  return out;
}

/** Seluruh isi laporan; `days` urut tanggal, `days[0]` = Senin pertama. */
export function buildLaporanModel(days: LaporanDayData[], photos: LaporanPhotoRef[]): LaporanModel {
  const dates = days.map((d) => d.tanggal);
  const firstWithData = days.find((d) => d.batchId);
  return {
    dates,
    periodHeader: periodHeader(dates),
    periodRange: periodRange(dates),
    penerima: firstWithData ? buildPenerimaManfaat(firstWithData) : null,
    menuDays: days.filter((d) => d.batchId).map(buildMenuDay),
    tim: TIM_PELAKSANA,
    dokumentasi: buildDokumentasi(dates, photos),
    warnings: laporanWarnings(days),
  };
}

/** "Laporan MBG 09 November - 20 November 2026.docx" */
export const laporanFileName = (model: LaporanModel, ext: 'pdf' | 'docx') =>
  `Laporan MBG ${model.periodRange}.${ext}`.replace(/[\\/:*?"<>|]/g, '-');

/** Penanda kolom menu bila Produksi MBG belum mengisi menu. */
export const MENU_BELUM_DIISI = 'MENU BELUM DIISI PRODUKSI MBG';
