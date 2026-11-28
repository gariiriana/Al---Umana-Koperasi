import { createContext, useContext } from "react";

/**
 * Tab Hari Ini / Rekap / Silah / foto dipakai admin absensi ("admin", semua karyawan) dan kepala unit di
 * halaman Tim ("tim", hanya anggota timnya, disaring Worker). Default "admin".
 */
export type AbsensiScope = "admin" | "tim";

export const AbsensiScopeContext = createContext<AbsensiScope>("admin");

export const useAbsensiScope = () => useContext(AbsensiScopeContext);
