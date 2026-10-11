import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { splitNotificationsByTab, type FirestoreNotification } from "@/services/notificationService";

const notif = (id: string, type: string): FirestoreNotification => ({
  id, type, recipientId: "uid", title: id, titleEn: id, message: "", messageEn: "",
  actorRole: "super_admin", read: false, createdAt: "2026-10-11T06:00:00.000Z",
});

describe("splitNotificationsByTab", () => {
  it("menampilkan task, job desk, dan MBG di tab pertama (sebelumnya hilang dari daftar)", () => {
    const { activity, info } = splitNotificationsByTab([
      notif("t", "task"), notif("j", "jobdesk"), notif("m", "mbg"), notif("o", "order"),
    ]);
    expect(activity.map((n) => n.id)).toEqual(["t", "j", "m", "o"]);
    expect(info).toEqual([]);
  });

  it("memisahkan pembayaran dan sistem ke tab Info", () => {
    const { activity, info } = splitNotificationsByTab([notif("p", "payment"), notif("s", "system"), notif("d", "delivery")]);
    expect(info.map((n) => n.id)).toEqual(["p", "s"]);
    expect(activity.map((n) => n.id)).toEqual(["d"]);
  });

  it("tidak membuang tipe yang belum dikenal", () => {
    const { activity, info } = splitNotificationsByTab([notif("x", "tipe_baru")]);
    expect(activity.length + info.length).toBe(1);
  });
});
