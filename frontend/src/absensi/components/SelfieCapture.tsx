import { useCallback, useEffect, useRef, useState } from "react";

import { FACE_MATCH_THRESHOLD } from "../../../../workers/absensi/shared/constants.js";
import { averageEar, createBlinkDetector } from "@/absensi/device/eyes";
import { detectSingleFace, faceDistance, loadFaceModels } from "@/absensi/device/face";
import { captureJpeg } from "@/absensi/device/selfie";
import { messageFor } from "@/absensi/messages";
import { Button } from "@/components/ui/Button";

export interface SelfieResult {
  jpeg: Blob;
  descriptor: number[] | null;
  distance: number | null;
}

export interface SelfieCaptureProps {
  /** acuan: foto referensi aktivasi; match: cocokkan dengan `reference`; photo: foto biasa tanpa cek wajah. */
  mode: "acuan" | "match" | "photo";
  reference?: number[] | null;
  onDone: (result: SelfieResult) => void;
  onCancel: () => void;
}

const DETECT_EVERY_MS = 200;

type Phase = "starting" | "detecting" | "ready" | "mismatch" | "error";

function cameraErrorCode(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" ? "IZIN_KAMERA" : "KAMERA_TIDAK_ADA";
}

/** Kamera depan; mode acuan/match baru mengambil foto setelah satu kedipan terdeteksi. */
export function SelfieCapture({ mode, reference = null, onDone, onCancel }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [hint, setHint] = useState("Menyalakan kamera...");
  const [error, setError] = useState<string | null>(null);
  // Naik setiap "Coba lagi" supaya loop deteksi dimulai ulang.
  const [attempt, setAttempt] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  const onDoneRef = useRef(onDone);
  const referenceRef = useRef(reference);
  useEffect(() => {
    onDoneRef.current = onDone;
    referenceRef.current = reference;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setCameraReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(messageFor(cameraErrorCode(err)));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!cameraReady) return undefined;
    if (mode === "photo") {
      setPhase("ready");
      setHint("Posisikan wajah lalu ambil foto.");
      return undefined;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const blink = createBlinkDetector();

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      try {
        const face = await detectSingleFace(video);
        if (stopped) return;
        if (face.kind === "none") {
          blink.reset();
          setHint("Hadapkan wajah ke kamera");
        } else if (face.kind === "many") {
          blink.reset();
          setHint("Pastikan hanya satu wajah di kamera");
        } else {
          setHint("Kedipkan mata sekali");
          if (blink.push(averageEar(face.landmarks))) {
            const jpeg = await captureJpeg(video);
            if (stopped) return;
            const ref = referenceRef.current;
            const distance = mode === "match" && ref ? faceDistance(face.descriptor, ref) : null;
            if (distance !== null && distance >= FACE_MATCH_THRESHOLD) {
              setPhase("mismatch");
              setError(messageFor("WAJAH_TIDAK_COCOK"));
              return;
            }
            onDoneRef.current({ jpeg, descriptor: face.descriptor, distance });
            return;
          }
        }
      } catch {
        // Frame gagal dibaca (mis. video belum siap); coba frame berikutnya.
      }
      timer = setTimeout(tick, DETECT_EVERY_MS);
    };

    setPhase("starting");
    setError(null);
    setHint("Menyiapkan pengenal wajah...");
    loadFaceModels()
      .then(() => {
        if (stopped) return;
        setPhase("detecting");
        setHint("Hadapkan wajah ke kamera");
        void tick();
      })
      .catch(() => {
        if (stopped) return;
        setPhase("error");
        setError(messageFor("MODEL_WAJAH_GAGAL"));
      });

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [cameraReady, mode, attempt]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    onDoneRef.current({ jpeg: await captureJpeg(video), descriptor: null, distance: null });
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl bg-black">
        {/* Pratinjau dicerminkan seperti kaca; foto yang dikirim tidak. */}
        <video ref={videoRef} className="h-full w-full -scale-x-100 object-cover" playsInline muted />
        {phase !== "error" && (
          <p
            aria-live="polite"
            className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-bold text-white"
          >
            {phase === "mismatch" ? "Wajah belum cocok" : hint}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]">
          {error}
        </p>
      )}

      <div className="flex justify-center gap-2">
        {phase === "ready" && (
          <Button variant="primary" onClick={() => void takePhoto()}>Ambil foto</Button>
        )}
        {phase === "mismatch" && (
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Button>
        )}
        <Button variant="secondary" onClick={onCancel}>Batal</Button>
      </div>
    </div>
  );
}
