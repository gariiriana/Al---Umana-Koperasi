import { describe, expect, it } from 'vitest';
import { hasSearchableSchools, matchArchiveBatch } from '@/lib/mbgArchiveSearch';

const batch = { institutionNames: ['SDN 1 Sukabumi', 'TK Melati', 'Posyandu Cempaka 7'], petugasList: ['Dwi', 'Wandi'] };

describe('archive search without reading PM rows', () => {
  it('finds a batch by part of a school name, in any letter case, and names the schools that matched', () => {
    expect(matchArchiveBatch(batch, 'cempaka')).toEqual({ institutions: ['Posyandu Cempaka 7'], couriers: [] });
  });

  it('finds a batch by its courier', () => {
    expect(matchArchiveBatch(batch, 'WAN')).toEqual({ institutions: [], couriers: ['Wandi'] });
  });

  it('leaves a batch out when neither a school nor a courier matches', () => {
    expect(matchArchiveBatch(batch, 'paud')).toBeNull();
  });

  it('treats batches saved before school names were stored as not yet searchable by school', () => {
    expect(hasSearchableSchools({ institutionNames: [] })).toBe(true);
    expect(hasSearchableSchools({})).toBe(false);
  });
});
