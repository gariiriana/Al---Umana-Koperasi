import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { checkLocation } from "../../../../workers/absensi/shared/geo.js";
import { AbsensiApiError, activate, activateOptions } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { SelfieCapture, type SelfieResult } from "@/absensi/components/SelfieCapture";
import { DeviceError } from "@/absensi/device/errors";
import { getBestPosition } from "@/absensi/device/gps";
import { createPasskey } from "@/absensi/device/passkey";
import { blobToBase64 } from "@/absensi/device/selfie";
import { setDeviceMarker } from "@/absensi/deviceMarker";
import { messageFor } from "@/absensi/messages";
import type { ActivateOptions, LocationInput } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const CONSENT_TEXT = "Foto wajah saya dipakai untuk absensi dan hanya bisa dilihat admin absensi.";

type Step = "persetujuan" | "lokasi" | "foto" | "passkey";
const STEP_NUMBER: Record<Step, number> = { persetujuan: 1, lokasi: 2, foto: 3, passkey: 4 };

function errorText(err: unknown): string {
  if (err instanceof DeviceError) return messageFor(err.code);
  if (err instanceof AbsensiApiError) return messageFor(err.code, err.details);
  return messageFor("INTERNAL");
}

/** Aktivasi pertama: persetujuan → lokasi → foto acuan → passkey → simpan di Worker. */
export function AktivasiPage() {
  const { me, reloadMe } = useAbsensiSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("persetujuan");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationInput | null>(null);
  const [photo, setPhoto] = useState<SelfieResult | null>(null);
  const [options, setOptions] = useState<ActivateOptions | null>(null);

  // Area terbaru tanpa membuat ulang `locate` (yang memicu effect langkah).
  const areasRef = useRef(me?.areas ?? []);
  areasRef.current = me?.areas ?? [];
  const locate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const fix = await getBestPosition();
      const check = checkLocation(fix, areasRef.current);
      if (!check.ok) {
        setError(messageFor(check.code, { distanceM: check.distanceM }));
        return;
      }
      setLocation(fix);
      setStep("foto");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // Opsi passkey diambil saat langkah dibuka; tombolnya sendiri memanggil WebAuthn
  // (Safari iPhone hanya mau memunculkan sidik jari/Face ID dari ketukan pengguna).
  const loadOptions = useCallback(async () => {
    setOptions(null);
    setError(null);
    try {
      setOptions(await activateOptions());
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    if (step === "lokasi") void locate();
    if (step === "passkey") void loadOptions();
  }, [step, locate, loadOptions]);

  const register = async () => {
    if (!me || !options || !location || !photo) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await createPasskey(options.optionsJSON);
      await activate({
        challengeId: options.challengeId,
        consent: true,
        registration,
        location,
        reference: { jpegBase64: await blobToBase64(photo.jpeg), descriptor: photo.descriptor },
      });
      setDeviceMarker(me.uid);
      await reloadMe();
      navigate("/absensi", { replace: true });
    } catch (err) {
      setError(errorText(err));
      // Challenge sudah terpakai atau kedaluwarsa; minta yang baru untuk percobaan berikutnya.
      void activateOptions().then(setOptions, () => setOptions(null));
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;

  return (
    <div className="min-h-screen bg-[#111827] px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div>
          <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold text-amber-300">
            Langkah {STEP_NUMBER[step]} dari 4
          </p>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-bold text-white">Aktivasi HP</h1>
          <p className="mt-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-300">
            Sekali saja di HP ini, dan harus di dalam area kerja.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          {step === "persetujuan" && (
            <div className="space-y-4">
              <label className="flex items-start gap-3 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-100">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-400"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{CONSENT_TEXT}</span>
              </label>
              <Button variant="primary" className="w-full" disabled={!consent} onClick={() => setStep("lokasi")}>
                Lanjut
              </Button>
            </div>
          )}

          {step === "lokasi" && (
            <div className="space-y-4 text-center">
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-200">
                {busy ? "Mencari lokasi kamu... (maks. 10 detik)" : "Cek lokasi kamu di area kerja."}
              </p>
              {!busy && error && (
                <Button variant="primary" onClick={() => void locate()}>Coba lagi</Button>
              )}
            </div>
          )}

          {step === "foto" && (
            <SelfieCapture
              mode={me.faceRequired ? "acuan" : "photo"}
              onDone={(result) => {
                setPhoto(result);
                setStep("passkey");
              }}
              onCancel={() => setStep("persetujuan")}
            />
          )}

          {step === "passkey" && (
            <div className="space-y-4 text-center">
              <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-200">
                Terakhir, daftarkan sidik jari atau Face ID HP ini. Nanti dipakai setiap clock in dan clock out.
              </p>
              <Button
                variant="primary"
                className="w-full"
                loading={busy}
                disabled={!options}
                onClick={() => void register()}
              >
                Daftarkan sidik jari / Face ID
              </Button>
              {!options && error && (
                <Button variant="secondary" onClick={() => void loadOptions()}>Coba lagi</Button>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
