import informasiBahanData from './informasiBahanPangan.json';
import akgReferenceData from './akgReference.json';

// ============================================================================
// MBG Constants — Labels, Templates, and Configuration
// ============================================================================

export interface MbgBahanPanganInfo {
  namaBahan: string;
  bdd: number;
  harga: number;
  satuan: string;
  unitBeli: number;
}

export interface MbgKategoriBahanPangan {
  bahanUtama: string[];
  bumbuPelengkap: string[];
  bumbuDasar: string[];
}

export interface MbgAkgValues {
  energi: number;
  protein: number;
  lemak: number;
  karbohidrat: number;
  serat: number;
}

export interface MbgAkgTargetGroup {
  targetGroup: string;
  key: string;
  harian: MbgAkgValues;
  makanSiang: MbgAkgValues;
  kudapan: MbgAkgValues;
}

export const MBG_INFORMASI_BAHAN_PANGAN: MbgBahanPanganInfo[] = informasiBahanData.informasiBahanPangan;
export const MBG_KATEGORI_BAHAN_PANGAN: MbgKategoriBahanPangan = informasiBahanData.kategoriBahanPangan;
export const MBG_AKG_REFERENCE: MbgAkgTargetGroup[] = akgReferenceData;

/** Lookup helper untuk info bahan pangan */
export function getBahanPanganInfo(namaBahan: string): MbgBahanPanganInfo | undefined {
  if (!namaBahan) return undefined;
  const key = namaBahan.trim().toLowerCase();
  return MBG_INFORMASI_BAHAN_PANGAN.find((b) => b.namaBahan.trim().toLowerCase() === key);
}

/** Lookup helper untuk AKG berdasarkan kelompok target */
export function getAkgTargetByGroup(groupNameOrKey: string): MbgAkgTargetGroup | undefined {
  if (!groupNameOrKey) return undefined;
  const key = groupNameOrKey.trim().toLowerCase();
  return MBG_AKG_REFERENCE.find(
    (a) => a.targetGroup.toLowerCase() === key || a.key.toLowerCase() === key
  );
}



/** Satuan untuk purchasing items */
export const MBG_SATUAN_OPTIONS = [
  'Kg',
  'g',
  'Liter',
  'ml',
  'Pcs',
  'Karung',
  'Ikat',
  'Karton',
  'Butir',
  'Pack',
  'Bungkus',
  'Botol',
  'Kaleng',
  'Sachet',
] as const;

/** Kategori barang supplier */
export const MBG_SUPPLIER_CATEGORIES = [
  'Beras & Biji-bijian',
  'Sayuran',
  'Buah-buahan',
  'Daging & Ayam',
  'Telur',
  'Ikan & Seafood',
  'Bumbu & Rempah',
  'Minyak & Lemak',
  'Roti & Bakery',
  'Susu & Dairy',
  'Minuman',
  'Bahan Kering',
  'Lainnya',
] as const;

/** Template deskripsi foto cooking */
export const MBG_COOKING_PHOTO_TEMPLATES = [
  'Persiapan Bahan',
  'Pencucian & Sanitasi',
  'Pemotongan Bahan',
  'Proses Memasak',
  'Pengecekan Matang',
  'Penambahan Bumbu',
  'Plating / Penyajian',
  'Pengemasan',
  'Quality Check Akhir',
  'Dokumentasi Umum',
] as const;

/** Tipe institusi labels */
export const MBG_INSTITUTION_TYPE_LABELS: Record<string, string> = {
  sekolah: 'Sekolah',
  posyandu: 'Posyandu',
};

/** Column labels yang berubah berdasarkan tipe institusi */
export const MBG_COLUMN_LABELS = {
  sekolah: {
    qtSiswaBalita: 'QT Siswa',
    qtBumilBusui: 'Bumil/Busui',
    qtGuruKader: 'QT Guru',
  },
  posyandu: {
    qtSiswaBalita: 'QT Balita',
    qtBumilBusui: 'QT Bumil/Busui',
    qtGuruKader: 'QT Kader',
  },
} as const;

