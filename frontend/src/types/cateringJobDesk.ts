// ============================================================================
// Catering Job Desk Types (Excel Form Layout Compatible)
// ============================================================================

/** Operational division for job desks: Katering or MBG */
export type JobDeskDivision = 'katering' | 'mbg';

/** Status of a job desk item as set by the operational role. */
export type JobDeskStatus = 'pending' | 'complete' | 'incomplete';

/** Review status as set by CO_MO. */
export type JobDeskReviewStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected';

/** Operational roles that can be assigned job desks. */
export type JobDeskAssignableRole =
  | 'produksi_1'
  | 'distribusi_1'
  | 'produksi_2'
  | 'distribusi_2'
  | 'MBG2'
  | 'distribusi_mbg_2';

/** Short PIC names matching the excel layout. */
export type PicShortName =
  | 'Joko'
  | 'Dwi'
  | 'Shifa'
  | 'Wandi'
  | 'MBG2'
  | 'Distribusi2';

/** Display labels for assignable roles. */
export const JOBDESK_ROLE_LABELS: Record<JobDeskAssignableRole, string> = {
  produksi_1: 'Joko (Produksi 1 - Katering & MBG 2)',
  distribusi_1: 'Dwi (Distribusi 1 - Katering & MBG)',
  produksi_2: 'Shifa (Produksi 2 - Katering & Produksi MBG)',
  distribusi_2: 'Wandi (Distribusi 2 - Katering & MBG)',
  MBG2: 'Joko (Produksi MBG 2)',
  distribusi_mbg_2: 'Wandi (Distribusi 2)',
};

/** PIC details including account email and operational scope. */
export const PIC_ACCOUNT_DETAILS: Record<PicShortName, { name: string; email: string; roleLabel: string }> = {
  Joko: {
    name: 'Ust. Joko',
    email: 'ProduksiMBG2@alumana.id',
    roleLabel: 'Produksi MBG 2 & Produksi 1 (Katering)',
  },
  Shifa: {
    name: 'Hashifah Dzihniyah Zhafirah',
    email: 'ProduksiMBG@alumana.id',
    roleLabel: 'Produksi MBG & Produksi 2 (Katering)',
  },
  Dwi: {
    name: 'Dwi',
    email: 'distribusimbg@alumana.id',
    roleLabel: 'Distribusi MBG & Distribusi 1 (Katering)',
  },
  Wandi: {
    name: 'Wandi',
    email: 'Dstribusi2@alumana.id',
    roleLabel: 'Distribusi 2 (Katering & MBG)',
  },
  MBG2: {
    name: 'Ust. Joko',
    email: 'ProduksiMBG2@alumana.id',
    roleLabel: 'Produksi MBG 2',
  },
  Distribusi2: {
    name: 'Wandi',
    email: 'Dstribusi2@alumana.id',
    roleLabel: 'Distribusi 2 (Katering & MBG)',
  },
};

/** Mapping from short PIC name to role ID and vice versa. */
export const PIC_NAME_TO_ROLE: Record<PicShortName, JobDeskAssignableRole> = {
  Joko: 'produksi_1',
  Dwi: 'distribusi_1',
  Shifa: 'produksi_2',
  Wandi: 'distribusi_2',
  MBG2: 'MBG2',
  Distribusi2: 'distribusi_2',
};

export const ROLE_TO_PIC_NAME: Record<JobDeskAssignableRole, PicShortName> = {
  produksi_1: 'Joko',
  distribusi_1: 'Dwi',
  produksi_2: 'Shifa',
  distribusi_2: 'Wandi',
  MBG2: 'Joko',
  distribusi_mbg_2: 'Wandi',
};

/** Days of the week in Indonesian. */
export const HARI_OPTIONS = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
] as const;

export type HariIndo = typeof HARI_OPTIONS[number];

/** A single job desk item matching the Excel layout and operational review workflow. */
export interface CateringJobDesk {
  id: string;

  /** Operational division: 'katering' (default) or 'mbg' */
  division?: JobDeskDivision;

  // === Excel Column Fields ===
  /** Kolom A: Hari (e.g. "Jumat", "Sabtu") */
  hari: string;
  /** Kolom B: Tanggal (e.g. "2026-07-17" atau "17 July 2026") */
  tanggal: string;
  /** Kolom C: Start Time / Jam Mulai (e.g. "09.00", "04.30") */
  startTime: string;
  /** Kolom D: PIC (e.g. "Joko", "Dwi", "Shifa", "Wandi", "MBG2") */
  pic: PicShortName | string;
  /** Kolom E: Kegiatan (e.g. "Pesanan Usth Nur", "MBG SDN 01 Sukamaju") */
  kegiatan: string;
  /** Kolom F: Keterangan / Detail tugas (e.g. "3. Capcay 6 porsi", "120 porsi porsi kecil") */
  keterangan: string;
  /** Kolom G: Key ID (e.g. "CAT-20260717-044" atau "MBG-20260717-012") */
  keyId: string;

