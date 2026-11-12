import JSZip from "jszip";
import { Packer } from "docx";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { rekapFileName, rekapTables, summarizeRekap, type RekapMeta } from "@/absensi/export/rekapData";
import { buildRekapDocument } from "@/absensi/export/rekapDocx";
import { buildRekapWorkbook } from "@/absensi/export/rekapExcel";
import type { AbsensiRequestView, RekapRow } from "@/absensi/types";

const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

function row(partial: Partial<RekapRow> & Pick<RekapRow, "uid" | "name" | "workDate" | "status">): RekapRow {
  return {
    shiftId: `${partial.uid}-${partial.workDate}`,
    masukAt: wib(partial.workDate, "07:00"),
    pulangAt: null,
    durationMin: null,
    areaName: "SPPG Sukabumi Gunungguruh Kebonmanggu",
    masukPhotoId: null,
    pulangPhotoId: null,
    ...partial,
  };
}

const ROWS: RekapRow[] = [
  row({ uid: "s", name: "Sari", workDate: "2026-10-01", status: "selesai", pulangAt: wib("2026-10-01", "16:00"), durationMin: 540 }),
  row({ uid: "s", name: "Sari", workDate: "2026-10-02", status: "lupa_pulang", durationMin: null }),
  row({ uid: "a", name: "Ahmad", workDate: "2026-10-01", status: "selesai", pulangAt: wib("2026-10-01", "15:30"), durationMin: 510 }),
];

const REQUESTS: AbsensiRequestView[] = [
  {
    id: "req-cuti-1",
    uid: "s",
    employeeName: "Sari",
    kind: "cuti",
    leaveType: "cuti",
    startDate: "2026-10-05",
    endDate: "2026-10-06",
    fromShift: null,
    toShift: null,
    partnerUid: null,
    partnerName: null,
    reason: "Acara keluarga",
    status: "approved",
    reviewedBy: "adm",
    reviewerName: "Admin",
    reviewedAt: wib("2026-10-04", "10:00"),
    reviewNote: "Disetujui",
    createdAt: wib("2026-10-04", "08:00"),
  },
  {
    id: "req-swap-1",
    uid: "a",
    employeeName: "Ahmad",
    kind: "pergantian_shift",
    leaveType: null,
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    fromShift: "Shift Pagi",
    toShift: "Shift Siang",
    partnerUid: "s",
    partnerName: "Sari",
    reason: "Tukar jadwal",
    status: "approved",
    reviewedBy: "adm",
    reviewerName: "Admin",
    reviewedAt: wib("2026-10-01", "06:00"),
    reviewNote: null,
    createdAt: wib("2026-10-01", "05:30"),
  },
];

const META: RekapMeta = {
  from: "2026-10-01",
  to: "2026-10-31",
  areaNames: ["SPPG Sukabumi Gunungguruh Kebonmanggu"],
  printedBy: "Admin Absensi",
  printedAt: wib("2026-10-31", "17:00"),
};

describe("summarizeRekap", () => {
  it("per karyawan urut nama; lupa_pulang, cuti, sakit, izin, dan pergantian shift dihitung rapi", () => {
    expect(summarizeRekap(ROWS, REQUESTS, { from: META.from, to: META.to })).toEqual([
      {
        uid: "a",
        name: "Ahmad",
        hariHadir: 1,
        cuti: 0,
        sakit: 0,
        izin: 0,
        silah: 0,
        tidakClockOut: 0,
        pergantianShift: 1,
        totalMenit: 510,
      },
      {
        uid: "s",
        name: "Sari",
        hariHadir: 2,
        cuti: 2,
        sakit: 0,
        izin: 0,
        silah: 0,
        tidakClockOut: 1,
        pergantianShift: 0,
        totalMenit: 540,
      },
    ]);
  });
});

describe("rekapTables", () => {
  it("header persis, menggabungkan shift dan hari cuti disetujui serta info pergantian shift", () => {
    const tables = rekapTables(ROWS, REQUESTS, { from: META.from, to: META.to });
    expect(tables.summary[0]).toEqual([
      "Nama",
      "Hari hadir",
      "Cuti",
      "Sakit",
      "Izin",
      "Silah",
      "Tidak clock out",
      "Pergantian shift",
      "Total jam kerja",
    ]);
    expect(tables.detail[0]).toEqual([
      "Tanggal",
      "Nama",
      "Clock in",
      "Clock out",
      "Durasi",
      "Status",
      "Area / Keterangan",
    ]);
    // 3 baris shift + 2 hari cuti Sari (5 & 6 Okt) + 1 baris header = 6
    expect(tables.detail).toHaveLength(6);

    const lupa = tables.detail.find((cells) => cells[5] === "Tidak clock out");
    expect(lupa).toBeDefined();
    expect(lupa?.[3]).toBe("-");
    expect(lupa?.[4]).toBe("-");

    const ahmadRow = tables.detail.find((cells) => cells[1] === "Ahmad");
    expect(ahmadRow?.[6]).toContain("Shift: Shift Pagi → Shift Siang (rekan: Sari)");

    const sari = tables.detailByEmployee.find((e) => e.name === "Sari");
    expect(sari?.rows[0]).toEqual(["Tanggal", "Clock in", "Clock out", "Durasi", "Status", "Area / Keterangan"]);
    expect(sari?.rows).toHaveLength(5); // header + 2 shift + 2 hari cuti
  });
});

