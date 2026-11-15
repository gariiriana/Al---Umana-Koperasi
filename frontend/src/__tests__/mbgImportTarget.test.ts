import { describe, expect, it } from "vitest";
import { parseSheetNameToDate, sheetDateMismatch } from "@/utils/mbgImportTarget";

describe("parseSheetNameToDate", () => {
  it("reads the tab name formats used in the MBG spreadsheets", () => {
    expect(parseSheetNameToDate("21112026")).toBe("2026-11-21");
    expect(parseSheetNameToDate("2026-11-21")).toBe("2026-11-21");
    expect(parseSheetNameToDate("1/10/2026")).toBe("2026-10-01");
    expect(parseSheetNameToDate("011026")).toBe("2026-10-01");
  });

  it("returns null for a tab name that is not a date", () => {
    expect(parseSheetNameToDate("21")).toBeNull();
    expect(parseSheetNameToDate("Penerima Manfaat")).toBeNull();
    expect(parseSheetNameToDate("")).toBeNull();
  });
});

describe("sheetDateMismatch", () => {
  it("is null when the tab is for the selected batch", () => {
    expect(sheetDateMismatch("21112026", "2026-11-21")).toBeNull();
  });

  it("returns the tab date when the tab is for another day, so the user is asked first", () => {
    expect(sheetDateMismatch("20112026", "2026-11-21")).toBe("2026-11-20");
    expect(sheetDateMismatch("01102026", "2026-11-01")).toBe("2026-10-01");
  });

  it("is null when the tab name carries no date (nothing to compare)", () => {
    expect(sheetDateMismatch("21", "2026-11-21")).toBeNull();
  });
});
