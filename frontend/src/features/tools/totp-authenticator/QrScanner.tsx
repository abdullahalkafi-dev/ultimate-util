'use client';

import { useEffect, useRef, useState } from 'react';
import { decodeImageData } from './qr';

/** Starts the camera only after the user clicks Start (parent mounts this on demand). */
export function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (stopped || !v || !ctx) return;
      if (v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const text = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (text) {
          onResult(text);
          return;
        }
      }
      raf = window.setTimeout(tick, 150);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        onError('The camera is not available here (it needs a secure https page). Upload a QR image or type the key instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        setReady(true);
        tick();
      } catch (e) {
        const name = (e as DOMException).name;
        onError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it in your browser settings, or upload a QR image instead.'
            : name === 'NotFoundError'
              ? 'No camera was found. Upload a QR image or type the key instead.'
              : 'The camera could not be started. Upload a QR image or type the key instead.',
        );
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
     
  }, []);

  return (
    <div>
      <video ref={video} muted playsInline aria-label="Camera preview" style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: '#000' }} />
      <p className="hint" role="status">{ready ? 'Point the camera at the QR code.' : 'Starting camera...'}</p>
    </div>
  );
}
