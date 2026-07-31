/**
 * Utility helper to compress and resize base64 images before saving to Firestore.
 * Firestore has a strict 1MB (1,048,576 bytes) limit per document.
 * Raw uncompressed images from phone cameras/uploads can be 3MB - 8MB.
 * Compression down to max 1000px and 0.7 quality reduces size to ~50KB-120KB.
 */
export const compressBase64Image = (
  base64Str: string,
  maxWidth = 1000,
  maxHeight = 1000,
  quality = 0.7
): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      // Draw and compress to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };

    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
};
