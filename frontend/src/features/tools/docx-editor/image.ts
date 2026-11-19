const MAX_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 2000;

/** Reads an image file as a data URI. SVG and oversized images are rasterised so every exporter can embed them. */
export async function imageToDataUri(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type)) throw new Error('Use a PNG, JPG, GIF, WebP or SVG image.');
  if (file.size > MAX_BYTES) throw new Error('This image is larger than 20 MB.');
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('The image could not be decoded.'));
    el.src = original;
  });
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  const mustConvert = file.type === 'image/svg+xml' || file.type === 'image/webp' || side > MAX_SIDE;
  if (!mustConvert) return original;
  const scale = Math.min(1, MAX_SIDE / (side || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.naturalWidth || 600) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || 400) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
}
