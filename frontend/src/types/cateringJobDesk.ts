// ============================================================================
// Catering Job Desk Types (Excel Form Layout Compatible)
// ============================================================================

/** Status of a job desk item as set by the operational role. */
export type JobDeskStatus = 'pending' | 'complete' | 'incomplete';

/** Review status as set by CO_MO. */
export type JobDeskReviewStatus = 'not_submitted' | 'pending_review' | 'approved' | 'rejected';

/** Operational roles that can be assigned job desks. */
export type JobDeskAssignableRole = 'produksi_1' | 'distribusi_1' | 'produksi_2' | 'distribusi_2';

/** Short PIC names matching the excel layout. */
export type PicShortName = 'Joko' | 'Dwi' | 'Shifa' | 'Wandi';

/** Display labels for assignable roles. */
export const JOBDESK_ROLE_LABELS: Record<JobDeskAssignableRole, string> = {
  produksi_1: 'Joko (Produksi 1)',
  distribusi_1: 'Dwi (Distribusi 1)',
  produksi_2: 'Shifa (Produksi 2)',
  distribusi_2: 'Wandi (Distribusi 2)',
};

/** Mapping from short PIC name to role ID and vice versa. */
export const PIC_NAME_TO_ROLE: Record<PicShortName, JobDeskAssignableRole> = {
  Joko: 'produksi_1',
  Dwi: 'distribusi_1',
  Shifa: 'produksi_2',
  Wandi: 'distribusi_2',
};

export const ROLE_TO_PIC_NAME: Record<JobDeskAssignableRole, PicShortName> = {
  produksi_1: 'Joko',
  distribusi_1: 'Dwi',
  produksi_2: 'Shifa',
  distribusi_2: 'Wandi',
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

  // === Excel Column Fields ===
  /** Kolom A: Hari (e.g. "Jumat", "Sabtu") */
  hari: string;
  /** Kolom B: Tanggal (e.g. "2026-07-17" atau "17 July 2026") */
  tanggal: string;
  /** Kolom C: Start Time / Jam Mulai (e.g. "09.00", "04.30") */
  startTime: string;
  /** Kolom D: PIC (e.g. "Joko", "Dwi", "Shifa", "Wandi") */
  pic: PicShortName | string;
  /** Kolom E: Kegiatan (e.g. "Pesanan Usth Nur", "Laporan produksi sarapan") */
  kegiatan: string;
  /** Kolom F: Keterangan / Detail tugas (e.g. "3. Capcay 6 porsi", "120 porsi nasi (21 kg)") */
  keterangan: string;
  /** Kolom G: Key ID (e.g. "CAT-20260717-044") */
  keyId: string;

  // === System & Operational Fields ===
  /** Reference to the catering order ID (if linked to an admin order). */
  orderId?: string;
  /** Human-readable order label. */
  orderLabel?: string;
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

/** Helper to generate auto Key ID like CAT-YYYYMMDD-001 */
export function generateKeyId(dateStr?: string, counter = 1): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  const month = String(isNaN(d.getMonth()) ? new Date().getMonth() + 1 : d.getMonth() + 1).padStart(2, '0');
  const day = String(isNaN(d.getDate()) ? new Date().getDate() : d.getDate()).padStart(2, '0');
  const seq = String(counter).padStart(3, '0');
  return `CAT-${year}${month}${day}-${seq}`;
}

/** Helper to calculate day name in Indonesian from date string */
export function getHariFromDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const days: HariIndo[] = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[d.getDay()] || '';
}
