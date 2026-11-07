import { describe, expect, it, vi } from 'vitest';
import { copySourceOptions } from '@/lib/mbgCopySource';
import { decodeRestFields, runEqualityQuerySelect } from '@/utils/firestoreRest';
import type { MbgPmBatch } from '@/types/mbg';

const batch = (id: string, tanggal: string, totalJumlah: number, extra: Partial<MbgPmBatch> = {}) =>
  ({ id, tanggal, totalJumlah, status: 'DRAFT', ...extra }) as MbgPmBatch;

describe('copySourceOptions', () => {
  it('defaults to the latest batch before the delivery date, not a mistyped future year', () => {
    const options = copySourceOptions(
      [
        batch('typo', '2030-10-23', 7100),
        batch('today', '2026-11-07', 0),
        batch('kemarin', '2026-11-06', 2835),
        batch('lusa', '2026-11-05', 2800),
        batch('arsip', '2026-11-04', 2700, { isBackup: true }),
      ],
      '2026-11-07',
    );
    expect(options.defaultId).toBe('kemarin');
    expect(options.before.map((b) => b.id)).toEqual(['kemarin', 'lusa']);
    expect(options.after.map((b) => b.id)).toEqual(['typo']);
  });

  it('skips empty batches for the default and falls back to later dates only when nothing earlier exists', () => {
    expect(copySourceOptions([batch('kosong', '2026-11-06', 0), batch('isi', '2026-11-05', 100)], '2026-11-07').defaultId).toBe('isi');
    expect(copySourceOptions([batch('nanti', '2026-11-09', 100)], '2026-11-07').defaultId).toBe('nanti');
    expect(copySourceOptions([], '2026-11-07').defaultId).toBe('');
  });
});

describe('firestoreRest', () => {
  it('decodes REST values like the SDK would', () => {
    expect(decodeRestFields({
      n: { integerValue: '120' },
      d: { doubleValue: 1.5 },
      s: { stringValue: 'SDN 1' },
      b: { booleanValue: false },
      z: { nullValue: null },
      a: { arrayValue: { values: [{ stringValue: 'Nasi' }] } },
      e: { arrayValue: {} },
      m: { mapValue: { fields: { kelas: { stringValue: '1A' }, qt: { integerValue: '30' } } } },
    })).toEqual({ n: 120, d: 1.5, s: 'SDN 1', b: false, z: null, a: ['Nasi'], e: [], m: { kelas: '1A', qt: 30 } });
  });

  it('asks only for the selected fields and returns doc ids', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([
      { document: { name: 'projects/p/databases/(default)/documents/mbg_pm_entries/abc', fields: { jumlah: { integerValue: '9' } } } },
      { readTime: 'x' },
    ])));
    const rows = await runEqualityQuerySelect({
      projectId: 'p', idToken: 't', collectionId: 'mbg_pm_entries', field: 'batchId', value: 'b1',
      selectFields: ['jumlah'], fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(rows).toEqual([{ id: 'abc', jumlah: 9 }]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
    expect(JSON.parse(String(init.body)).structuredQuery.select.fields).toEqual([{ fieldPath: 'jumlah' }]);
  });

  it('throws on HTTP errors so the caller can fall back to the SDK', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 403 }));
    await expect(runEqualityQuerySelect({
      projectId: 'p', idToken: 't', collectionId: 'c', field: 'f', value: 'v', selectFields: ['a'],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(/403/);
  });
});
