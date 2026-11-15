import { describe, expect, it } from "vitest";
import { batchToShowAfterImport, defaultImportTargetOption } from "@/utils/mbgImportTarget";

describe("defaultImportTargetOption", () => {
  it("imports into the open batch by default (Pesanan Bahan and Laporan Harian alike)", () => {
    expect(defaultImportTargetOption()).toBe("current_batch");
  });
});

describe("batchToShowAfterImport", () => {
  it("keeps the batch the user had open (21 Nov) even when the data went to another batch (20 Nov)", () => {
    expect(batchToShowAfterImport("batch-21", "batch-20")).toBe("batch-21");
  });

  it("stays on the open batch when the data went into it", () => {
    expect(batchToShowAfterImport("batch-21", "batch-21")).toBe("batch-21");
  });

  it("opens the imported batch when no batch was open", () => {
    expect(batchToShowAfterImport(null, "batch-20")).toBe("batch-20");
    expect(batchToShowAfterImport(undefined, "batch-20")).toBe("batch-20");
  });
});
