import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { checkLocation } from "../../../../workers/absensi/shared/geo.js";
import { activate, activateOptions } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { LogoutConfirmModal } from "@/absensi/components/LogoutConfirmModal";
import { SelfieCapture, type SelfieResult } from "@/absensi/components/SelfieCapture";
import { getBestPosition } from "@/absensi/device/gps";
import { createPasskey } from "@/absensi/device/passkey";
import { blobToBase64 } from "@/absensi/device/selfie";
import { setDeviceMarker } from "@/absensi/deviceMarker";
import { errorMessage } from "@/absensi/errorMessage";
import { messageFor } from "@/absensi/messages";
import type { ActivateOptions, LocationInput } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const CONSENT_TEXT = "Foto wajah saya dipakai untuk absensi dan hanya bisa dilihat admin absensi.";

type Step = "persetujuan" | "lokasi" | "foto" | "passkey";
const STEP_NUMBER: Record<Step, number> = { persetujuan: 1, lokasi: 2, foto: 3, passkey: 4 };

/** Aktivasi pertama: persetujuan → lokasi → foto acuan → passkey → simpan di Worker. */
export function AktivasiPage() {
  const { me, reloadMe, signOut } = useAbsensiSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("persetujuan");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationInput | null>(null);
  const [photo, setPhoto] = useState<SelfieResult | null>(null);
  const [options, setOptions] = useState<ActivateOptions | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

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
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setOptions(null);
    setError(null);
    try {
      setOptions(await activateOptions());
    } catch (err) {
      setError(errorMessage(err));
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
      setError(errorMessage(err));
      void activateOptions().then(setOptions, () => setOptions(null));
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      <div className="rounded-b-[2rem] bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-4 pb-14 pt-8">
        <div className="mx-auto flex w-full max-w-md items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-block rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-extrabold text-amber-900">
              Langkah {STEP_NUMBER[step]} dari 4
            </span>
            <h1 className="mt-2 font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-neutral-900">
              Aktivasi HP
            </h1>
            <p className="mt-1 text-sm font-medium text-neutral-800/85">
              Sekali saja di HP ini, dan harus berada di dalam area kerja.
            </p>
          </div>
          <Button variant="outlined" size="sm" className="!bg-white/90" onClick={() => setConfirmLogout(true)}>
            Keluar
          </Button>
        </div>
      </div>

      <div className="mx-auto -mt-8 w-full max-w-md space-y-4 px-4 pb-10">
        <div className="rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          {step === "persetujuan" && (
            <div className="space-y-5">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-500"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span className="font-medium leading-relaxed">{CONSENT_TEXT}</span>
              </label>
              <Button variant="primary" className="w-full" disabled={!consent} onClick={() => setStep("lokasi")}>
                Lanjut
              </Button>
            </div>
          )}

          {step === "lokasi" && (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm font-semibold text-neutral-700">
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
            <div className="space-y-4 py-2 text-center">
              <p className="text-sm text-neutral-700">
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
              <div className="flex flex-wrap justify-center gap-2">
                {!options && error && (
                  <Button variant="outlined" onClick={() => void loadOptions()}>Coba lagi</Button>
                )}
                <Button variant="outlined" disabled={busy} onClick={() => setStep("foto")}>Ulangi foto</Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>

      <LogoutConfirmModal
        open={confirmLogout}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void signOut();
        }}
      />
    </div>
  );
}
