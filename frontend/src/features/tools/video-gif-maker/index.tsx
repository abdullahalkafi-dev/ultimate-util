'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner, DropZone, EmptyState, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl, SliderField, StatTile, Tabs, useToast,
} from '@/components/ui';
import { downloadBlob, formatBytes, outputName, readFirstBytes, sniffType } from '@/lib/files';
import {
  buildAudioArgs, buildConvertArgs, buildGifArgs, buildTrimArgs,
  type AudioAction, type ConvertFormat, type ConvertResolution, type GifDither,
} from './args';
import { runFfmpegJob, terminateFfmpeg } from './ffmpegClient';
import { clampRange, estimateOutputBytes, formatTimestamp, parseTimestamp, type ToolOperationMode } from './time';
import styles from './styles.module.css';

interface SourceMedia {
  file: File;
  url: string;
  name: string;
  size: number;
  isAudioOnly: boolean;
}

interface OutputResult {
  blob: Blob;
  url: string;
  filename: string;
  kind: 'video' | 'audio' | 'gif';
}

const ACCEPT_MEDIA = [
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', '.mov', '.mkv',
];
const SOFT_LIMIT_BYTES = 100 * 1024 * 1024;
const HARD_WARN_BYTES = 300 * 1024 * 1024;

function writeWavToneBuffer(seconds = 3): File {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 261.63 + Math.floor(t * 2) * 65;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.35;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return new File([buffer], 'sample-tone.wav', { type: 'audio/wav' });
}

async function createSampleClipFile(): Promise<File> {
  if (typeof MediaRecorder === 'undefined') {
    return writeWavToneBuffer(3);
  }
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const ctx = c.getContext('2d');
  if (!ctx || typeof c.captureStream !== 'function') {
    return writeWavToneBuffer(3);
  }

  try {
    const stream = c.captureStream(24);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });

    rec.start();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const drawFrame = () => {
        const elapsed = (performance.now() - start) / 1000;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, c.width, c.height);
        const x = 60 + ((Math.sin(elapsed * 2.5) + 1) / 2) * 320;
        ctx.fillStyle = '#2446f0';
        ctx.beginPath();
        ctx.arc(x + 24, 135, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(`Sample ${elapsed.toFixed(1)}s`, 24, 38);
        if (elapsed < 2.2) {
          requestAnimationFrame(drawFrame);
        } else {
          rec.stop();
          resolve();
        }
      };
      requestAnimationFrame(drawFrame);
    });
    const blob = await done;
    return new File([blob], 'sample-motion.webm', { type: 'video/webm' });
  } catch {
    return writeWavToneBuffer(3);
  }
}

