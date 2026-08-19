import { describe, it, expect } from 'vitest';

describe('MBG Courier Task Matching Algorithm', () => {
  const isMatchingPetugas = (
    userDisplayName: string,
    userEmailHandle: string,
    userUid: string,
    selectedPetugasName: string,
    taskPetugasName?: string,
    taskPetugasId?: string,
    taskKenekName?: string,
    taskKenekId?: string
  ): boolean => {
    const targetPetugas = selectedPetugasName || userDisplayName || userEmailHandle;
    const tLower = targetPetugas.toLowerCase().trim();
    const uUid = (userUid || '').toLowerCase().trim();

    const userTokens: string[] = Array.from(
      new Set([
        ...userDisplayName.toLowerCase().split(/[\s,+/&|()_\-.]+/).filter((t: string) => t.length >= 2),
        ...userEmailHandle.toLowerCase().split(/[\s,+/&|()_\-.]+/).filter((t: string) => t.length >= 2),
        ...tLower.split(/[\s,+/&|()_\-.]+/).filter((t: string) => t.length >= 2),
      ])
    );

    const nLower = (taskPetugasName || '').toLowerCase().trim();
    const iLower = (taskPetugasId || '').toLowerCase().trim();
    const kLower = (taskKenekName || '').toLowerCase().trim();
    const kiLower = (taskKenekId || '').toLowerCase().trim();

    // 1. Direct UID match
    if (uUid && (iLower === uUid || kiLower === uUid || iLower.includes(uUid))) return true;

    // 2. Selected petugas exact / partial match
    if (selectedPetugasName) {
      if (nLower === tLower || kLower === tLower || nLower.includes(tLower) || tLower.includes(nLower)) return true;
      const targetTokens = tLower.split(/[\s,+/&|()_\-.]+/).filter((t: string) => t.length >= 2);
      if (targetTokens.some((tok: string) => nLower.includes(tok) || kLower.includes(tok))) return true;
    }

    // 3. User name / email match
    if (tLower && (nLower === tLower || kLower === tLower || nLower.includes(tLower) || tLower.includes(nLower))) return true;

    // 4. Token-level matching (e.g. "Dwi" in "Dwi & Wandi", "Andi" in "Andi & Dede")
    const allText = `${nLower} ${iLower} ${kLower} ${kiLower}`;
    if (userTokens.some((tok: string) => tok.length >= 3 && allText.includes(tok))) return true;

    return false;
  };

  it('matches exact name and email handle', () => {
    expect(isMatchingPetugas('Andi', 'andi', 'uid-andi', '', 'Andi', 'uid-andi')).toBe(true);
    expect(isMatchingPetugas('', 'andi', 'uid-andi', '', 'Andi Kurir', 'uid-andi')).toBe(true);
  });

  it('matches paired team names like "Andi & Dede" for courier Andi', () => {
    expect(isMatchingPetugas('Andi', 'andi', 'uid-andi', '', 'Andi & Dede')).toBe(true);
    expect(isMatchingPetugas('Dede', 'dede', 'uid-dede', '', 'Andi & Dede')).toBe(true);
  });

  it('matches paired team names like "Yusep & Erik" for courier Yusep and Kenek Erik', () => {
    expect(isMatchingPetugas('Yusep', 'yusep', 'uid-yusep', '', 'Yusep & Erik')).toBe(true);
    expect(isMatchingPetugas('Erik', 'erik', 'uid-erik', '', 'Yusep & Erik')).toBe(true);
    expect(isMatchingPetugas('Erik', 'erik', 'uid-erik', '', 'Yusep', 'uid-yusep', 'Erik', 'uid-erik')).toBe(true);
  });

  it('matches when admin explicit switcher is selected', () => {
    expect(isMatchingPetugas('Admin MBG', 'admin', 'uid-admin', 'Agus & Firdi', 'Agus & Firdi')).toBe(true);
    expect(isMatchingPetugas('Admin MBG', 'admin', 'uid-admin', 'Agus & Firdi', 'Agus', 'uid-agus', 'Firdi')).toBe(true);
  });

  it('does not match unrelated couriers', () => {
    expect(isMatchingPetugas('Budi', 'budi', 'uid-budi', '', 'Andi & Dede')).toBe(false);
  });
});
