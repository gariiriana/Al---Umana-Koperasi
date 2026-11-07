import { useCallback, useEffect, useRef, useState } from "react";

import { FACE_MATCH_THRESHOLD } from "../../../../workers/absensi/shared/constants.js";
import { getHeadYawRatio } from "@/absensi/device/eyes";
import {
  DETECT_SCORE_ABSEN,
  DETECT_SCORE_ACUAN,
  detectSingleFace,
  faceDistance,
  loadFaceModels,
  type FaceDetection,
} from "@/absensi/device/face";
import { frameBrightness } from "@/absensi/device/faceMatch";
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
/** Frame cocok berturut-turut sebelum foto diambil otomatis (satu frame kebetulan cocok tidak cukup). */
const MATCH_STREAK = 2;
/** Frame wajah lurus berturut-turut sebelum foto acuan diambil otomatis (≈1 detik diam). */
const ACUAN_STREAK = 4;
/** Lama mencoba sejak wajah pertama terlihat sebelum menyerah ("Wajah belum cocok"). */
const SCAN_TIMEOUT_MS = 12_000;
/** Mode foto biasa (akun tanpa cek wajah): hitung mundur lalu foto otomatis. */
const PHOTO_COUNTDOWN_S = 3;
/** Rata-rata kecerahan frame (0–255) di bawah ini dianggap terlalu gelap. */
const DARK_LUMA = 55;

const HINT_DARK = "Terlalu gelap. Nyalakan lampu atau hadap ke sumber cahaya";
const HINT_SCAN = "Memindai wajah... hadap lurus ke kamera dan tahan sebentar";
const HINT_ACUAN = "Hadap lurus ke kamera dan tahan sebentar";

type Phase = "starting" | "detecting" | "mismatch" | "error";
type OneFace = Extract<FaceDetection, { kind: "one" }>;

function cameraErrorCode(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" ? "IZIN_KAMERA" : "KAMERA_TIDAK_ADA";
}

const isCentered = (face: OneFace) => {
  const yaw = getHeadYawRatio(face.landmarks);
  return yaw >= 0.42 && yaw <= 0.58;
};

/** Kamera depan; foto diambil otomatis begitu wajah terpindai (cocok), tanpa tombol ambil foto. */
export function SelfieCapture({ mode, reference = null, onDone, onCancel }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [hint, setHint] = useState("Menyalakan kamera...");
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Naik setiap "Coba lagi" supaya pemindaian dimulai ulang.
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

  const finish = useCallback(async (descriptor: number[] | null, distance: number | null) => {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    try {
      const jpeg = await captureJpeg(video);
      onDoneRef.current({ jpeg, descriptor, distance });
    } finally {
      setCapturing(false);
    }
  }, []);

  useEffect(() => {
    if (!cameraReady) return undefined;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
    };
    setError(null);

    if (mode === "photo") {
      // Tanpa cek wajah: hitung mundur singkat lalu foto otomatis.
      setPhase("detecting");
      let left = PHOTO_COUNTDOWN_S;
      const countdown = () => {
        if (stopped) return;
        if (left === 0) {
          setHint("Mengambil foto...");
          void finish(null, null);
          return;
        }
        setHint(`Posisikan wajah, foto otomatis dalam ${left}...`);
        left -= 1;
        timer = setTimeout(countdown, 1000);
      };
      countdown();
      return stop;
    }

    const minScore = mode === "acuan" ? DETECT_SCORE_ACUAN : DETECT_SCORE_ABSEN;
    let streak = 0;
    let firstFaceAt: number | null = null;
    let bestCentered: OneFace | null = null;

    const giveUp = () => {
      stop();
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
        if (face.kind !== "one") {
          streak = 0;
          const brightness = frameBrightness(video);
          if (face.kind === "many") setHint("Pastikan hanya satu wajah di kamera");
          else if (brightness !== null && brightness < DARK_LUMA) setHint(HINT_DARK);
          else setHint("Hadapkan wajah ke kamera");
        } else {
          firstFaceAt ??= at;
          if (isCentered(face)) bestCentered = face;
          const ref = referenceRef.current;
          if (mode === "match" && ref) {
            const distance = faceDistance(face.descriptor, ref);
            streak = distance < FACE_MATCH_THRESHOLD ? streak + 1 : 0;
            if (streak >= MATCH_STREAK) {
              stop();
              setHint("Wajah terverifikasi!");
              await finish((bestCentered ?? face).descriptor, distance);
              return;
            }
          } else {
            // Acuan aktivasi: tunggu wajah lurus & diam beberapa frame supaya deskriptornya bagus.
            streak = isCentered(face) ? streak + 1 : 0;
            if (streak >= ACUAN_STREAK) {
              stop();
              setHint("Wajah terekam!");
              await finish(face.descriptor, null);
              return;
            }
          }
          if (mode === "match" && at - firstFaceAt > SCAN_TIMEOUT_MS) {
            giveUp();
            return;
          }
          const brightness = frameBrightness(video);
          if (brightness !== null && brightness < DARK_LUMA) setHint(HINT_DARK);
          else setHint(mode === "match" ? HINT_SCAN : HINT_ACUAN);
        }
      } catch {
        // Frame gagal dibaca (mis. video belum siap); coba frame berikutnya.
      }
      if (!stopped) {
        timer = setTimeout(tick, DETECT_EVERY_MS);
      }
    };

    setPhase("starting");
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
  }, [cameraReady, mode, attempt, finish]);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl bg-black">
        {/* Pratinjau dicerminkan seperti kaca; foto yang dikirim tidak. */}
        <video ref={videoRef} className="h-full w-full -scale-x-100 object-cover" playsInline muted />
        {phase === "detecting" && !capturing && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[58%] w-[62%] animate-pulse rounded-[45%] border-4 border-[#FBBF24]/80" />
          </div>
        )}
        {phase !== "error" && (
          <p
            aria-live="polite"
            className="absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-bold text-white"
          >
            {phase === "mismatch" ? "Wajah belum cocok" : capturing ? "Wajah terverifikasi!" : hint}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {phase === "mismatch" && (
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Button>
        )}
        <Button variant="outlined" disabled={capturing} onClick={onCancel}>Batal</Button>
      </div>
    </div>
  );
}
