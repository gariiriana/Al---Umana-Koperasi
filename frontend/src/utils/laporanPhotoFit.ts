/**
 * Foto dokumentasi laporan: dimasukkan utuh (tidak dipotong) ke petak seragam berlatar abu muda,
 * seperti CSS object-fit: contain, supaya foto tegak dan mendatar sama rapinya di tabel.
 */
export const PHOTO_BOX_BG = '#F1F5F9';

export function containFitDataUrl(dataUrl: string, aspect: number, widthPx = 900, background = PHOTO_BOX_BG): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      if (!srcW || !srcH || !aspect) {
        resolve(dataUrl);
        return;
      }
      const outW = Math.round(widthPx);
      const outH = Math.round(widthPx / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, outW, outH);
      const scale = Math.min(outW / srcW, outH / srcH);
      const w = srcW * scale;
      const h = srcH * scale;
      ctx.drawImage(img, (outW - w) / 2, (outH - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(',')[1] || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Simpan Blob sebagai file unduhan. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
