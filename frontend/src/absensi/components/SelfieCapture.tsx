import { useCallback, useEffect, useRef, useState } from "react";

import { FACE_MATCH_THRESHOLD } from "../../../../workers/absensi/shared/constants.js";
import { averageEar, createBlinkDetector, createHeadTurnDetector, getHeadYawRatio } from "@/absensi/device/eyes";
import {
  DETECT_SCORE_ABSEN,
  DETECT_SCORE_ACUAN,
  detectSingleFace,
  faceDistance,
  loadFaceModels,
  type FaceDetection,
} from "@/absensi/device/face";
import { createMatchTracker, frameBrightness } from "@/absensi/device/faceMatch";
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
/** Jarak wajah terbaik dihitung dari frame beberapa detik terakhir, bukan satu frame saat kedip/tengok. */
const MATCH_WINDOW_MS = 3000;
/** Sesudah kedip/tengok/tombol, terus coba cocokkan selama ini sebelum menyerah. */
const MATCH_RETRY_MS = 8000;
/** Rata-rata kecerahan frame (0–255) di bawah ini dianggap terlalu gelap. */
const DARK_LUMA = 55;

const HINT_DARK = "Terlalu gelap. Nyalakan lampu atau hadap ke sumber cahaya";
const HINT_RETRY = "Mencocokkan wajah... hadap lurus ke kamera dan tahan sebentar";

type Phase = "starting" | "detecting" | "ready" | "mismatch" | "error";
type OneFace = Extract<FaceDetection, { kind: "one" }>;

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
  const lastFaceRef = useRef<OneFace | null>(null);
  const lastCenteredFaceRef = useRef<OneFace | null>(null);
  const trackerRef = useRef(createMatchTracker({ windowMs: MATCH_WINDOW_MS }));
  /** Waktu kedip/tengok/tombol pertama yang belum cocok; selama ini terisi, frame cocok langsung diambil. */
  const armedAtRef = useRef<number | null>(null);
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

  const finish = useCallback(async (face: OneFace, distance: number | null) => {
    const video = videoRef.current;
    if (!video) return;
    stopLoopRef.current();
    setCapturing(true);
    try {
      const jpeg = await captureJpeg(video);
      const descriptor = lastCenteredFaceRef.current?.descriptor ?? face.descriptor;
      onDoneRef.current({ jpeg, descriptor, distance });
    } finally {
      setCapturing(false);
    }
  }, []);

  /** Dipanggil saat kedip/tengok/tombol: ambil kalau wajah sudah cocok, kalau belum tunggu frame yang cocok. */
  const tryCapture = useCallback(async (face: OneFace, at: number): Promise<boolean> => {
    if (mode !== "match" || !referenceRef.current) {
      await finish(face, null);
      return true;
    }
    const best = trackerRef.current.best(at);
    if (best !== null && best < FACE_MATCH_THRESHOLD) {
      await finish(face, best);
      return true;
    }
    armedAtRef.current ??= at;
    setHint(HINT_RETRY);
    return false;
  }, [mode, finish]);

  useEffect(() => {
    if (!cameraReady) return undefined;
    if (mode === "photo") {
      setPhase("ready");
      setHint("Posisikan wajah lalu ambil foto.");
      return undefined;
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
    };
    stopLoopRef.current = stop;
    const blink = createBlinkDetector();
    const headTurn = createHeadTurnDetector();
    const minScore = mode === "acuan" ? DETECT_SCORE_ACUAN : DETECT_SCORE_ABSEN;
    trackerRef.current.reset();
    armedAtRef.current = null;

    const giveUp = () => {
      stop();
      armedAtRef.current = null;
      setPhase("mismatch");
      setError(messageFor("WAJAH_TIDAK_COCOK"));
    };

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      try {
        const face = await detectSingleFace(video, { minScore });
        if (stopped) return;
        const at = Date.now();
        const armedAt = armedAtRef.current;
        if (armedAt !== null && at - armedAt > MATCH_RETRY_MS) {
          giveUp();
          return;
        }
        if (face.kind !== "one") {
          blink.reset();
          headTurn.reset();
          lastFaceRef.current = null;
          lastCenteredFaceRef.current = null;
          setHasFace(false);
          const brightness = frameBrightness(video);
          if (face.kind === "many") setHint("Pastikan hanya satu wajah di kamera");
          else if (brightness !== null && brightness < DARK_LUMA) setHint(HINT_DARK);
          else setHint("Hadapkan wajah ke kamera");
        } else {
          lastFaceRef.current = face;
          const yaw = getHeadYawRatio(face.landmarks);
          if (yaw >= 0.42 && yaw <= 0.58) {
            lastCenteredFaceRef.current = face;
          }
          setHasFace(true);

          const ref = referenceRef.current;
          const distance = mode === "match" && ref ? faceDistance(face.descriptor, ref) : null;
          if (distance !== null) trackerRef.current.push(distance, at);

          if (armedAt !== null) {
            if (distance !== null && distance < FACE_MATCH_THRESHOLD) {
              setHint("Wajah terverifikasi!");
              await finish(face, distance);
              return;
            }
            const brightness = frameBrightness(video);
            setHint(brightness !== null && brightness < DARK_LUMA ? HINT_DARK : HINT_RETRY);
          } else {
            setHint("Tengok kiri / kanan sedikit, atau tekan Ambil Foto");
            const isTurn = headTurn.push(face.landmarks);
            const isBlink = blink.push(averageEar(face.landmarks));
            if ((isTurn || isBlink) && (await tryCapture(face, at))) {
              setHint("Wajah terverifikasi!");
              return;
            }
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

    return stop;
  }, [cameraReady, mode, attempt, finish, tryCapture]);

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
                void tryCapture(face, Date.now());
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
        <Button variant="outlined" disabled={capturing} onClick={onCancel}>Batal</Button>
      </div>
    </div>
  );
}
