---
id: F-024
slug: qr-barcode
title: QR Code & Barcode Generator/Scanner
category: everyday
tier: client
priority: P0
status: planned
depends_on: []
---

# QR Code & Barcode Generator/Scanner

## 1. Summary
Create styled QR codes (URL, text, Wi-Fi, vCard, email, SMS, phone, location, calendar event) and common 1D/2D barcodes, export them at print quality, and scan codes from the webcam or an image. All work, including camera frames, stays on the device.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Cafe owner | Wants guests to join Wi-Fi by scanning a table card | Wi-Fi QR with correct escaping, exported as print-size PDF |
| Freelancer | Needs a vCard QR for a business card, with logo | Branded QR that still scans, with a scannability check |
| Shop owner | Labels products with EAN-13 or Code128 | Valid barcode with check digit verified, SVG for the printer |
| Anyone | Gets a QR on a flyer and is unsure about it | Scans it, sees the full decoded text and a safety warning before anything opens |
| Event organizer (non-obvious) | Needs a calendar-invite QR | Event QR that adds to the phone calendar |

## 3. User flow
1. Empty state: `Tabs` **Generate QR | Barcode | Scan**. Generate tab shows a content-type `SegmentedControl`, a "Try an example" button, and a placeholder preview.
2. Pick a type, fill the form (fields change per type). Preview updates live (debounce 150 ms).
3. Open `SettingsPanel` for style: colors, dot shape, corner shape, error correction (L/M/Q/H), margin (quiet zone), logo upload.
4. A status strip shows: scannability OK / warning (low contrast, big logo, dense data), and data size.
5. Export: PNG (size in px), SVG, PDF (physical size in mm/in at 300 dpi), copy image. Done state: Toast "Saved as qr-wifi.png".
6. **Barcode tab:** choose format, enter value, see live validation (length, digits, check digit), preview, export PNG/SVG, optional human-readable text.
7. **Scan tab:** two choices: **Use camera** and **Upload/paste image**. Camera: `PermissionPrompt` explains first, then the browser prompt. Working state: live video with a detection overlay. Done state: result list (type, decoded text, format) with Copy, "Open" (confirm dialog), "Make a QR from this".

## 4. Inputs and outputs
- **Inputs:** typed text up to the QR capacity (about 2,953 bytes at level L, 7,089 numeric digits; verify against library); Wi-Fi: SSID, password, security (WPA/WEP/none), hidden flag; vCard fields; event start/end/timezone; images for logo (PNG/JPG/SVG, soft 5 MB) and for scanning (PNG/JPG/WebP/GIF first frame/HEIC via F-008 if available).
- **Outputs:** PNG, SVG, PDF; copyable decoded text. Filename `qr-<type>.<ext>`, `barcode-<format>-<value>.<ext>`.
- Wi-Fi payload: `WIFI:T:WPA;S:<ssid>;P:<pass>;H:true;;` (`H` only when hidden). Escape `\`, `;`, `,`, `:`, `"` with a backslash in SSID and password. An SSID or password made only of hex digits that is meant as text is wrapped in double quotes (ZXing format; verify behavior on current iOS and Android).
- QR capacity depends on ECC level and content mode; the figures above are version 40 at level L (binary and numeric). Level M/Q/H hold less (verify against the library).
- Barcodes: Code128, Code39, ITF, EAN-13, EAN-8, UPC-A, DataMatrix (scope permitting).

## 5. Components and tech
- **UI (shared):** `ToolShell`, `Tabs`, `SegmentedControl`, `SettingsPanel`, `ColorField`, `Slider`/`NumberField`, `DropZone`, `PermissionPrompt`, `CopyButton`, `DownloadButton`, `Toast`, `ErrorBanner`, `ConfirmDialog`, `EmptyState`, `LibraryLoader`, `HelpPopover`.
- **New:** `QrPreview` (canvas/SVG preview with print-size ruler), `ContrastBadge` (ratio + pass/fail), `ScanOverlay` (camera view with boxes), `ScanResultList`, `LinkSafetyCard` (shows host, flags).
- **Libraries:** `qr-code-styling` or `qrcode` (MIT) for generation; `JsBarcode` (MIT) for 1D; DataMatrix needs a separate lib (verify, e.g. bwip-js MIT, size). Scan: native `BarcodeDetector` first, fallback `zxing-wasm` (Apache-2.0, verify size) or `jsQR` (Apache-2.0, QR only). PDF via pdf-lib or jsPDF (verify).
- **Where it runs:** generation on main thread; fallback decoding in a worker; frames sampled about 10 to 15 fps.

