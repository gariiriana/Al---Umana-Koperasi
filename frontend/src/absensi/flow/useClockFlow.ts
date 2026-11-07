import { useCallback, useEffect, useRef, useState } from "react";

import { payloadChallenge } from "../../../../workers/absensi/shared/binding.js";
import { LATE_REASON_MAX, LATE_REASON_MIN } from "../../../../workers/absensi/shared/constants.js";
import { checkLocation } from "../../../../workers/absensi/shared/geo.js";
import { isLateClockIn } from "../../../../workers/absensi/shared/time.js";
import { absen, absenOptions } from "@/absensi/api";
import type { SelfieResult } from "@/absensi/components/SelfieCapture";
import { signWithPasskey } from "@/absensi/device/passkey";
import { blobSha256Hex, blobToBase64 } from "@/absensi/device/selfie";
import { errorMessage } from "@/absensi/errorMessage";
import { messageFor } from "@/absensi/messages";
import type { AbsenKind, AbsenOptions, LocationInput, Me, ShiftStatus } from "@/absensi/types";

export type ClockStep = "idle" | "alasan" | "lokasi" | "selfie" | "passkey" | "kirim" | "sukses" | "gagal";

/** Rapikan spasi; null kalau alasan terlalu pendek. */
export function normalizeLateReason(text: string): string | null {
  const reason = text.replace(/\s+/g, " ").trim().slice(0, LATE_REASON_MAX);
  return reason.length >= LATE_REASON_MIN ? reason : null;
}

interface Prepared {
  options: AbsenOptions;
  challenge: string;
  selfieBase64: string;
  faceDistance: number | null;
}

export interface ClockFlow {
  step: ClockStep;
  kind: AbsenKind | null;
  error: string | null;
  result: { kind: AbsenKind; serverTime: number } | null;
  /** Challenge sudah terikat ke lokasi + selfie; tombol passkey boleh ditekan. */
  passkeyReady: boolean;
  start: (kind: AbsenKind) => void;
  /** Step "alasan": alasan clock in lewat 08:00; lanjut ke peta lokasi kalau cukup panjang. */
  submitLateReason: (reason: string) => void;
  confirmLocation: (fix: LocationInput) => void;
  selfieDone: (selfie: SelfieResult) => Promise<void>;
  confirmPasskey: () => Promise<void>;
  retry: () => void;
  cancel: () => void;
}

/**
 * (Alasan kalau clock in lewat 08:00) → Konfirmasi Peta Lokasi → Selfie → Challenge dari Worker yang diikat
 * ke lokasi + hash selfie → Passkey → Absen.
 * Passkey dipanggil dari tombol (`confirmPasskey`) karena Safari iPhone butuh ketukan pengguna.
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
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  // Naik setiap mulai/batal; hasil async dari percobaan lama dibuang.
  const run = useRef(0);
  const kindRef = useRef<AbsenKind | null>(null);
  const locationRef = useRef<LocationInput | null>(null);
  const preparedRef = useRef<Prepared | null>(null);
  const lateReasonRef = useRef<string | null>(null);
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
    preparedRef.current = null;
    if (!keepReason || nextKind !== "masuk") lateReasonRef.current = null;
    setKind(nextKind);
    setError(null);
    setResult(null);
    setPrepared(null);
    const needReason = nextKind === "masuk" && lateReasonRef.current === null && isLateClockIn(nowRef.current());
    setStep(needReason ? "alasan" : "lokasi");
  }, []);

  const start = useCallback((nextKind: AbsenKind) => begin(nextKind, false), [begin]);

  const submitLateReason = useCallback((text: string) => {
    const reason = normalizeLateReason(text);
    if (!reason || kindRef.current !== "masuk") return;
    lateReasonRef.current = reason;
    setStep("lokasi");
  }, []);

  const confirmLocation = useCallback((fix: LocationInput) => {
    const token = run.current;
    const check = checkLocation(fix, meRef.current.areas);
    if (!check.ok) {
      fail(token, messageFor(check.code, { distanceM: check.distanceM }));
      return;
    }
    locationRef.current = fix;
    setError(null);
    setStep("selfie");
  }, [fail]);

  const selfieDone = useCallback(async (selfie: SelfieResult) => {
    const token = run.current;
    const currentKind = kindRef.current;
    const location = locationRef.current;
    if (!currentKind || !location) return;
    setStep("passkey");
    try {
      const options = await absenOptions(currentKind);
      const [selfieSha256Hex, selfieBase64] = await Promise.all([blobSha256Hex(selfie.jpeg), blobToBase64(selfie.jpeg)]);
      const challenge = await payloadChallenge({
        nonce: options.nonce,
        kind: currentKind,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        selfieSha256Hex,
      });
      if (token !== run.current) return;
      const next = { options, challenge, selfieBase64, faceDistance: selfie.distance };
      preparedRef.current = next;
      setPrepared(next);
    } catch (err) {
      fail(token, errorMessage(err));
    }
  }, [fail]);

  const confirmPasskey = useCallback(async () => {
    const token = run.current;
    const currentKind = kindRef.current;
    const location = locationRef.current;
    const ready = preparedRef.current;
    if (!currentKind || !location || !ready) return;
    try {
      const authentication = await signWithPasskey({
        challenge: ready.challenge,
        rpId: ready.options.rpId,
        allowCredentials: ready.options.allowCredentials,
      });
      if (token !== run.current) return;
      setStep("kirim");
      const lateReason = currentKind === "masuk" ? lateReasonRef.current : null;
      const res = await absen({
        challengeId: ready.options.challengeId,
        kind: currentKind,
        location,
        selfieBase64: ready.selfieBase64,
        faceDistance: ready.faceDistance,
        ...(lateReason ? { lateReason } : {}),
        authentication,
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
    preparedRef.current = null;
    lateReasonRef.current = null;
    setPrepared(null);
    setError(null);
    setStep("idle");
  }, []);

  return {
    step,
    kind,
    error,
    result,
    passkeyReady: prepared !== null,
    start,
    submitLateReason,
    confirmLocation,
    selfieDone,
    confirmPasskey,
    retry,
    cancel,
  };
}
