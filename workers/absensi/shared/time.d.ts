// Types for time.js (shared by the absensi Worker and frontend).
export function workDateWIB(ms: number): string;
export function addDays(date: string, n: number): string;
export function minuteOfDayWIB(ms: number): number;
export function isLateClockIn(ms: number): boolean;
export function isShiftExpired(workDate: string, nowMs: number): boolean;
export function isLateClockOut(masukAt: number, nowMs: number): boolean;
