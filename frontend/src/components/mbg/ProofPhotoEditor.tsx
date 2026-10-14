import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, RotateCcw, RotateCw, Save, X } from 'lucide-react';
import { rotatePhoto } from '@/utils/rotatePhoto';

export function ProofPhotoEditor({ photoUrl, label, onSave, onClose }: {
  photoUrl: string;
  label: string;
  onSave: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState(0);
  const [preview, setPreview] = useState({ turns: 0, url: photoUrl });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preparing = preview.turns !== turns;

  useEffect(() => {
    let cancelled = false;
    setError('');
    rotatePhoto(photoUrl, turns).then((url) => {
      if (!cancelled) setPreview({ turns, url });
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memutar foto.');
    });
    return () => { cancelled = true; };
  }, [photoUrl, turns]);

  const save = async () => {
    if (saving || preparing || turns === 0) return;
    setSaving(true);
    setError('');
    try {
      await onSave(preview.url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan foto. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/70" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 md:p-6 shadow-2xl max-h-[90dvh] overflow-y-auto"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-gray-900">Edit foto</Dialog.Title>
              <Dialog.Description className="text-xs text-gray-500 mt-1">{label}. Putar foto lalu simpan.</Dialog.Description>
            </div>
            <button type="button" aria-label="Tutup editor foto" onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-50 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mt-4 h-[min(45dvh,360px)] rounded-xl bg-gray-100 flex items-center justify-center p-2">
            <img src={preview.url} alt={`Pratinjau ${label}`} className="max-h-full max-w-full object-contain" />
            {preparing && !error && <Loader2 aria-label="Memutar foto" className="absolute h-7 w-7 animate-spin text-amber-600" />}
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button type="button" onClick={() => setTurns((value) => (value + 3) % 4)} disabled={saving} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold hover:bg-gray-50 disabled:opacity-50 cursor-pointer">
              <RotateCcw className="h-4 w-4" /> Putar kiri 90°
            </button>
            <button type="button" onClick={() => setTurns((value) => (value + 1) % 4)} disabled={saving} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold hover:bg-gray-50 disabled:opacity-50 cursor-pointer">
              <RotateCw className="h-4 w-4" /> Putar kanan 90°
            </button>
            <button type="button" onClick={() => setTurns(0)} disabled={saving || turns === 0} className="px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-50 cursor-pointer">Reset</button>
          </div>
          {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-bold disabled:opacity-50 cursor-pointer">Batal</button>
            <button type="button" onClick={save} disabled={saving || preparing || turns === 0} className="flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50 cursor-pointer">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Menyimpan...' : 'Simpan foto'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
