/** Rotate from the original each time so preview edits never compound JPEG loss. */
export async function rotatePhoto(photoUrl: string, quarterTurns: number): Promise<string> {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return photoUrl;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Foto tidak bisa dibaca. Coba buka ulang editor foto.'));
    img.src = photoUrl;
  });
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  canvas.width = turns % 2 ? height : width;
  canvas.height = turns % 2 ? width : height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak bisa memutar foto.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(turns * Math.PI / 2);
  ctx.drawImage(image, -width / 2, -height / 2);
  try {
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    throw new Error('Foto tidak bisa diproses. Coba unggah ulang foto dari perangkat.');
  }
}
