import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Payload interface matching the local express server
interface WAPayload {
  number: string;
  message: string;
}

/**
 * Normalizes phone number into WhatsApp-compatible 628xxx format.
 */
function normalizePhoneNumber(phone: string): string {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  }
  return clean;
}

/**
 * Sends a WhatsApp notification to a specific user by their customer ID.
 * Automatically checks their notification preferences and retrieves their phone number.
 */
export async function sendWhatsAppNotification(
  customerId: string,
  shortId: string,
  message: string
): Promise<boolean> {
  try {
    // 1. Fetch user profile from Firestore
    const userRef = doc(db, "users", customerId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.log(`[whatsappService] User document ${customerId} not found.`);
      return false;
    }

    const userData = userSnap.data();

    // 2. Check if WhatsApp notifications are enabled (default to true if not set)
    const waEnabled = userData.notifications?.whatsapp !== false;
    if (!waEnabled) {
      console.log(`[whatsappService] User ${customerId} has disabled WhatsApp notifications.`);
      return false;
    }

    // 3. Get phone number
    const phone = userData.phoneNumber || userData.phone;
    if (!phone) {
      console.log(`[whatsappService] User ${customerId} has no phone number in profile.`);
      return false;
    }

    const targetPhone = normalizePhoneNumber(phone);
    if (!targetPhone) {
      console.log(`[whatsappService] Normalized phone number is empty.`);
      return false;
    }

    // 4. Send POST request to local WA Gateway
    const payload: WAPayload = {
      number: targetPhone,
      message: message,
    };

    console.log(`[whatsappService] Triggering WA message to ${targetPhone}...`);

    const response = await fetch("http://localhost:8000/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }

    console.log(`[whatsappService] WhatsApp notification sent successfully for Order #${shortId}.`);
    return true;
  } catch (err) {
    console.error(`[whatsappService] Failed to send WhatsApp notification:`, err);
    return false;
  }
}

/**
 * Sends a WhatsApp notification to a specific phone number directly.
 */
export async function sendWhatsAppNotificationDirect(
  phone: string,
  shortId: string,
  message: string
): Promise<boolean> {
  try {
    const targetPhone = normalizePhoneNumber(phone);
    if (!targetPhone) {
      console.log(`[whatsappService] Normalized phone number is empty.`);
      return false;
    }

    const payload: WAPayload = {
      number: targetPhone,
      message: message,
    };

    console.log(`[whatsappService] Triggering WA message to ${targetPhone}...`);

    const response = await fetch("http://localhost:8000/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }

    console.log(`[whatsappService] WhatsApp notification sent successfully for Order #${shortId}.`);
    return true;
  } catch (err) {
    console.error(`[whatsappService] Failed to send WhatsApp notification:`, err);
    return false;
  }
}


/**
 * Pre-defined notification messages for status transitions.
 */
export const WA_MESSAGES = {
  placedCOD: (name: string, shortId: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda berhasil ditempatkan!\nMetode Pembayaran: Cash on Delivery (COD).\n\nPesanan akan segera diproses oleh koperasi.`,
    
  placedNonCOD: (name: string, shortId: string, payMethod: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda berhasil dibuat!\nSilakan lakukan transfer pembayaran via ${payMethod}, lalu unggah bukti transfer di aplikasi Koperasi Al-Umanaa agar pesanan dapat segera diproses.`,

  paymentUploaded: (name: string, shortId: string) =>
    `Halo ${name},\n\nBukti transfer untuk Pesanan #${shortId} Anda telah diunggah dan sedang ditinjau oleh Admin. Mohon tunggu konfirmasi berikutnya.`,

  paymentApproved: (name: string, shortId: string) => 
    `Halo ${name},\n\nPembayaran untuk Pesanan #${shortId} Anda telah disetujui! Pesanan Anda kini dikonfirmasi dan mengantre untuk proses produksi.`,

  paymentRejected: (name: string, shortId: string, reason: string) => 
    `Halo ${name},\n\nMohon maaf, bukti pembayaran untuk Pesanan #${shortId} Anda ditolak oleh Admin dengan alasan: "${reason || "bukti tidak valid"}".\n\nSilakan unggah kembali bukti transfer yang sah di aplikasi Koperasi Al-Umanaa.`,

  inProduction: (name: string, shortId: string) => 
    `Halo ${name},\n\nKabar baik! Pesanan #${shortId} Anda saat ini sedang dikerjakan oleh Tim Produksi Koperasi.`,

  ready: (name: string, shortId: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda telah selesai diproduksi dan sedang memasuki proses Quality Control (QC).`,

  readyToDeliver: (name: string, shortId: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda telah lolos uji QC dan siap diserahkan ke Kurir untuk dikirim.`,

  outForDelivery: (name: string, shortId: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda sedang dikirim oleh Kurir. Anda dapat memantau status pengiriman di aplikasi secara real-time.`,

  delivered: (name: string, shortId: string) => 
    `Halo ${name},\n\nHore! Pesanan #${shortId} Anda telah berhasil diserahterimakan dengan selamat. Terima kasih telah berbelanja di Koperasi Al-Umanaa!`,

  failed: (name: string, shortId: string, reason: string) => 
    `Halo ${name},\n\nMohon maaf, Pesanan #${shortId} Anda dibatalkan/gagal karena: "${reason || "stok tidak mencukupi"}".`
};
