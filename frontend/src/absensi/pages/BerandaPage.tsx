import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { ClockButtons } from "@/absensi/components/ClockButtons";
import { RiwayatList } from "@/absensi/components/RiwayatList";
import { SelfieCapture } from "@/absensi/components/SelfieCapture";
import { hasDeviceMarker } from "@/absensi/deviceMarker";
import { useClockFlow } from "@/absensi/flow/useClockFlow";
import { buttonState } from "@/absensi/logic/buttonState";
import { bulanWIB, formatJam, formatTanggalPanjang } from "@/absensi/logic/format";
import { messageFor } from "@/absensi/messages";
import type { Me, ShiftStatus } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const SUCCESS_MS = 2500;
const CLOCK_TICK_MS = 30_000;

const text = "font-['Hanken_Grotesk',system-ui,sans-serif]";

function Beranda({ me, setStatus, reloadMe, signOut }: {
  me: Me;
  setStatus: (status: ShiftStatus) => void;
  reloadMe: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  // Jam berjalan supaya shift terbuka yang lewat 20 jam dan tanggal hari ini ikut berubah.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void reloadMe();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadMe]);

  const flow = useClockFlow({ me, onStatus: setStatus });
  const [bulan, setBulan] = useState(() => bulanWIB(Date.now()));
  const [reloadKey, setReloadKey] = useState(0);
  const view = buttonState(me.status, now);
  const showDeviceBanner = hasDeviceMarker(me.uid) === false;

  const { step, cancel } = flow;
  useEffect(() => {
    if (step !== "sukses") return undefined;
    const id = setTimeout(() => {
      cancel();
      setReloadKey((n) => n + 1);
    }, SUCCESS_MS);
    return () => clearTimeout(id);
  }, [step, cancel]);

  // Gagal bisa berarti status di layar sudah basi (mis. sudah clock in dari HP lain).
  const closeFailure = () => {
    cancel();
    void reloadMe();
  };

  const title = flow.kind === "pulang" ? "Clock Out" : "Clock In";

  return (
    <div className="min-h-screen bg-[#111827] px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`${text} text-xs font-bold text-amber-300`}>{formatTanggalPanjang(workDateWIB(now))}</p>
            <h1 className="truncate font-['Manrope',system-ui,sans-serif] text-2xl font-bold text-white">{me.name}</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>Keluar</Button>
        </header>

        {showDeviceBanner && (
          <p className={`${text} rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200`}>
            {messageFor("PASSKEY_TIDAK_DIKENAL")}
          </p>
        )}

        {view.lastShiftLine && <p className={`${text} text-sm text-emerald-300`}>{view.lastShiftLine}</p>}
        {view.shiftDateLabel && <p className={`${text} text-sm font-bold text-amber-300`}>{view.shiftDateLabel}</p>}

        <ClockButtons view={view} onPress={(kind) => void flow.start(kind)} />

        {view.durasi && <p className={`${text} text-center text-sm text-neutral-200`}>Durasi: {view.durasi}</p>}

        <RiwayatList bulan={bulan} onBulanChange={setBulan} reloadKey={reloadKey} />
      </div>

      {flow.step !== "idle" && (
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 overflow-y-auto bg-[#111827]/95 px-4 py-8">
          <div className="mx-auto w-full max-w-md space-y-5">
            <h2 className="text-center font-['Manrope',system-ui,sans-serif] text-xl font-bold text-white">{title}</h2>

            {flow.step === "lokasi" && (
              <p className={`${text} text-center text-sm text-neutral-200`}>Mencari lokasi kamu... (maks. 10 detik)</p>
            )}

            {flow.step === "selfie" && (
              <SelfieCapture
                mode={me.faceRequired && me.faceDescriptor ? "match" : "photo"}
                reference={me.faceDescriptor}
                onDone={(selfie) => void flow.selfieDone(selfie)}
                onCancel={cancel}
              />
            )}

            {flow.step === "passkey" && (
              <div className="space-y-4 text-center">
                <p className={`${text} text-sm text-neutral-200`}>Konfirmasi dengan sidik jari atau Face ID.</p>
                <Button
                  variant="primary"
                  className="w-full"
                  loading={!flow.passkeyReady}
                  disabled={!flow.passkeyReady}
                  onClick={() => void flow.confirmPasskey()}
                >
                  Konfirmasi sidik jari / Face ID
                </Button>
                <Button variant="secondary" onClick={cancel}>Batal</Button>
              </div>
            )}

            {flow.step === "kirim" && (
              <p className={`${text} text-center text-sm text-neutral-200`}>Mengirim absen...</p>
            )}

            {flow.step === "sukses" && flow.result && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-16 w-16 text-emerald-400" aria-hidden="true" />
                <p className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">
                  {flow.result.kind === "masuk" ? "Clock in berhasil" : "Clock out berhasil"} · {formatJam(flow.result.serverTime)}
                </p>
              </div>
            )}

            {flow.step === "gagal" && (
              <div className="space-y-4 text-center">
                <p role="alert" className={`${text} text-sm text-[#EF4444]`}>{flow.error}</p>
                <div className="flex justify-center gap-2">
                  <Button variant="primary" onClick={flow.retry}>Coba lagi</Button>
                  <Button variant="secondary" onClick={closeFailure}>Tutup</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Beranda karyawan: tombol status, alur clock in/out, dan riwayat. */
export function BerandaPage() {
  const { me, setStatus, reloadMe, signOut } = useAbsensiSession();
  if (!me) return null;
  return <Beranda me={me} setStatus={setStatus} reloadMe={reloadMe} signOut={signOut} />;
}
