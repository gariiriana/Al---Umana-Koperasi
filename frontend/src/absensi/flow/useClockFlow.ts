import { useCallback, useEffect, useRef, useState } from "react";

import { LATE_REASON_MAX, LATE_REASON_MIN } from "../../../../workers/absensi/shared/constants.js";
import { checkLocation } from "../../../../workers/absensi/shared/geo.js";
import { isLateClockIn } from "../../../../workers/absensi/shared/time.js";
import { absen, absenOptions } from "@/absensi/api";
import type { SelfieResult } from "@/absensi/components/SelfieCapture";
import { blobToBase64 } from "@/absensi/device/selfie";
import { errorMessage } from "@/absensi/errorMessage";
import { messageFor } from "@/absensi/messages";
import type { AbsenKind, LocationInput, Me, ShiftStatus } from "@/absensi/types";

export type ClockStep = "idle" | "alasan" | "lokasi" | "selfie" | "kirim" | "sukses" | "gagal";

/** Rapikan spasi; null kalau alasan terlalu pendek. */
export function normalizeLateReason(text: string): string | null {
  const reason = text.replace(/\s+/g, " ").trim().slice(0, LATE_REASON_MAX);
  return reason.length >= LATE_REASON_MIN ? reason : null;
}

export interface ClockFlow {
  step: ClockStep;
  kind: AbsenKind | null;
  error: string | null;
  result: { kind: AbsenKind; serverTime: number } | null;
  start: (kind: AbsenKind) => void;
  /** Step "alasan": alasan + foto bukti clock in lewat 08:00; lanjut ke peta lokasi kalau keduanya ada. */
  submitLateReason: (reason: string, photo: Blob | null) => void;
  /** `outsideReason`: absen di luar zona dengan alasan (menunggu persetujuan). */
  confirmLocation: (fix: LocationInput, outsideReason?: string) => void;
  selfieDone: (selfie: SelfieResult) => Promise<void>;
  retry: () => void;
  cancel: () => void;
}

/**
 * (Alasan kalau clock in lewat 08:00) → Konfirmasi Peta Lokasi → Selfie → Absen langsung terkirim.
 * Tanpa sidik jari/Face ID: identitas dicek dari login + selfie (cek wajah) + lokasi.
 */
export function useClockFlow({
  me,
  onStatus,
  now = Date.now,
}: {
  me: Me;
  onStatus: (status: ShiftStatus) => void;
  /** Jam perangkat untuk cek "lewat 08:00"; bisa diganti di tes. */
  now?: () => number;
}): ClockFlow {
  const [step, setStep] = useState<ClockStep>("idle");
  const [kind, setKind] = useState<AbsenKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClockFlow["result"]>(null);

  // Naik setiap mulai/batal; hasil async dari percobaan lama dibuang.
  const run = useRef(0);
  const kindRef = useRef<AbsenKind | null>(null);
  const locationRef = useRef<LocationInput | null>(null);
  const lateReasonRef = useRef<string | null>(null);
  const latePhotoRef = useRef<Blob | null>(null);
  const outsideReasonRef = useRef<string | null>(null);
  const meRef = useRef(me);
  const onStatusRef = useRef(onStatus);
  const nowRef = useRef(now);
  useEffect(() => {
    meRef.current = me;
    onStatusRef.current = onStatus;
    nowRef.current = now;
  });

  const fail = useCallback((token: number, message: string) => {
    if (token !== run.current) return;
    setError(message);
    setStep("gagal");
  }, []);

  // `keepReason`: "Coba lagi" sesudah gagal tidak menanyakan alasan untuk kedua kalinya.
  const begin = useCallback((nextKind: AbsenKind, keepReason: boolean) => {
    run.current++;
    kindRef.current = nextKind;
    locationRef.current = null;
    outsideReasonRef.current = null;
    if (!keepReason || nextKind !== "masuk") {
      lateReasonRef.current = null;
      latePhotoRef.current = null;
    }
    setKind(nextKind);
    setError(null);
    setResult(null);
    const needReason = nextKind === "masuk"
      && (lateReasonRef.current === null || latePhotoRef.current === null)
      && isLateClockIn(nowRef.current());
    setStep(needReason ? "alasan" : "lokasi");
  }, []);

  const start = useCallback((nextKind: AbsenKind) => begin(nextKind, false), [begin]);

  const submitLateReason = useCallback((text: string, photo: Blob | null) => {
    const reason = normalizeLateReason(text);
    if (!reason || !photo || kindRef.current !== "masuk") return;
    lateReasonRef.current = reason;
    latePhotoRef.current = photo;
    setStep("lokasi");
  }, []);

  const confirmLocation = useCallback((fix: LocationInput, outsideText?: string) => {
    const token = run.current;
    const check = checkLocation(fix, meRef.current.areas);
    const outsideReason = outsideText ? normalizeLateReason(outsideText) : null;
    if (!check.ok && !(check.code === "DI_LUAR_AREA" && outsideReason)) {
      fail(token, messageFor(check.code, { distanceM: check.distanceM }));
      return;
    }
    outsideReasonRef.current = check.ok ? null : outsideReason;
    locationRef.current = fix;
    setError(null);
    setStep("selfie");
  }, [fail]);

  const selfieDone = useCallback(async (selfie: SelfieResult) => {
    const token = run.current;
    const currentKind = kindRef.current;
    const location = locationRef.current;
    if (!currentKind || !location) return;
    setStep("kirim");
    try {
      const options = await absenOptions(currentKind);
      const selfieBase64 = await blobToBase64(selfie.jpeg);
      const lateReason = currentKind === "masuk" ? lateReasonRef.current : null;
      const latePhoto = currentKind === "masuk" ? latePhotoRef.current : null;
      const latePhotoBase64 = latePhoto ? await blobToBase64(latePhoto) : null;
      if (token !== run.current) return;
      const res = await absen({
        challengeId: options.challengeId,
        kind: currentKind,
        location,
        selfieBase64,
        faceDistance: selfie.distance,
        ...(lateReason ? { lateReason } : {}),
        ...(latePhotoBase64 ? { latePhotoBase64 } : {}),
        ...(outsideReasonRef.current ? { outsideReason: outsideReasonRef.current } : {}),
      });
      if (token !== run.current) return;
      onStatusRef.current(res.status);
      setResult({ kind: currentKind, serverTime: res.serverTime });
      setStep("sukses");
    } catch (err) {
      fail(token, errorMessage(err));
    }
  }, [fail]);

  const retry = useCallback(() => {
    if (kindRef.current) begin(kindRef.current, true);
  }, [begin]);

  const cancel = useCallback(() => {
    run.current++;
    lateReasonRef.current = null;
    latePhotoRef.current = null;
    outsideReasonRef.current = null;
    setError(null);
    setStep("idle");
  }, []);

  return {
    step,
    kind,
    error,
    result,
    start,
    submitLateReason,
    confirmLocation,
    selfieDone,
    retry,
    cancel,
  };
}
