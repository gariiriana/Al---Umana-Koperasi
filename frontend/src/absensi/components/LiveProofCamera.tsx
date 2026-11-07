import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, SwitchCamera } from "lucide-react";

import { captureWatermarkedPhoto } from "@/absensi/device/photo";
import { lateProofWatermark, type WatermarkLocation } from "@/absensi/logic/watermark";
import { messageFor } from "@/absensi/messages";
import { Button } from "@/components/ui/Button";

export interface LiveProofCameraProps {
  name: string;
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
  /** Jam sekarang (ms); bisa diganti di tes. */
  clock?: () => number;
}

type Facing = "environment" | "user";

function cameraErrorCode(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" ? "IZIN_KAMERA" : "KAMERA_TIDAK_ADA";
}

/** Kamera live di dalam aplikasi (default kamera belakang) dengan watermark waktu, nama, dan lokasi. */
export function LiveProofCamera({ name, onCapture, onCancel, clock = Date.now }: LiveProofCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Kamera + tombol Jepret langsung terlihat tanpa harus menggulir pop-up.
  useEffect(() => {
    boxRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, []);
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [now, setNow] = useState(clock);
  const [location, setLocation] = useState<WatermarkLocation | null>(null);

  // Jam di pratinjau watermark berjalan tiap detik.
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(timer);
  }, [clock]);

  // Lokasi untuk watermark (opsional; foto tetap bisa diambil tanpa lokasi).
  useEffect(() => {
    if (!navigator.geolocation?.getCurrentPosition) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (active) setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(messageFor(cameraErrorCode(err)));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  const lines = lateProofWatermark({ now, name, source: "kamera", location });

  const shoot = async () => {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    setError(null);
    try {
      onCapture(await captureWatermarkedPhoto(video, lateProofWatermark({ now: clock(), name, source: "kamera", location })));
    } catch {
      setError(messageFor("FOTO_ALASAN_TIDAK_VALID"));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="space-y-3" aria-label="Kamera foto bukti">
      <div ref={boxRef} className="relative mx-auto aspect-[3/4] max-h-[50vh] w-full overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
          playsInline
          muted
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Menyalakan kamera...
          </div>
        )}
        {/* Pratinjau watermark; versi final digambar ke foto saat diambil. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-3 pb-2.5 pt-8 text-left">
          {lines.map((line, i) => (
            <p
              key={i}
              className={`truncate text-[11px] leading-snug ${i === 0 ? "font-extrabold text-amber-300" : "font-semibold text-white"}`}
            >
              {line}
            </p>
          ))}
        </div>
        <button
          type="button"
          aria-label="Ganti kamera"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
        >
          <SwitchCamera className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p role="alert" className="text-center text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outlined" className="w-full" onClick={onCancel} disabled={capturing}>
          Kembali
        </Button>
        <Button
          type="button"
          variant="primary"
          className="w-full"
          onClick={() => void shoot()}
          disabled={!ready || capturing}
          leftIcon={<Camera className="h-4 w-4" aria-hidden="true" />}
        >
          Jepret
        </Button>
      </div>
    </div>
  );
}
