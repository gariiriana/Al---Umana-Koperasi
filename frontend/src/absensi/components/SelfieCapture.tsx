import { useCallback, useEffect, useRef, useState } from "react";

import { FACE_MATCH_THRESHOLD } from "../../../../workers/absensi/shared/constants.js";
import { averageEar, createBlinkDetector, createHeadTurnDetector, getHeadYawRatio } from "@/absensi/device/eyes";
import { detectSingleFace, faceDistance, loadFaceModels, type FaceDetection } from "@/absensi/device/face";
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

/** Kamera depan; mengambil foto lewat kedip, tengok kiri/kanan, atau tombol ambil foto. */
export function SelfieCapture({ mode, reference = null, onDone, onCancel }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [hint, setHint] = useState("Menyalakan kamera...");
  const [error, setError] = useState<string | null>(null);
  const [hasFace, setHasFace] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // Naik setiap "Coba lagi" supaya loop deteksi dimulai ulang.
  const [attempt, setAttempt] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const lastFaceRef = useRef<Extract<FaceDetection, { kind: "one" }> | null>(null);
  const lastCenteredFaceRef = useRef<Extract<FaceDetection, { kind: "one" }> | null>(null);
  const stopLoopRef = useRef<() => void>(() => {});

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

  const handleCapture = useCallback(async (face: { descriptor: number[] }) => {
    const video = videoRef.current;
    if (!video) return;
    stopLoopRef.current();
    setCapturing(true);
    try {
      const jpeg = await captureJpeg(video);
      const centeredDescriptor = lastCenteredFaceRef.current?.descriptor ?? face.descriptor;
      const ref = referenceRef.current;
      let distance: number | null = null;
      if (mode === "match" && ref) {
        distance = Math.min(faceDistance(face.descriptor, ref), faceDistance(centeredDescriptor, ref));
      }
      if (distance !== null && distance >= FACE_MATCH_THRESHOLD) {
        setPhase("mismatch");
        setError(messageFor("WAJAH_TIDAK_COCOK"));
        return;
      }
      onDoneRef.current({ jpeg, descriptor: centeredDescriptor, distance });
    } finally {
      setCapturing(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!cameraReady) return undefined;
    if (mode === "photo") {
      setPhase("ready");
      setHint("Posisikan wajah lalu ambil foto.");
      return undefined;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    stopLoopRef.current = () => {
      stopped = true;
      clearTimeout(timer);
    };
    const blink = createBlinkDetector();
    const headTurn = createHeadTurnDetector();

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      try {
        const face = await detectSingleFace(video);
        if (stopped) return;
        if (face.kind === "none") {
          blink.reset();
          headTurn.reset();
          lastFaceRef.current = null;
          lastCenteredFaceRef.current = null;
          setHasFace(false);
          setHint("Hadapkan wajah ke kamera");
        } else if (face.kind === "many") {
          blink.reset();
          headTurn.reset();
          lastFaceRef.current = null;
          lastCenteredFaceRef.current = null;
          setHasFace(false);
          setHint("Pastikan hanya satu wajah di kamera");
        } else {
          lastFaceRef.current = face;
          const yaw = getHeadYawRatio(face.landmarks);
          if (yaw >= 0.42 && yaw <= 0.58) {
            lastCenteredFaceRef.current = face;
          }
          setHasFace(true);
          setHint("Tengok kiri / kanan sedikit, atau tekan Ambil Foto");
          const isTurn = headTurn.push(face.landmarks);
          const isBlink = blink.push(averageEar(face.landmarks));
          if (isTurn || isBlink) {
            setHint("Wajah terverifikasi!");
            await handleCapture(face);
            return;
          }
        }
      } catch {
        // Frame gagal dibaca (mis. video belum siap); coba frame berikutnya.
      }
      if (!stopped) {
        timer = setTimeout(tick, DETECT_EVERY_MS);
      }
    };

    setPhase("starting");
    setError(null);
    setHasFace(false);
    lastFaceRef.current = null;
    lastCenteredFaceRef.current = null;
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
  }, [cameraReady, mode, attempt, handleCapture]);

  const takePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    try {
      onDoneRef.current({ jpeg: await captureJpeg(video), descriptor: null, distance: null });
    } finally {
      setCapturing(false);
    }
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

      <div className="flex flex-wrap justify-center gap-2">
        {phase === "detecting" && hasFace && (
          <Button
            variant="primary"
            disabled={capturing}
            onClick={() => {
              const face = lastCenteredFaceRef.current ?? lastFaceRef.current;
              if (face) {
                void handleCapture(face);
              }
            }}
          >
            Ambil foto
          </Button>
        )}
        {phase === "ready" && (
          <Button variant="primary" disabled={capturing} onClick={() => void takePhoto()}>Ambil foto</Button>
        )}
        {phase === "mismatch" && (
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Button>
        )}
        <Button variant="secondary" disabled={capturing} onClick={onCancel}>Batal</Button>
      </div>
    </div>
  );
}
