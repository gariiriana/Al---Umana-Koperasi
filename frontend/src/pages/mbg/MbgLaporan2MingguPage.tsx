// ============================================================================
// Laporan 2 Minggu: pilih periode → tambah foto per hari per bagian → download Word/PDF.
// Isi laporan dari data PM Admin MBG + menu Produksi MBG + data tetap (constants/mbgLaporanMaster).
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileDown,
  FileText,
  ImagePlus,
  Loader2,
  Soup,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  PHOTO_SECTIONS,
  addDays,
  buildLaporanModel,
  buildMenuBlocks,
  formatHariTanggal,
  hariPendek,
  laporanWarnings,
  mondayOf,
  periodHeader,
  reportDates,
  tanggalPendek,
  type LaporanDayData,
  type PhotoSectionKey,
} from '@/lib/laporan2Minggu';
import {
  addLaporanPhotos,
  deleteLaporanPhoto,
  loadLaporanDays,
  subscribeLaporanPhotos,
  type LaporanPhoto,
} from '@/services/laporan2MingguService';
import { getJakartaDate } from '@/utils/date';

const SECTION_ICONS: Record<PhotoSectionKey, ComponentType<{ className?: string }>> = {
  persiapan: ClipboardCheck,
  pemorsian: Soup,
  menu: UtensilsCrossed,
  distribusi: Truck,
  penerima: Users,
};

const SECTION_HINTS: Record<PhotoSectionKey, string> = {
  persiapan: 'Bahan, cek list, dan persiapan dapur',
  pemorsian: 'Proses memasukkan makanan ke ompreng',
  menu: 'Foto ompreng / poster menu hari ini',
  distribusi: 'Serah terima di sekolah atau posyandu',
  penerima: 'Siswa / balita / ibu sedang makan',
};

type DayStatus = 'loading' | 'ok' | 'no-menu' | 'no-data';

function dayStatus(day: LaporanDayData | undefined): DayStatus {
  if (!day) return 'loading';
  if (!day.batchId) return 'no-data';
  return buildMenuBlocks(day.menus).length === 0 ? 'no-menu' : 'ok';
}

const STATUS_STYLE: Record<DayStatus, { dot: string; label: string }> = {
  loading: { dot: 'bg-slate-300 animate-pulse', label: 'Memuat' },
  ok: { dot: 'bg-emerald-500', label: 'Data & menu lengkap' },
  'no-menu': { dot: 'bg-amber-500', label: 'Menu belum diisi Produksi' },
  'no-data': { dot: 'bg-slate-300', label: 'Belum ada data PM' },
};

