import type { Me } from "@/absensi/types";

/** Halaman Tim terbuka untuk kepala unit, atau karyawan yang diberi izin lihat semua unit oleh admin. */
export const hasTeamAccess = (me: Pick<Me, "headOf" | "viewAllUnits"> | null | undefined) =>
  Boolean(me && ((me.headOf?.length ?? 0) > 0 || me.viewAllUnits));

/** Persetujuan hanya untuk kepala unit (unit yang dikepalai). */
export const canApproveTeam = (me: Pick<Me, "headOf"> | null | undefined) => (me?.headOf?.length ?? 0) > 0;
