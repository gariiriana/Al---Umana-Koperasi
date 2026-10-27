import { AbsensiApiError } from "@/absensi/api";
import { DeviceError } from "@/absensi/device/errors";
import { messageFor } from "@/absensi/messages";

/** Teks untuk error apa pun dari alur absensi (Worker, perangkat, atau tak dikenal). */
export function errorMessage(err: unknown): string {
  if (err instanceof DeviceError) return messageFor(err.code);
  if (err instanceof AbsensiApiError) return messageFor(err.code, err.details);
  return messageFor("INTERNAL");
}