  // === System & Operational Fields ===
  /** Reference to the catering order ID (if linked to an admin order). */
  orderId?: string;
  /** Human-readable order label. */
  orderLabel?: string;

  // === MBG Linked Metadata (if division === 'mbg') ===
  /** Reference to MBG Batch ID */
  mbgBatchId?: string;
  /** Nama Institusi / Sekolah MBG (e.g. "SDN Sukamaju 01") */
  mbgInstitutionName?: string;
  /** Jumlah Total Porsi MBG */
  mbgPortionCount?: number;
  /** Tipe Menu / Porsi MBG (e.g. "Porsi Besar", "Porsi Kecil") */
  mbgMenuType?: string;

  /** The operational role this job desk is assigned to. */
  assignedRole: JobDeskAssignableRole;
  /** UID of MO who created this job desk. */
  assignedBy: string;
  /** Title / alias for kegiatan. */
  title: string;
  /** Description / alias for keterangan. */
  description: string;

  // === Submission by Operational Role ===
  /** Status set by the operational role: pending, complete (✅), incomplete (❌) */
  status: JobDeskStatus;
  /** Reason provided when marking as incomplete. */
  incompleteReason?: string;
  /** Timestamp when the operational role submitted their status. */
  submittedAt?: string;
  /** UID of the person who submitted the status. */
  submittedBy?: string;

  // === Review by CO_MO ===
  /** Review status set by CO_MO: not_submitted, pending_review, approved, rejected */
  reviewStatus: JobDeskReviewStatus;
  /** UID of CO_MO who reviewed. */
  reviewedBy?: string;
  /** Timestamp of review. */
  reviewedAt?: string;
  /** Remark from CO_MO when rejecting or giving notes. */
  rejectionRemark?: string;

  /** Firestore timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Helper to extract only YYYY-MM-DD from any date string / ISO datetime */
export function extractDateOnly(dateStr?: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('T')) return dateStr.split('T')[0];
  if (dateStr.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  return dateStr;
}

/** Helper to extract only HH:mm from any time string / ISO datetime */
export function extractTimeOnly(timeStr?: string, defaultTime = '07:00'): string {
  if (!timeStr) return defaultTime;
  let t = timeStr.trim();
  if (t.includes('T')) {
    t = t.split('T')[1];
  } else if (t.includes(' ')) {
    t = t.split(' ')[1];
  }
  // Remove trailing timezone info if present
  t = t.replace(/Z|[+-]\d{2}:?\d{2}$/, '');
  // If format is HH:mm or HH:mm:ss
  if (/^\d{1,2}:\d{2}/.test(t)) {
    const parts = t.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].slice(0, 2)}`;
  }
  // If format is HH.mm
  if (/^\d{1,2}\.\d{2}/.test(t)) {
    const parts = t.split('.');
    return `${parts[0].padStart(2, '0')}:${parts[1].slice(0, 2)}`;
  }
  return t || defaultTime;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/** Format date string into human readable Indonesian: e.g. "28 Juli 2026" */
export function formatIndoDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const cleanDate = extractDateOnly(dateStr);
  const parts = cleanDate.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 0 && m < 12) {
      return `${d} ${MONTH_NAMES_ID[m]} ${y}`;
    }
  }
  return cleanDate || '-';
}

/** Format time string cleanly: e.g. "22:30" */
export function formatIndoTime(timeStr?: string, fallback = '07:00'): string {
  return extractTimeOnly(timeStr, fallback);
}

/** Helper to generate auto Key ID like CAT-YYYYMMDD-001 or MBG-YYYYMMDD-001 */
export function generateKeyId(dateStr?: string, counter = 1, prefix = 'CAT'): string {
  const pfx = prefix.toUpperCase();
  const clean = extractDateOnly(dateStr);
  if (clean) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      const seq = String(counter).padStart(3, '0');
      return `${pfx}-${year}${month}${day}-${seq}`;
    }
  }
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = String(counter).padStart(3, '0');
  return `${pfx}-${year}${month}${day}-${seq}`;
}

/** Helper to calculate day name in Indonesian from date string */
export function getHariFromDate(dateStr: string): string {
  if (!dateStr) return '';
  const cleanDate = extractDateOnly(dateStr);
  const parts = cleanDate.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const days: HariIndo[] = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[dateObj.getDay()] || '';
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const days: HariIndo[] = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[d.getDay()] || '';
}

