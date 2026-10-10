import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock("@/services/notificationWriter", () => ({ notifyQuietly: notify }));

import {
  canonicalJobDeskRole, formatTanggal, notifyJobDeskReviewed, notifyJobDeskSubmitted,
  notifyJobDesksAssigned, notifyTaskAssigned, notifyTaskSubmitted, setNotificationActorRole,
} from "@/services/flowNotifications";
import { describePlatform, sha256Hex } from "@/services/pushService";
import { ALL_ROLES } from "@/constants/roles";

import { ROLE_ALIASES } from "../../../workers/push/logic.js";

beforeEach(() => {
  notify.mockReset();
  setNotificationActorRole("mo_katering");
});

describe("notifikasi job desk", () => {
  it("role job desk lama dipetakan ke role kanonik", () => {
    expect(canonicalJobDeskRole("MBG2")).toBe("produksi_1");
    expect(canonicalJobDeskRole("distribusi_mbg_2")).toBe("distribusi_2");
    expect(canonicalJobDeskRole("produksi_2")).toBe("produksi_2");
  });

  it("MO menyimpan banyak job desk → satu notifikasi per role", () => {
    notifyJobDesksAssigned([
      { assignedRole: "produksi_1", tanggal: "2026-10-10", kegiatan: "Masak nasi" },
      { assignedRole: "MBG2", tanggal: "2026-10-10", kegiatan: "Goreng ayam" },
      { assignedRole: "distribusi_1", tanggal: "2026-10-11", kegiatan: "Antar ke aula" },
    ]);
    expect(notify).toHaveBeenCalledTimes(2);
    const [toProduksi, produksi] = notify.mock.calls[0];
    expect(toProduksi).toEqual(["produksi_1"]);
    expect(produksi.title).toBe("2 job desk baru dari MO");
    expect(produksi.message).toContain("Masak nasi dan 1 lainnya");
    expect(produksi.actorRole).toBe("mo_katering");
    expect(notify.mock.calls[1][0]).toEqual(["distribusi_1"]);
  });

  it("submit PIC → MO & CO-MO; review → PIC & MO", () => {
    notifyJobDeskSubmitted({ kegiatan: "Masak nasi", pic: "Joko" }, false, "gas habis");
    expect(notify.mock.calls[0][0]).toEqual(["mo_katering", "co_mo_katering"]);
    expect(notify.mock.calls[0][1].message).toContain("Tidak selesai: gas habis");
    notifyJobDeskReviewed({ kegiatan: "Masak nasi", assignedRole: "MBG2" }, false, "foto kurang");
    expect(notify.mock.calls[1][0]).toEqual(["produksi_1", "mo_katering"]);
    expect(notify.mock.calls[1][1].title).toBe("Job desk ditolak CO-MO");
  });
});

describe("notifikasi task Super Admin", () => {
  it("task baru ke pemilik task, submit ke super_admin", () => {
    notifyTaskAssigned("uid-joko", "Rekap stok", "2026-10-12T15:00");
    expect(notify.mock.calls[0][0]).toEqual(["uid-joko"]);
    expect(notify.mock.calls[0][1].link).toBe("/performance");
    notifyTaskSubmitted("Rekap stok", "Joko");
    expect(notify.mock.calls[1][0]).toEqual(["super_admin"]);
  });
});

describe("Worker push mengenal semua penerima", () => {
  it("setiap role penerima di aplikasi punya alias di Worker", () => {
    const recipients = [
      "admin", "tim_produksi", "distribusi", "super_admin", "mo_katering", "co_mo_katering",
      "produksi_1", "distribusi_1", "produksi_2", "distribusi_2",
      "admin_mbg", "produksi_mbg", "distribusi_mbg", "kurir_mbg",
    ];
    for (const r of recipients) expect(ROLE_ALIASES[r], r).toBeDefined();
  });

  it("semua role yang ada di aplikasi bisa dijangkau lewat minimal satu penerima", () => {
    const reachable = new Set(Object.values(ROLE_ALIASES).flat());
    for (const role of ALL_ROLES) expect(reachable.has(role), role).toBe(true);
  });
});

describe("helper perangkat", () => {
  it("platform & id perangkat", async () => {
    expect(describePlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(describePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(formatTanggal("bukan tanggal")).toBe("bukan tanggal");
  });
});
