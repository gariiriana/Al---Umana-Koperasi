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
import { averageYaw, turnProgress, yawSample, type YawSample } from "@/absensi/device/headTurn";
import { captureJpeg } from "@/absensi/device/selfie";
import { messageFor } from "@/absensi/messages";
import { Button } from "@/components/ui/Button";

export interface SelfieResult {
  jpeg: Blob;
  /** Mode acuan: deskriptor wajah acuan untuk aktivasi. */
  descriptor: number[] | null;
  /** Mode match: deskriptor beberapa frame sesudah menoleh; Worker yang mencocokkan dengan wajah acuan. */
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
/** Frame sesudah menoleh yang jaraknya sejauh ini dari wajah awal = wajah lain, scan diulang. */
const SAME_FACE_MAX_DISTANCE = 0.6;
/** Mode foto biasa (akun tanpa cek wajah): hitung mundur lalu foto otomatis. */
const PHOTO_COUNTDOWN_S = 3;
/** Rata-rata kecerahan frame (0–255) di bawah ini dianggap terlalu gelap. */
const DARK_LUMA = 55;
/** Pesan penting (mis. "Wajah berganti") tidak ditimpa petunjuk biasa selama ini. */
const NOTICE_MS = 1_500;
/** Dari 3 frame lurus terakhir, sebanyak ini tertutup = dianggap pakai masker. */
const COVERED_OF_LAST_3 = 2;
/** Sesudah patokan lurus ada: menoleh kurang dari setengah ambang tengok = masih dianggap hadap lurus. */
const STRAIGHT_PROGRESS_MAX = 0.5;
/** Patokan lurus = rata-rata frame lurus terakhir sebanyak ini. */
const BASELINE_FRAMES = 3;

const HINT_DARK = "Terlalu gelap. Nyalakan lampu atau hadap ke sumber cahaya";
const HINT_STRAIGHT = "Hadap lurus ke kamera";
const HINT_TURN = "Tengok ke kiri atau kanan sampai garis penuh";
const HINT_TURN_MORE = "Sedikit lagi, tengok lebih jauh";
const HINT_BACK = "Hadap lurus lagi dan tahan sebentar";
const HINT_ACUAN = "Hadap lurus ke kamera dan tahan sebentar";
const HINT_COVERED = "Hidung dan mulut harus terlihat. Lepas masker atau penutup wajah";
const HINT_MANY = "Pastikan hanya satu wajah di kamera";

type Phase = "starting" | "detecting" | "timeout" | "error";
type OneFace = Extract<FaceDetection, { kind: "one" }>;
/** Langkah scan mode match: lurus → tengok ke samping → lurus lagi (frame dikumpulkan). */
type Step = "lurus" | "toleh" | "kembali";

function cameraErrorCode(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" ? "IZIN_KAMERA" : "KAMERA_TIDAK_ADA";
}

/** Hadap lurus menurut angka tetap; dipakai sebelum ada patokan lurus orang itu sendiri. */
const isCentered = (face: OneFace) => {
  const yaw = getHeadYawRatio(face.landmarks);
  return yaw >= 0.42 && yaw <= 0.58;
};

/**
 * Kamera depan; foto diambil otomatis, tanpa tombol ambil foto.
 * Mode match: wajah harus menoleh sekali (bukti wajah hidup, bukan foto) dan hidung + mulut terlihat (tanpa masker).
 * Cocok-tidaknya wajah diputuskan Worker dari deskriptor frame yang dikirim.
 */
export function SelfieCapture({ mode, onDone, onCancel }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [hint, setHint] = useState("Menyalakan kamera...");
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState<Step | null>(null);
  // Langkah tengok: seberapa jauh sudah menoleh (0–1) untuk garis petunjuk.
  const [turn, setTurn] = useState(0);
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
    setProgress(null);

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
    // Match: langkah, wajah awal (untuk memastikan tidak tertukar), dan frame yang dikumpulkan sesudah menoleh.
    let step: Step = "lurus";
    let anchor: number[] | null = null;
    let frames: number[][] = [];
    // Posisi lurus orang itu sendiri (dari frame lurus terakhir); tengok & lurus lagi diukur dari sini.
    let straightSamples: YawSample[] = [];
    let baseline: YawSample | null = null;

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
    const goTo = (next: Step) => {
      step = next;
      setProgress(next);
      setTurn(0);
    };
    const restart = () => {
      anchor = null;
      frames = [];
      coverHistory = [];
      straightSamples = [];
      baseline = null;
      goTo("lurus");
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
      const sample = yawSample(face.landmarks);
      const turned = baseline ? turnProgress(sample, baseline) : 0;
      // Sebelum ada patokan: angka tetap. Sesudahnya: dekat posisi lurus orang itu sendiri.
      const centered = baseline ? turned < STRAIGHT_PROGRESS_MAX : isCentered(face);
      const covered = centered && coveredNow(face);
      if (covered) {
        // Pakai masker: kumpulan frame dibuang, tapi langkah menoleh tidak perlu diulang.
        frames = [];
        if (step === "lurus") anchor = null;
        say(HINT_COVERED);
        return false;
      }
      if (step === "lurus") {
        if (centered) straightSamples = [...straightSamples, sample].slice(-BASELINE_FRAMES);
        // Minimal 2 frame lurus tanpa masker sebelum diminta menoleh.
        if (centered && coverHistory.length >= 2) {
          anchor = face.descriptor;
          baseline = averageYaw(straightSamples);
          goTo("toleh");
          say(HINT_TURN);
        } else {
          show(lightingHint(video, HINT_STRAIGHT));
        }
        return false;
      }
      if (step === "toleh") {
        if (turned >= 1) {
          goTo("kembali");
          say(HINT_BACK);
        } else {
          setTurn(turned);
          show(turned >= STRAIGHT_PROGRESS_MAX ? HINT_TURN_MORE : HINT_TURN);
        }
        return false;
      }
      // step "kembali": kumpulkan frame lurus dari wajah yang sama.
      if (!centered) {
        show(HINT_BACK);
        return false;
      }
      if (anchor && faceDistance(face.descriptor, anchor) > SAME_FACE_MAX_DISTANCE) {
        restart();
        notice("Wajah berganti. Ulangi: hadap lurus ke kamera");
        return false;
      }
      frames = [...frames, face.descriptor];
      if (frames.length < FACE_FRAMES_MAX) {
        show(lightingHint(video, HINT_BACK));
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
            // Saat menoleh wajah bisa sebentar tidak terbaca; lama hilang = mulai lagi.
            if (lastFaceAt !== null && at - lastFaceAt > LOST_RESET_MS && step !== "lurus") restart();
            show(lightingHint(video, step === "toleh" ? HINT_TURN : "Hadapkan wajah ke kamera"));
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
        if (mode === "match") goTo("lurus");
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
        {mode === "match" && phase === "detecting" && progress && (
          <ol
            aria-label="Langkah scan wajah"
            className="absolute inset-x-0 top-3 flex justify-center gap-2 font-['Hanken_Grotesk',system-ui,sans-serif] text-[11px] font-bold"
          >
            {(["lurus", "toleh", "kembali"] as const).map((s, i) => {
              const order = ["lurus", "toleh", "kembali"].indexOf(progress);
              const state = i < order ? "done" : i === order ? "now" : "next";
              return (
                <li
                  key={s}
                  aria-current={state === "now" ? "step" : undefined}
                  className={`rounded-full px-2.5 py-1 ${
                    state === "done" ? "bg-emerald-500 text-white" : state === "now" ? "bg-[#FBBF24] text-neutral-950" : "bg-black/50 text-white/80"
                  }`}
                >
                  {i + 1}. {s === "lurus" ? "Lurus" : s === "toleh" ? "Tengok" : "Lurus lagi"}
                </li>
              );
            })}
          </ol>
        )}
        {mode === "match" && phase === "detecting" && progress === "toleh" && (
          <div
            role="progressbar"
            aria-label="Seberapa jauh menoleh"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(turn, 1) * 100)}
            className="absolute inset-x-10 top-12 h-2.5 overflow-hidden rounded-full bg-black/50"
          >
            <div
              className="h-full rounded-full bg-[#FBBF24] transition-[width] duration-200"
              style={{ width: `${Math.round(Math.min(turn, 1) * 100)}%` }}
            />
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
