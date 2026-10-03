import type { MbgDeliveryTask, MbgPmEntry } from '@/types/mbg';

export interface CourierAccount {
  uid: string;
  name: string;
  email: string;
}

/** Names are for selection only; persisted assignments always use account UIDs. */
export function resolveCourierAccount(accounts: CourierAccount[], selection: string): CourierAccount {
  const value = selection.trim();
  const byUid = accounts.find((account) => account.uid === value);
  if (byUid) return byUid;
  const normalized = value.toLocaleLowerCase();
  const matches = normalized ? accounts.filter((account) =>
    account.name.trim().toLocaleLowerCase() === normalized ||
    account.email.trim().toLocaleLowerCase() === normalized ||
    account.email.split('@')[0].trim().toLocaleLowerCase() === normalized
  ) : [];
  if (matches.length !== 1) {
    throw new Error(matches.length > 1
      ? `Nama "${value}" cocok dengan beberapa akun. Pilih akun menggunakan email.`
      : `Akun kurir "${value}" belum ditemukan. Pilih akun kurir yang terdaftar.`);
  }
  return matches[0];
}

export function resolveMbgAssignment(accounts: CourierAccount[], courier: string, assistant = '') {
  let courierSelection = courier;
  let assistantSelection = assistant;
  // Legacy team labels use explicit separators, never substring matching.
  const team = courier.split(/\s*[&+/]\s*/).filter(Boolean);
  const isRegisteredTeam = accounts.some((account) => account.name.trim().toLocaleLowerCase() === courier.trim().toLocaleLowerCase());
  if (team.length === 2 && !isRegisteredTeam && !courier.includes('@')) {
    courierSelection = team[0];
    assistantSelection = assistant.trim() || team[1];
  }
  const petugas = resolveCourierAccount(accounts, courierSelection);
  const kenek = assistantSelection.trim() ? resolveCourierAccount(accounts, assistantSelection) : null;
  return {
    assignedPetugasId: petugas.uid,
    assignedPetugasName: petugas.name,
    assignedKenekId: kenek?.uid || '',
    assignedKenekName: kenek?.name || '',
  };
}

export function isMbgTaskAssignedTo(task: Pick<MbgDeliveryTask, 'petugasId' | 'kenekId'>, uid: string): boolean {
  return Boolean(uid && (task.petugasId === uid || task.kenekId === uid));
}

export function hasCompleteMbgProof(entry: Pick<MbgPmEntry,
  'photoMenuUrl' | 'photoPenerimaUrl' | 'photoSerahTerimaUrl' | 'photoSuratJalanUrl'>): boolean {
  return Boolean(entry.photoMenuUrl && entry.photoPenerimaUrl && entry.photoSerahTerimaUrl && entry.photoSuratJalanUrl);
}