describe("silah", () => {
  // Ahmad Silah Jumat sampai 7 Okt, mulai 8 Okt ganti Sabtu. Sari Silah Senin (5 Okt) bertabrakan dengan cutinya.
  const SILAH = [
    { uid: "a", name: "Ahmad", effectiveFrom: "2026-09-01", days: [5] },
    { uid: "a", name: "Ahmad", effectiveFrom: "2026-10-08", days: [6] },
    { uid: "s", name: "Sari", effectiveFrom: "2026-09-01", days: [1] },
    { uid: "w", name: "Wandi", effectiveFrom: "2026-09-01", days: [4] },
  ];
  const range = { from: "2026-10-01", to: "2026-10-31", silah: SILAH, today: "2026-10-10" };

  it("menghitung hari Silah sampai hari ini, memakai jadwal yang berlaku di tiap tanggal", () => {
    const summary = summarizeRekap(ROWS, REQUESTS, range);
    const ahmad = summary.find((s) => s.uid === "a");
    const sari = summary.find((s) => s.uid === "s");
    const wandi = summary.find((s) => s.uid === "w");
    // Jumat 2 Okt (jadwal lama) + Sabtu 10 Okt (jadwal baru); Jumat 9 Okt bukan Silah lagi, 17 Okt dst. belum terjadi.
    expect(ahmad?.silah).toBe(2);
    expect(sari?.silah).toBe(1); // Senin 5 Okt
    expect(sari?.cuti).toBe(1); // cuti 5–6 Okt, 5 Okt sudah Silah → hanya 6 Okt
    // Wandi tidak punya shift maupun pengajuan, tetap muncul karena ada Silah (Kamis 1 & 8 Okt).
    expect(wandi?.silah).toBe(2);
    expect(wandi?.hariHadir).toBe(0);
  });

  it("baris Silah di rincian, dan clock in di hari Silah diberi catatan", () => {
    const rows = [...ROWS, row({ uid: "w", name: "Wandi", workDate: "2026-10-08", status: "selesai", durationMin: 480 })];
    const tables = rekapTables(rows, REQUESTS, range);
    const silahRows = tables.detail.filter((cells) => cells[5] === "Silah");
    expect(silahRows.map((cells) => cells[1]).sort()).toEqual(["Ahmad", "Ahmad", "Sari", "Wandi"]);
    expect(silahRows.every((cells) => cells[6] === "Libur mingguan")).toBe(true);
    const wandiMasuk = tables.detail.find((cells) => cells[1] === "Wandi" && cells[5] !== "Silah");
    expect(wandiMasuk?.[6]).toContain("Masuk di hari Silah");
    expect(summarizeRekap(rows, REQUESTS, range).find((s) => s.uid === "w")?.silah).toBe(1);
  });

  it("tanpa jadwal Silah rekap tidak berubah", () => {
    expect(rekapTables(ROWS, REQUESTS, { from: META.from, to: META.to }).detail).toHaveLength(6);
  });
});

describe("export", () => {
  it("Excel: sheet Ringkasan dan Detail memuat shift + pengajuan cuti disetujui", () => {
    const workbook = buildRekapWorkbook(ROWS, META, REQUESTS);
    expect(workbook.SheetNames).toEqual(["Ringkasan", "Detail"]);
    const detail = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Detail, { header: 1 });
    expect(detail).toHaveLength(6);
  });

  it("Word: zip valid, isi judul/nama/periode/cuti, halaman landscape", async () => {
    const buffer = await Packer.toBuffer(buildRekapDocument(ROWS, META, REQUESTS));
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Rekap Absensi");
    expect(xml).toContain("Sari");
    expect(xml).toContain("Ahmad");
    expect(xml).toContain("Acara keluarga");
    expect(xml).toContain("Periode: 1 Oktober 2026 – 31 Oktober 2026");
    expect(xml).toContain('w:orient="landscape"');
  });

  it("nama file", () => {
    expect(rekapFileName("2026-10-01", "2026-10-31", "docx")).toBe("Rekap-Absensi_2026-10-01_2026-10-31.docx");
    expect(rekapFileName("2026-10-01", "2026-10-31", "xlsx")).toBe("Rekap-Absensi_2026-10-01_2026-10-31.xlsx");
  });
});
