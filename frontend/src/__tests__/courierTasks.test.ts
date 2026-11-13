import { describe, expect, it } from "vitest";
import { buildCourierTaskList, kateringStatusLabel, MBG_STATUS_LABEL } from "@/lib/courierTasks";
import type { MbgDeliveryTask } from "@/types/mbg";
import type { Order } from "@/types/order";

const ME = "uid-kurir";
const TODAY = "2026-11-13";

const task = (over: Partial<MbgDeliveryTask>): MbgDeliveryTask => ({
  id: "t1", batchId: "b13", petugasId: ME, petugasName: "Kurir", kenekId: "", kenekName: "",
  entryIds: ["s1", "s2", "s3"], totalPorsi: 420, handoverPhotoId: "", handoverAt: "", status: "waiting",
  deliveryPhotos: [], completedAt: "", createdAt: "", updatedAt: "", ...over,
});

const order = (over: Partial<Order>): Order => ({
  id: "o1", institutionName: "Bu Ani", customerName: "", recipientName: "Ani", eventDate: "2026-11-13",
  deliveryTime: "12:00", deliveryAddress: "Jl. Mawar 1", status: "READY_TO_DELIVER", assignedCourierId: ME,
  ...over,
} as Order);

const batchDates = { b11: "2026-11-11", b12: "2026-11-12", b13: "2026-11-13", b14: "2026-11-14" };

const build = (over: { orders?: Order[]; mbgTasks?: MbgDeliveryTask[] }) =>
  buildCourierTaskList({ uid: ME, today: TODAY, orders: [], mbgTasks: [], batchDates, ...over });

describe("kartu Tugas Saya", () => {
  it("includes kenek tasks", () => {
    const [card] = build({ mbgTasks: [task({ petugasId: "orang-lain", kenekId: ME })] });
    expect(card.kind).toBe("mbg");
    expect(card.detail).toBe("3 sekolah · 420 porsi · sebagai Kenek");
  });

  it("drops MBG batches outside yesterday..tomorrow", () => {
    const cards = build({ mbgTasks: ["b11", "b12", "b13", "b14"].map((batchId) => task({ id: batchId, batchId })) });
    expect(cards.map((card) => card.key)).toEqual(["mbg:b12", "mbg:b13", "mbg:b14"]);
  });

  it("drops tasks of other couriers", () => {
    const cards = build({
      mbgTasks: [task({ petugasId: "orang-lain" })],
      orders: [order({ assignedCourierId: "orang-lain" })],
    });
    expect(cards).toEqual([]);
  });

  it("katering: active any date plus delivered today only", () => {
    const cards = build({
      orders: [
        order({ id: "future", eventDate: "2026-11-20" }),
        order({ id: "kemarin", status: "COMPLETED", deliveredAt: "2026-11-12T10:00:00Z" }),
        order({ id: "tadi", status: "COMPLETED", deliveredAt: "2026-11-13T03:00:00Z" }),
        order({ id: "batal", status: "FAILED" }),
      ],
    });
    expect(cards.map((card) => [card.key, card.done])).toEqual([["katering:future", false], ["katering:tadi", true]]);
  });

  it("sorts unfinished first, then by sortTime", () => {
    const cards = build({
      mbgTasks: [task({ id: "selesai", status: "delivered" }), task({ id: "besok", batchId: "b14" })],
      orders: [order({ id: "siang", deliveryTime: "12:00" }), order({ id: "pagi", deliveryTime: "06:30" })],
    });
    expect(cards.map((card) => card.key)).toEqual(["katering:pagi", "katering:siang", "mbg:besok", "mbg:selesai"]);
  });

  it("links each card to the page that does the work", () => {
    const [mbg, katering] = build({ mbgTasks: [task({ batchId: "b12" })], orders: [order({ id: "o1" })] });
    expect(mbg.href).toBe("/mbg/delivery?batch=b12");
    expect(katering.href).toBe("/distribusi/delivery?order=o1");
  });

  it("shows the place, date, time and address of a catering order", () => {
    const [card] = build({ orders: [order({})] });
    expect(card.title).toBe("Bu Ani");
    expect(card.detail).toContain("12:00");
    expect(card.detail).toContain("Jl. Mawar 1");
    expect(card.statusLabel).toBe("Siap diambil");
  });

  it("uses plain Indonesian status words", () => {
    expect(MBG_STATUS_LABEL.waiting).toBe("Belum serah terima");
    expect(MBG_STATUS_LABEL.delivered).toBe("Selesai");
    expect(kateringStatusLabel("OUT_FOR_DELIVERY")).toBe("Sedang diantar");
    expect(kateringStatusLabel("IN_PRODUCTION")).toBe("Masih diproduksi");
  });
});
