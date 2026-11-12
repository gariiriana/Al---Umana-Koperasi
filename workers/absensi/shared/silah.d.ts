// Types for silah.js (shared by the absensi Worker and frontend).
export interface SilahHistoryEntry {
  /** `YYYY-MM-DD`, jadwal berlaku mulai tanggal ini. */
  effectiveFrom: string;
  /** 0 = Minggu … 6 = Sabtu. */
  days: number[];
}

export const SILAH_DAY_NAMES: readonly string[];
export const SILAH_DAY_ORDER: readonly number[];
export const MAX_SILAH_DAYS: number;
export function weekdayOf(date: string): number;
export function parseSilahDays(text: string | null | undefined): number[];
export function normalizeSilahDays(days: unknown): number[] | null;
export function silahDaysOn(history: readonly SilahHistoryEntry[], date: string): number[];
export function groupSilahHistory(
  rows: readonly { uid: string; effective_from: string; days: string }[],
): Map<string, SilahHistoryEntry[]>;
export function isSilahOn(history: readonly SilahHistoryEntry[], date: string): boolean;
export function formatSilahDays(days: readonly number[]): string;
