/**
 * WhatsApp Gateway has been retired. These compatibility functions keep the
 * order workflow independent from the old local gateway; they never send a
 * network request or expose customer data.
 */
export const WA_MESSAGES = {
  placedCOD: (..._args: unknown[]) => "",
  placedNonCOD: (..._args: unknown[]) => "",
  paymentUploaded: (..._args: unknown[]) => "",
  paymentApproved: (..._args: unknown[]) => "",
  paymentRejected: (..._args: unknown[]) => "",
};

export async function sendWhatsAppNotification(..._args: unknown[]): Promise<boolean> {
  return false;
}

export async function sendWhatsAppNotificationDirect(..._args: unknown[]): Promise<boolean> {
  return false;
}
