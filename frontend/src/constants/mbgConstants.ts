// ============================================================================
// MBG Constants — Labels, Templates, and Configuration
// ============================================================================

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
