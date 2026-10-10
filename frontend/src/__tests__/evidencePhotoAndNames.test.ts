import { describe, expect, it } from "vitest";
import {
  ENCODE_STEPS, EVIDENCE_PHOTO_MAX_BYTES, EVIDENCE_PHOTO_MAX_CHARS, firstThatFits, formatBytes, prepareEvidencePhoto,
} from "@/utils/evidencePhoto";
import { accountNameHint, personName } from "@/utils/personName";
import { ALL_ROLES, KPI_EXCLUDED_ROLES, ROLE_PERMISSIONS } from "@/constants/roles";

describe("foto bukti", () => {
  it("menerima foto minimal 10 MB", () => {
    expect(EVIDENCE_PHOTO_MAX_BYTES).toBeGreaterThanOrEqual(10 * 1024 * 1024);
    expect(EVIDENCE_PHOTO_MAX_CHARS).toBeLessThan(900_000); // batas rules ad_hoc_tasks
  });

  it("memakai resolusi tertinggi yang ukurannya muat", async () => {
    const sizes = [2_000_000, 1_200_000, 700_000, 400_000];
    const tried: number[] = [];
    const result = await firstThatFits((step) => {
      tried.push(step.maxSide);
      return "x".repeat(sizes[tried.length - 1] ?? 100);
    });
    expect(result?.length).toBe(700_000);
    expect(tried).toEqual(ENCODE_STEPS.slice(0, 3).map((s) => s.maxSide));
  });

  it("null kalau semua langkah masih terlalu besar", async () => {
    expect(await firstThatFits(() => "x".repeat(EVIDENCE_PHOTO_MAX_CHARS + 1))).toBeNull();
  });

  it("menolak file di atas batas dan file bukan foto dengan pesan jelas", async () => {
    const big = new File(["x"], "besar.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: EVIDENCE_PHOTO_MAX_BYTES + 1 });
    await expect(prepareEvidencePhoto(big)).rejects.toThrow(/terlalu besar/);
    await expect(prepareEvidencePhoto(new File(["x"], "data.pdf", { type: "application/pdf" }))).rejects.toThrow(/harus berupa foto/);
  });

  it("format ukuran", () => {
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12,4 MB");
    expect(formatBytes(420 * 1024)).toBe("420 KB");
  });
});

describe("atas nama akun", () => {
  it("nama orang didahulukan, jatuh ke nama akun lalu email", () => {
    expect(personName({ holderName: "  Dwi Saputra ", displayName: "distributor" })).toBe("Dwi Saputra");
    expect(personName({ holderName: "", displayName: "distributor" })).toBe("distributor");
    expect(personName({ email: "a@x.id" })).toBe("a@x.id");
    expect(personName(null)).toBe("Tanpa Nama");
  });

  it("keterangan nama akun hanya muncul kalau berbeda", () => {
    expect(accountNameHint({ holderName: "Dwi", displayName: "distributor" })).toBe("distributor");
    expect(accountNameHint({ holderName: "Dwi", displayName: "Dwi" })).toBeNull();
    expect(accountNameHint({ displayName: "distributor" })).toBeNull();
  });
});

describe("role", () => {
  it("role purchasing sudah dihapus", () => {
    expect(ALL_ROLES as readonly string[]).not.toContain("purchasing_mbg");
    expect(ALL_ROLES as readonly string[]).not.toContain("sub_purchasing_mbg");
    expect(ROLE_PERMISSIONS).not.toHaveProperty("purchasing_mbg");
  });

  it("Performa Saya hanya untuk role yang bisa diberi task", () => {
    for (const [role, paths] of Object.entries(ROLE_PERMISSIONS)) {
      expect(paths.includes("/performance"), role).toBe(!KPI_EXCLUDED_ROLES.includes(role));
    }
  });
});