export default function VideoGifMakerTool() {
  const toast = useToast();
  const [source, setSource] = useState<SourceMedia | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [startText, setStartText] = useState('00:00.000');
  const [endText, setEndText] = useState('00:00.000');

  const [mode, setMode] = useState<ToolOperationMode>('trim');
  const [accurateTrim, setAccurateTrim] = useState(false);

  const [audioAction, setAudioAction] = useState<AudioAction>('mute');
  const [volumeDb, setVolumeDb] = useState(0);

  const [convertFormat, setConvertFormat] = useState<ConvertFormat>('mp4');
  const [convertRes, setConvertRes] = useState<ConvertResolution>('original');
  const [convertCrf, setConvertCrf] = useState(23);

  const [gifWidth, setGifWidth] = useState(480);
  const [gifFps, setGifFps] = useState(12);
  const [gifDither, setGifDither] = useState<GifDither>('bayer');
  const [gifLoop, setGifLoop] = useState(0);

  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [result, setResult] = useState<OutputResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (source?.url) URL.revokeObjectURL(source.url);
    };
  }, [source]);

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setWarning(null);
    setResult(null);
    setLogs([]);

    const head = await readFirstBytes(file, 32);
    const sniffed = sniffType(head);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isAudioOnly =
      file.type.startsWith('audio/') || ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'].includes(ext);

    if (!isAudioOnly && sniffed === 'unknown' && !['mov', 'mkv', 'avi', 'mp4', 'webm'].includes(ext)) {
      setError(`Unsupported file "${file.name}". Drop an MP4, WebM, MOV, MKV or audio file.`);
      return;
    }

    if (file.size > HARD_WARN_BYTES) {
      setWarning(
        `Large media file (${formatBytes(file.size)}): 32-bit browser WASM memory can exhaust above ~300 MB. Fast keyframe trim is safest.`,
      );
    } else if (file.size > SOFT_LIMIT_BYTES) {
      setWarning(
        `File size is ${formatBytes(file.size)}. Re-encoding in single-thread WASM may take several minutes — keyframe Trim Copy is instant.`,
      );
    }

    if (isAudioOnly) {
      setMode('audio');
      setAudioAction('extract-mp3');
    }

    const url = URL.createObjectURL(file);
    setSource({ file, url, name: file.name, size: file.size, isAudioOnly });
  }, []);

  const syncLoadedDuration = (dur: number) => {
    const clean = Number.isFinite(dur) && dur > 0 ? dur : 0;
    setDurationSec(clean);
    setStartSec(0);
    setEndSec(clean);
    setStartText(formatTimestamp(0));
    setEndText(formatTimestamp(clean));
  };

  const applyRange = (nextStart: number, nextEnd: number) => {
    const clamped = clampRange(nextStart, nextEnd, durationSec);
    setStartSec(clamped.start);
    setEndSec(clamped.end);
    setStartText(formatTimestamp(clamped.start));
    setEndText(formatTimestamp(clamped.end));
  };

  const selectionDuration = Math.max(0.1, endSec - startSec);

  const estimatedBytes = useMemo(() => {
    return estimateOutputBytes({
      mode,
      durationSec: mode === 'trim' || mode === 'gif' ? selectionDuration : Math.max(0.1, durationSec),
      sourceBytes: source?.size,
      sourceDurationSec: durationSec,
      width: mode === 'gif' ? gifWidth : convertRes === 'original' ? 720 : Number(convertRes),
      fps: gifFps,
      crf: convertCrf,
      audioAction,
    });
  }, [audioAction, convertCrf, convertRes, durationSec, gifFps, gifWidth, mode, selectionDuration, source?.size]);

  const handleRun = async () => {
    if (!source) return;
    setError(null);
    setResult(null);
    setLogs([]);
    setProgress(0);

    try {
      const inExt = source.name.split('.').pop()?.toLowerCase() || (source.isAudioOnly ? 'wav' : 'mp4');
      const inputName = `input.${inExt}`;
      const inputBytes = new Uint8Array(await source.file.arrayBuffer());

      let outName = 'output.mp4';
      let outMime = 'video/mp4';
      let kind: OutputResult['kind'] = 'video';
      let args: string[] = [];

      if (mode === 'trim') {
        outName = `trimmed.${inExt}`;
        outMime = source.file.type || 'video/mp4';
        kind = source.isAudioOnly ? 'audio' : 'video';
        args = buildTrimArgs({
          inputName,
          outputName: outName,
          startSec,
          endSec,
          accurate: accurateTrim,
        });
      } else if (mode === 'audio') {
        if (audioAction === 'extract-mp3') {
          outName = 'audio.mp3';
          outMime = 'audio/mpeg';
          kind = 'audio';
        } else if (audioAction === 'extract-wav') {
          outName = 'audio.wav';
          outMime = 'audio/wav';
          kind = 'audio';
        } else if (audioAction === 'extract-aac') {
          outName = 'audio.m4a';
          outMime = 'audio/mp4';
          kind = 'audio';
        } else {
          outName = `audio-updated.${inExt}`;
          outMime = source.file.type || 'video/mp4';
          kind = source.isAudioOnly ? 'audio' : 'video';
        }
        args = buildAudioArgs({ inputName, outputName: outName, action: audioAction, volumeDb });
      } else if (mode === 'convert') {
        outName = `converted.${convertFormat}`;
        outMime = convertFormat === 'webm' ? 'video/webm' : 'video/mp4';
        kind = 'video';
        args = buildConvertArgs({
          inputName,
          outputName: outName,
          format: convertFormat,
          resolution: convertRes,
          crf: convertCrf,
        });
      } else {
        outName = 'clip.gif';
        outMime = 'image/gif';
        kind = 'gif';
        args = buildGifArgs({
          inputName,
          outputName: outName,
          startSec,
          endSec,
          fps: gifFps,
          width: gifWidth,
          dither: gifDither,
          loop: gifLoop,
        });
      }

      const outBytes = await runFfmpegJob({
        inputName,
        inputBytes,
        outputName: outName,
        args,
        onProgress: (pct) => setProgress(pct),
        onLog: (line) => setLogs((prev) => [...prev.slice(-140), line]),
      });

      const blob = new Blob([outBytes.slice().buffer], { type: outMime });
      const url = URL.createObjectURL(blob);
      const outExt = outName.split('.').pop()!;
      const friendlyName = outputName(source.name, mode, outExt);
      setResult({ blob, url, filename: friendlyName, kind });
      toast(`Ready: ${friendlyName} (${formatBytes(blob.size)})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'FFmpeg processing failed.');
    } finally {
      setProgress(null);
    }
  };

  const handleCancel = () => {
    terminateFfmpeg();
    setProgress(null);
    toast('FFmpeg worker stopped.');
  };

  const seekMedia = (sec: number) => {
    if (videoRef.current) videoRef.current.currentTime = sec;
    if (audioRef.current) audioRef.current.currentTime = sec;
    setCurrentSec(sec);
  };

  return (
    <div className="stack">
      <Banner kind="info">
        Runs locally with single-thread FFmpeg WebAssembly (`/vendor/ffmpeg/`). No media leaves your browser.
      </Banner>

      <div className="row wrap">
        <div className="grow">
          <DropZone
            accept={ACCEPT_MEDIA}
            title="Drop MP4, WebM, MOV, MKV or audio file"
            hint="Keyframe trim copy is near-instant; GIF and transcode re-encode in WASM"
            onFiles={(files) => {
              const f = files[0];
              if (f) void handleFile(f);
            }}
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void createSampleClipFile().then((f) => handleFile(f))}
        >
          Try an example
        </button>
      </div>

      {progress !== null && (
        <ProgressBar value={progress} label="Running FFmpeg locally…" onCancel={handleCancel} />
      )}
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}
      {warning && <Banner kind="warn">{warning}</Banner>}

      {!source ? (
        <EmptyState icon="video" title="No media file loaded">
          Drop a video or audio clip above, or click Try an example to generate a local sample clip.
        </EmptyState>
      ) : (
        <div className={styles.workspace}>
          <div className="panel stack">
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <strong className="name">{source.name}</strong>
              <span className="muted tabular">{formatBytes(source.size)}</span>
            </div>

            <div className={styles.mediaWrap}>
              {source.isAudioOnly ? (
                <audio
                  ref={audioRef}
                  src={source.url}
                  controls
                  style={{ width: '90%' }}
                  onLoadedMetadata={(e) => syncLoadedDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setCurrentSec(e.currentTarget.currentTime)}
                />
              ) : (
                <video
                  ref={videoRef}
                  src={source.url}
                  controls
                  className={styles.mediaEl}
                  onLoadedMetadata={(e) => syncLoadedDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setCurrentSec(e.currentTarget.currentTime)}
                />
              )}
            </div>

            <div className={styles.trimmer}>
              <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                <span className="label">Timeline selection</span>
                <span className="muted tabular">
                  Selection: {formatTimestamp(selectionDuration)} / Total: {formatTimestamp(durationSec)}
                </span>
              </div>

              <div className="grid-3">
                <StatTile label="Playhead" value={formatTimestamp(currentSec)} />
                <StatTile label="Start" value={formatTimestamp(startSec)} />
                <StatTile label="End" value={formatTimestamp(endSec)} />
              </div>

              {durationSec > 0 && (
                <>
                  <SliderField
                    label="Start (seconds)"
                    min={0}
                    max={Number(durationSec.toFixed(2))}
                    step={0.1}
                    value={startSec}
                    onChange={(v) => {
                      applyRange(v, endSec);
                      seekMedia(v);
                    }}
                    unit="s"
                  />
                  <SliderField
                    label="End (seconds)"
                    min={0}
                    max={Number(durationSec.toFixed(2))}
                    step={0.1}
                    value={endSec}
                    onChange={(v) => {
                      applyRange(startSec, v);
                      seekMedia(v);
                    }}
                    unit="s"
                  />
                </>
              )}

              <div className={styles.trimInputs}>
                <Field label="Start timestamp (MM:SS.mmm)">
                  {(id) => (
                    <input
                      id={id}
                      className="input mono"
                      value={startText}
                      onChange={(e) => setStartText(e.target.value)}
                      onBlur={() => {
                        const parsed = parseTimestamp(startText);
                        if (parsed !== null) applyRange(parsed, endSec);
                        else setStartText(formatTimestamp(startSec));
                      }}
                    />
                  )}
                </Field>
                <Field label="End timestamp (MM:SS.mmm)">
                  {(id) => (
                    <input
                      id={id}
                      className="input mono"
                      value={endText}
                      onChange={(e) => setEndText(e.target.value)}
                      onBlur={() => {
                        const parsed = parseTimestamp(endText);
                        if (parsed !== null) applyRange(startSec, parsed);
                        else setEndText(formatTimestamp(endSec));
                      }}
                    />
                  )}
                </Field>
              </div>

              <div className="row wrap">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => applyRange(currentSec, endSec)}
                >
                  Set Start = Playhead
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => applyRange(startSec, currentSec)}
                >
                  Set End = Playhead
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => applyRange(0, durationSec)}
                >
                  Reset full range
                </button>
              </div>
            </div>

            {result && (
              <div className="panel stack">
                <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                  <strong>Output: {result.filename}</strong>
                  <span className="muted tabular">{formatBytes(result.blob.size)}</span>
                </div>
                {result.kind === 'gif' ? (
                  <img src={result.url} alt="Generated GIF preview" className={styles.mediaEl} />
                ) : result.kind === 'audio' ? (
                  <audio src={result.url} controls style={{ width: '100%' }} />
                ) : (
                  <video src={result.url} controls className={styles.mediaEl} />
                )}
                <div className="row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => downloadBlob(result.blob, result.filename)}
                  >
                    <Icon name="download" /> Download {result.filename}
                  </button>
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <details>
                <summary className="muted">FFmpeg output log ({logs.length} lines)</summary>
                <pre className={styles.logPre}>{logs.join('\n')}</pre>
              </details>
            )}
          </div>

          <aside className="panel stack">
            <Tabs
              label="FFmpeg operation"
              value={mode}
              onChange={setMode}
              tabs={[
                { id: 'trim', label: 'Trim' },
                { id: 'audio', label: 'Audio' },
                { id: 'convert', label: 'Convert' },
                { id: 'gif', label: 'GIF Maker' },
              ]}
            />

            {mode === 'trim' && (
              <div className="stack">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={accurateTrim}
                    onChange={(e) => setAccurateTrim(e.target.checked)}
                  />
                  <span>Frame-accurate trim (re-encodes video; slower than stream copy)</span>
                </label>
                <p className="hint">
                  Fast Copy preserves original quality with zero re-encoding by cutting on keyframes.
                </p>
              </div>
            )}

            {mode === 'audio' && (
              <div className="stack">
                <Field label="Audio action">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={audioAction}
                      onChange={(e) => setAudioAction(e.target.value as AudioAction)}
                    >
                      <option value="mute">Strip audio track (Mute video)</option>
                      <option value="extract-mp3">Extract audio as MP3</option>
                      <option value="extract-wav">Extract uncompressed WAV</option>
                      <option value="extract-aac">Extract AAC (.m4a)</option>
                      <option value="normalize">Normalize loudness (loudnorm)</option>
                      <option value="volume">Adjust gain (dB)</option>
                    </select>
                  )}
                </Field>
                {audioAction === 'volume' && (
                  <SliderField
                    label="Volume offset"
                    min={-24}
                    max={24}
                    value={volumeDb}
                    onChange={setVolumeDb}
                    unit="dB"
                  />
                )}
              </div>
            )}

            {mode === 'convert' && (
              <div className="stack">
                <SegmentedControl
                  label="Container & codec"
                  value={convertFormat}
                  onChange={(next) => {
                    setConvertFormat(next);
                    setConvertCrf(next === 'webm' ? 32 : 23);
                  }}
                  options={[
                    { id: 'mp4', label: 'MP4 (H.264)' },
                    { id: 'webm', label: 'WebM (VP8)' },
                  ]}
                />
                <Field label="Max vertical resolution">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={convertRes}
                      onChange={(e) => setConvertRes(e.target.value as ConvertResolution)}
                    >
                      <option value="original">Original dimensions</option>
                      <option value="1080">1080p max</option>
                      <option value="720">720p max</option>
                      <option value="480">480p max</option>
                    </select>
                  )}
                </Field>
                <SliderField
                  label="CRF quality (lower = higher quality)"
                  min={15}
                  max={42}
                  value={convertCrf}
                  onChange={setConvertCrf}
                />
              </div>
            )}

            {mode === 'gif' && (
              <div className="stack">
                <SliderField label="Width" min={160} max={960} step={20} value={gifWidth} onChange={setGifWidth} unit="px" />
                <SliderField label="Frame rate" min={5} max={25} value={gifFps} onChange={setGifFps} unit="fps" />
                <Field label="Palette dither">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={gifDither}
                      onChange={(e) => setGifDither(e.target.value as GifDither)}
                    >
                      <option value="bayer">Bayer (crisp, smaller)</option>
                      <option value="floyd_steinberg">Floyd-Steinberg (smooth gradients)</option>
                      <option value="none">None (flat artwork)</option>
                    </select>
                  )}
                </Field>
                <SliderField
                  label="Loop count (0 = infinite)"
                  min={0}
                  max={10}
                  value={gifLoop}
                  onChange={setGifLoop}
                />
              </div>
            )}

            <div className={styles.estimateBox}>
              <span className="muted">Estimated output</span>
              <strong className="tabular">{formatBytes(estimatedBytes)}</strong>
            </div>

            {mode === 'gif' && estimatedBytes > 10 * 1024 * 1024 && (
              <Banner kind="warn">
                <span>Estimated GIF exceeds 10 MB.</span>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setGifWidth(480);
                    setGifFps(12);
                  }}
                >
                  Suggest settings (480px · 12 fps)
                </button>
              </Banner>
            )}

            <button
              type="button"
              className="btn primary"
              disabled={progress !== null}
              onClick={() => void handleRun()}
            >
              {progress !== null ? 'Processing…' : `Run ${mode.toUpperCase()}`}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
