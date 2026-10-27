import { useCallback, useEffect, useRef, useState } from "react";

import { payloadChallenge } from "../../../../workers/absensi/shared/binding.js";
import { checkLocation } from "../../../../workers/absensi/shared/geo.js";
import { absen, absenOptions } from "@/absensi/api";
import type { SelfieResult } from "@/absensi/components/SelfieCapture";
import { getBestPosition } from "@/absensi/device/gps";
import { signWithPasskey } from "@/absensi/device/passkey";
import { blobSha256Hex, blobToBase64 } from "@/absensi/device/selfie";
import { errorMessage } from "@/absensi/errorMessage";
import { messageFor } from "@/absensi/messages";
import type { AbsenKind, AbsenOptions, LocationInput, Me, ShiftStatus } from "@/absensi/types";

export type ClockStep = "idle" | "lokasi" | "selfie" | "passkey" | "kirim" | "sukses" | "gagal";

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
  start: (kind: AbsenKind) => Promise<void>;
  selfieDone: (selfie: SelfieResult) => Promise<void>;
  confirmPasskey: () => Promise<void>;
  retry: () => void;
  cancel: () => void;
}

/**
 * Lokasi → selfie → challenge dari Worker yang diikat ke lokasi + hash selfie → passkey → absen.
 * Passkey dipanggil dari tombol (`confirmPasskey`) karena Safari iPhone butuh ketukan pengguna.
 */
export function useClockFlow({ me, onStatus }: { me: Me; onStatus: (status: ShiftStatus) => void }): ClockFlow {
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
  const meRef = useRef(me);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    meRef.current = me;
    onStatusRef.current = onStatus;
  });

  const fail = useCallback((token: number, message: string) => {
    if (token !== run.current) return;
    setError(message);
    setStep("gagal");
  }, []);

  const start = useCallback(async (nextKind: AbsenKind) => {
    const token = ++run.current;
    kindRef.current = nextKind;
    locationRef.current = null;
    preparedRef.current = null;
    setKind(nextKind);
    setError(null);
    setResult(null);
    setPrepared(null);
    setStep("lokasi");
    try {
      const fix = await getBestPosition();
      if (token !== run.current) return;
      const check = checkLocation(fix, meRef.current.areas);
      if (!check.ok) {
        fail(token, messageFor(check.code, { distanceM: check.distanceM }));
        return;
      }
      locationRef.current = fix;
      setStep("selfie");
    } catch (err) {
      fail(token, errorMessage(err));
    }
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
      const res = await absen({
        challengeId: ready.options.challengeId,
        kind: currentKind,
        location,
        selfieBase64: ready.selfieBase64,
        faceDistance: ready.faceDistance,
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
    if (kindRef.current) void start(kindRef.current);
  }, [start]);

  const cancel = useCallback(() => {
    run.current++;
    preparedRef.current = null;
    setPrepared(null);
    setError(null);
    setStep("idle");
  }, []);

  return { step, kind, error, result, passkeyReady: prepared !== null, start, selfieDone, confirmPasskey, retry, cancel };
}
