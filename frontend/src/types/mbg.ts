// ============================================================================
// MBG (Makan Bergizi Gratis) — Type Definitions
// ============================================================================

// === CORE ENUMS ===

/** Tipe institusi penerima MBG */
export type MbgInstitutionType = 'sekolah' | 'posyandu';

/** Ukuran porsi */
export type MbgPortionSize = 'kecil' | 'besar';

/** Tipe menu */
export type MbgMenuType = 'reguler' | 'keringan';

/** State machine status untuk batch MBG */
export type MbgBatchStatus =
  | 'DRAFT'
  | 'PM_SUBMITTED'
  | 'NUTRITION_DONE'
  | 'PDF_EXPORTED'
  | 'PURCHASING'
  | 'PURCHASED'
  | 'QC_PENDING'
  | 'QC_PASSED'
  | 'QC_FAILED'
  | 'COOKING'
  | 'COOKED'
  | 'DELIVERING'
  | 'DELIVERED';

/** Status purchase order */
export type MbgPurchaseStatus = 'pending' | 'ordered' | 'shipped' | 'received';

/** Status QC */
export type MbgQcStatus = 'pending' | 'passed' | 'failed';

/** Status cooking session */
export type MbgCookingStatus = 'preparation' | 'cooking' | 'plating' | 'packaging' | 'done';

/** Status delivery task kurir */
export type MbgDeliveryStatus = 'waiting' | 'handover_done' | 'delivering' | 'delivered';

/** Status per-item QC */
export type MbgQcItemStatus = 'ok' | 'rejected';

// === DATA PM (Penanggung Jawab Makanan) ===

/**
 * Satu baris entry di tabel PM — mewakili satu institusi.
 *
 * Format sesuai tabel referensi:
 * | Institusi | QT Siswa/Balita | QT Bumil/Busui | QT Guru/Kader | Pobia Nasi | Jumlah | Jadwal |
 */
export interface MbgPmEntry {
  id: string;
  batchId: string;
  institutionName: string;
  institutionType: MbgInstitutionType;
  /** Tingkatan sekolah (sekolah only) */
  schoolLevel?: 'tk_paud' | 'sd' | 'sma';
  /** Jumlah siswa (sekolah) ATAU balita (posyandu) */
  qtSiswaBalita: number;
  /** Jumlah ibu hamil + menyusui (posyandu only, 0 for sekolah) */
  qtBumilBusui: number;
  /** Jumlah ibu hamil (Bumil) secara terpisah */
  qtBumil?: number;
  /** Jumlah ibu menyusui (Busui) secara terpisah */
  qtBusui?: number;
  /** Alamat lengkap institusi/sekolah */
  address?: string;
  /** Jumlah guru (sekolah) ATAU kader (posyandu) */
  qtGuruKader: number;
  /** Jumlah penerima yang butuh menu keringan (non-nasi) */
  qtPobiaNasi: number;
  /** Jumlah porsi balita */
  qtPorsiBalita?: number;
  /** Jumlah porsi kecil */
  qtPorsiKecil?: number;
  /** Jumlah porsi besar */
  qtPorsiBesar?: number;
  /** Jumlah porsi bumil/busui */
  qtPorsiBumilBusui?: number;
  /** Auto-sum: siswa + bumil + guru + pobia (note: pobia overlaps) */
  jumlah: number;
  /** Time range jadwal pengantaran, e.g. "06.00-08.30" */
  jadwalPengantaran: string;
  /** UID kurir yang ditugaskan */
  assignedPetugasId: string;
  /** Display name kurir */
  assignedPetugasName: string;
  /** Daftar menu reguler */
  menuItems: string[];
  /** Daftar menu keringan untuk pobia nasi */
  menuKeringanItems: string[];
  /** Flag institusi libur (skip delivery) */
  isSekolahLibur: boolean;
  /** Catatan tambahan */
  notes: string;
  /** Sort order within petugas group */
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Jumlah penerima yang memiliki alergi */
  qtAlergi?: number;
  /** Jumlah penerima yang tidak memiliki alergi */
  qtTidakAlergi?: number;
  /** Catatan/rincian alergi */
  keteranganAlergi?: string;
  /** Breakdown per kelas (hanya untuk tipe 'sekolah') */
  classesBreakdown?: MbgClassBreakdown[];
  /** Breakdown Porsi Kecil Laki-laki */
  qtPorsiKecilL?: number;
  /** Breakdown Porsi Kecil Perempuan */
  qtPorsiKecilP?: number;
  /** Breakdown Porsi Besar Laki-laki */
  qtPorsiBesarL?: number;
  /** Breakdown Porsi Besar Perempuan */
  qtPorsiBesarP?: number;
  /** Breakdown Guru Laki-laki */
  qtGuruL?: number;
  /** Breakdown Guru Perempuan */
  qtGuruP?: number;
  /** Breakdown Tendik Laki-laki */
  qtTendikL?: number;
  /** Breakdown Tendik Perempuan */
  qtTendikP?: number;
}

