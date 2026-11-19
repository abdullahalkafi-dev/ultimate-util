'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  ConfirmDialog,
  CopyButton,
  DropZone,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  SliderField,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadBlob, downloadText, readFirstBytes, sniffType } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { ColorInput } from '../_shared-color/ColorInput';
import { contrastRatio, formatRatio } from '../_shared-color/contrast';
import { hexToRgb } from '../_shared-color/convert';
import { BARCODE_FORMATS, validateBarcode, type BarcodeFormat } from './barcode';
import {
  QR_MAX_BYTES,
  autoEccForLogo,
  formatEmailPayload,
  formatEventPayload,
  formatSmsPayload,
  formatVCardPayload,
  formatWifiPayload,
  parseVCardPayload,
  parseWifiPayload,
  qrByteLength,
  type EccLevel,
  type QrType,
} from './payloads';
import { inspectDecodedContent } from './safety';
import styles from './styles.module.css';

type ToolTab = 'qr' | 'barcode' | 'scan';
type DotStyle = 'square' | 'dots' | 'rounded' | 'classy' | 'extra-rounded';
type CornerStyle = 'square' | 'dot' | 'extra-rounded';

const STORAGE_KEY = 'uu-qr-barcode';

interface StylePrefs {
  fg: string;
  bg: string;
  dot: DotStyle;
  corner: CornerStyle;
  ecc: EccLevel;
  margin: number;
  sizePx: number;
}

const DEFAULT_STYLE: StylePrefs = {
  fg: '#0b0f19',
  bg: '#ffffff',
  dot: 'square',
  corner: 'square',
  ecc: 'M',
  margin: 4,
  sizePx: 600,
};

interface ScanEntry {
  format: string;
  text: string;
}

