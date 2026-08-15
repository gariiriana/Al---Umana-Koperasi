// ============================================================================
// Operational Seed Service — Sample Data Generator for Katering & MBG
// ============================================================================
// Populates Firestore with realistic sample catering orders and MBG batches
// for Manager Operational (MO) testing and demonstration.

import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MBG_MASTER_INSTITUTIONS } from "@/constants/mbgConstants";
import type { Order, OrderLineItem } from "@/types/order";
import type { MbgPmBatch, MbgPmEntry } from "@/types/mbg";

export async function seedOperationalData(userUid: string = "system-admin"): Promise<{
  ordersCount: number;
  batchesCount: number;
  entriesCount: number;
}> {
  const now = new Date();
  const getOffsetDateStr = (daysOffset: number): string => {
    const d = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  };

  const date0 = getOffsetDateStr(0); // Hari Ini
  const date1 = getOffsetDateStr(1); // Besok
  const date2 = getOffsetDateStr(2); // Lusa
  const date3 = getOffsetDateStr(3); // H+3

  // =========================================================================
  // 1. SEED CATERING ORDERS
  // =========================================================================
  const sampleOrders: Array<Partial<Order> & { id: string; items: OrderLineItem[] }> = [
    {
      id: `ord-scg-${date0}`,
      orderType: "event",
      institutionName: "PT Siam Cement Group (SCG)",
      customerName: "Bpk. Hendra Gunawan",
      recipientName: "Bpk. Hendra Gunawan",
      recipientPhone: "0812-3456-7890",
      recipientNotes: "Pengantaran masuk ke lobby utama gedung administrasi SCG, minta cap surat jalan.",
      eventDate: date0,
      deliveryTime: "09:30",
      deliveryAddress: "Jl. Pelabuhan II Km. 11, Cikembar, Sukabumi",
      status: "CONFIRMED",
      paymentStatus: "SUDAH_DIBAYAR",
      totalPrice: 4500000,
      items: [
        { itemId: "menu-1", itemName: "Nasi Box Ayam Bakar Madu Spesial", quantity: 150, unit: "box", price: 22000 },
        { itemId: "menu-2", itemName: "Snack Box Premium (Lemper + Risoles + Aqua)", quantity: 150, unit: "box", price: 8000 },
      ],
      foodDetails: "150 Nasi Box Ayam Bakar Madu + 150 Snack Box",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ord-disdik-${date0}`,
      orderType: "event",
      institutionName: "Dinas Pendidikan Kab. Sukabumi",
      customerName: "Ibu Hj. Rina Marlina",
      recipientName: "Ibu Hj. Rina Marlina",
      recipientPhone: "0857-1122-3344",
      recipientNotes: "Set meja prasmanan disiapkan di Aula Barat Gedung Pemda Cisaat.",
      eventDate: date0,
      deliveryTime: "11:30",
      deliveryAddress: "Kompleks Perkantoran Pemda Cisaat, Sukabumi",
      status: "CONFIRMED",
      paymentStatus: "SUDAH_DIBAYAR",
      totalPrice: 3200000,
      items: [
        { itemId: "menu-3", itemName: "Paket Prasmanan Nusantara Sapi Rendang", quantity: 80, unit: "porsi", price: 35000 },
        { itemId: "menu-4", itemName: "Buah Potong Segar + Puding Santan", quantity: 80, unit: "porsi", price: 5000 },
      ],
      foodDetails: "80 Porsi Prasmanan Sapi Rendang + Buah & Puding",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ord-ponpes-${date1}`,
      orderType: "event",
      institutionName: "Pesantren Modern Al-Umanaa",
      customerName: "Ust. Ahmad Syafi'i",
      recipientName: "Ust. Ahmad Syafi'i",
      recipientPhone: "0813-8899-7766",
      recipientNotes: "Kirim ke dapur asrama santri putra sebelum shalat Shubuh selesai.",
      eventDate: date1,
      deliveryTime: "06:15",
      deliveryAddress: "Kampus Asrama Putra Ponpes Al-Umanaa, Cikaret",
      status: "CONFIRMED",
      paymentStatus: "SUDAH_DIBAYAR",
      totalPrice: 3000000,
      items: [
        { itemId: "menu-5", itemName: "Nasi Uduk Betawi Komplit Telur Balado", quantity: 200, unit: "porsi", price: 15000 },
      ],
      foodDetails: "200 Porsi Nasi Uduk Komplit Telur Balado",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ord-wedding-${date2}`,
      orderType: "event",
      institutionName: "Pernikahan Ananda Rian & Salsa",
      customerName: "Bpk. H. Dedi Suryadi",
      recipientName: "Bpk. H. Dedi Suryadi",
      recipientPhone: "0819-0987-6543",
      recipientNotes: "Catering Resepsi Pernikahan lengkap pemanas & waiter service.",
      eventDate: date2,
      deliveryTime: "10:00",
      deliveryAddress: "Gedung Islamic Center Kota Sukabumi, Jl. Veteran No. 1",
      status: "CONFIRMED",
      paymentStatus: "SUDAH_DIBAYAR",
      totalPrice: 22500000,
      items: [
        { itemId: "menu-6", itemName: "Paket Buffet Wedding Exclusive (Daging Balado + Rolade Sapi)", quantity: 450, unit: "porsi", price: 45000 },
        { itemId: "menu-7", itemName: "Gubukan Es Doger Khas Sukabumi", quantity: 450, unit: "porsi", price: 5000 },
      ],
      foodDetails: "450 Porsi Buffet Wedding Exclusive + Gubukan Es Doger",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: `ord-klinik-${date3}`,
      orderType: "event",
      institutionName: "Klinik Pratama Al-Umanaa Medika",
      customerName: "dr. Farhan Malik",
      recipientName: "dr. Farhan Malik",
      recipientPhone: "0821-4455-6677",
      recipientNotes: "Menu bento diet sehat rendah kolesterol untuk staf medis shift pagi.",
      eventDate: date3,
      deliveryTime: "11:45",
      deliveryAddress: "Jl. Pelabuhan II Km. 10, Cikaret, Sukabumi",
      status: "CONFIRMED",
      paymentStatus: "SUDAH_DIBAYAR",
      totalPrice: 1200000,
      items: [
        { itemId: "menu-8", itemName: "Bento Ayam Panggang Rosemary + Sayur Panggang", quantity: 40, unit: "box", price: 30000 },
      ],
      foodDetails: "40 Box Bento Diet Sehat Staf Medis",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  for (const ord of sampleOrders) {
    await setDoc(doc(db, "orders", ord.id), {
      ...ord,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // =========================================================================
  // 2. SEED MBG BATCHES & PM ENTRIES
  // =========================================================================
  const sampleMbgBatches: Array<{
    batch: MbgPmBatch;
    institutions: typeof MBG_MASTER_INSTITUTIONS;
  }> = [
    {
      batch: {
        id: `batch-mbg-${date0}`,
        tanggal: date0,
        status: "PM_SUBMITTED",
        totalSiswaBalita: 2450,
        totalBumilBusui: 162,
        totalGuruKader: 240,
        totalPobiaNasi: 0,
        totalJumlah: 2852,
        petugasList: ["Dwi", "Wandi"],
        batchNotes: "Ayam Goreng Lengkuas, Sayur Sop Wortel Buncis, Tempe Goreng Tepung, Nasi Putih",
        createdBy: userUid,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      institutions: MBG_MASTER_INSTITUTIONS.slice(0, 10),
    },
    {
      batch: {
        id: `batch-mbg-${date1}`,
        tanggal: date1,
        status: "PM_SUBMITTED",
        totalSiswaBalita: 2180,
        totalBumilBusui: 127,
        totalGuruKader: 215,
        totalPobiaNasi: 0,
        totalJumlah: 2522,
        petugasList: ["Dwi", "Wandi"],
        batchNotes: "Daging Sapi Semur, Tumis Buncis Jagung, Tahu Bacem, Nasi Putih",
        createdBy: userUid,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      institutions: MBG_MASTER_INSTITUTIONS.slice(10, 19),
    },
    {
      batch: {
        id: `batch-mbg-${date2}`,
        tanggal: date2,
        status: "PM_SUBMITTED",
        totalSiswaBalita: 1950,
        totalBumilBusui: 140,
        totalGuruKader: 180,
        totalPobiaNasi: 0,
        totalJumlah: 2270,
        petugasList: ["Dwi", "Wandi"],
        batchNotes: "Telur Balado, Capcay Kuah Segar, Perkedel Tahu, Nasi Putih",
        createdBy: userUid,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      institutions: MBG_MASTER_INSTITUTIONS.slice(19, 27),
    },
  ];

  let totalEntriesCreated = 0;

  for (const item of sampleMbgBatches) {
    const batchRef = doc(db, "mbg_pm_batches", item.batch.id);
    await setDoc(batchRef, item.batch, { merge: true });

    for (let idx = 0; idx < item.institutions.length; idx++) {
      const inst = item.institutions[idx];
      const entryId = `entry-${item.batch.id}-${idx + 1}`;
      const entryRef = doc(db, "mbg_pm_entries", entryId);

      const assignedPetugas = idx % 2 === 0 ? "Dwi" : "Wandi";

      const pmEntry: MbgPmEntry = {
        id: entryId,
        batchId: item.batch.id,
        institutionName: inst.institutionName,
        institutionType: inst.institutionType,
        schoolLevel: inst.schoolLevel,
        qtSiswaBalita: inst.qtSiswaBalita,
        qtBumilBusui: inst.qtBumilBusui,
        qtBumil: inst.qtBumil || 0,
        qtBusui: inst.qtBusui || 0,
        qtGuruKader: inst.qtGuruKader,
        qtPobiaNasi: inst.qtPobiaNasi || 0,
        qtPorsiBalita: inst.qtPorsiBalita || 0,
        qtPorsiKecil: inst.qtPorsiKecil || 0,
        qtPorsiBesar: inst.qtPorsiBesar || 0,
        qtPorsiBumilBusui: inst.qtPorsiBumilBusui || 0,
        jumlah: inst.qtSiswaBalita + inst.qtBumilBusui + inst.qtGuruKader,
        jadwalPengantaran: inst.jadwalPengantaran || "06.00-08.30",
        assignedPetugasId: assignedPetugas.toLowerCase(),
        assignedPetugasName: assignedPetugas,
        assignedKenekName: "Karyawan Logistik",
        menuItems: item.batch.batchNotes.split(",").map((s) => s.trim()),
        menuKeringanItems: ["Roti Abon Kering", "Susu UHT"],
        isSekolahLibur: false,
        notes: `Rute Distribusi Wilayah ${idx % 2 === 0 ? "Utara" : "Selatan"} - Pelabuhan II`,
        address: `Kec. Gunungguruh / Cikembar, Kab. Sukabumi`,
        sortOrder: idx + 1,
        createdBy: userUid,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await setDoc(entryRef, pmEntry, { merge: true });
      totalEntriesCreated++;
    }
  }

  return {
    ordersCount: sampleOrders.length,
    batchesCount: sampleMbgBatches.length,
    entriesCount: totalEntriesCreated,
  };
}

export async function clearSampleOperationalData(): Promise<number> {
  const now = new Date();
  const getOffsetDateStr = (daysOffset: number): string => {
    const d = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  };

  const dates = [
    getOffsetDateStr(0),
    getOffsetDateStr(1),
    getOffsetDateStr(2),
    getOffsetDateStr(3),
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
    "2026-08-19",
  ];
  const orderPrefixes = ["ord-scg", "ord-disdik", "ord-ponpes", "ord-wedding", "ord-klinik"];

  let deletedCount = 0;
  for (const pfx of orderPrefixes) {
    for (const d of dates) {
      try {
        await deleteDoc(doc(db, "orders", `${pfx}-${d}`));
        deletedCount++;
      } catch {
        // ignore if not exists
      }
    }
  }

  for (const d of dates) {
    try {
      await deleteDoc(doc(db, "mbg_pm_batches", `batch-mbg-${d}`));
      for (let i = 1; i <= 30; i++) {
        await deleteDoc(doc(db, "mbg_pm_entries", `entry-batch-mbg-${d}-${i}`));
      }
    } catch {
      // ignore
    }
  }

  return deletedCount;
}
