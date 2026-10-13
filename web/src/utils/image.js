/**
 * Shrink a camera photo before upload (the server resizes again; this keeps uploads small and
 * well under the 8 MB limit). Falls back to the original file if the browser can't decode it.
 * @param {File} file
 * @param {number} maxEdge
 * @returns {Promise<Blob>}
 */
export async function downscaleImage(file, maxEdge = 1600) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
