import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDLPHuVggHLvrQlmj3fV1hKQiStN366fdE",
  authDomain: "al-umana-koperasi.firebaseapp.com",
  projectId: "al-umana-koperasi",
  storageBucket: "al-umana-koperasi.firebasestorage.app",
  messagingSenderId: "238836777828",
  appId: "1:238836777828:web:29f9786375e2c7ad61f071",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function cleanup() {
  console.log("Authenticating...");
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, "cleanup_bot@alumana.id", "cleanup_pass123");
  } catch {
    try {
      userCred = await createUserWithEmailAndPassword(auth, "cleanup_bot@alumana.id", "cleanup_pass123");
    } catch (e2) {
      console.log("Could not create/signin cleanup_bot:", e2.message);
    }
  }

  console.log("Authenticated user:", auth.currentUser?.email || "anonymous/none");

  // 1. Clean Orders
  console.log("Checking orders collection...");
  const ordersSnap = await getDocs(collection(db, "orders"));
  console.log(`Found ${ordersSnap.size} total orders.`);
  let deletedOrders = 0;
  for (const docSnap of ordersSnap.docs) {
    const id = docSnap.id;
    const data = docSnap.data();
    const inst = (data.institutionName || "").toLowerCase();
    const cust = (data.customerName || "").toLowerCase();
    const recip = (data.recipientName || "").toLowerCase();
    
    const isDummy =
      id.startsWith("ord-scg-") ||
      id.startsWith("ord-disdik-") ||
      id.startsWith("ord-ponpes-") ||
      id.startsWith("ord-wedding-") ||
      id.startsWith("ord-klinik-") ||
      inst.includes("siam cement") ||
      inst.includes("dinas pendidikan") ||
      inst.includes("pernikahan ananda rian") ||
      inst.includes("pesantren modern al-umanaa") ||
      inst.includes("klinik pratama al-umanaa") ||
      cust.includes("dedi suryadi") ||
      cust.includes("hendra gunawan") ||
      cust.includes("rina marlina") ||
      recip.includes("dedi suryadi") ||
      recip.includes("hendra gunawan") ||
      recip.includes("rina marlina");

    if (isDummy) {
      console.log(`Deleting dummy order: ${id} (${data.institutionName || data.recipientName})`);
      try {
        await deleteDoc(doc(db, "orders", id));
        deletedOrders++;
      } catch (err) {
        console.error(`Failed to delete ${id}:`, err.message);
      }
    }
  }
  console.log(`Deleted ${deletedOrders} dummy orders.`);

  // 2. Clean MBG Batches
  console.log("Checking mbg_pm_batches collection...");
  const batchesSnap = await getDocs(collection(db, "mbg_pm_batches"));
  let deletedBatches = 0;
  for (const docSnap of batchesSnap.docs) {
    const id = docSnap.id;
    if (id.startsWith("batch-mbg-")) {
      console.log(`Deleting dummy batch: ${id}`);
      try {
        await deleteDoc(doc(db, "mbg_pm_batches", id));
        deletedBatches++;
      } catch (err) {
        console.error(`Failed to delete batch ${id}:`, err.message);
      }
    }
  }
  console.log(`Deleted ${deletedBatches} dummy MBG batches.`);

  // 3. Clean MBG Entries
  console.log("Checking mbg_pm_entries collection...");
  const entriesSnap = await getDocs(collection(db, "mbg_pm_entries"));
  let deletedEntries = 0;
  for (const docSnap of entriesSnap.docs) {
    const id = docSnap.id;
    if (id.startsWith("entry-batch-mbg-")) {
      try {
        await deleteDoc(doc(db, "mbg_pm_entries", id));
        deletedEntries++;
      } catch (err) {
        console.error(`Failed to delete entry ${id}:`, err.message);
      }
    }
  }
  console.log(`Deleted ${deletedEntries} dummy MBG entries.`);

  // 4. Clean Catering Job Desks linked to dummy orders
  console.log("Checking catering_jobdesks collection...");
  const jdSnap = await getDocs(collection(db, "catering_jobdesks"));
  let deletedJd = 0;
  for (const docSnap of jdSnap.docs) {
    const id = docSnap.id;
    const data = docSnap.data();
    const isLinkedDummy =
      (data.orderId && (
        data.orderId.startsWith("ord-scg-") ||
        data.orderId.startsWith("ord-disdik-") ||
        data.orderId.startsWith("ord-ponpes-") ||
        data.orderId.startsWith("ord-wedding-") ||
        data.orderId.startsWith("ord-klinik-")
      )) ||
      (data.mbgBatchId && data.mbgBatchId.startsWith("batch-mbg-"));

    if (isLinkedDummy) {
      console.log(`Deleting dummy jobdesk: ${id}`);
      try {
        await deleteDoc(doc(db, "catering_jobdesks", id));
        deletedJd++;
      } catch (err) {
        console.error(`Failed to delete jobdesk ${id}:`, err.message);
      }
    }
  }
  console.log(`Deleted ${deletedJd} dummy jobdesks.`);

  console.log("=== CLEANUP SUCCESSFUL ===");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
