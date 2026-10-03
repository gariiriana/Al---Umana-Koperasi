import { describe, it, expect } from 'vitest';
import { hasCompleteMbgProof, isMbgTaskAssignedTo, resolveCourierAccount, resolveMbgAssignment } from '@/lib/mbgCourierAssignment';

const accounts = [
  { uid: 'UID-Andi', name: 'Andi', email: 'andi@example.test' },
  { uid: 'UID-Wandi', name: 'Wandi', email: 'wandi@example.test' },
];

describe('MBG courier identity and evidence', () => {
  it('does not confuse Andi and Wandi or fall back to names for a different UID', () => {
    expect(isMbgTaskAssignedTo({ petugasId: 'UID-Wandi', kenekId: '' }, 'UID-Andi')).toBe(false);
    expect(isMbgTaskAssignedTo({ petugasId: 'UID-Andi' }, 'uid-andi')).toBe(false);
  });
  it('lets an assigned assistant access the same task', () => {
    expect(isMbgTaskAssignedTo({ petugasId: 'UID-Andi', kenekId: 'UID-Wandi' }, 'UID-Wandi')).toBe(true);
  });
  it('keeps blank assistant fields empty instead of selecting the first account', () => {
    expect(resolveMbgAssignment(accounts, 'Andi', '  ')).toEqual({
      assignedPetugasId: 'UID-Andi', assignedPetugasName: 'Andi', assignedKenekId: '', assignedKenekName: '',
    });
  });
  it('resolves exact UID, name, email and handle to registered account UIDs', () => {
    for (const selection of ['UID-Wandi', ' Wandi ', 'wandi@example.test', 'wandi']) {
      expect(resolveCourierAccount(accounts, selection).uid).toBe('UID-Wandi');
    }
  });
  it('repairs explicit legacy team labels using two registered account UIDs', () => {
    expect(resolveMbgAssignment(accounts, 'Andi & Wandi')).toEqual({
      assignedPetugasId: 'UID-Andi', assignedPetugasName: 'Andi', assignedKenekId: 'UID-Wandi', assignedKenekName: 'Wandi',
    });
    expect(() => resolveMbgAssignment(accounts, 'Andi & Tidak Ada')).toThrow('belum ditemukan');
  });
  it('rejects missing or partial names instead of inventing UIDs', () => {
    expect(() => resolveMbgAssignment(accounts, 'And')).toThrow('belum ditemukan');
    expect(() => resolveMbgAssignment(accounts, 'Andi', 'Tidak Ada')).toThrow('belum ditemukan');
  });
  it('rejects ambiguous names but allows an explicit email', () => {
    const duplicates = [...accounts, { uid: 'UID-Andi2', name: 'Andi', email: 'andi2@example.test' }];
    expect(() => resolveCourierAccount(duplicates, 'Andi')).toThrow('beberapa akun');
    expect(resolveCourierAccount(duplicates, 'andi2@example.test').uid).toBe('UID-Andi2');
  });
  it('requires all four evidence photos, including the empty container photo', () => {
    const proof = { photoMenuUrl: 'menu', photoSerahTerimaUrl: 'handover', photoSuratJalanUrl: 'letter', photoPenerimaUrl: '' };
    expect(hasCompleteMbgProof(proof)).toBe(false);
    expect(hasCompleteMbgProof({ ...proof, photoPenerimaUrl: 'container' })).toBe(true);
  });
});