function StepHeader({ n, title, hint, right }: { n: number; title: string; hint: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-extrabold text-slate-900">{n}</span>
        <div>
          <h2 className="text-base font-extrabold text-slate-900 leading-tight">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

/** Satu kotak bagian foto (Persiapan, Pemorsian, …) untuk hari yang dipilih. */
function PhotoSectionCard({
  index,
  sectionKey,
  label,
  photos,
  onUpload,
  onOpen,
  onDelete,
}: {
  index: number;
  sectionKey: PhotoSectionKey;
  label: string;
  photos: LaporanPhoto[];
  onUpload: (files: File[], report: (done: number, total: number) => void) => Promise<string>;
  onOpen: (photo: LaporanPhoto) => void;
  onDelete: (photo: LaporanPhoto) => void;
}) {
  const Icon = SECTION_ICONS[sectionKey];
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');

  const upload = async (files: File[]) => {
    if (files.length === 0 || progress) return;
    setMessage('');
    setProgress({ done: 0, total: files.length });
    try {
      setMessage(await onUpload(files, (done, total) => setProgress({ done, total })));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div
      data-testid={`section-${sectionKey}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(Array.from(e.dataTransfer.files || []));
      }}
      className={`rounded-2xl border p-3 sm:p-4 transition-colors ${dragging ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
              {index}. {label}
            </h3>
            <p className="text-[11px] text-slate-500 truncate">{SECTION_HINTS[sectionKey]}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${photos.length > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}
        >
          {photos.length} foto
        </span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={progress !== null}
          aria-label={`Tambah foto ${label}`}
          className="aspect-[4/3] flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-colors disabled:cursor-wait"
        >
          {progress ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="text-[11px] font-bold">
                {progress.done}/{progress.total}
              </span>
            </>
          ) : (
            <>
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] font-extrabold">Tambah</span>
            </>
          )}
        </button>
        {photos.map((p, i) => (
          <div key={p.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <button type="button" onClick={() => onOpen(p)} className="block h-full w-full" aria-label={`Lihat foto ${i + 1} ${label}`}>
              <img src={p.url} alt={`${label} ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              aria-label={`Hapus foto ${i + 1} ${label}`}
              onClick={() => onDelete(p)}
              className="absolute top-1 right-1 rounded-full bg-black/55 p-1.5 text-white shadow hover:bg-red-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid={`input-${sectionKey}`}
        onChange={(e) => {
          void upload(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      {message && <p className="mt-2 text-xs font-bold text-slate-600" role="status">{message}</p>}
    </div>
  );
}

export function MbgLaporan2MingguPage() {
  const { profile } = useAuth();
  // Laporan biasanya dibuat di akhir minggu kedua, jadi bawaannya Senin minggu lalu.
  const [monday, setMonday] = useState(() => addDays(mondayOf(getJakartaDate()), -7));
  const dates = useMemo(() => reportDates(monday), [monday]);
  const [days, setDays] = useState<LaporanDayData[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [photos, setPhotos] = useState<LaporanPhoto[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [selectedDay, setSelectedDay] = useState(dates[0]);
  const [preview, setPreview] = useState<LaporanPhoto | null>(null);
  const [busy, setBusy] = useState<'' | 'pdf' | 'docx'>('');
  const [exportError, setExportError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    setLoadError('');
    setSelectedDay((d) => (dates.includes(d) ? d : dates[0]));
    loadLaporanDays(dates)
      .then((loaded) => !cancelled && setDays(loaded))
      .catch((err) => {
        console.error('Gagal memuat data laporan:', err);
        if (!cancelled) setLoadError('Data Admin MBG gagal dimuat. Periksa sinyal, lalu ketuk "Muat ulang".');
      });
    return () => {
      cancelled = true;
    };
  }, [dates, reloadKey]);

  useEffect(() => {
    setPhotoError('');
    return subscribeLaporanPhotos(dates, setPhotos, () => setPhotoError('Foto gagal dimuat. Periksa sinyal lalu buka ulang halaman ini.'));
  }, [dates]);

  const dayData = (date: string) => days?.find((d) => d.tanggal === date);
  const photosOf = (date: string, section?: PhotoSectionKey) =>
    photos.filter((p) => p.tanggal === date && (!section || p.section === section));
  const warnings = useMemo(() => (days ? laporanWarnings(days) : []), [days]);
  const withData = days?.filter((d) => d.batchId).length ?? 0;
  const noMenu = warnings.filter((w) => w.kind === 'tanpa-menu');
  const daysWithPhotos = dates.filter((d) => photosOf(d).length > 0).length;
  const thisWeekMonday = mondayOf(getJakartaDate());

  const uploadTo = (section: PhotoSectionKey) => async (files: File[], report: (done: number, total: number) => void) => {
    try {
      const { added, rejected } = await addLaporanPhotos(selectedDay, section, files, profile?.displayName || 'Distribusi MBG', report);
      return [
        added ? `${added} foto tersimpan.` : '',
        rejected.length ? `${rejected.length} file dilewati (bukan foto atau terlalu besar): ${rejected.join(', ')}` : '',
      ].filter(Boolean).join(' ');
    } catch (err) {
      console.error('Gagal menyimpan foto laporan:', err);
      return 'Foto gagal disimpan. Periksa sinyal lalu coba lagi.';
    }
  };

  const removePhoto = (p: LaporanPhoto) => {
    if (!window.confirm('Hapus foto ini dari laporan?')) return;
    setPreview(null);
    deleteLaporanPhoto(p.id).catch((err) => {
      console.error('Gagal menghapus foto laporan:', err);
      window.alert('Foto gagal dihapus. Periksa sinyal lalu coba lagi.');
    });
  };

  const download = async (kind: 'pdf' | 'docx') => {
    if (!days) return;
    setBusy(kind);
    setExportError('');
    try {
      const model = buildLaporanModel(days, photos);
      if (kind === 'pdf') {
        const { exportLaporanPdf } = await import('@/utils/laporan2MingguPdf');
        await exportLaporanPdf(model);
      } else {
        const { exportLaporanDocx } = await import('@/utils/laporan2MingguDocx');
        await exportLaporanDocx(model);
      }
    } catch (err) {
      console.error('Gagal membuat laporan:', err);
      setExportError('Laporan gagal dibuat. Coba lagi; bila tetap gagal, kurangi jumlah foto.');
    } finally {
      setBusy('');
    }
  };

  const selectedIndex = dates.indexOf(selectedDay);

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] px-1 sm:px-4 pt-2 sm:pt-4 pb-16">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs px-4 py-3 flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">Laporan 2 Minggu</h1>
            <p className="text-xs text-slate-500">Laporan Pelaksanaan Program MBG · 10 hari kerja</p>
          </div>
        </div>

        {/* 1. Periode */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4">
          <StepHeader n={1} title="Pilih periode" hint="Senin minggu pertama sampai Jumat minggu kedua." />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonday((m) => addDays(m, -7))}
              aria-label="Periode sebelumnya"
              className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <label className="relative flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100">
              <CalendarRange className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
              <span className="text-sm sm:text-base font-extrabold text-slate-900 text-center" data-testid="periode">
                {periodHeader(dates)}
              </span>
              <input
                type="date"
                aria-label="Pilih tanggal di minggu pertama"
                value={monday}
                onChange={(e) => e.target.value && setMonday(mondayOf(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => setMonday((m) => addDays(m, 7))}
              disabled={monday >= thisWeekMonday}
              aria-label="Periode berikutnya"
              className="h-12 w-12 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {dates.map((date) => {
              const status = dayStatus(dayData(date));
              return (
                <div key={date} className="rounded-xl border border-slate-200 px-1 py-1.5 text-center" title={STATUS_STYLE[status].label}>
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">{hariPendek(date)}</span>
                  <span className="block text-xs font-extrabold text-slate-900">{tanggalPendek(date)}</span>
                  <span className={`mx-auto mt-1 block h-1.5 w-6 rounded-full ${STATUS_STYLE[status].dot}`} aria-label={STATUS_STYLE[status].label} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {(['ok', 'no-menu', 'no-data'] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-4 rounded-full ${STATUS_STYLE[s].dot}`} />
                {STATUS_STYLE[s].label}
              </span>
            ))}
          </div>
          {loadError && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-sm font-bold text-red-700">{loadError}</p>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-extrabold text-white">
                Muat ulang
              </button>
            </div>
          )}
        </section>

        {/* 2. Foto */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4">
          <StepHeader n={2} title="Foto dokumentasi" hint="Pilih harinya, lalu tambah foto ke bagian yang sesuai. Bisa banyak foto sekaligus." />

          <div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5" role="tablist" aria-label="Pilih hari">
              {dates.map((date) => {
                const active = date === selectedDay;
                const count = photosOf(date).length;
                return (
                  <button
                    key={date}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDay(date)}
                    className={`rounded-xl border-2 px-1 py-2 text-center transition-colors ${active ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-200'}`}
                  >
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">{hariPendek(date)}</span>
                    <span className="block text-xs font-extrabold text-slate-900">{tanggalPendek(date)}</span>
                    <span className={`mt-1 inline-block rounded-full px-1.5 text-[10px] font-extrabold ${count > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-slate-900">{formatHariTanggal(selectedDay)}</p>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Hari sebelumnya"
                disabled={selectedIndex <= 0}
                onClick={() => setSelectedDay(dates[selectedIndex - 1])}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Hari berikutnya"
                disabled={selectedIndex >= dates.length - 1}
                onClick={() => setSelectedDay(dates[selectedIndex + 1])}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {photoError && <p className="mb-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{photoError}</p>}

          <div className="space-y-3">
            {PHOTO_SECTIONS.map((s, i) => (
              <PhotoSectionCard
                key={`${selectedDay}-${s.key}`}
                index={i + 1}
                sectionKey={s.key}
                label={s.label}
                photos={photosOf(selectedDay, s.key)}
                onUpload={uploadTo(s.key)}
                onOpen={setPreview}
                onDelete={removePhoto}
              />
            ))}
          </div>
        </section>

        {/* 3. Download */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4">
          <StepHeader n={3} title="Cek & download" hint="Data yang belum lengkap tetap bisa di-download, tapi ditandai di laporan." />

          {!days && !loadError ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat data Admin MBG dan menu Produksi…
            </div>
          ) : (
            <ul className="space-y-2 mb-4" data-testid="checklist">
              <li className="flex items-start gap-2.5 text-sm">
                {withData === dates.length ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                )}
                <span>
                  <b>Data PM Admin MBG:</b> {withData} dari {dates.length} hari
                  {withData < dates.length && (
                    <span className="block text-xs text-slate-500">
                      Hari tanpa data tidak masuk laporan: {dates.filter((d) => !dayData(d)?.batchId).map(tanggalPendek).join(', ')}
                    </span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                {noMenu.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                )}
                <span>
                  <b>Menu Produksi MBG:</b> {withData - noMenu.length} dari {withData} hari
                  {noMenu.length > 0 && (
                    <span className="block text-xs font-bold text-amber-700">
                      Belum diisi: {noMenu.map((w) => tanggalPendek(w.tanggal)).join(', ')}. Di laporan ditandai “MENU BELUM DIISI”.
                    </span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-sm">
                {daysWithPhotos > 0 ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                )}
                <span>
                  <b>Foto dokumentasi:</b> {photos.length} foto di {daysWithPhotos} hari
                </span>
              </li>
              {warnings
                .filter((w) => w.kind === 'hari-pertama-kosong')
                .map((w) => (
                  <li key={w.text} className="flex items-start gap-2.5 text-xs font-bold text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
                    {w.text}
                  </li>
                ))}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!days || busy !== ''}
              onClick={() => void download('docx')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-4 text-base font-extrabold text-slate-900 shadow-sm hover:bg-amber-500 disabled:opacity-60"
            >
              {busy === 'docx' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileDown className="h-5 w-5" aria-hidden="true" />}
              {busy === 'docx' ? 'Menyiapkan Word…' : 'Download Word'}
            </button>
            <button
              type="button"
              disabled={!days || busy !== ''}
              onClick={() => void download('pdf')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 text-base font-extrabold text-white shadow-sm hover:bg-slate-900 disabled:opacity-60"
            >
              {busy === 'pdf' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <FileDown className="h-5 w-5" aria-hidden="true" />}
              {busy === 'pdf' ? 'Menyiapkan PDF…' : 'Download PDF'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 text-center">Word bila masih mau diedit · PDF untuk dikirim/dicetak</p>
          {exportError && <p className="mt-2 text-sm font-bold text-red-700">{exportError}</p>}
        </section>
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau foto"
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3"
          onClick={() => setPreview(null)}
        >
          <div className="flex items-center justify-between gap-2 text-white" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold truncate">
              {PHOTO_SECTIONS.find((s) => s.key === preview.section)?.label} · {formatHariTanggal(preview.tanggal)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => removePhoto(preview)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-extrabold"
              >
                <Trash2 className="h-4 w-4" /> Hapus
              </button>
              <button type="button" aria-label="Tutup" onClick={() => setPreview(null)} className="rounded-lg bg-white/15 p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0 mt-3">
            <img src={preview.url} alt="Pratinjau foto" className="max-h-full max-w-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}

export default MbgLaporan2MingguPage;