/** Status batch labels & warna */
export const MBG_BATCH_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textClass: string; bgClass: string }> = {
  DRAFT: { label: 'Draft', color: '#6B7280', bgColor: '#F3F4F6', textClass: 'text-[#6B7280]', bgClass: 'bg-[#F3F4F6]' },
  PM_SUBMITTED: { label: 'Data PM Lengkap', color: '#2563EB', bgColor: '#DBEAFE', textClass: 'text-[#2563EB]', bgClass: 'bg-[#DBEAFE]' },
  NUTRITION_DONE: { label: 'Gizi Dihitung', color: '#7C3AED', bgColor: '#EDE9FE', textClass: 'text-[#7C3AED]', bgClass: 'bg-[#EDE9FE]' },
  PDF_EXPORTED: { label: 'PDF Diekspor', color: '#6D28D9', bgColor: '#EDE9FE', textClass: 'text-[#6D28D9]', bgClass: 'bg-[#EDE9FE]' },
  PURCHASING: { label: 'Sedang Belanja', color: '#D97706', bgColor: '#FEF3C7', textClass: 'text-[#D97706]', bgClass: 'bg-[#FEF3C7]' },
  PURCHASED: { label: 'Belanja Selesai', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
  QC_PENDING: { label: 'Menunggu QC', color: '#D97706', bgColor: '#FEF3C7', textClass: 'text-[#D97706]', bgClass: 'bg-[#FEF3C7]' },
  QC_PASSED: { label: 'QC Lolos', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
  QC_FAILED: { label: 'QC Gagal', color: '#DC2626', bgColor: '#FEE2E2', textClass: 'text-[#DC2626]', bgClass: 'bg-[#FEE2E2]' },
  COOKING: { label: 'Sedang Dimasak', color: '#EA580C', bgColor: '#FFF7ED', textClass: 'text-[#EA580C]', bgClass: 'bg-[#FFF7ED]' },
  COOKED: { label: 'Masak Selesai', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
  DELIVERING: { label: 'Sedang Diantar', color: '#2563EB', bgColor: '#DBEAFE', textClass: 'text-[#2563EB]', bgClass: 'bg-[#DBEAFE]' },
  DELIVERED: { label: 'Terkirim', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
};

/** Purchase order status config */
export const MBG_PURCHASE_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textClass: string; bgClass: string; bgActiveClass: string }> = {
  pending: { label: 'Belum Dibeli', color: '#6B7280', bgColor: '#F3F4F6', textClass: 'text-[#6B7280]', bgClass: 'bg-[#F3F4F6]', bgActiveClass: 'bg-[#6B7280]' },
  ordered: { label: 'Sudah Dipesan', color: '#2563EB', bgColor: '#DBEAFE', textClass: 'text-[#2563EB]', bgClass: 'bg-[#DBEAFE]', bgActiveClass: 'bg-[#2563EB]' },
  shipped: { label: 'Sedang Dikirim', color: '#D97706', bgColor: '#FEF3C7', textClass: 'text-[#D97706]', bgClass: 'bg-[#FEF3C7]', bgActiveClass: 'bg-[#D97706]' },
  received: { label: 'Sudah Diterima', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]', bgActiveClass: 'bg-[#059669]' },
};

/** QC status config */
export const MBG_QC_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textClass: string; bgClass: string }> = {
  pending: { label: 'Menunggu', color: '#D97706', bgColor: '#FEF3C7', textClass: 'text-[#D97706]', bgClass: 'bg-[#FEF3C7]' },
  passed: { label: 'Lolos', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
  failed: { label: 'Gagal', color: '#DC2626', bgColor: '#FEE2E2', textClass: 'text-[#DC2626]', bgClass: 'bg-[#FEE2E2]' },
};

/** Delivery status config */
export const MBG_DELIVERY_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: string; textClass: string; bgClass: string }> = {
  waiting: { label: 'Menunggu', color: '#6B7280', bgColor: '#F3F4F6', icon: '⏳', textClass: 'text-[#6B7280]', bgClass: 'bg-[#F3F4F6]' },
  handover_done: { label: 'Serah Terima', color: '#2563EB', bgColor: '#DBEAFE', icon: '🤝', textClass: 'text-[#2563EB]', bgClass: 'bg-[#DBEAFE]' },
  delivering: { label: 'Sedang Antar', color: '#D97706', bgColor: '#FEF3C7', icon: '🚚', textClass: 'text-[#D97706]', bgClass: 'bg-[#FEF3C7]' },
  delivered: { label: 'Sampai', color: '#059669', bgColor: '#D1FAE5', icon: '✅', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
};

/** Cooking session status config */
export const MBG_COOKING_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textClass: string; bgClass: string }> = {
  preparation: { label: 'Persiapan', color: '#6B7280', bgColor: '#F3F4F6', textClass: 'text-[#6B7280]', bgClass: 'bg-[#F3F4F6]' },
  cooking: { label: 'Memasak', color: '#EA580C', bgColor: '#FFF7ED', textClass: 'text-[#EA580C]', bgClass: 'bg-[#FFF7ED]' },
  plating: { label: 'Penyajian', color: '#7C3AED', bgColor: '#EDE9FE', textClass: 'text-[#7C3AED]', bgClass: 'bg-[#EDE9FE]' },
  packaging: { label: 'Pengemasan', color: '#2563EB', bgColor: '#DBEAFE', textClass: 'text-[#2563EB]', bgClass: 'bg-[#DBEAFE]' },
  done: { label: 'Selesai', color: '#059669', bgColor: '#D1FAE5', textClass: 'text-[#059669]', bgClass: 'bg-[#D1FAE5]' },
};

/** MBG Role display names for sidebar badges */
export const MBG_ROLE_BADGES: Record<string, string> = {
  admin_mbg: 'Admin MBG',
  produksi_mbg: 'Produksi MBG',
  purchasing_mbg: 'Purchasing MBG',
  distribusi_mbg: 'Distribusi MBG',
  kurir_mbg: 'Kurir MBG',
};

/** Default empty PM entry for new row creation */
export function createEmptyPmEntry(batchId: string, petugasId: string, petugasName: string, sortOrder: number): Omit<import('../types/mbg').MbgPmEntry, 'id'> {
  return {
    batchId,
    institutionName: '',
    institutionType: 'sekolah',
    qtSiswaBalita: 0,
    qtBumilBusui: 0,
    qtGuruKader: 0,
    qtPobiaNasi: 0,
    jumlah: 0,
    jadwalPengantaran: '',
    assignedPetugasId: petugasId,
    assignedPetugasName: petugasName,
    menuItems: [],
    menuKeringanItems: [],
    isSekolahLibur: false,
    notes: '',
    sortOrder,
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const NUTRIENTS_LIST = [
  { key: 'air', label: 'Air (g)' },
  { key: 'kalori', label: 'Energi (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'lemak', label: 'Lemak (g)' },
  { key: 'karbohidrat', label: 'KH (g)' },
  { key: 'serat', label: 'Serat (g)' },
  { key: 'abu', label: 'Abu (g)' },
  { key: 'kalsium', label: 'Kalsium (mg)' },
  { key: 'fosfor', label: 'Fosfor (mg)' },
  { key: 'zatBesi', label: 'Besi (mg)' },
  { key: 'natrium', label: 'Natrium (mg)' },
  { key: 'kalium', label: 'Kalium (mg)' },
  { key: 'tembaga', label: 'Tembaga (mg)' },
  { key: 'seng', label: 'Seng (mg)' },
  { key: 'vitaminA', label: 'Retinol (mcg)' },
  { key: 'bkar', label: 'Bkar (mcg)' },
  { key: 'kartotal', label: 'Kartotal (mcg)' },
  { key: 'thiamin', label: 'Thiamin (mg)' },
  { key: 'riboflavin', label: 'Riboflavin (mg)' },
  { key: 'niasin', label: 'Niasin (mg)' },
  { key: 'vitaminC', label: 'Vit C (mg)' },
] as const;

export const NUTRITIONAL_MAP: Record<typeof NUTRIENTS_LIST[number]['key'], string> = {
  air: 'air',
  kalori: 'energi',
  protein: 'protein',
  lemak: 'lemak',
  karbohidrat: 'kh',
  serat: 'serat',
  abu: 'abu',
  kalsium: 'kalsium',
  fosfor: 'fosfor',
  zatBesi: 'besi',
  natrium: 'natrium',
  kalium: 'kalium',
  tembaga: 'tembaga',
  seng: 'seng',
  vitaminA: 'retinol',
  bkar: 'bkar',
  kartotal: 'kartotal',
  thiamin: 'thiamin',
  riboflavin: 'riboflavin',
  niasin: 'niasin',
  vitaminC: 'vit_c',
};

/** Master Institusi MBG berdasarkan Rekapitulasi Penerima Manfaat */
export interface MbgMasterInstitution {
  institutionName: string;
  institutionType: 'sekolah' | 'posyandu';
  schoolLevel?: 'tk_paud' | 'sd' | 'sma';
  qtSiswaBalita: number;
  qtBumilBusui: number;
  qtBumil?: number;
  qtBusui?: number;
  qtGuruKader: number;
  qtPobiaNasi?: number;
  qtAlergi?: number;
  qtTidakAlergi?: number;
  keteranganAlergi?: string;
  qtPorsiBalita?: number;
  qtPorsiKecil?: number;
  qtPorsiBesar?: number;
  qtPorsiBumilBusui?: number;
  qtPorsiKecilL?: number;
  qtPorsiKecilP?: number;
  qtPorsiBesarL?: number;
  qtPorsiBesarP?: number;
  qtGuruL?: number;
  qtGuruP?: number;
  qtTendikL?: number;
  qtTendikP?: number;
  jadwalPengantaran?: string;
}

export const MBG_MASTER_INSTITUTIONS: MbgMasterInstitution[] = [
  { institutionName: 'SPS CEMPAKA', institutionType: 'sekolah', schoolLevel: 'tk_paud', qtSiswaBalita: 31, qtBumilBusui: 0, qtGuruKader: 5, qtPorsiKecil: 31, qtPorsiBesar: 0, qtPorsiKecilL: 14, qtPorsiKecilP: 17, qtGuruL: 0, qtGuruP: 5, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 36, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SPS CEMPAKA 10', institutionType: 'sekolah', schoolLevel: 'tk_paud', qtSiswaBalita: 52, qtBumilBusui: 0, qtGuruKader: 7, qtPorsiKecil: 52, qtPorsiBesar: 0, qtPorsiKecilL: 18, qtPorsiKecilP: 34, qtGuruL: 0, qtGuruP: 7, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 59, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'TK PADARAANG', institutionType: 'sekolah', schoolLevel: 'tk_paud', qtSiswaBalita: 17, qtBumilBusui: 0, qtGuruKader: 3, qtPorsiKecil: 17, qtPorsiBesar: 0, qtPorsiKecilL: 11, qtPorsiKecilP: 6, qtGuruL: 0, qtGuruP: 3, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 20, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'TK AL-MUJAHID', institutionType: 'sekolah', schoolLevel: 'tk_paud', qtSiswaBalita: 56, qtBumilBusui: 0, qtGuruKader: 5, qtPorsiKecil: 56, qtPorsiBesar: 0, qtPorsiKecilL: 0, qtPorsiKecilP: 56, qtGuruL: 0, qtGuruP: 5, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 61, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SDN PASIRBADAK', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 94, qtBumilBusui: 0, qtGuruKader: 0, qtPorsiKecil: 94, qtPorsiBesar: 0, qtPorsiKecilL: 49, qtPorsiKecilP: 45, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 94, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SDN PASIRBADAK 4-6', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 76, qtBumilBusui: 0, qtGuruKader: 11, qtPorsiKecil: 0, qtPorsiBesar: 87, qtPorsiBesarL: 39, qtPorsiBesarP: 37, qtGuruL: 2, qtGuruP: 8, qtTendikL: 1, qtTendikP: 0, qtTidakAlergi: 87, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SDN PADARAANG', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 107, qtBumilBusui: 0, qtGuruKader: 0, qtPorsiKecil: 107, qtPorsiBesar: 0, qtPorsiKecilL: 58, qtPorsiKecilP: 49, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 107, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SDN PADARAANG 4-6', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 112, qtBumilBusui: 0, qtGuruKader: 10, qtPorsiKecil: 0, qtPorsiBesar: 122, qtPorsiBesarL: 65, qtPorsiBesarP: 47, qtGuruL: 2, qtGuruP: 8, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 122, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SD ISLAM MASAGI', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 30, qtBumilBusui: 0, qtGuruKader: 0, qtPorsiKecil: 30, qtPorsiBesar: 0, qtPorsiKecilL: 7, qtPorsiKecilP: 23, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 30, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SD ISLAM MASAGI 4-6', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 32, qtBumilBusui: 0, qtGuruKader: 6, qtPorsiKecil: 0, qtPorsiBesar: 38, qtPorsiBesarL: 16, qtPorsiBesarP: 16, qtGuruL: 0, qtGuruP: 6, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 38, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'MIN KARARANGGE', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 97, qtBumilBusui: 0, qtGuruKader: 0, qtPorsiKecil: 97, qtPorsiBesar: 0, qtPorsiKecilL: 52, qtPorsiKecilP: 45, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 97, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'MIN KARARANGGE 4-6', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 78, qtBumilBusui: 0, qtGuruKader: 11, qtPorsiKecil: 0, qtPorsiBesar: 89, qtPorsiBesarL: 44, qtPorsiBesarP: 34, qtGuruL: 3, qtGuruP: 7, qtTendikL: 1, qtTendikP: 0, qtTidakAlergi: 89, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SMP AL - UMANAA', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 193, qtBumilBusui: 0, qtGuruKader: 88, qtPorsiKecil: 0, qtPorsiBesar: 281, qtPorsiBesarL: 103, qtPorsiBesarP: 90, qtGuruL: 28, qtGuruP: 45, qtTendikL: 10, qtTendikP: 5, qtTidakAlergi: 281, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SMP ISLAM MASAGI', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 92, qtBumilBusui: 0, qtGuruKader: 13, qtPorsiKecil: 0, qtPorsiBesar: 105, qtPorsiBesarL: 58, qtPorsiBesarP: 34, qtGuruL: 2, qtGuruP: 11, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 105, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SMPN 1 GUNUNGGURUH', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 785, qtBumilBusui: 0, qtGuruKader: 41, qtPorsiKecil: 0, qtPorsiBesar: 826, qtPorsiBesarL: 403, qtPorsiBesarP: 382, qtGuruL: 14, qtGuruP: 15, qtTendikL: 9, qtTendikP: 3, qtTidakAlergi: 826, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'MTS AL-MUJAHID', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 72, qtBumilBusui: 0, qtGuruKader: 15, qtPorsiKecil: 0, qtPorsiBesar: 87, qtPorsiBesarL: 46, qtPorsiBesarP: 26, qtGuruL: 8, qtGuruP: 6, qtTendikL: 1, qtTendikP: 0, qtTidakAlergi: 87, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'MA SAMSUL MA\'ARIF', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 45, qtBumilBusui: 0, qtGuruKader: 14, qtPorsiKecil: 0, qtPorsiBesar: 59, qtPorsiBesarL: 0, qtPorsiBesarP: 45, qtGuruL: 7, qtGuruP: 3, qtTendikL: 4, qtTendikP: 0, qtTidakAlergi: 59, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SMA AL UMANAA', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 179, qtBumilBusui: 0, qtGuruKader: 62, qtPorsiKecil: 0, qtPorsiBesar: 241, qtPorsiBesarL: 101, qtPorsiBesarP: 78, qtGuruL: 36, qtGuruP: 20, qtTendikL: 5, qtTendikP: 1, qtTidakAlergi: 241, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'MTS SAMSUL ULUM 2', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 55, qtBumilBusui: 0, qtGuruKader: 14, qtPorsiKecil: 0, qtPorsiBesar: 69, qtPorsiBesarL: 24, qtPorsiBesarP: 31, qtGuruL: 8, qtGuruP: 6, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 69, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'MA NURUL AZIZ', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 56, qtBumilBusui: 0, qtGuruKader: 10, qtPorsiKecil: 0, qtPorsiBesar: 66, qtPorsiBesarL: 29, qtPorsiBesarP: 27, qtGuruL: 2, qtGuruP: 8, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 66, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SMK AL-FATHONAH', institutionType: 'sekolah', schoolLevel: 'sma', qtSiswaBalita: 302, qtBumilBusui: 0, qtGuruKader: 38, qtPorsiKecil: 0, qtPorsiBesar: 340, qtPorsiBesarL: 154, qtPorsiBesarP: 148, qtGuruL: 17, qtGuruP: 15, qtTendikL: 3, qtTendikP: 3, qtTidakAlergi: 340, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'TK QURROTAYAUN', institutionType: 'sekolah', schoolLevel: 'tk_paud', qtSiswaBalita: 51, qtBumilBusui: 0, qtGuruKader: 6, qtPorsiKecil: 51, qtPorsiBesar: 6, qtPorsiKecilL: 0, qtPorsiKecilP: 51, qtGuruL: 4, qtGuruP: 0, qtTendikL: 2, qtTendikP: 0, qtTidakAlergi: 57, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SD QURROTAYAUN 1-3', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 168, qtBumilBusui: 0, qtGuruKader: 0, qtPorsiKecil: 168, qtPorsiBesar: 0, qtPorsiKecilL: 0, qtPorsiKecilP: 168, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 0, qtTidakAlergi: 168, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'SD QURROTAYAUN 4-6', institutionType: 'sekolah', schoolLevel: 'sd', qtSiswaBalita: 79, qtBumilBusui: 0, qtGuruKader: 24, qtPorsiKecil: 0, qtPorsiBesar: 103, qtPorsiBesarL: 0, qtPorsiBesarP: 79, qtGuruL: 0, qtGuruP: 18, qtTendikL: 0, qtTendikP: 6, qtTidakAlergi: 103, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'Balita Cempaka', institutionType: 'posyandu', qtSiswaBalita: 416, qtBumilBusui: 0, qtGuruKader: 13, qtPorsiBalita: 416, qtPorsiBesar: 13, qtPorsiKecilL: 204, qtPorsiKecilP: 212, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 13, qtTidakAlergi: 429, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'Bumil Cempaka', institutionType: 'posyandu', qtSiswaBalita: 0, qtBumilBusui: 35, qtBumil: 35, qtBusui: 0, qtGuruKader: 13, qtPorsiBumilBusui: 35, qtPorsiBesar: 13, qtPorsiBesarL: 0, qtPorsiBesarP: 35, qtGuruL: 0, qtGuruP: 0, qtTendikL: 0, qtTendikP: 13, qtTidakAlergi: 48, jadwalPengantaran: '06.00-08.30' },
  { institutionName: 'Busui Cempaka', institutionType: 'posyandu', qtSiswaBalita: 0, qtBumilBusui: 92, qtBumil: 0, qtBusui: 92, qtGuruKader: 0, qtPorsiBumilBusui: 92, qtPorsiBesarL: 0, qtPorsiBesarP: 92, qtTidakAlergi: 92, jadwalPengantaran: '06.00-08.30' },
];
