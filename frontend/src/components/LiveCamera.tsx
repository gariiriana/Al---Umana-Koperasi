import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera,
  RotateCcw,
  X,
  MapPin,
  Loader2,
  AlertTriangle,
  Check,
  Download,
  ZoomIn,
  ZoomOut,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
} from "lucide-react";
import { getSecureTime, isTimeManipulated } from "@/services/secureTimeService";
import { verifyGpsLocation } from "@/services/gpsVerification";
import { reverseGeocode } from "@/services/geocodingService";

export interface LiveCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  activityType: "PRODUKSI" | "PENGIRIMAN" | "START_OTW" | "HANDOVER";
  orderId: string;
}

export function LiveCamera({
  isOpen,
  onClose,
  onCapture,
  activityType,
  orderId,
}: LiveCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("Sedang mencari alamat...");
  const [, setGpsError] = useState<string | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedBlobUrl, setCapturedBlobUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [gpsCheck, setGpsCheck] = useState<{ isValid: boolean; reason?: string }>({ isValid: true });
  const [timeCheck, setTimeCheck] = useState<boolean>(true);

  // Zoom & Flash state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);

  // Pinch-to-zoom refs
  const lastPinchDistance = useRef<number | null>(null);

  const getActivityLabel = () => {
    switch (activityType) {
      case "PRODUKSI":
        return "PRODUKSI MASAK";
      case "PENGIRIMAN":
        return "BUKTI PENGIRIMAN";
      case "START_OTW":
        return "MULAI PERJALANAN";
      case "HANDOVER":
        return "SERAH TERIMA DAPUR";
      default:
        return "KEGIATAN";
    }
  };

  // ─── 1. GPS Watch ───
  useEffect(() => {
    if (!isOpen) return;

    if (!navigator.geolocation) {
      setGpsError("Geolocation tidak didukung oleh browser Anda.");
      return;
    }

    setGpsError(null);
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsCoords({ lat: latitude, lng: longitude, accuracy });

        const check = verifyGpsLocation(latitude, longitude, accuracy);
        setGpsCheck({ isValid: check.isValid, reason: check.reason });

        const timeManipulated = isTimeManipulated();
        setTimeCheck(!timeManipulated);

        try {
          const addr = await reverseGeocode(latitude, longitude);
          setGpsAddress(addr);
        } catch {
          setGpsAddress("Alamat gagal dimuat");
        }
      },
      (err) => {
        console.error("GPS Error:", err);
        setGpsError("Gagal mendapatkan lokasi. Pastikan izin GPS aktif.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [isOpen]);

  // ─── 2. Load Camera Devices ───
  useEffect(() => {
    if (!isOpen) return;

    const getDevices = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
        if (videoDevices.length > 0 && !selectedDeviceId) {
          const backCam = videoDevices.find(
            (d) =>
              d.label.toLowerCase().includes("back") ||
              d.label.toLowerCase().includes("environment")
          );
          setSelectedDeviceId(backCam ? backCam.deviceId : videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error listing cameras:", err);
      }
    };
    void getDevices();
  }, [isOpen, selectedDeviceId]);

  // ─── 3. Start Camera Stream ───
  useEffect(() => {
    if (!isOpen) return;

    const startCamera = async () => {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : { facingMode },
        audio: false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Probe zoom & flash capabilities from track
        const track = stream.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
          if (caps) {
            // Zoom
            const zoomCaps = caps.zoom as { min?: number; max?: number; step?: number } | undefined;
            if (zoomCaps && typeof zoomCaps.min === "number" && typeof zoomCaps.max === "number") {
              setMinZoom(zoomCaps.min);
              setMaxZoom(zoomCaps.max);
              setZoomLevel(zoomCaps.min);
            } else {
              setMinZoom(1);
              setMaxZoom(1);
              setZoomLevel(1);
            }
            // Flash / Torch
            const torchSupported = Array.isArray(caps.torch) ? (caps.torch as boolean[]).includes(true) : caps.torch === true;
            setFlashSupported(torchSupported);
            setFlashOn(false);
          }
        }
      } catch (err) {
        console.error("Gagal membuka kamera:", err);
        setCameraError("Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.");
      }
    };

    void startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, selectedDeviceId, facingMode]);

  // ─── Apply Zoom ───
  const applyZoom = useCallback(
    (level: number) => {
      const clamped = Math.min(maxZoom, Math.max(minZoom, level));
      setZoomLevel(clamped);
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        try {
          (track as unknown as { applyConstraints: (c: Record<string, unknown>) => Promise<void> })
            .applyConstraints({ advanced: [{ zoom: clamped }] } as unknown as Record<string, unknown>);
        } catch {
          /* zoom not supported on this device */
        }
      }
    },
    [maxZoom, minZoom]
  );

  // ─── Toggle Flash / Torch ───
  const toggleFlash = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newState = !flashOn;
    try {
      (track as unknown as { applyConstraints: (c: Record<string, unknown>) => Promise<void> })
        .applyConstraints({ advanced: [{ torch: newState }] } as unknown as Record<string, unknown>);
      setFlashOn(newState);
    } catch {
      /* torch not supported */
    }
  }, [flashOn]);

  // ─── Toggle front/back camera ───
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    setSelectedDeviceId("");
    setZoomLevel(1);
    setFlashOn(false);
  };

  // ─── Pinch-to-zoom handlers ───
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || maxZoom <= minZoom) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (lastPinchDistance.current !== null) {
        const delta = (dist - lastPinchDistance.current) * 0.01;
        applyZoom(zoomLevel + delta * (maxZoom - minZoom));
      }
      lastPinchDistance.current = dist;
    },
    [applyZoom, maxZoom, minZoom, zoomLevel]
  );

  const handleTouchEnd = useCallback(() => {
    lastPinchDistance.current = null;
  }, []);

  // ─── Draw transparent watermark & capture ───
  const takePhoto = async () => {
    if (!videoRef.current || !gpsCoords) return;
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    // 1. Draw full video frame
    ctx.drawImage(video, 0, 0, w, h);

    // 2. Draw transparent watermark text — NO background box
    const scale = w / 1280;
    const margin = 20 * scale;

    // Helper: draw text with shadow for readability on any background
    const drawWatermarkText = (
      text: string,
      x: number,
      y: number,
      font: string,
      color: string,
      alpha = 0.85
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = font;
      ctx.fillStyle = color;
      // Text shadow for contrast
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 6 * scale;
      ctx.shadowOffsetX = 1 * scale;
      ctx.shadowOffsetY = 1 * scale;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    // Bottom-left watermark — draw from BOTTOM UP so text is flush to edge
    const x = margin;
    const gap = 17 * scale; // tight line spacing

    // Calculate positions bottom-up
    const addressText = gpsAddress || "Lokasi tidak teridentifikasi";
    const addressTruncated = addressText.length > 65 ? addressText.slice(0, 65) + "…" : addressText;

    const yAddress = h - margin;
    const yCoords = yAddress - gap;
    const yTime = yCoords - gap;
    const yActivity = yTime - gap;
    const yBrand = yActivity - gap * 1.1;

    // Brand name
    drawWatermarkText(
      "KOPERASI AL-UMANAA",
      x, yBrand,
      `bold ${Math.round(20 * scale)}px 'Manrope', system-ui, sans-serif`,
      "#fbbf24",
      0.95
    );

    // Activity type
    drawWatermarkText(
      `KEGIATAN: ${getActivityLabel()}`,
      x, yActivity,
      `bold ${Math.round(14 * scale)}px 'Manrope', system-ui, sans-serif`,
      "#ffffff",
      0.9
    );

    // Verified time
    const verifiedTime = getSecureTime();
    const timeString =
      verifiedTime.toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "medium",
      }) + " WIB";
    drawWatermarkText(
      timeString,
      x, yTime,
      `${Math.round(13 * scale)}px 'Hanken Grotesk', system-ui, sans-serif`,
      "#ffffff",
      0.85
    );

    // GPS coords
    drawWatermarkText(
      `📍 ${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}  (±${Math.round(gpsCoords.accuracy)}m)`,
      x, yCoords,
      `bold ${Math.round(12 * scale)}px 'Hanken Grotesk', system-ui, sans-serif`,
      "#fbbf24",
      0.9
    );

    // Address
    drawWatermarkText(
      addressTruncated,
      x, yAddress,
      `${Math.round(11 * scale)}px 'Hanken Grotesk', system-ui, sans-serif`,
      "#ffffff",
      0.7
    );

    // Top-right: verified badge text (transparent)
    drawWatermarkText(
      "✓ TERVERIFIKASI",
      w - margin - 160 * scale,
      margin + 20 * scale,
      `bold ${Math.round(13 * scale)}px 'Manrope', system-ui, sans-serif`,
      "#34d399",
      0.85
    );

    // 3. Output image blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `live_proof_${orderId}_${Date.now()}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          const url = URL.createObjectURL(blob);
          setCapturedBlobUrl(url);
          setCapturedFile(file);
        }
        setIsCapturing(false);
      },
      "image/jpeg",
      0.90
    );
  };

  // ─── Retake / Download / Confirm ───
  const retakePhoto = () => {
    if (capturedBlobUrl) URL.revokeObjectURL(capturedBlobUrl);
    setCapturedBlobUrl(null);
    setCapturedFile(null);
  };

  const downloadPhoto = () => {
    if (capturedBlobUrl && capturedFile) {
      const a = document.createElement("a");
      a.href = capturedBlobUrl;
      a.download = capturedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const confirmPhoto = () => {
    if (capturedFile) {
      onCapture(capturedFile);
      onClose();
      retakePhoto();
    }
  };

  const handleClose = () => {
    retakePhoto();
    setFlashOn(false);
    onClose();
  };

  if (!isOpen) return null;

  const zoomAvailable = maxZoom > minZoom;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 animate-fade-in font-['Hanken_Grotesk']">
      <div className="w-full max-w-lg bg-[#111827] rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col relative max-h-[95vh]">

        {/* ═══ Header ═══ */}
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <Camera className="h-5 w-5 text-amber-500 animate-pulse" />
            </div>
            <div>
              <h3 className="font-['Manrope',system-ui] font-bold text-sm text-white">
                Ambil Foto Dokumentasi
              </h3>
              {gpsCoords ? (
                <span className="text-[10px] text-neutral-400 font-mono flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-amber-500" />
                  {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)} (±{Math.round(gpsCoords.accuracy)}m)
                </span>
              ) : (
                <span className="text-[10px] text-neutral-500">Mencari sinyal GPS...</span>
              )}
            </div>
          </div>

          <button
            title="Tutup"
            onClick={handleClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ═══ Camera Viewport ═══ */}
        <div
          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden aspect-[4/3] sm:aspect-video min-h-[300px]"
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {!capturedBlobUrl ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Corner guides */}
              <div className="absolute inset-4 pointer-events-none border border-white/10 rounded-2xl">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/60 rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/60 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/60 rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/60 rounded-br-xl" />
              </div>

              {/* ─── Live Watermark Preview (transparent text, no box) ─── */}
              {gpsCoords && (
                <div className="absolute bottom-3 left-3 right-3 pointer-events-none select-none">
                  <div className="space-y-0.5 text-[10px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    <p className="font-extrabold text-[#fbbf24] text-[12px] tracking-wide font-['Manrope',system-ui]">
                      KOPERASI AL-UMANAA
                    </p>
                    <p className="font-bold text-white text-[10px]">
                      KEGIATAN: {getActivityLabel()}
                    </p>
                    <p className="text-white/80 text-[9px]">
                      {getSecureTime().toLocaleString("id-ID")} WIB
                    </p>
                    <p className="text-[#fbbf24] font-semibold text-[9px] flex items-center gap-0.5">
                      📍 {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
                      <span className="text-[8px] text-white/50 font-normal ml-1">
                        (±{Math.round(gpsCoords.accuracy)}m)
                      </span>
                    </p>
                    <p className="text-white/60 text-[9px] truncate max-w-[90%]">{gpsAddress}</p>
                  </div>
                </div>
              )}

              {/* Top-right verified badge */}
              {gpsCoords && (
                <div className="absolute top-3 right-3 pointer-events-none select-none">
                  <span className="text-emerald-400 text-[9px] font-bold font-['Manrope',system-ui] drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                    ✓ TERVERIFIKASI
                  </span>
                </div>
              )}

              {/* ─── Camera Toolbar (right side, vertical) ─── */}
              <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                {/* Switch front/back camera */}
                <button
                  onClick={toggleFacingMode}
                  title={facingMode === "environment" ? "Kamera Depan" : "Kamera Belakang"}
                  className="p-2.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full transition active:scale-90"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>

                {/* Flash toggle */}
                {flashSupported && (
                  <button
                    onClick={toggleFlash}
                    title={flashOn ? "Matikan Flash" : "Nyalakan Flash"}
                    className={`p-2.5 backdrop-blur-sm rounded-full transition active:scale-90 ${
                      flashOn
                        ? "bg-amber-500 text-[#111827]"
                        : "bg-black/50 hover:bg-black/70 text-white"
                    }`}
                  >
                    {flashOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
                  </button>
                )}
              </div>

              {/* ─── Zoom Slider (right side, vertical) ─── */}
              {zoomAvailable && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-10">
                  <button
                    onClick={() => applyZoom(zoomLevel + (maxZoom - minZoom) * 0.1)}
                    title="Zoom In"
                    className="p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full transition active:scale-90"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>

                  {/* Vertical slider */}
                  <div className="relative h-28 w-6 flex items-center justify-center">
                    <input
                      type="range"
                      min={minZoom}
                      max={maxZoom}
                      step={0.1}
                      value={zoomLevel}
                      onChange={(e) => applyZoom(parseFloat(e.target.value))}
                      title={`Zoom ${zoomLevel.toFixed(1)}x`}
                      className="absolute h-24 w-6 appearance-none bg-transparent cursor-pointer vertical-zoom-slider"
                    />
                  </div>

                  <button
                    onClick={() => applyZoom(zoomLevel - (maxZoom - minZoom) * 0.1)}
                    title="Zoom Out"
                    className="p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white rounded-full transition active:scale-90"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>

                  {/* Zoom level indicator */}
                  <span className="text-[9px] text-white/70 font-mono bg-black/40 px-1.5 py-0.5 rounded">
                    {zoomLevel.toFixed(1)}x
                  </span>
                </div>
              )}
            </>
          ) : (
            // Preview captured photo
            <img
              src={capturedBlobUrl}
              alt="Bukti Terambil"
              className="w-full h-full object-contain bg-neutral-900"
            />
          )}

          {/* Loading spinner */}
          {isCapturing && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <span className="text-xs font-semibold">Mengambil Foto...</span>
            </div>
          )}

          {/* Camera Error */}
          {cameraError && (
            <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center p-6 text-center text-white gap-3">
              <AlertTriangle className="h-10 w-10 text-red-500 animate-bounce" />
              <p className="text-xs font-bold text-red-200">{cameraError}</p>
              <button
                onClick={() => {
                  setCameraError(null);
                  setFacingMode("environment");
                }}
                className="px-4 py-2 bg-neutral-800 text-xs font-bold rounded-xl hover:bg-neutral-700 transition"
              >
                Coba Lagi
              </button>
            </div>
          )}
        </div>

        {/* ═══ GPS / Time Spoofing Warning ═══ */}
        {isOpen && gpsCoords && (!gpsCheck.isValid || !timeCheck) && (
          <div className="bg-red-950/90 border-t border-b border-red-800/60 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5 animate-pulse" />
            <div className="text-[11px] text-red-200 leading-normal font-medium">
              <span className="font-bold text-red-400 block mb-0.5">⚠️ PERINGATAN KEAMANAN</span>
              {!gpsCheck.isValid && <p>{gpsCheck.reason || "GPS tidak valid / spoofing terdeteksi."}</p>}
              {!timeCheck && (
                <p>Manipulasi waktu terdeteksi! Silakan kembalikan jam sistem perangkat Anda ke waktu otomatis.</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ Footer Controls ═══ */}
        <div className="p-4 bg-[#0f172a] border-t border-neutral-800 flex items-center justify-center">
          {!capturedBlobUrl ? (
            // Snap Photo Control
            <button
              onClick={takePhoto}
              disabled={isCapturing || !!cameraError || !gpsCoords || !gpsCheck.isValid || !timeCheck}
              className="relative flex items-center justify-center h-16 w-16 bg-white hover:bg-neutral-100 disabled:bg-neutral-800 disabled:opacity-40 rounded-full transition shadow-lg shrink-0 cursor-pointer disabled:cursor-not-allowed group active:scale-95"
              title="Ambil Foto"
            >
              <div className="absolute -inset-1.5 border-2 border-white rounded-full group-hover:scale-105 transition duration-150" />
              <div className="h-12 w-12 border-4 border-[#111827] rounded-full bg-white shrink-0" />
            </button>
          ) : (
            // 3 action buttons: Ulangi / Download / Pakai Foto
            <div className="flex gap-2.5 w-full">
              <button
                onClick={retakePhoto}
                className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Ulangi
              </button>
              <button
                onClick={downloadPhoto}
                className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 border border-neutral-700"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={confirmPhoto}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-[#111827] font-bold text-xs rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                Pakai Foto
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
