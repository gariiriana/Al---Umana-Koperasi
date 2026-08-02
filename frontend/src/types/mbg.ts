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
  /** Display name kenek (asisten kurir) — display only, no login */
  assignedKenekName?: string;
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
  /** Foto Menu Makanan / Box porsi */
  photoMenuUrl?: string;
  /** Deskripsi foto menu */
  photoMenuDesc?: string;
  /** Foto Penyerahan dengan Penanggung Jawab Penerima (PJ Sekolah / Posyandu / Guru / Kader) */
  photoPenerimaUrl?: string;
  /** Deskripsi foto penanggung jawab penerima */
  photoPenerimaDesc?: string;
  /** Timestamp foto penanggung jawab penerima */
  photoPenerimaTimestamp?: string;
  /** Geotag lokasi foto penanggung jawab penerima */
  photoPenerimaLocation?: string;
  /** Foto Serah Terima di lokasi penerima */
  photoSerahTerimaUrl?: string;
  /** Deskripsi foto serah terima */
  photoSerahTerimaDesc?: string;
  /** Timestamp foto serah terima */
  photoSerahTerimaTimestamp?: string;
  /** Geotag lokasi foto serah terima */
  photoSerahTerimaLocation?: string;
  /** Foto Surat Jalan / Berita Acara Penerimaan (BAST) berstempel */
  photoSuratJalanUrl?: string;
  /** Deskripsi foto surat jalan */
  photoSuratJalanDesc?: string;
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
  /** Foto barang belanjaan */
  photoUrl?: string;
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
  /** Foto bukti belanjaan per PO */
  photos?: string[];
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
  /** Preview URL (DataURL or Remote URL) */
  url?: string;
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

export interface MbgSchoolProof {
  institutionName: string;
  photoMenuUrl?: string;
  photoSerahTerimaUrl?: string;
  photoSerahTerimaTimestamp?: string;
  photoSerahTerimaLocation?: string;
  photoSuratJalanUrl?: string;
  photoPenerimaUrl?: string;
  photoPenerimaTimestamp?: string;
  photoPenerimaLocation?: string;
  updatedAt?: string;
}

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
  /** UID kenek (asisten kurir) */
  kenekId?: string;
  /** Display name kenek */
  kenekName?: string;
  /** List PM entry IDs assigned to this petugas */
  entryIds: string[];
  /** Total porsi for this petugas */
  totalPorsi: number;
  /** Foto serah terima dengan tim produksi */
  handoverPhotoId: string;
  handoverAt: string;
  status: MbgDeliveryStatus;
  /** Target deadline pengantaran (ISO Datetime) */
  deadlineAt?: string;
  /** Bukti foto per delivery stop */
  deliveryPhotos: { fileId: string; description: string; institutionName: string }[];
  /** Bukti foto 3-kategori (Menu, Serah Terima, Surat Jalan) per ID institusi */
  schoolProofs?: Record<string, MbgSchoolProof>;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

// === JADWAL MENU MINGGUAN (Weekly Menu Schedule) ===

/** Menu terklasifikasi per hari dalam seminggu */
export interface MbgDayMenu {
  dayOfWeek: number; // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  dayName: string; // "Senin", "Selasa", dll
  hewani: string; // e.g. "Ayam Goreng Lengkuas"
  sayur: string; // e.g. "Sayur Sop Wortel Buncis"
  buah: string; // e.g. "Pisang Ambon"
  nabati: string; // e.g. "Tempe Goreng Tepung"
  karbohidrat?: string; // e.g. "Nasi Putih"
  menuKeringan?: string; // e.g. "Roti Abon Kering"
  /** Multi-item arrays for categories with multiple dishes */
  hewaniItems?: string[];
  sayurItems?: string[];
  buahItems?: string[];
  nabatiItems?: string[];
  karbohidratItems?: string[];
  menuKeringanItems?: string[];
}

/** Konfigurasi Master Jadwal Menu Mingguan MBG */
export interface MbgWeeklyScheduleConfig {
  id: string;
  title: string;
  days: MbgDayMenu[];
  updatedAt: string;
  updatedBy: string;
}

// === SUB PURCHASING ===

/** Satu item belanja dalam tugas sub_purchasing */
export interface MbgSubPurchasingItem {
  bahanName: string;
  jumlah: number;
  satuan: string;
  hargaSatuan: number;
  totalHarga: number;
  keterangan: string;
  /** Foto bukti per bahan */
  photoUrl?: string;
  /** Status: belum_beli / sudah_beli */
  status: 'belum_beli' | 'sudah_beli';
}

