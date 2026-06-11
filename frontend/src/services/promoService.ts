import { db } from "@/lib/firebase";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc } from "firebase/firestore";

export interface Promo {
  code: string; // doc ID
  discountType: "percentage" | "fixed";
  value: number;
  minPurchase: number;
  maxDiscount?: number;
  active: boolean;
  description?: string;
}

const SAMPLE_PROMOS: Promo[] = [
  {
    code: "MAHASISWA10",
    discountType: "percentage",
    value: 10,
    minPurchase: 50000,
    maxDiscount: 15000,
    active: true,
    description: "Promo khusus santri/mahasiswa. Diskon 10% s/d Rp 15.000 dengan min. belanja Rp 50.000."
  },
  {
    code: "KOPERASI50K",
    discountType: "fixed",
    value: 50000,
    minPurchase: 300000,
    active: true,
    description: "Voucher potongan langsung Rp 50.000 untuk pembelanjaan minimal Rp 300.000."
  },
  {
    code: "DISKONBARU",
    discountType: "percentage",
    value: 15,
    minPurchase: 20000,
    maxDiscount: 5000,
    active: true,
    description: "Diskon pengguna baru 15% s/d Rp 5.000 dengan min. belanja Rp 20.000."
  },
  {
    code: "EVENTBESAR",
    discountType: "fixed",
    value: 150000,
    minPurchase: 1000000,
    active: true,
    description: "Potongan Rp 150.000 khusus pesanan event besar dengan min. belanja Rp 1.000.000."
  }
];

export async function listPromos(): Promise<Promo[]> {
  const col = collection(db, "promos");
  const snap = await getDocs(col);

  // Seed sample promos if none exist, or if only the initial test promo is present
  if (snap.empty || snap.docs.length <= 1) {
    console.log("Seeding sample promos...");
    const seedPromises = SAMPLE_PROMOS.map(async (p) => {
      const docRef = doc(col, p.code);
      const existing = snap.docs.find(d => d.id === p.code);
      if (!existing) {
        await setDoc(docRef, {
          discountType: p.discountType,
          value: p.value,
          minPurchase: p.minPurchase,
          maxDiscount: p.maxDiscount || null,
          active: p.active,
          description: p.description || ""
        });
      }
    });
    await Promise.all(seedPromises);
    const freshSnap = await getDocs(col);
    return freshSnap.docs.map(d => ({ code: d.id, ...d.data() } as Promo));
  }

  return snap.docs.map(d => ({ code: d.id, ...d.data() } as Promo));
}

export async function savePromo(promo: Promo): Promise<void> {
  const codeFormatted = promo.code.toUpperCase().trim();
  const docRef = doc(db, "promos", codeFormatted);
  await setDoc(docRef, {
    discountType: promo.discountType,
    value: promo.value,
    minPurchase: promo.minPurchase || 0,
    maxDiscount: promo.maxDiscount || null,
    active: promo.active,
    description: promo.description || "",
  });
}

export async function deletePromo(code: string): Promise<void> {
  const docRef = doc(db, "promos", code.toUpperCase().trim());
  await deleteDoc(docRef);
}

export async function getPromo(code: string): Promise<Promo | null> {
  if (!code) return null;
  const docRef = doc(db, "promos", code.toUpperCase().trim());
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { code: snap.id, ...snap.data() } as Promo;
}