## 6. Behavior rules
- Camera starts only after a user tap, only on secure context (HTTPS or localhost); `getUserMedia` is unavailable otherwise. On HTTP show "Camera needs a secure (HTTPS) page".
- `BarcodeDetector` is Chromium-only (and platform-dependent; verify) and also needs a secure context. Always call `BarcodeDetector.getSupportedFormats()` and fall back to zxing-wasm for any format it lacks.
- Scanned content is never opened or fetched automatically. URLs show full host (punycode decoded and raw), and the user presses "Open" then confirms. Warnings: shortened-URL domains (a maintained list, verify), mixed-script or punycode lookalike hosts, `javascript:`/`data:` schemes (blocked, text only), IP-address hosts, very long URLs.
- Camera frames are processed in memory, not stored or sent. Stopping the scan or leaving the tab releases the stream tracks.
- Logo: raise ECC to at least Q automatically (H if logo over about 20% of the area), cap logo at about 25% of the QR width, warn above that. Logo area gets a white pad option.
- Contrast: require dark modules on a lighter background. Warn below 4:1 contrast, and warn if inverted (light on dark), since many scanners fail. Block export only on ratio below 2:1 unless user overrides.
- Margin default 4 modules (spec quiet zone); warn if set under 2.
- Barcode validation: EAN-13/UPC-A/EAN-8 accept N-1 digits and compute the check digit, or full length and verify it; mismatch is an error with the correct digit suggested. Code39 allowed set `A-Z 0-9 -. $/+%` and space. ITF needs even digit count (offer to prepend 0). Code128 supports full ASCII.
- Scan multiple codes in one image; list all with position order.
- Remember settings (colors, ECC, size) in localStorage; never remember content (Wi-Fi passwords, vCards).
- Calendar event: iCalendar `VEVENT` with UTC or floating time as chosen, text escaped per RFC 5545.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Preview shows placeholder, export disabled, hint what to type |
| Content exceeds QR capacity | Error with max size and current size; suggest lower ECC or shorter text |
| Wi-Fi password contains `; , : \ "` | Escaped as per rules; test string round-trips through own scanner |
| Open Wi-Fi (no password) | `T:nopass`, password field hidden |
| Logo too large or low contrast | Warning badge; ECC auto-raised; "Test scan" button decodes the rendered image |
| Non-Latin text (Arabic, Bengali, emoji) | Encoded as UTF-8 (ECI where the lib supports; verify); round-trip test with own decoder |
| EAN-13 wrong check digit | Inline error with the correct digit; one-click fix |
| UPC/EAN with letters or wrong length | Error naming the expected length |
| Huge PNG size (over 8000 px) | Cap with message; recommend SVG/PDF for print |
| Camera denied | `PermissionPrompt` recovery steps per browser; upload fallback offered |
| No camera / camera in use | Message "No camera found or in use by another app"; upload fallback |
| Insecure context (HTTP) | Camera hidden, message explains HTTPS; upload still works |
| No `BarcodeDetector` (Firefox, Safari) | Auto-load zxing-wasm via `LibraryLoader`; if load fails, jsQR for QR only |
| Torch / flip camera unsupported | Controls hidden when `getCapabilities()` lacks them |
| Blurry, tilted, or inverted QR image | Try inverted and rotated attempts; if none decode, "No code found" with tips |
| Image has several codes | All listed; user picks which to copy |
| Scanned text is a URL with `javascript:` or lookalike host | Not clickable; red warning card; copy only |
| Scanned vCard / Wi-Fi payload | Parsed into readable fields; Wi-Fi password hidden by default with Show |
| User cancels camera mid-scan | Tracks stopped, preview cleared, state returns to empty |
| Mobile screen locks / tab hidden | Pause detection on `visibilitychange`, resume on return |
| RTL text in label under barcode | Label rendered with correct direction |
| Offline | Generation and still-image scanning work after first load; fallback decoder loads only if it was cached, else a clear message |
| Wi-Fi password or vCard in an exported file | Exported QR contains the secret in plain form; help text warns before sharing the image; nothing is stored |
| EAN/UPC of a different system (UPC-A vs EAN-13 with leading 0) | Treated as equivalent; UPC-A shown as EAN-13 with a leading 0 when the format is switched |

## 8. Limits, performance, privacy
- Generation under 100 ms for typical content; scan decode under 1 s per still image of 12 MP (downscale to about 2000 px long side).
- Network: none for user content. Library files (zxing-wasm, verify about 1 MB) load on demand, then cached.
- Stored locally: style settings only. No scan history by default; optional "Keep recent scans in this session" is memory-only.

## 9. Accessibility and mobile
- All form fields labeled; preview has an `aria-label` describing content type and size; scan results announced with `aria-live="polite"`.
- Camera view has a keyboard-reachable Stop and Torch buttons; upload alternative always present.
- Mobile: single column, preview on top, settings in a `Sheet`; rear camera by default; 44 px targets.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Wi-Fi QR with SSID `a;b:"c\d` scans correctly on iOS and Android cameras.
- [ ] Changing ECC level or adding a logo never produces a QR that fails the tool's own test scan without a visible warning.
- [ ] EAN-13 with a wrong check digit is rejected; with 12 digits the check digit is added.
- [ ] SVG and PDF exports are vector and print at the chosen mm size within 1% tolerance.
- [ ] Scanning never opens, fetches, or navigates to decoded content without an explicit confirm.
- [ ] Camera stream is released within 1 s of Stop or tab close.
- [ ] Works in Firefox/Safari through the fallback decoder; camera disabled with clear message on HTTP.
- [ ] No network request contains typed content, logo, or camera/image data.

## 12. Future ideas and open questions
- Batch generation from CSV (one QR per row, ZIP via fflate), dynamic/trackable QRs (needs a server, not planned), UPI/payment QR formats, scan history with Clear button.
- Open: include DataMatrix in v1 (extra library size)? Which shortener-domain list to bundle and how to update it?
