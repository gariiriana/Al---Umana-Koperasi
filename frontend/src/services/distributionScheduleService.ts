import { db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";

export interface DistributionSchedule {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "04.00"
  title: string; // e.g. "Makan Pagi Pimpinan & Mahad"
  destination: string; // e.g. "Math'am & Area Santri"
  notes?: string;
  createdAt: string;
}

const SAMPLE_SCHEDULES = [
  { date: "2026-06-05", time: "04.00", title: "Makan Pagi Pimpinan & Mahad (Catering/MBG)", destination: "Math'am & Area Santri", notes: "" },
  { date: "2026-06-05", time: "07.00", title: "Indocafe, Paket Buah Utk Pimpinan (Catering)", destination: "10B", notes: "" },
  { date: "2026-06-05", time: "07.00", title: "Lemper, Risol Mayo dll (Bakery)", destination: "10B", notes: "" },
  { date: "2026-06-05", time: "08.00", title: "Snack Pagi Pimpinan (Catering)", destination: "Math'am", notes: "" },
  { date: "2026-06-05", time: "08.00", title: "10 Paket Snack Box (Bakery)", destination: "SCG (MD Office)", notes: "" },
  { date: "2026-06-05", time: "11.00", title: "Makan siang Mahad & Pimpinan (Catering)", destination: "Math'am & Area Santri", notes: "" },
  { date: "2026-06-05", time: "11.00", title: "Tempe, Kerupuk (catering)", destination: "10B", notes: "" },
  { date: "2026-06-05", time: "12.00", title: "Snack siang Pimpinan (Catering)", destination: "Math'am", notes: "" },
  { date: "2026-06-05", time: "14.00", title: "Makan Sore Mahad & Pimpinan (Catering)", destination: "Math'am & Area Santri", notes: "" },
  { date: "2026-06-05", time: "22.00", title: "Pesanan Extra Vit (Catering)", destination: "SCG", notes: "" },
];

export async function listAllSchedules(): Promise<DistributionSchedule[]> {
  const col = collection(db, "distribution_schedules");
  const snap = await getDocs(col);
  
  let schedules = snap.docs.map(d => ({ id: d.id, ...d.data() } as DistributionSchedule));
  
  if (schedules.length === 0) {
    // Auto-seed if database is empty
    console.log("Seeding distribution schedules collection...");
    const seedPromises = SAMPLE_SCHEDULES.map(async (item) => {
      const docRef = doc(col);
      await setDoc(docRef, {
        ...item,
        createdAt: new Date().toISOString(),
      });
    });
    await Promise.all(seedPromises);
    // Fetch again
    const reSnap = await getDocs(col);
    schedules = reSnap.docs.map(d => ({ id: d.id, ...d.data() } as DistributionSchedule));
  }

  // Sort client-side: date ascending, time ascending
  return schedules.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export async function saveSchedule(schedule: Omit<DistributionSchedule, "id" | "createdAt"> & { id?: string }): Promise<void> {
  const col = collection(db, "distribution_schedules");
  const id = schedule.id || doc(col).id;
  const docRef = doc(db, "distribution_schedules", id);
  await setDoc(docRef, {
    date: schedule.date,
    time: schedule.time,
    title: schedule.title,
    destination: schedule.destination,
    notes: schedule.notes || "",
    createdAt: new Date().toISOString(),
  }, { merge: true });
}

export async function deleteSchedule(id: string): Promise<void> {
  const docRef = doc(db, "distribution_schedules", id);
  await deleteDoc(docRef);
}
