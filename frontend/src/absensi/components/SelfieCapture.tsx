import { useCallback, useEffect, useRef, useState } from "react";

import { FACE_FRAMES_MAX } from "../../../../workers/absensi/shared/constants.js";
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
  /** Mode acuan: deskriptor wajah acuan untuk aktivasi. */
  descriptor: number[] | null;
  /** Mode match: deskriptor beberapa frame wajah lurus berturut-turut; Worker yang mencocokkan dengan wajah acuan. */
  descriptors: number[][] | null;
}

export interface SelfieCaptureProps {
  /** acuan: foto referensi aktivasi; match: scan wajah untuk absen (dicocokkan server); photo: foto biasa tanpa cek wajah. */
  mode: "acuan" | "match" | "photo";
  onDone: (result: SelfieResult) => void;
  onCancel: () => void;
}

const DETECT_EVERY_MS = 200;
/** Frame wajah lurus berturut-turut sebelum foto acuan diambil otomatis (≈1 detik diam). */
const ACUAN_STREAK = 4;
/** Lama mencoba sejak wajah pertama terlihat sebelum menyerah. */
const SCAN_TIMEOUT_MS = 25_000;
/** Wajah hilang selama ini di tengah scan = mulai lagi dari awal (wajah tidak boleh tertukar). */
const LOST_RESET_MS = 1_500;
/** Frame yang jaraknya sejauh ini dari frame pertama = wajah lain, scan diulang. */
const SAME_FACE_MAX_DISTANCE = 0.6;
/** Mode foto biasa (akun tanpa cek wajah): hitung mundur lalu foto otomatis. */
const PHOTO_COUNTDOWN_S = 3;
/** Rata-rata kecerahan frame (0–255) di bawah ini dianggap terlalu gelap. */
const DARK_LUMA = 55;
/** Pesan penting (mis. "Wajah berganti") tidak ditimpa petunjuk biasa selama ini. */
const NOTICE_MS = 1_500;
/** Dari 3 frame lurus terakhir, sebanyak ini tertutup = dianggap pakai masker. */
const COVERED_OF_LAST_3 = 2;
/** Frame lurus tanpa masker yang dicek dulu sebelum frame mulai dikumpulkan. */
const COVER_CHECK_MIN = 2;

const HINT_DARK = "Terlalu gelap. Nyalakan lampu atau hadap ke sumber cahaya";
const HINT_STRAIGHT = "Hadap lurus ke kamera";
const HINT_HOLD = "Tahan sebentar, sedang memindai wajah";
const HINT_ACUAN = "Hadap lurus ke kamera dan tahan sebentar";
const HINT_COVERED = "Hidung dan mulut harus terlihat. Lepas masker atau penutup wajah";
const HINT_MANY = "Pastikan hanya satu wajah di kamera";

type Phase = "starting" | "detecting" | "timeout" | "error";
type OneFace = Extract<FaceDetection, { kind: "one" }>;

function cameraErrorCode(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" ? "IZIN_KAMERA" : "KAMERA_TIDAK_ADA";
}

/** Hadap kurang lebih lurus ke kamera. */
const isCentered = (face: OneFace) => {
  const yaw = getHeadYawRatio(face.landmarks);
  return yaw >= 0.42 && yaw <= 0.58;
};

/**
 * Kamera depan; foto diambil otomatis, tanpa tombol ambil foto.
 * Mode match: cukup hadap lurus sebentar (tanpa tengok kiri/kanan), hidung + mulut harus terlihat (tanpa masker).
 * Cocok-tidaknya wajah diputuskan Worker dari deskriptor frame yang dikirim.
 */