/** Tugas belanja yang di-assign purchasing ke sub_purchasing */
export interface MbgSubPurchasingTask {
  id: string;
  batchId: string;
  /** ID Purchase Order asal */
  purchaseOrderId: string;
  /** Nama supplier asal PO */
  supplierName: string;
  /** UID sub_purchasing yang ditugaskan */
  assignedTo: string;
  /** Display name sub_purchasing */
  assignedToName: string;
  /** Daftar bahan yang harus dibelanjakan */
  items: MbgSubPurchasingItem[];
  /** Total pengeluaran sub_purchasing */
  totalPengeluaran: number;
  /** Status keseluruhan: pending / in_progress / completed */
  status: 'pending' | 'in_progress' | 'completed';
  /** Catatan dari purchasing */
  notes: string;
  assignedBy: string;
  assignedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface MbgPortionNutritionItem {
  menuName: string;
  rincianBahan: string;
  beratBersih: number;
  energi: number;
  protein: number;
  lemak: number;
  karbohidrat: number;
  serat: number;
}

export interface MbgPortionBahanItem {
  rincianBahan: string;
  hargaBahan: number;
  bddPercent: number;
  beratKotor: number;
  totalGml: number;
  sparePercent: number;
  kebutuhan: number;
  satuan: string;
  harga: number;
}

export interface MbgPortionBumbuItem {
  namaMenu: string;
  namaBumbu: string;
  hargaBumbu: number;
  kebutuhan: number;
  satuan: string;
  harga: number;
}

export interface MbgPortionDailyData {
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui';
  portionTitle: string;
  menuList: string[];
  nutritionItems: MbgPortionNutritionItem[];
  bahanItems: MbgPortionBahanItem[];
  bumbuItems: MbgPortionBumbuItem[];
  totalGizi: {
    beratBersih: number;
    energi: number;
    protein: number;
    lemak: number;
    karbohidrat: number;
    serat: number;
  };
  akgMetrics: Record<string, { percentMakanSiang: number; percentHarian: number }>;
  totalBelanjaBahan: number;
  hargaBahanPerPorsi: number;
  totalBelanjaBumbu: number;
  hargaBumbuPerPorsi: number;
  totalBelanjaOverall: number;
  hargaPerPorsiOverall: number;
}

export interface MbgPaketSehat3bReport {
  balitaCount: number;
  bumilBusuiCount: number;
  keringanItems: {
    item: string;
    qtyPcs: number;
    qty: number;
    satuan: string;
    hargaSatuan?: number;
    totalHarga?: number;
  }[];
}

export interface MbgPoReportRow {
  supplier: string;
  item: string;
  jamKedatangan: string;
  jumlah: number;
  satuan: string;
  keterangan: string;
}

export interface MbgRealisasiPembelianRow {
  tanggal: string;
  namaBahan: string;
  kuantitas: number;
  satuan: string;
  hargaPerUnit: number;
  totalHarga: number;
}

export interface MbgInspectionFormRow {
  jenisBahan: string;
  banyaknya: number;
  satuan: string;
  isSesuai: boolean;
  isBaik: boolean;
  notes?: string;
}

export interface MbgWasteLogRow {
  no: number;
  namaMakanan: string;
  kuantitas: number;
  satuan: string;
  dokumentasi?: string;
}

export interface MbgProductionDailyReport {
  id: string;
  batchId: string;
  tanggal: string;
  sheetDayName?: string; // e.g. "HARI 3"
  porsiKecil: MbgPortionDailyData;
  porsiBesar: MbgPortionDailyData;
  porsiBalita: MbgPortionDailyData;
  porsiBumilBusui: MbgPortionDailyData;
  paketSehat3b: MbgPaketSehat3bReport;
  poRows: MbgPoReportRow[];
  realisasiPembelianRows: MbgRealisasiPembelianRow[];
  totalPengeluaran: number;
  totalAnggaran: number;
  selisih: number;
  inspectionForm: {
    dari: string;
    kepada: string;
    waktu: string;
    noForm: string;
    rows: MbgInspectionFormRow[];
    officerName: string;
    officerTitle: string;
  };
  wasteLogs: MbgWasteLogRow[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
