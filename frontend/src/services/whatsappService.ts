/**
 * Browser code must never contact the WhatsApp gateway: the secret required
 * by the gateway would be exposed to every visitor. Order notifications are
 * sent by the backend Firestore listener instead.
 */
export async function sendWhatsAppNotification(
  _customerId: string,
  _shortId: string,
  _message: string
): Promise<boolean> {
  void _customerId;
  void _shortId;
  void _message;
  return false;
}

/**
 * Sends a WhatsApp notification to a specific phone number directly.
 */
export async function sendWhatsAppNotificationDirect(
  _phone: string,
  _shortId: string,
  _message: string
): Promise<boolean> {
  void _phone;
  void _shortId;
  void _message;
  return false;
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
    `Halo ${name},\n\nPesanan #${shortId} Anda telah selesai diproduksi dan siap diserahkan ke Kurir untuk dikirim.`,

  readyToDeliver: (name: string, shortId: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda telah lolos uji QC dan siap diserahkan ke Kurir untuk dikirim.`,

  outForDelivery: (name: string, shortId: string) => 
    `Halo ${name},\n\nPesanan #${shortId} Anda sedang dikirim oleh Kurir. Anda dapat memantau status pengiriman di aplikasi secara real-time.`,

  delivered: (name: string, shortId: string) => 
    `Halo ${name},\n\nHore! Pesanan #${shortId} Anda telah berhasil diserahterimakan dengan selamat. Terima kasih telah berbelanja di Koperasi Al-Umanaa!`,

  failed: (name: string, shortId: string, reason: string) => 
    `Halo ${name},\n\nMohon maaf, Pesanan #${shortId} Anda dibatalkan/gagal karena: "${reason || "stok tidak mencukupi"}".`
};
