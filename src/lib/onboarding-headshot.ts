/** Storage bucket allows 25MB; keep under middleware/proxy headroom after multipart overhead. */
export const HEADSHOT_MAX_BYTES = 20 * 1024 * 1024;
const COMPRESS_IF_OVER_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

function basenameWithoutExt(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return base || 'headshot';
}

/**
 * Downscale / recompress large phone photos so onboarding submit stays under
 * the Next.js proxy body buffer (and is friendlier for storage).
 */
export async function prepareOnboardingHeadshot(file: File): Promise<File> {
  if (file.size > HEADSHOT_MAX_BYTES && (!file.type.startsWith('image/') || file.type === 'image/gif')) {
    throw new Error('Photo is too large (max 20MB). Please choose a smaller image or skip for now.');
  }

  // Leave GIFs alone; canvas would flatten animation.
  if (file.type === 'image/gif') return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= COMPRESS_IF_OVER_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return file;
    if (blob.size > HEADSHOT_MAX_BYTES) {
      throw new Error('Photo is still too large after compression. Please choose a smaller image or skip for now.');
    }

    return new File([blob], `${basenameWithoutExt(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
