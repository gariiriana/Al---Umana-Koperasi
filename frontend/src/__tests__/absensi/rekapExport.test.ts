import JSZip from "jszip";
import { Packer } from "docx";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { rekapFileName, rekapTables, summarizeRekap, type RekapMeta } from "@/absensi/export/rekapData";
import { buildRekapDocument } from "@/absensi/export/rekapDocx";
import { buildRekapWorkbook } from "@/absensi/export/rekapExcel";
import type { RekapRow } from "@/absensi/types";

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

const META: RekapMeta = {
  from: "2026-10-01",
  to: "2026-10-31",
  areaNames: ["SPPG Sukabumi Gunungguruh Kebonmanggu"],
  printedBy: "Admin Absensi",
  printedAt: wib("2026-10-31", "17:00"),
};

describe("summarizeRekap", () => {
  it("per karyawan urut nama; lupa_pulang dihitung tapi durasinya tidak", () => {
    expect(summarizeRekap(ROWS)).toEqual([
      { uid: "a", name: "Ahmad", hariHadir: 1, tidakClockOut: 0, totalMenit: 510 },
      { uid: "s", name: "Sari", hariHadir: 2, tidakClockOut: 1, totalMenit: 540 },
    ]);
  });
});

describe("rekapTables", () => {
  it("header persis, satu baris detail per shift, label status dan '-' untuk jam kosong", () => {
    const tables = rekapTables(ROWS);
    expect(tables.summary[0]).toEqual(["Nama", "Hari hadir", "Tidak clock out", "Total jam kerja"]);
    expect(tables.detail[0]).toEqual(["Tanggal", "Nama", "Clock in", "Clock out", "Durasi", "Status", "Area"]);
    expect(tables.detail).toHaveLength(ROWS.length + 1);

    const lupa = tables.detail.find((cells) => cells[5] === "Tidak clock out");
    expect(lupa).toBeDefined();
    expect(lupa?.[3]).toBe("-");
    expect(lupa?.[4]).toBe("-");

    const sari = tables.detailByEmployee.find((e) => e.name === "Sari");
    expect(sari?.rows[0]).toEqual(["Tanggal", "Clock in", "Clock out", "Durasi", "Status", "Area"]);
    expect(sari?.rows).toHaveLength(3);
  });
});

describe("export", () => {
  it("Excel: sheet Ringkasan dan Detail, baris Detail = rows + 1", () => {
    const workbook = buildRekapWorkbook(ROWS, META);
    expect(workbook.SheetNames).toEqual(["Ringkasan", "Detail"]);
    const detail = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Detail, { header: 1 });
    expect(detail).toHaveLength(ROWS.length + 1);
  });

  it("Word: zip valid, isi judul/nama/periode, halaman landscape", async () => {
    const buffer = await Packer.toBuffer(buildRekapDocument(ROWS, META));
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Rekap Absensi");
    expect(xml).toContain("Sari");
    expect(xml).toContain("Ahmad");
    expect(xml).toContain("Periode: 1 Oktober 2026 – 31 Oktober 2026");
    expect(xml).toContain('w:orient="landscape"');
  });

  it("nama file", () => {
    expect(rekapFileName("2026-10-01", "2026-10-31", "docx")).toBe("Rekap-Absensi_2026-10-01_2026-10-31.docx");
    expect(rekapFileName("2026-10-01", "2026-10-31", "xlsx")).toBe("Rekap-Absensi_2026-10-01_2026-10-31.xlsx");
  });
});
