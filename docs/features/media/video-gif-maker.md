---
id: F-011
slug: video-gif-maker
title: Video/Audio Trimmer & GIF Maker
category: media
tier: client
priority: P2
status: planned
depends_on: []
---

# Video/Audio Trimmer & GIF Maker

## 1. Summary
Trim video or audio, remove or extract the audio track, convert MP4 and WebM, and turn a clip into an optimized GIF, all in the browser using FFmpeg compiled to WebAssembly. Heavy by nature: it loads about 31 MB on first use (verify) and is limited by device memory, so the tool is honest about limits. Scope: this tool makes GIFs from video clips. Compressing an existing GIF is F-006; resizing or converting still images is F-007.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Developer / support | Screen recording needs to become a short GIF for a bug report | Trim, set width and fps, size estimate, optimized GIF |
| Social media user | Wants the audio from a clip as MP3/M4A | Audio extraction without upload |
| Parent | Phone video has private background talk | Strip audio track (video stream copied, no quality loss) |
| Podcaster | Cuts an intro from an audio file | Trim by time inputs or waveform handles |
| Non-obvious: documentation writer | Needs a silent, small WebM loop for a docs page | Convert to WebM (VP9), no audio, size shown |

## 3. User flow
1. Empty state: `DropZone` (video/audio), notice with expected limits (recommended under 200 MB, clips under about 10 minutes), "Try an example".
2. `LibraryLoader` explains: "FFmpeg engine, about 31 MB, one-time download" (verify size), progress, cached after. User confirms on mobile/metered data.
3. File loads; preview in a native `<video>`/`<audio>` element plus a **timeline** with start/end handles, a playhead, and numeric **start / end / duration** fields (`hh:mm:ss.ms`). Frame-step buttons.
4. Choose action in `Tabs`: **Trim**, **Audio** (strip, extract), **Convert** (MP4/WebM, quality, resolution), **GIF**.
5. GIF tab: width (px), fps (5-30), palette colors (16-256), dither (none, Bayer, Floyd-Steinberg), loop count, speed; shows **estimated size** (heuristic from a quick test encode of a short slice) and warns when over a threshold (e.g. 10 MB).
6. Click **Export**. Working: `ProgressBar` with time elapsed and remaining estimate, Cancel (terminates FFmpeg worker), warning not to close the tab. Done: `ResultCard` with preview, size, Download, "Edit again".

```
[ video preview ]
|====[=====handle=====]=========|   Start 00:00:03.2  End 00:00:09.8  Len 6.6 s
Tabs: Trim | Audio | Convert | GIF       GIF: width[480] fps[12] colors[128] dither[Bayer]
Estimated size: ~3.4 MB                               [Export]  [Cancel]
```

