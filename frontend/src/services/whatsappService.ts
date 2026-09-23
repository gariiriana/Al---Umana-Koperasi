/**
 * WhatsApp Gateway has been retired. These compatibility functions keep the
 * order workflow independent from the old local gateway; they never send a
 * network request or expose customer data.
 */
const emptyMessage = (...args: unknown[]): string => {
  void args;
  return "";
};

export const WA_MESSAGES = {
  placedCOD: emptyMessage,
  placedNonCOD: emptyMessage,
  paymentUploaded: emptyMessage,
  paymentApproved: emptyMessage,
  paymentRejected: emptyMessage,
};

export async function sendWhatsAppNotification(...args: unknown[]): Promise<boolean> {
  void args;
  return false;
}

export async function sendWhatsAppNotificationDirect(...args: unknown[]): Promise<boolean> {
  void args;
  return false;
}
