import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  assessKpi, deadlineMillis, formatDeadline, formatDuration, summarizeTasks, taskKpiStatus, taskMonthKey,
} from '@/utils/taskKpi';
import { buildKpiWorkbook, uniqueSheetName } from '@/utils/kpiExcelExporter';
import type { AdHocTask } from '@/services/performanceService';

// 15 Okt 2026 17:00 WIB = 10:00 UTC
const DEADLINE = '2026-10-15T17:00';
const at = (iso: string) => ({ toMillis: () => Date.parse(iso) });
const now = Date.parse('2026-10-20T00:00:00+07:00');

const task = (id: string, deadline: string, submittedAt?: string, extra: Partial<AdHocTask> = {}): AdHocTask => ({
  id, assigneeId: 'u1', assigneeNameSnapshot: 'Dwi', roleSnapshot: 'distribusi_1', divisionSnapshot: 'katering',
  title: `Task ${id}`, instructions: 'Kerjakan', deadline, status: submittedAt ? 'submitted' : 'pending', createdBy: 'sa',
  ...(submittedAt ? { submittedAt: at(submittedAt) } : {}), ...extra,
});

describe('deadline & status KPI', () => {
  it('reads deadlines as WIB, with legacy date-only deadlines ending at 23:59 WIB', () => {
    expect(deadlineMillis(DEADLINE)).toBe(Date.parse('2026-10-15T10:00:00Z'));
    expect(deadlineMillis('2026-10-15')).toBe(Date.parse('2026-10-15T16:59:59Z'));
    expect(Number.isNaN(deadlineMillis(undefined))).toBe(true);
    expect(formatDeadline(DEADLINE)).toBe('15 Okt 2026 17:00 WIB');
  });

  it('classifies proses / terpenuhi / terlambat', () => {
    const before = Date.parse('2026-10-15T16:00:00+07:00');
    expect(taskKpiStatus(task('a', DEADLINE), before)).toBe('proses');
    expect(taskKpiStatus(task('b', DEADLINE, '2026-10-15T17:00:00+07:00'), now)).toBe('terpenuhi');
    expect(taskKpiStatus(task('c', DEADLINE, '2026-10-15T17:01:00+07:00'), now)).toBe('terlambat');
    // Lewat deadline tanpa submit = terlambat, dan tetap terlambat setelah submit
    expect(taskKpiStatus(task('d', DEADLINE), now)).toBe('terlambat');
  });

  it('puts a task in the month of its deadline', () => {
    expect(taskMonthKey(task('a', '2026-11-03T08:00'))).toBe('2026-11');
    expect(taskMonthKey({ deadline: undefined })).toBeNull();
  });

  it('formats durations', () => {
    expect(formatDuration(135)).toBe('2 jam 15 menit');
    expect(formatDuration(3000)).toBe('2 hari 2 jam');
    expect(formatDuration(0)).toBe('-');
  });
});

const tasks = [
  task('1', DEADLINE, '2026-10-15T09:00:00+07:00'), // terpenuhi
  task('2', DEADLINE, '2026-10-15T10:00:00+07:00'), // terpenuhi
  task('3', DEADLINE, '2026-10-15T19:00:00+07:00'), // terlambat 2 jam
  task('4', '2026-10-25T17:00'),                    // proses
];

describe('rekap & penilaian KPI', () => {
  it('summarises counts and percentages', () => {
    const s = summarizeTasks(tasks, now);
    expect(s).toMatchObject({ total: 4, proses: 1, terpenuhi: 2, terlambat: 1, terlambatSubmit: 1, belumSubmit: 0, dinilai: 3 });
    expect(s.pctTerpenuhi).toBe(50);
    expect(s.ketepatanWaktu).toBe(66.7);
    expect(s.avgLateMinutes).toBe(120);
  });

  it('scores on-time first: 70% ketepatan + 20% penyelesaian + 10% keterlambatan', () => {
    const a = assessKpi(summarizeTasks(tasks, now), 'Dwi', 'Oktober 2026');
    // 66.7×0.7 + 100×0.2 + (100 − 2/72×100)×0.1 = 46.69 + 20 + 9.72
    expect(a.nilai).toBe(76.4);
    expect(a.grade).toBe('B');
    expect(a.kesimpulan).toContain('Dwi menerima 4 task');
    expect(a.kesimpulan).toContain('1 task masih berjalan');
  });

  it('cannot grade a month with nothing due yet', () => {
    const a = assessKpi(summarizeTasks([task('4', '2026-10-25T17:00')], now), 'Dwi', 'Oktober 2026');
    expect(a.nilai).toBeNull();
    expect(a.grade).toBe('-');
  });

  it('gives D when tasks are left unsubmitted past the deadline', () => {
    const a = assessKpi(summarizeTasks([task('x', DEADLINE), task('y', DEADLINE)], now), 'Dwi', 'Oktober 2026');
    expect(a.nilai).toBe(0);
    expect(a.grade).toBe('D');
    expect(a.rekomendasi).toContain('2 task lewat deadline');
  });
});

describe('Excel per orang', () => {
  it('makes valid, unique sheet names', () => {
    const used = new Set<string>();
    expect(uniqueSheetName('Dwi', used)).toBe('Dwi');
    expect(uniqueSheetName('dwi', used)).toBe('dwi (2)');
    expect(uniqueSheetName('Ust. Joko [Produksi]: MBG/2', used)).toBe('Ust. Joko Produksi MBG 2');
    expect(uniqueSheetName('Hashifah Dzihniyah Zhafirah Produksi MBG', used)).toHaveLength(31);
  });

  it('creates one worksheet per person with the KPI assessment and task rows', () => {
    const wb = buildKpiWorkbook([
      { name: 'Wandi', role: 'Distribusi 2', tasks: [task('9', DEADLINE, '2026-10-14T08:00:00+07:00', { assigneeId: 'u2' })] },
      { name: 'Dwi', role: 'Distribusi 1', tasks },
    ], '2026-10', now);
    expect(wb.SheetNames).toEqual(['Dwi', 'Wandi']);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Dwi, { header: 1 });
    const find = (label: string) => rows.find((r) => r[0] === label);
    expect(find('Nama')?.[1]).toBe('Dwi');
    expect(find('Periode')?.[1]).toBe('Oktober 2026');
    expect(find('Nilai KPI')?.[3]).toBe(76.4);
    expect(find('Grade')?.[1]).toBe('B — Baik');
    expect(String(find('Kesimpulan')?.[1])).toContain('Nilai KPI 76.4');
    const header = rows.findIndex((r) => r[0] === 'No');
    expect(rows.slice(header + 1).map((r) => r[6])).toEqual(['Terpenuhi', 'Terpenuhi', 'Terlambat', 'Proses']);
  });
});