export default function QrBarcodeTool() {
  const toast = useToast();
  const [tab, setTab] = useState<ToolTab>('qr');

  // QR data state
  const [qrType, setQrType] = useState<QrType>('url');
  const [urlVal, setUrlVal] = useState('https://example.com');
  const [textVal, setTextVal] = useState('Hello from Ultimate Util');
  const [wifi, setWifi] = useState({ ssid: '', password: '', auth: 'WPA' as 'WPA' | 'WEP' | 'nopass', hidden: false });
  const [vcard, setVcard] = useState({ firstName: '', lastName: '', org: '', title: '', phone: '', email: '', url: '' });
  const [email, setEmail] = useState({ to: '', subject: '', body: '' });
  const [sms, setSms] = useState({ phone: '', message: '' });
  const [phone, setPhone] = useState('');
  const [geo, setGeo] = useState({ lat: '23.8103', lon: '90.4125' });
  const [event, setEvent] = useState({ title: '', start: '', end: '', location: '', description: '', utc: true });

  // QR style state
  const [style, setStyle] = useState<StylePrefs>(DEFAULT_STYLE);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState(0.2);
  const [printMm, setPrintMm] = useState(50);
  const [loaded, setLoaded] = useState(false);
  const [testScanStatus, setTestScanStatus] = useState<string | null>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrInstanceRef = useRef<InstanceType<typeof import('qr-code-styling').default> | null>(null);

  // Barcode state
  const [bcFormat, setBcFormat] = useState<BarcodeFormat>('CODE128');
  const [bcValue, setBcValue] = useState('UU-2026-001');
  const [bcDisplayText, setBcDisplayText] = useState(true);
  const [bcHeight, setBcHeight] = useState(90);
  const [bcWidth, setBcWidth] = useState(2);
  const [bcFg, setBcFg] = useState('#0b0f19');
  const [bcBg, setBcBg] = useState('#ffffff');
  const barcodeSvgRef = useRef<SVGSVGElement>(null);

  // Scan state
  const [scanResults, setScanResults] = useState<ScanEntry[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraPrompt, setCameraPrompt] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [showWifiPass, setShowWifiPass] = useState<Record<number, boolean>>({});
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const saved = readJson<Partial<StylePrefs> | null>(STORAGE_KEY, null);
    if (saved) setStyle((s) => ({ ...s, ...saved }));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, style);
  }, [style, loaded]);

  useEffect(
    () => () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [logoUrl],
  );

  const payload = useMemo(() => {
    switch (qrType) {
      case 'url':
        return urlVal.trim();
      case 'text':
        return textVal;
      case 'wifi':
        return wifi.ssid.trim() ? formatWifiPayload(wifi) : '';
      case 'vcard':
        return vcard.firstName.trim() || vcard.lastName.trim() || vcard.email.trim() || vcard.phone.trim()
          ? formatVCardPayload(vcard)
          : '';
      case 'email':
        return email.to.trim() ? formatEmailPayload(email) : '';
      case 'sms':
        return sms.phone.trim() ? formatSmsPayload(sms) : '';
      case 'phone':
        return phone.trim() ? `tel:${phone.trim()}` : '';
      case 'geo':
        return geo.lat.trim() && geo.lon.trim() ? `geo:${geo.lat.trim()},${geo.lon.trim()}` : '';
      case 'event':
        return event.title.trim() ? formatEventPayload(event) : '';
    }
  }, [qrType, urlVal, textVal, wifi, vcard, email, sms, phone, geo, event]);

  const effectiveEcc = useMemo(
    () => (logoUrl ? autoEccForLogo(style.ecc, logoScale) : style.ecc),
    [logoUrl, style.ecc, logoScale],
  );
  const byteCount = useMemo(() => qrByteLength(payload), [payload]);
  const maxBytes = QR_MAX_BYTES[effectiveEcc];
  const overCapacity = byteCount > maxBytes;

  const qrContrast = useMemo(() => {
    const f = hexToRgb(style.fg) ?? { r: 0, g: 0, b: 0 };
    const b = hexToRgb(style.bg) ?? { r: 255, g: 255, b: 255 };
    const ratio = contrastRatio(f, b);
    const lumF = 0.2126 * f.r + 0.7152 * f.g + 0.0722 * f.b;
    const lumB = 0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b;
    return { ratio, label: formatRatio(ratio), inverted: lumF > lumB };
  }, [style.fg, style.bg]);

  // Render QR preview dynamically in browser
  useEffect(() => {
    if (tab !== 'qr' || !payload || overCapacity) {
      if (qrContainerRef.current) qrContainerRef.current.innerHTML = '';
      qrInstanceRef.current = null;
      return;
    }
    let cancelled = false;
    setTestScanStatus(null);
    (async () => {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      if (cancelled) return;
      const previewPx = 240;
      const opts = {
        width: previewPx,
        height: previewPx,
        type: 'canvas' as const,
        data: payload,
        margin: style.margin * 3,
        image: logoUrl ?? undefined,
        qrOptions: { errorCorrectionLevel: effectiveEcc },
        imageOptions: { hideBackgroundDots: true, imageSize: logoScale, margin: 4 },
        dotsOptions: { color: style.fg, type: style.dot },
        cornersSquareOptions: { color: style.fg, type: style.corner },
        cornersDotOptions: { color: style.fg, type: (style.corner === 'dot' ? 'dot' : 'square') as 'dot' | 'square' },
        backgroundOptions: { color: style.bg },
      };
      if (!qrInstanceRef.current) {
        qrInstanceRef.current = new QRCodeStyling(opts);
        if (qrContainerRef.current) {
          qrContainerRef.current.innerHTML = '';
          qrInstanceRef.current.append(qrContainerRef.current);
        }
      } else {
        qrInstanceRef.current.update(opts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, payload, overCapacity, style, logoUrl, logoScale, effectiveEcc]);

  // Render Barcode preview
  const bcValidation = useMemo(() => validateBarcode(bcFormat, bcValue), [bcFormat, bcValue]);

  useEffect(() => {
    if (tab !== 'barcode' || !bcValidation.ok || !barcodeSvgRef.current) return;
    let cancelled = false;
    (async () => {
      const { default: JsBarcode } = await import('jsbarcode');
      if (cancelled || !barcodeSvgRef.current) return;
      try {
        JsBarcode(barcodeSvgRef.current, bcValidation.normalized, {
          format: bcFormat,
          displayValue: bcDisplayText,
          height: bcHeight,
          width: bcWidth,
          lineColor: bcFg,
          background: bcBg,
          margin: 12,
        });
      } catch {
        /* invalid format combination handled by validation */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, bcValidation, bcFormat, bcDisplayText, bcHeight, bcWidth, bcFg, bcBg]);

  function loadQrExample() {
    setQrType('wifi');
    setWifi({ ssid: 'Guest-Cafe', password: 'coffee-2026', auth: 'WPA', hidden: false });
  }

  async function handleLogoPick(files: File[]) {
    const file = files[0];
    if (!file) return;
    const type = sniffType(await readFirstBytes(file));
    if (!['png', 'jpeg', 'webp', 'svg'].includes(type)) {
      toast('Logo must be a PNG, JPG, WebP or SVG image.', 'error');
      return;
    }
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogoUrl(URL.createObjectURL(file));
  }

  async function exportQr(kind: 'png' | 'svg' | 'pdf') {
    if (!payload || overCapacity) return;
    const { default: QRCodeStyling } = await import('qr-code-styling');
    const size = Math.min(4000, Math.max(128, style.sizePx));
    const exporter = new QRCodeStyling({
      width: size,
      height: size,
      type: kind === 'svg' ? 'svg' : 'canvas',
      data: payload,
      margin: style.margin * Math.max(2, Math.round(size / 80)),
      image: logoUrl ?? undefined,
      qrOptions: { errorCorrectionLevel: effectiveEcc },
      imageOptions: { hideBackgroundDots: true, imageSize: logoScale, margin: 6 },
      dotsOptions: { color: style.fg, type: style.dot },
      cornersSquareOptions: { color: style.fg, type: style.corner },
      cornersDotOptions: { color: style.fg, type: (style.corner === 'dot' ? 'dot' : 'square') as 'dot' | 'square' },
      backgroundOptions: { color: style.bg },
    });

    if (kind === 'svg') {
      const raw = await exporter.getRawData('svg');
      if (raw) {
        const blob = raw instanceof Blob ? raw : new Blob([new Uint8Array(raw)], { type: 'image/svg+xml' });
        downloadBlob(blob, `qr-${qrType}.svg`);
        toast(`Saved as qr-${qrType}.svg`, 'success');
      }
      return;
    }

    const raw = await exporter.getRawData('png');
    if (!raw) return;
    const pngBlob = raw instanceof Blob ? raw : new Blob([new Uint8Array(raw)], { type: 'image/png' });
    if (kind === 'png') {
      downloadBlob(pngBlob, `qr-${qrType}.png`);
      toast(`Saved as qr-${qrType}.png`, 'success');
      return;
    }

    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const ptPerMm = 72 / 25.4;
    const dim = Math.max(20, Math.min(400, printMm)) * ptPerMm;
    const page = doc.addPage([dim, dim]);
    const img = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));
    page.drawImage(img, { x: 0, y: 0, width: dim, height: dim });
    const pdfBytes = await doc.save();
    downloadBlob(new Blob([pdfBytes.slice().buffer], { type: 'application/pdf' }), `qr-${qrType}.pdf`);
    toast(`Saved as qr-${qrType}.pdf`, 'success');
  }

  async function testScanQr() {
    if (!qrInstanceRef.current) return;
    const raw = await qrInstanceRef.current.getRawData('png');
    if (!raw) return;
    const blob = raw instanceof Blob ? raw : new Blob([new Uint8Array(raw)], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const { default: jsQR } = await import('jsqr');
    const decoded = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth',
    });
    setTestScanStatus(
      decoded?.data === payload
        ? 'Self-test passed: the rendered QR code decoded cleanly.'
        : 'Warning: could not decode the rendered QR code reliably. Increase contrast or reduce logo size.',
    );
  }

  async function copyQrImage() {
    if (!qrInstanceRef.current || typeof ClipboardItem === 'undefined') {
      toast('Image copy is not supported in this browser; download PNG instead.', 'info');
      return;
    }
    const raw = await qrInstanceRef.current.getRawData('png');
    if (!raw) return;
    const blob = raw instanceof Blob ? raw : new Blob([new Uint8Array(raw)], { type: 'image/png' });
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Copied QR image', 'success');
    } catch {
      toast('Clipboard image copy was blocked by the browser.', 'error');
    }
  }

  function exportBarcode(kind: 'svg' | 'png') {
    if (!barcodeSvgRef.current || !bcValidation.ok) return;
    const svgText = new XMLSerializer().serializeToString(barcodeSvgRef.current);
    const name = `barcode-${bcFormat.toLowerCase()}-${bcValidation.normalized}.${kind}`;
    if (kind === 'svg') {
      downloadText(svgText, name, 'image/svg+xml');
      return;
    }
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 600;
      c.height = img.naturalHeight || 220;
      c.getContext('2d')?.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((b) => {
        if (b) downloadBlob(b, name);
      }, 'image/png');
    };
    img.src = url;
  }

  async function decodeImageDataAny(imageData: ImageData): Promise<ScanEntry[]> {
    const hits: ScanEntry[] = [];
    const seen = new Set<string>();
    const pushHit = (format: string, text: string) => {
      const k = `${format}:${text}`;
      if (!seen.has(k) && text) {
        seen.add(k);
        hits.push({ format, text });
      }
    };

    // 1. Native BarcodeDetector if present
    if ('BarcodeDetector' in globalThis) {
      try {
        const BD = (globalThis as unknown as { BarcodeDetector: new (opts?: { formats?: string[] }) => { detect: (src: ImageData) => Promise<{ format: string; rawValue: string }[]> } }).BarcodeDetector;
        const det = new BD();
        const found = await det.detect(imageData);
        for (const r of found) pushHit(r.format, r.rawValue);
      } catch {
        /* fall through to WASM/jsQR */
      }
    }

    // 2. zxing-wasm from same-origin /vendor/zxing
    try {
      const zxing = await import('zxing-wasm/reader');
      zxing.prepareZXingModule({
        overrides: { locateFile: (file: string) => `/vendor/zxing/${file}` },
      });
      const res = await zxing.readBarcodes(imageData, { tryHarder: true, tryRotate: true, tryInvert: true });
      for (const r of res) if (r.isValid) pushHit(r.format, r.text);
    } catch {
      /* fallback to jsQR */
    }

    // 3. jsQR fallback for QR codes
    if (hits.length === 0) {
      const { default: jsQR } = await import('jsqr');
      const qr = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if (qr?.data) pushHit('QR_CODE', qr.data);
    }
    return hits;
  }

  async function scanFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setScanning(true);
    setScanError(null);
    try {
      const type = sniffType(await readFirstBytes(file));
      if (!['png', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(type)) {
        setScanError('Please upload a PNG, JPG, WebP, GIF, BMP or AVIF image containing a code.');
        return;
      }
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const hits = await decodeImageDataAny(ctx.getImageData(0, 0, c.width, c.height));
      setScanResults(hits);
      if (hits.length === 0) setScanError('No QR code or barcode was found in that image. Try cropping closer or improving contrast.');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not scan that image.');
    } finally {
      setScanning(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  async function startCamera() {
    setCameraPrompt(false);
    setScanError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setScanError('Camera requires a secure (HTTPS or localhost) page. Upload an image instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (e) {
      const name = (e as DOMException).name;
      setScanError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow access in your browser settings or upload an image.'
          : 'No camera was found or it is in use by another app.',
      );
    }
  }

  useEffect(() => {
    if (!cameraActive || tab !== 'scan') {
      stopCamera();
      return;
    }
    let stopped = false;
    let timer = 0;
    const v = videoRef.current;
    if (v && streamRef.current) {
      v.srcObject = streamRef.current;
      void v.play();
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loop = async () => {
      if (stopped || !v || !ctx) return;
      if (document.visibilityState === 'visible' && v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const hits = await decodeImageDataAny(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (hits.length > 0 && !stopped) {
          setScanResults(hits);
          stopCamera();
          return;
        }
      }
      if (!stopped) timer = window.setTimeout(() => void loop(), 200);
    };
    timer = window.setTimeout(() => void loop(), 250);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [cameraActive, tab]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs<ToolTab>
        label="QR and barcode sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'qr', label: 'Generate QR' },
          { id: 'barcode', label: 'Barcode' },
          { id: 'scan', label: 'Scan' },
        ]}
      />

      {tab === 'qr' && (
        <div className="split">
          <section className="panel stack" aria-label="QR content and styling">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <SegmentedControl<QrType>
                label="QR content type"
                value={qrType}
                onChange={setQrType}
                options={[
                  { id: 'url', label: 'URL' },
                  { id: 'text', label: 'Text' },
                  { id: 'wifi', label: 'Wi-Fi' },
                  { id: 'vcard', label: 'vCard' },
                  { id: 'email', label: 'Email' },
                  { id: 'sms', label: 'SMS' },
                  { id: 'phone', label: 'Phone' },
                  { id: 'geo', label: 'Geo' },
                  { id: 'event', label: 'Event' },
                ]}
              />
              <button type="button" className="btn sm" onClick={loadQrExample}>
                Try an example
              </button>
            </div>

            {qrType === 'url' && (
              <Field label="URL">
                {(id) => <input id={id} className="input" value={urlVal} onChange={(e) => setUrlVal(e.target.value)} placeholder="https://example.com" />}
              </Field>
            )}
            {qrType === 'text' && (
              <Field label="Text">
                {(id) => <textarea id={id} className="textarea" value={textVal} onChange={(e) => setTextVal(e.target.value)} />}
              </Field>
            )}
            {qrType === 'wifi' && (
              <div className="stack">
                <div className="grid-2">
                  <Field label="Network name (SSID)">
                    {(id) => <input id={id} className="input" value={wifi.ssid} onChange={(e) => setWifi((w) => ({ ...w, ssid: e.target.value }))} />}
                  </Field>
                  <Field label="Security">
                    {(id) => (
                      <select
                        id={id}
                        className="select"
                        value={wifi.auth}
                        onChange={(e) => setWifi((w) => ({ ...w, auth: e.target.value as 'WPA' | 'WEP' | 'nopass' }))}
                      >
                        <option value="WPA">WPA / WPA2 / WPA3</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">Open (no password)</option>
                      </select>
                    )}
                  </Field>
                </div>
                {wifi.auth !== 'nopass' && (
                  <Field label="Wi-Fi password" hint="Saved only in the generated QR image; never stored.">
                    {(id) => <input id={id} className="input" value={wifi.password} onChange={(e) => setWifi((w) => ({ ...w, password: e.target.value }))} />}
                  </Field>
                )}
                <label className="check">
                  <input type="checkbox" checked={wifi.hidden} onChange={(e) => setWifi((w) => ({ ...w, hidden: e.target.checked }))} />
                  Hidden network
                </label>
              </div>
            )}
            {qrType === 'vcard' && (
              <div className="grid-2">
                <Field label="First name">{(id) => <input id={id} className="input" value={vcard.firstName} onChange={(e) => setVcard((v) => ({ ...v, firstName: e.target.value }))} />}</Field>
                <Field label="Last name">{(id) => <input id={id} className="input" value={vcard.lastName} onChange={(e) => setVcard((v) => ({ ...v, lastName: e.target.value }))} />}</Field>
                <Field label="Phone">{(id) => <input id={id} className="input" value={vcard.phone} onChange={(e) => setVcard((v) => ({ ...v, phone: e.target.value }))} />}</Field>
                <Field label="Email">{(id) => <input id={id} className="input" value={vcard.email} onChange={(e) => setVcard((v) => ({ ...v, email: e.target.value }))} />}</Field>
                <Field label="Company">{(id) => <input id={id} className="input" value={vcard.org} onChange={(e) => setVcard((v) => ({ ...v, org: e.target.value }))} />}</Field>
                <Field label="Website">{(id) => <input id={id} className="input" value={vcard.url} onChange={(e) => setVcard((v) => ({ ...v, url: e.target.value }))} />}</Field>
              </div>
            )}
            {qrType === 'email' && (
              <div className="stack">
                <Field label="To">{(id) => <input id={id} className="input" value={email.to} onChange={(e) => setEmail((m) => ({ ...m, to: e.target.value }))} />}</Field>
                <Field label="Subject">{(id) => <input id={id} className="input" value={email.subject} onChange={(e) => setEmail((m) => ({ ...m, subject: e.target.value }))} />}</Field>
                <Field label="Message">{(id) => <textarea id={id} className="textarea" value={email.body} onChange={(e) => setEmail((m) => ({ ...m, body: e.target.value }))} />}</Field>
              </div>
            )}
            {qrType === 'sms' && (
              <div className="stack">
                <Field label="Phone number">{(id) => <input id={id} className="input" value={sms.phone} onChange={(e) => setSms((s) => ({ ...s, phone: e.target.value }))} />}</Field>
                <Field label="Message">{(id) => <textarea id={id} className="textarea" value={sms.message} onChange={(e) => setSms((s) => ({ ...s, message: e.target.value }))} />}</Field>
              </div>
            )}
            {qrType === 'phone' && (
              <Field label="Phone number">{(id) => <input id={id} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" />}</Field>
            )}
            {qrType === 'geo' && (
              <div className="grid-2">
                <Field label="Latitude">{(id) => <input id={id} className="input" value={geo.lat} onChange={(e) => setGeo((g) => ({ ...g, lat: e.target.value }))} />}</Field>
                <Field label="Longitude">{(id) => <input id={id} className="input" value={geo.lon} onChange={(e) => setGeo((g) => ({ ...g, lon: e.target.value }))} />}</Field>
              </div>
            )}
            {qrType === 'event' && (
              <div className="stack">
                <Field label="Event title">{(id) => <input id={id} className="input" value={event.title} onChange={(e) => setEvent((ev) => ({ ...ev, title: e.target.value }))} />}</Field>
                <div className="grid-2">
                  <Field label="Start">{(id) => <input id={id} className="input" type="datetime-local" value={event.start} onChange={(e) => setEvent((ev) => ({ ...ev, start: e.target.value }))} />}</Field>
                  <Field label="End">{(id) => <input id={id} className="input" type="datetime-local" value={event.end} onChange={(e) => setEvent((ev) => ({ ...ev, end: e.target.value }))} />}</Field>
                </div>
                <Field label="Location">{(id) => <input id={id} className="input" value={event.location} onChange={(e) => setEvent((ev) => ({ ...ev, location: e.target.value }))} />}</Field>
              </div>
            )}

            <hr className="divider" />
            <div className="grid-2">
              <ColorInput label="Module color" value={style.fg} onValid={(_, fg) => setStyle((s) => ({ ...s, fg }))} />
              <ColorInput label="Background" value={style.bg} onValid={(_, bg) => setStyle((s) => ({ ...s, bg }))} />
              <Field label="Dot style">
                {(id) => (
                  <select id={id} className="select" value={style.dot} onChange={(e) => setStyle((s) => ({ ...s, dot: e.target.value as DotStyle }))}>
                    <option value="square">Square</option>
                    <option value="rounded">Rounded</option>
                    <option value="dots">Dots</option>
                    <option value="classy">Classy</option>
                    <option value="extra-rounded">Extra rounded</option>
                  </select>
                )}
              </Field>
              <Field label="Corner eye style">
                {(id) => (
                  <select id={id} className="select" value={style.corner} onChange={(e) => setStyle((s) => ({ ...s, corner: e.target.value as CornerStyle }))}>
                    <option value="square">Square</option>
                    <option value="extra-rounded">Rounded</option>
                    <option value="dot">Dot</option>
                  </select>
                )}
              </Field>
              <Field label="Error correction">
                {(id) => (
                  <select id={id} className="select" value={effectiveEcc} onChange={(e) => setStyle((s) => ({ ...s, ecc: e.target.value as EccLevel }))}>
                    <option value="L">L (7%)</option>
                    <option value="M">M (15%)</option>
                    <option value="Q">Q (25%)</option>
                    <option value="H">H (30%)</option>
                  </select>
                )}
              </Field>
              <SliderField label="Quiet zone (modules)" value={style.margin} min={0} max={10} onChange={(margin) => setStyle((s) => ({ ...s, margin }))} />
            </div>

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label className="btn sm">
                <Icon name="image" /> {logoUrl ? 'Change center logo' : 'Add center logo'}
                <input
                  type="file"
                  hidden
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={(e) => e.target.files && void handleLogoPick(Array.from(e.target.files))}
                />
              </label>
              {logoUrl && (
                <div className="row">
                  <SliderField label="Logo size %" value={Math.round(logoScale * 100)} min={10} max={25} unit="%" onChange={(v) => setLogoScale(v / 100)} />
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => {
                      URL.revokeObjectURL(logoUrl);
                      setLogoUrl(null);
                    }}
                  >
                    Remove logo
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="panel stack" aria-label="QR preview and export">
            <div className={styles.qrFrame}>
              {!payload ? (
                <p className="muted">Enter content on the left to generate a QR code.</p>
              ) : overCapacity ? (
                <ErrorBanner>
                  Payload is {byteCount} bytes, which exceeds the {maxBytes}-byte capacity at ECC {effectiveEcc}. Lower error correction or shorten the text.
                </ErrorBanner>
              ) : (
                <div
                  ref={qrContainerRef}
                  className={styles.qrHost}
                  role="img"
                  aria-label={`QR code for ${qrType}, ${byteCount} bytes, contrast ${qrContrast.label}:1`}
                />
              )}
            </div>

            <div className="row" style={{ justifyContent: 'space-between' }} aria-live="polite">
              <span className="tag local">
                Contrast {qrContrast.label}:1 {qrContrast.ratio >= 4 ? '· OK' : '· Low contrast'}
              </span>
              <span className="faint tabular">{byteCount} / {maxBytes} bytes · ECC {effectiveEcc}</span>
            </div>

            {qrContrast.inverted && (
              <Banner kind="warn">Light modules on a dark background fail on some older scanners.</Banner>
            )}
            {style.margin < 2 && (
              <Banner kind="warn">A quiet zone smaller than 2 modules can prevent scanners from detecting the edges.</Banner>
            )}
            {testScanStatus && <Banner kind={testScanStatus.startsWith('Self-test passed') ? 'ok' : 'warn'}>{testScanStatus}</Banner>}

            <div className="grid-2">
              <Field label="PNG export size (px)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    className="input"
                    min={128}
                    max={4000}
                    value={style.sizePx}
                    onChange={(e) => setStyle((s) => ({ ...s, sizePx: Math.min(4000, Math.max(128, Number(e.target.value) || 600)) }))}
                  />
                )}
              </Field>
              <Field label="PDF print width (mm)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    className="input"
                    min={20}
                    max={400}
                    value={printMm}
                    onChange={(e) => setPrintMm(Math.min(400, Math.max(20, Number(e.target.value) || 50)))}
                  />
                )}
              </Field>
            </div>

            <div className="row">
              <button type="button" className="btn primary" disabled={!payload || overCapacity || qrContrast.ratio < 2} onClick={() => void exportQr('png')}>
                <Icon name="download" /> PNG
              </button>
              <button type="button" className="btn" disabled={!payload || overCapacity} onClick={() => void exportQr('svg')}>
                <Icon name="download" /> SVG
              </button>
              <button type="button" className="btn" disabled={!payload || overCapacity} onClick={() => void exportQr('pdf')}>
                <Icon name="download" /> PDF
              </button>
              <button type="button" className="btn sm" disabled={!payload || overCapacity} onClick={() => void testScanQr()}>
                Test scan
              </button>
              <button type="button" className="btn sm" disabled={!payload || overCapacity} onClick={() => void copyQrImage()}>
                Copy image
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'barcode' && (
        <div className="split">
          <section className="panel stack" aria-label="Barcode settings">
            <Field label="Barcode format" hint={BARCODE_FORMATS.find((f) => f.id === bcFormat)?.hint}>
              {(id) => (
                <select id={id} className="select" value={bcFormat} onChange={(e) => setBcFormat(e.target.value as BarcodeFormat)}>
                  {BARCODE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Value" error={bcValidation.ok ? undefined : bcValidation.error} hint={bcValidation.note}>
              {(id) => <input id={id} className="input mono" value={bcValue} onChange={(e) => setBcValue(e.target.value)} />}
            </Field>
            {!bcValidation.ok && bcValidation.suggestedFix && (
              <button type="button" className="btn sm" onClick={() => setBcValue(bcValidation.suggestedFix!)}>
                Use check digit ({bcValidation.suggestedFix})
              </button>
            )}
            <div className="grid-2">
              <SliderField label="Bar width" value={bcWidth} min={1} max={4} step={0.5} onChange={setBcWidth} />
              <SliderField label="Height (px)" value={bcHeight} min={40} max={200} onChange={setBcHeight} />
              <ColorInput label="Bar color" value={bcFg} onValid={(_, c) => setBcFg(c)} />
              <ColorInput label="Background" value={bcBg} onValid={(_, c) => setBcBg(c)} />
            </div>
            <label className="check">
              <input type="checkbox" checked={bcDisplayText} onChange={(e) => setBcDisplayText(e.target.checked)} />
              Show human-readable text below bars
            </label>
          </section>

          <section className="panel stack" aria-label="Barcode preview">
            <div className={styles.qrFrame}>
              {bcValidation.ok ? (
                <svg ref={barcodeSvgRef} className={styles.barcodeSvg} role="img" aria-label={`${bcFormat} barcode for ${bcValidation.normalized}`} />
              ) : (
                <p className="muted">Fix the input on the left to preview the barcode.</p>
              )}
            </div>
            <div className="row">
              <button type="button" className="btn primary" disabled={!bcValidation.ok} onClick={() => exportBarcode('svg')}>
                <Icon name="download" /> Download SVG
              </button>
              <button type="button" className="btn" disabled={!bcValidation.ok} onClick={() => exportBarcode('png')}>
                <Icon name="download" /> Download PNG
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'scan' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="split">
            <section className="panel stack" aria-label="Upload or paste image to scan">
              <h2 className="panel-title" style={{ margin: 0 }}>Upload or paste image</h2>
              <DropZone
                paste
                accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']}
                title={scanning ? 'Decoding…' : 'Drop an image with a QR or barcode'}
                hint="Frames and images are decoded locally on your device"
                onFiles={(f) => void scanFiles(f)}
              />
            </section>

            <section className="panel stack" aria-label="Webcam scanner">
              <h2 className="panel-title" style={{ margin: 0 }}>Webcam scanner</h2>
              {!cameraActive ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    Camera frames are processed in memory only and never recorded or uploaded.
                  </p>
                  <button type="button" className="btn primary" onClick={() => setCameraPrompt(true)}>
                    <Icon name="camera" /> Start camera
                  </button>
                </>
              ) : (
                <>
                  <video ref={videoRef} muted playsInline style={{ width: '100%', maxHeight: 280, borderRadius: 10, background: '#000' }} />
                  <button type="button" className="btn" onClick={stopCamera}>Stop camera</button>
                </>
              )}
            </section>
          </div>

          {scanError && <ErrorBanner onDismiss={() => setScanError(null)}>{scanError}</ErrorBanner>}

          {scanResults.length > 0 && (
            <section className="panel stack" aria-live="polite">
              <h2 className="panel-title" style={{ margin: 0 }}>Decoded ({scanResults.length})</h2>
              {scanResults.map((entry, idx) => {
                const safety = inspectDecodedContent(entry.text);
                const wifiParsed = safety.kind === 'wifi' ? parseWifiPayload(entry.text) : null;
                const vcardParsed = safety.kind === 'vcard' ? parseVCardPayload(entry.text) : null;
                return (
                  <div key={`${entry.format}-${idx}`} className={`${styles.resultItem} stack`} style={{ gap: 8 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="tag local">{entry.format}</span>
                      <div className="row">
                        <CopyButton text={entry.text} label="Copy text" />
                        {safety.kind === 'url' && !safety.blocked && safety.safeUrl && (
                          <button type="button" className="btn sm" onClick={() => setConfirmUrl(safety.safeUrl!)}>
                            Open link…
                          </button>
                        )}
                      </div>
                    </div>

                    {safety.warnings.map((w) => (
                      <Banner key={w} kind={safety.blocked ? 'error' : 'warn'}>{w}</Banner>
                    ))}

                    {safety.host && (
                      <p className="hint" style={{ margin: 0 }}>
                        Host: <strong className="mono">{safety.decodedHost}</strong>
                      </p>
                    )}

                    {wifiParsed ? (
                      <div className="stack" style={{ gap: 4 }}>
                        <div><strong>SSID:</strong> {wifiParsed.ssid} ({wifiParsed.auth})</div>
                        {wifiParsed.password && (
                          <div className="row">
                            <strong>Password:</strong>
                            <code className="mono">{showWifiPass[idx] ? wifiParsed.password : '••••••••'}</code>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => setShowWifiPass((m) => ({ ...m, [idx]: !m[idx] }))}
                            >
                              {showWifiPass[idx] ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : vcardParsed ? (
                      <div className="stack" style={{ gap: 4 }}>
                        {Object.entries(vcardParsed).map(([k, v]) => (
                          <div key={k}><strong>{k}:</strong> {v}</div>
                        ))}
                      </div>
                    ) : (
                      <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{entry.text}</pre>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={cameraPrompt}
        title="Allow camera access?"
        message="Your browser will ask to use your camera. Video frames are analyzed locally in memory and are never uploaded or stored."
        confirmLabel="Enable camera"
        onConfirm={() => void startCamera()}
        onCancel={() => setCameraPrompt(false)}
      />

      <ConfirmDialog
        open={confirmUrl !== null}
        title="Open scanned link?"
        message={
          <div className="stack" style={{ gap: 6 }}>
            <span>Only open links from codes you trust.</span>
            <code className="mono" style={{ wordBreak: 'break-all' }}>{confirmUrl}</code>
          </div>
        }
        confirmLabel="Open in new tab"
        onConfirm={() => {
          if (confirmUrl) window.open(confirmUrl, '_blank', 'noopener,noreferrer');
          setConfirmUrl(null);
        }}
        onCancel={() => setConfirmUrl(null)}
      />
    </div>
  );
}