## 4. Inputs and outputs
- **Inputs:** MP4/MOV (H.264/HEVC varies), WebM, MKV, M4A, MP3, WAV, OGG, FLAC; codec support depends on the WASM build (verify). Soft limit 200 MB; hard limit about 500 MB desktop, 100 MB mobile (verify by spike).
- **Outputs:** trimmed file in the original container (stream copy where possible, otherwise re-encode); MP3/M4A/WAV from extraction; MP4 (H.264+AAC) or WebM (VP9+Opus) conversions; GIF. Names `<name>-trimmed.mp4`, `<name>-clip.gif`, `<name>-audio.mp3`, `<name>-noaudio.mp4`, `<name>-converted.webm`. One file at a time (no batch in v1).

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `Tabs`, `SegmentedControl`, `SettingsPanel`, `Slider`/`NumberField`, `ProgressBar`, `ResultCard`, `DownloadButton`, `LibraryLoader`, `ErrorBanner`, `ConfirmDialog`, `Toast`, `HelpPopover`. New: `TimelineTrimmer` (range handles, playhead, time inputs, waveform for audio), `EstimateBadge` (size/time estimate with confidence), `CapabilityNotice` (explains isolation/memory/mobile limits).
- **Engine:** `ffmpeg.wasm` (`@ffmpeg/ffmpeg`, wrapper MIT; **core license must be verified**: FFmpeg is LGPL-2.1+ by default, GPL if built with x264/x265 etc.). Prefer an LGPL build; H.264 encoding in a default ffmpeg.wasm core may involve GPL (x264), so verify before shipping MP4 encode. Consider WebCodecs (`VideoEncoder`) for H.264 where the browser provides it (patent license shifts to the browser). GIF palette flow: `palettegen` + `paletteuse`.
- **Threading and isolation:** multi-thread core needs SharedArrayBuffer, hence `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. **Conflict:** COOP breaks Google sign-in popups, and COEP blocks third-party resources. Decision options: (a) serve isolation headers only on a dedicated route/path (e.g. `/tools/video-gif-maker`) and use redirect-style Google login; (b) ship the single-thread core, no headers, slower (verify speed). Recommended: (b) first, (a) as an optional "fast mode". Spike before choosing.
- **Runs in:** dedicated Web Worker with the WASM module; files via the virtual FS (MEMFS) or WORKERFS to avoid copies where possible (verify).

## 6. Behavior rules
- Engine loads only on tool open, shows size first, stored in Cache Storage; works offline afterward.
- **Trim fast path:** stream copy (`-c copy`) is instant but cuts on keyframes; offer **Precise (re-encode)** vs **Fast (keyframe)** with a visible note about possible few-second drift.
- **Strip audio** copies the video stream (`-an -c:v copy`), no quality loss. **Extract audio** to MP3 (LAME may have licensing/size considerations, verify), M4A (AAC) or WAV.
- GIF defaults: width 480 px, 12 fps, 128 colors, Bayer dither, loop forever; max duration warning at 15 s and hard stop at 60 s. Size estimate updates when settings change (debounced, based on a short test slice).
- Hard guard on memory: refuse or warn when file size x expected overhead (about 3x, verify) exceeds the budget. No attempt to continue after an OOM; FFmpeg is torn down and recreated.
- One export at a time. Cancel terminates the worker and discards partial output; the loaded source stays.
- Never transmits media. Original untouched. Progress derived from FFmpeg `time=` log lines vs duration.
- Rotation metadata (iPhone) respected; variable frame rate normalized for GIF.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| No file / unsupported codec (e.g. ProRes, exotic MKV) | Clear message with detected codec; suggest converting elsewhere or a supported format |
| File over limit | Warn at soft limit; refuse above hard limit with the number and a suggestion (trim on a desktop device) |
| Out of memory mid-run | Catch worker error, restart engine, message "File too large for this device", suggest lower resolution/shorter clip |
| SharedArrayBuffer unavailable | Use single-thread core; show "Slower mode"; no crash |
| Isolation headers break login or third-party embeds | Isolation limited to this route; fallback to single-thread; documented in `CapabilityNotice` |
| 31 MB engine download fails/offline first run | Retry with progress; offline message; resume not guaranteed |
| Mobile browser (iOS Safari memory limits) | Strong notice; lower caps (about 100 MB, 30 s GIF); may fail on long clips; never freezes the page silently |
| Long-running job (minutes) | Progress, ETA, Cancel; suggest keeping the tab open (Wake Lock if supported, optional) |
| Start >= end, or end beyond duration | Inline validation; Export disabled |
| Variable frame rate or rotated video | Normalized; rotation applied; note shown |
| Trim with stream copy produces black start / audio desync | Detect with keyframe warning; recommend Precise mode |
| GIF estimate over 10 MB | Warning with tips (lower width/fps/colors) and a "Suggest settings" button |
| Transparent WebM to GIF | Flatten onto background color or keep alpha (GIF 1-bit transparency); notice |
| Audio-only file used in GIF tab | Tab disabled with reason |
| Multiple audio tracks or subtitles | Show track list; stripping affects chosen tracks; subtitles dropped on GIF |
| Unicode/RTL filenames | Names sanitized for the virtual FS internally; output names preserve user's name |
| Cancel | Worker terminated, partial files removed, UI back to ready |
| Tab backgrounded (throttling) | Warn if progress slows; keep processing in worker |
| HDR/10-bit video | Tone-map or convert to 8-bit with notice (verify support) |
| Empty/0-byte, truncated or renamed non-media file | Probe fails fast; error names what was detected; no engine load wasted on a 0-byte file |
| No WebAssembly or no Worker | Clear message; tool disabled |
| Batch of several dropped files | Only the first is loaded; message that this tool handles one file at a time |
| Privacy | The 31 MB core comes from our origin; no request carries media; no third-party scripts on this route |

## 8. Limits, performance, privacy
- Rough expectations (verify in spike): 10 s 720p clip to GIF in 10-30 s single-thread on a mid-range laptop; 200 MB MP4 trim with stream copy in under 30 s; re-encode much slower (real-time or worse).
- Memory: WASM 32-bit heap limit about 2 GB, practical use lower; plan for 3x file size working set.
- **Network:** downloading the FFmpeg core (about 31 MB, static asset from our own host, verify; no user data). No third-party scripts allowed on this route if COEP is enabled. Media never leaves the device.
- Stored locally: settings; engine cache. A "Clear engine cache" action is shown.

## 9. Accessibility and mobile
- `TimelineTrimmer` handles are focusable sliders (arrow = 0.1 s, Shift+arrow = 1 s, Home/End); numeric time fields are the primary accessible path; announce "Start 3.2 s, length 6.6 s". Video preview keeps native controls with captions passthrough where present.
- Progress and completion `aria-live="polite"`; errors `role="alert"`.
- Mobile: notice first, simplified layout (tabs on top, timeline full width), 44 px handles, long-press for frame step; export from a `Sheet`.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] A 10-second 720p clip converts to a GIF whose final size is within +/- 30% of the shown estimate (target) with the chosen fps and width.
- [ ] Strip-audio output has no audio stream and an identical video stream (verified with ffprobe-style check).
- [ ] Trim handles and time fields stay in sync and reject invalid ranges.
- [ ] Cancel stops work within 2 seconds and releases memory (second export works).
- [ ] Single-thread mode works with no COOP/COEP headers, and Google login still works site-wide.
- [ ] An oversized file shows a clear refusal or warning before loading into memory.
- [ ] The core license review is recorded and the shipped build matches it (LGPL/GPL decision documented).
- [ ] No network request carries media content; after first load the tool works offline.
- [ ] Mobile device test: 50 MB clip trims or fails with a friendly message, never an unresponsive tab.

## 12. Future ideas and open questions
- Merge clips, speed change, crop/rotate, watermark, subtitles burn-in, animated WebP/APNG/AVIF output, WebCodecs-based fast path, GIF to MP4.
- Open: single-thread only in v1, or also an isolated "fast" route? Ship H.264 encode (licensing/GPL question) or WebM/VP9 only plus WebCodecs? Is MP3 encoding required (LAME) or is AAC/M4A enough? Final file-size caps after spike?
