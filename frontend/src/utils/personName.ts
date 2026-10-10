/**
 * Akun internal dipakai per role (mis. akun "distributor"), jadi nama akun belum
 * tentu nama orangnya. Super Admin mengisi `holderName` = atas nama siapa akun itu.
 */
export interface NamedAccount {
  holderName?: string;
  displayName?: string;
  email?: string;
}

/** Nama orang pemegang akun; jatuh ke nama akun / email kalau belum diisi. */
export function personName(account?: NamedAccount | null): string {
  return account?.holderName?.trim() || account?.displayName?.trim() || account?.email || "Tanpa Nama";
}

/** Nama akun asli, hanya kalau berbeda dengan nama orangnya (untuk keterangan kecil). */
export function accountNameHint(account?: NamedAccount | null): string | null {
  const holder = account?.holderName?.trim();
  const accountName = account?.displayName?.trim() || account?.email;
  return holder && accountName && accountName !== holder ? accountName : null;
}