export function SelfieCapture({ mode, onDone, onCancel }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [hint, setHint] = useState("Menyalakan kamera...");
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  // Naik setiap "Coba lagi" supaya pemindaian dimulai ulang.
  const [attempt, setAttempt] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
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

  const finish = useCallback(async (result: Omit<SelfieResult, "jpeg">) => {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    try {
      const jpeg = await captureJpeg(video);
      onDoneRef.current({ jpeg, ...result });
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
          void finish({ descriptor: null, descriptors: null });
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
    let firstFaceAt: number | null = null;
    let lastFaceAt: number | null = null;
    // Hasil cek masker frame lurus terakhir (true = tertutup).
    let coverHistory: boolean[] = [];
    // Acuan: frame lurus berturut-turut.
    let streak = 0;
    // Match: wajah frame pertama (untuk memastikan tidak tertukar) dan frame lurus yang dikumpulkan.
    let anchor: number[] | null = null;
    let frames: number[][] = [];

    // Petunjuk biasa (show) tidak menimpa pesan penting (notice) yang baru tampil; pindah langkah selalu tampil (say).
    let noticeUntil = 0;
    const show = (text: string) => {
      if (Date.now() >= noticeUntil) setHint(text);
    };
    const say = (text: string) => {
      noticeUntil = 0;
      setHint(text);
    };
    const notice = (text: string) => {
      noticeUntil = Date.now() + NOTICE_MS;
      setHint(text);
    };
    const restart = () => {
      anchor = null;
      frames = [];
      coverHistory = [];
    };
    const giveUp = () => {
      stop();
      setPhase("timeout");
      setError(messageFor("SCAN_WAJAH_BELUM_SELESAI"));
    };
    /** Catat hasil cek masker frame lurus; true kalau mayoritas 3 frame terakhir tertutup. */
    const coveredNow = (face: OneFace) => {
      coverHistory = [...coverHistory, face.cover === "tertutup"].slice(-3);
      return coverHistory.filter(Boolean).length >= COVERED_OF_LAST_3;
    };
    const lightingHint = (video: HTMLVideoElement, fallback: string) => {
      const brightness = frameBrightness(video);
      return brightness !== null && brightness < DARK_LUMA ? HINT_DARK : fallback;
    };

    /** Satu frame mode match; true kalau foto sudah diambil. */
    const matchFrame = async (face: OneFace, video: HTMLVideoElement): Promise<boolean> => {
      if (!isCentered(face)) {
        show(lightingHint(video, HINT_STRAIGHT));
        return false;
      }
      if (coveredNow(face)) {
        // Pakai masker: kumpulan frame dibuang.
        anchor = null;
        frames = [];
        say(HINT_COVERED);
        return false;
      }
      // Cek masker beberapa frame dulu sebelum frame mulai dikumpulkan.
      if (coverHistory.length < COVER_CHECK_MIN) {
        show(lightingHint(video, HINT_STRAIGHT));
        return false;
      }
      if (anchor && faceDistance(face.descriptor, anchor) > SAME_FACE_MAX_DISTANCE) {
        restart();
        notice("Wajah berganti. Ulangi: hadap lurus ke kamera");
        return false;
      }
      anchor ??= face.descriptor;
      frames = [...frames, face.descriptor];
      if (frames.length < FACE_FRAMES_MAX) {
        show(lightingHint(video, HINT_HOLD));
        return false;
      }
      stop();
      say("Memeriksa wajah...");
      await finish({ descriptor: null, descriptors: frames });
      return true;
    };

    /** Satu frame mode acuan; true kalau foto sudah diambil. */
    const acuanFrame = async (face: OneFace, video: HTMLVideoElement): Promise<boolean> => {
      const centered = isCentered(face);
      if (centered && coveredNow(face)) {
        streak = 0;
        setHint(HINT_COVERED);
        return false;
      }
      // Tunggu wajah lurus & diam beberapa frame supaya deskriptor acuannya bagus.
      streak = centered ? streak + 1 : 0;
      if (streak >= ACUAN_STREAK) {
        stop();
        setHint("Wajah terekam!");
        await finish({ descriptor: face.descriptor, descriptors: null });
        return true;
      }
      setHint(lightingHint(video, HINT_ACUAN));
      return false;
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
          if (face.kind === "many") {
            restart();
            notice(HINT_MANY);
          } else {
            // Wajah bisa sebentar tidak terbaca; lama hilang di tengah scan = mulai lagi (wajah tidak boleh tertukar).
            if (lastFaceAt !== null && at - lastFaceAt > LOST_RESET_MS && anchor) restart();
            show(lightingHint(video, "Hadapkan wajah ke kamera"));
          }
        } else {
          firstFaceAt ??= at;
          lastFaceAt = at;
          const done = mode === "match" ? await matchFrame(face, video) : await acuanFrame(face, video);
          if (done) return;
          if (mode === "match" && at - firstFaceAt > SCAN_TIMEOUT_MS) {
            giveUp();
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
    setHint("Menyiapkan pengenal wajah...");
    loadFaceModels()
      .then(() => {
        if (stopped) return;
        setPhase("detecting");
        setHint(mode === "match" ? HINT_STRAIGHT : "Hadapkan wajah ke kamera");
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
            {phase === "timeout" ? "Scan wajah belum selesai" : capturing ? "Memeriksa wajah..." : hint}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {phase === "timeout" && (
          <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Coba lagi</Button>
        )}
        <Button variant="outlined" disabled={capturing} onClick={onCancel}>Batal</Button>
      </div>
    </div>
  );
}