export interface MbgClassBreakdown {
  id: string;
  className: string;
  totalSiswa: number;
  qtPobiaNasi: number;
  qtAlergi?: number;
  qtTidakAlergi?: number;
  keteranganAlergi?: string;
  portionType?: 'balita' | 'kecil' | 'besar' | 'ibu';
  qtPorsiBalita?: number;
  qtPorsiKecil?: number;
  qtPorsiBesar?: number;
  qtPorsiBumilBusui?: number;
  jumlah: number;
  menuItems: string[];
  menuKeringanItems: string[];
  jadwalPengantaran: string;
}

/**
 * Batch = satu "pengiriman" per tanggal.
 * Mengelompokkan semua PM entries untuk tanggal yang sama.
 */
export interface MbgPmBatch {
  id: string;
  /** Tanggal pengiriman (YYYY-MM-DD) */
  tanggal: string;
  /** Status keseluruhan batch */
  status: MbgBatchStatus;
  /** Summary totals (auto-calculated from entries) */
  totalSiswaBalita: number;
  totalBumilBusui: number;
  totalGuruKader: number;
  totalPobiaNasi: number;
  totalJumlah: number;
  /** List unique petugas names in this batch */
  petugasList: string[];
  /** Catatan khusus batch (e.g., "GANTI MENU KERINGAN") */
  batchNotes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// === NUTRITION (Kadar Gizi) ===

/**
 * Data kadar gizi per menu item dalam satu batch.
 */
export interface MbgNutritionEntry {
  id: string;
  batchId: string;
  menuItemName: string;
  berat?: number;
  baseBerat?: number;
  air: number;
  kalori: number;
  protein: number;
  lemak: number;
  karbohidrat: number;
  serat: number;
  abu: number;
  kalsium: number;
  fosfor: number;
  zatBesi: number;
  natrium: number;
  kalium: number;
  tembaga: number;
  seng: number;
  vitaminA: number;
  bkar: number;
  kartotal: number;
  thiamin: number;
  riboflavin: number;
  niasin: number;
  vitaminC: number;
  /** Jumlah porsi */
  quantity: number;
  /** Calculated: kalori × quantity */
  totalKalori: number;
  totalProtein: number;
  totalLemak: number;
  totalKarbohidrat: number;
  totalSerat: number;
  calculatedBy: string;
  calculatedAt: string;
}

// === SUPPLIER ===

/**
 * Master data supplier (e.g., "H. DONAT", "KASMA TANI", "AURUM").
 */
export interface MbgSupplier {
  id: string;
  name: string;
  address: string;
  phone: string;
  /** Kategori barang yang dijual */
  kategoriBarang: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// === PURCHASING ===

/**
 * Satu baris item dalam purchase order.
 *
 * Format sesuai tabel referensi hijau:
 * | List Pesanan Bahan | Jam Kedatangan | Jumlah | Item | Keterangan |
 */
export interface MbgPurchaseItem {
  /** Nama bahan: "Beras", "Telur Ayam", "Pakcoy" */
  bahanName: string;
  /** Waktu kedatangan: "07.00", "14.00", "16.00" */
  jamKedatangan: string;
  /** Kuantitas: 15, 180, 116 */
  jumlah: number;
  /** Satuan: "Karung", "Kg", "Pcs", "Ikat", "Karton", "Butir" */
  satuan: string;
  /** Harga per unit */
  hargaSatuan: number;
  /** Auto-calculated: jumlah × hargaSatuan */
  totalHarga: number;
  /** Catatan tambahan */
  keterangan: string;
}

/**
 * Purchase order — dikelompokkan per supplier.
 * Satu PO = satu supplier + list items.
 */
export interface MbgPurchaseOrder {
  id: string;
  batchId: string;
  supplierId: string;
  supplierName: string;
  /** Tipe belanja */
  type: 'harian' | 'supplier';
  /** Target tanggal pengiriman: "Pesanan A → tanggal ini" */
  targetDate: string;
  /** Label grouping: "Pesanan A", "Pesanan B" */
  groupLabel: string;
  items: MbgPurchaseItem[];
  /** Auto-calculated sum of all item totalHarga */
  totalPengeluaran: number;
  status: MbgPurchaseStatus;
  orderedBy: string;
  orderedAt: string;
  createdAt: string;
  updatedAt: string;
  submittedToRecap?: boolean;
  submittedAt?: string;
}

// === QC (Quality Control) ===

/**
 * Per-item QC check with 6 checklist points.
 */
export interface MbgQcItemCheck {
  bahanName: string;
  jumlahOrdered: number;
  jumlahReceived: number;
  satuanOrdered: string;
  /** ✅ Jumlah yang diterima sesuai pesanan */
  isJumlahOk: boolean;
  /** ✅ Visual inspection kualitas */
  isKualitasOk: boolean;
  /** ✅ Berat/volume akurat */
  isQuantityOk: boolean;
  /** ✅ Item yang diterima sesuai yang dipesan */
  isKesesuaianOk: boolean;
  /** ✅ Kesegaran (sayur, daging, etc.) */
  isFreshOk: boolean;
  /** ✅ Kemasan tidak rusak/bocor */
  isPackagingOk: boolean;
  /** Alasan ditolak (if any) */
  failReason: string;
  status: MbgQcItemStatus;
}

/**
 * QC check untuk satu purchase order.
 */
export interface MbgQcCheck {
  id: string;
  batchId: string;
  purchaseOrderId: string;
  supplierName: string;
  items: MbgQcItemCheck[];
  overallStatus: MbgQcStatus;
  notes: string;
  /** Foto bukti QC (optional) */
  photoFileIds: string[];
  checkedBy: string;
  checkedAt: string;
  createdAt: string;
  updatedAt: string;
}

// === COOKING (Proses Masak) ===

/**
 * Satu foto dokumentasi proses masak.
 */
export interface MbgCookingPhoto {
  fileId: string;
  /** Deskripsi template or custom */
  description: string;
  capturedAt: string;
}

/**
 * Sesi masak untuk satu batch.
 */
export interface MbgCookingSession {
  id: string;
  batchId: string;
  status: MbgCookingStatus;
  photos: MbgCookingPhoto[];
  startedAt: string;
  completedAt: string;
  cookedBy: string;
  createdAt: string;
  updatedAt: string;
}

// === DELIVERY (Kurir MBG) ===

/**
 * Delivery task — satu tugas per petugas/kurir.
 *
 * Format sesuai tabel referensi foto ke-3:
 * PETUGAS: [Nama]
 * | Institusi | QT Siswa/Balita | Bumil/Busui | Guru/Kader | Pobia Nasi | Jumlah | Jadwal |
 */
export interface MbgDeliveryTask {
  id: string;
  batchId: string;
  /** UID kurir */
  petugasId: string;
  /** Display name: "Rahmat Dede", "Erik Yusep", "Yendi Firdi" */
  petugasName: string;
  /** List PM entry IDs assigned to this petugas */
  entryIds: string[];
  /** Total porsi for this petugas */
  totalPorsi: number;
  /** Foto serah terima dengan tim produksi */
  handoverPhotoId: string;
  handoverAt: string;
  status: MbgDeliveryStatus;
  /** Bukti foto per delivery stop */
  deliveryPhotos: { fileId: string; description: string; institutionName: string }[];
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}
