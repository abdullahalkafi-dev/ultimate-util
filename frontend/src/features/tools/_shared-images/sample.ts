/** Draws a photo-like test image (gradient, shapes, light noise) for the "Try an example" buttons. */
export async function makeSampleImage(name = 'example.png', width = 1600, height = 1000): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#2b5aa8');
  sky.addColorStop(0.6, '#f2b872');
  sky.addColorStop(1, '#2a3a2a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255, 244, 214, 0.95)';
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.32, height * 0.1, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `hsl(${140 + i * 10} 30% ${22 - i * 4}%)`;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 40) {
      ctx.lineTo(x, height * (0.62 + i * 0.08) - Math.sin(x / (180 - i * 20) + i) * height * 0.06);
    }
    ctx.lineTo(width, height);
    ctx.fill();
  }
  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    image.data[i] = image.data[i]! + n;
    image.data[i + 1] = image.data[i + 1]! + n;
    image.data[i + 2] = image.data[i + 2]! + n;
  }
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the example image.'))), 'image/png'),
  );
  return new File([blob], name, { type: 'image/png' });
}
