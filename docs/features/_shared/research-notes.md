# Research notes and risks

_Created: 2026-11-19._ Findings from a first round of research, plus items that must be verified when building. Web results were mostly blogs and vendor pages, so treat them as directional. **Rule: run a small spike (one real test file) before committing to any library below.**

## Findings that shape decisions

### DOCX viewing and editing (F-001)
- `docx-preview` renders DOCX to HTML in the browser, read-only, closer to page layout. `mammoth.js` converts DOCX to clean semantic HTML but loses layout and pagination. `SuperDoc` targets editing with round-trip DOCX (built on ProseMirror), but its fidelity is self-reported and the license must be checked (verify AGPL/commercial terms). Sources: [npm-compare](https://npm-compare.com/docx-preview,docxtemplater,jszip,mammoth,officegen), [SuperDoc README](https://cdn.jsdelivr.net/npm/superdoc@1.45.0/README.md), [guide](https://www.besthub.dev/articles/comprehensive-guide-to-docx-pptx-xlsx-and-pdf-preview-solutions-d5e00bd76cb4).
- Recommended staged approach: viewer with `docx-preview` (P0), editor on TipTap/ProseMirror with `docx` (MIT) export (P0 basic), evaluate SuperDoc in a spike for higher fidelity.
- Word-identical output is not achievable with lightweight libraries. The product promise must be "readable and editable for normal documents", with a visible fidelity notice.

### PDF encryption and compression (F-004)
- `pdf-lib` is the usual choice for merge/split/reorder, but sources disagree on whether it can **encrypt**; treat it as unsupported until verified. QPDF compiled to WASM (about 2 MB module via `@neslinesli93/qpdf-wasm` or similar) is the most common client-side route for AES encryption/decryption. Sources: [DEV: QPDF WASM protect](https://dev.to/linmingren/securing-pdfs-with-password-protection-a-webassembly-powered-implementation-2c9g), [DEV: unlock](https://dev.to/linmingren/building-a-browser-based-pdf-unlock-tool-with-qpdf-webassembly-361a).
- No reliable result on Ghostscript/MuPDF WASM for compression. Plan: re-encode embedded images (downscale/recompress) and strip metadata with pdf-lib + canvas; test a Ghostscript-WASM or MuPDF-WASM spike for stronger compression and check licenses (Ghostscript and MuPDF are AGPL, which has consequences for a closed product).

### PDF to DOCX (F-002)
- Client-side conversion is feasible for **text and reading order** (pdf.js to extract, `docx` to build). Layout-faithful conversion (columns, tables, floating shapes, scans) is hard without a server or commercial engine. Source: [DEV: browser PDF to Word](https://dev.to/sunshey/how-i-built-a-browser-based-pdf-to-word-converter-with-vue-3-pdfjs-and-docx-1fa3), [Nutrient overview](https://www.nutrient.io/blog/convert-pdf-to-word/).
- Therefore ship as "Text and structure conversion" with honest expectations, not "perfect conversion".

### Background removal (F-009)
- Bria RMBG-1.4 is **non-commercial** unless licensed ([model card](https://huggingface.co/briaai/RMBG-1.4)); RMBG-2.0 is similar (verify). Using it would be a licensing problem for a public product. Prefer Apache/MIT-licensed models (e.g. U²-Net, ISNet, MODNet; verify each) run through ONNX Runtime Web. Check the license of `@imgly/background-removal` (believed AGPL-3.0, verify) before using it.

### Video and GIF (F-011)
- ffmpeg.wasm multi-thread needs cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). The core is roughly 31 MB. Single-thread works without those headers but is slower. Third-party scripts and resources break under COEP. Source: [Shotstack](https://shotstack.io/learn/ffmpeg-wasm/), [cookbook](https://ffmpeg-cookbook.pages.dev/en/articles/ffmpeg-sharedarraybuffer-error/).
- **Important conflict:** `COOP: same-origin` can break Google sign-in popups. Plan: apply isolation headers only on the video tool route (separate path), or use the single-thread core, and use redirect-style Google login. Verify in a spike. Also check ffmpeg.wasm core license (GPL parts if x264 is included; verify).

### Softbox light (F-012)
- Screen Wake Lock is supported in Chrome, Safari 16.4+, Firefox, but has reports of **not working in iOS home-screen web apps**; iPhone does not support element-level Fullscreen (only video), while iPad and desktop do. Sources: [caniuse](https://caniuse.com/wake-lock), [web.dev](https://web.dev/blog/screen-wake-lock-supported-in-all-browsers?hl=en), [WebKit bug 205104](https://bugs.webkit.org/show_bug.cgi?id=205104).
- Therefore: on iPhone use a "pseudo-fullscreen" (full-viewport overlay, hidden UI, hide the Safari bar via scroll/Add to Home Screen hint) and fall back to a "keep screen on" hint if Wake Lock fails.

### Platform and auth (P-002, P-003, P-005)
- Redirect-based Google login (OAuth code + PKCE, session in an `HttpOnly; Secure; SameSite=Lax` cookie, ideally `__Host-` prefixed) avoids the COOP popup problem. Under `COEP: require-corp` (video route) cross-origin images such as the Google avatar can fail to load; use initials or serve the avatar from our own origin on that route. An HttpOnly cookie cannot be read by JavaScript, so "is a session present" needs a separate non-sensitive flag cookie or one cheap request after Sign in is clicked.
- `Ctrl K` is used by Chrome/Firefox (search bar) and `/` by Firefox (quick find); calling `preventDefault` on page keydown works for these, but the visible button must always exist as a fallback. Editors that use `Ctrl K` (CodeMirror, TipTap links) must win when focused.
- `storage` events fire only in *other* tabs; use `BroadcastChannel` as the primary sync and `storage` as fallback.
- Command palette and privacy: Class A titles are never indexed by default; any Class B index uses titles and tags only.

### Other risks collected from the specs
| Risk | Feature | Action |
|---|---|---|
| libimagequant (PNG lossy) is GPL/commercial | F-006 | Verify license; fallback oxipng lossless plus own quantizer |
| HEIC decode libraries (libheif-js LGPL) | F-006, F-007 | Verify license and lazy load |
| Google Fonts CDN sends visitor IP to Google | F-016 | Default self-hosted (Fontsource); CDN only as opt-in for the exported snippet |
| Map tiles reveal coordinates to a provider | F-010 | Opt-in only, or no map; owner decision |
| Device frame artwork may be trademarked | F-017 | Original generic frames only in v1 |
| Malware in clipboard-drop files, link abuse | F-032 | Scanning service decision; block list of file types; rate limits |
| APCA contrast licensing | F-013 | Verify before including |
| Wordlists and stopword lists need licence/attribution (EFF list etc.) | F-026, F-027 | Check before bundling |
| Argon2id timing on low-end phones | F-028, F-029 | Spike 6; PBKDF2 600k+ fallback |
| ffmpeg core GPL parts (x264) | F-011 | Verify; may limit output to WebM/VP9 |

## Library shortlist (verify license and size at build time)
| Need | Candidate | License (verify) |
|---|---|---|
| PDF read/render | pdf.js | Apache-2.0 |
| PDF edit/merge/split | pdf-lib | MIT |
| PDF encrypt | qpdf-wasm | Apache-2.0 (qpdf) |
| DOCX render | docx-preview | Apache-2.0 |
| DOCX to HTML | mammoth | BSD-2 |
| DOCX write | docx | MIT |
| Rich text editor | TipTap / ProseMirror | MIT |
| OCR | tesseract.js | Apache-2.0 |
| Image codecs | jSquash (mozjpeg, oxipng, webp, avif) | Apache-2.0 / BSD |
| HEIC decode | heic2any / libheif-js | MIT / LGPL (check) |
| Image resize | pica | MIT |
| EXIF | exifr | MIT |
| Canvas editor | Konva or Fabric.js | MIT |
| ONNX in browser | onnxruntime-web | MIT |
| Video | ffmpeg.wasm | LGPL/GPL (check core) |
| Color math | culori | MIT |
| SVG optimize | svgo (browser build) | MIT |
| SVG to JSX | @svgr/core | MIT |
| YAML / XML | yaml / fast-xml-parser | ISC / MIT |
| Diff | jsdiff / CodeMirror merge | BSD / MIT |
| Hash | SubtleCrypto (SHA), spark-md5, bcryptjs | native / MIT |
| Cron | cronstrue + cron-parser | MIT |
| SQL format | sql-formatter | MIT |
| QR | qr-code-styling / qrcode | MIT |
| QR/barcode scan | BarcodeDetector API, zxing-wasm / jsQR fallback | native / Apache / Apache |
| Barcode draw | JsBarcode | MIT |
| Password strength | zxcvbn-ts | MIT |
| TOTP | otpauth | MIT |
| KDF | hash-wasm (Argon2id) | MIT |
| ZIP | fflate | MIT |
| Code editor | CodeMirror 6 | MIT |
| Fuzzy search | Fuse.js / MiniSearch | Apache / MIT |
| Fake data | @faker-js/faker (lazy) | MIT |

## Spike list (do before building each area)
1. DOCX: open 10 real client files (tables, images, headers, tracked changes, RTL) in docx-preview; edit and export in TipTap + docx; compare. Decide on SuperDoc.
2. PDF encrypt/compress: qpdf-wasm encrypt test; compression ratio on 5 real PDFs.
3. Background removal: model license and quality/size on 20 images; load time on mid-range phone.
4. ffmpeg: isolation headers vs Google login popup; trimmed MP4 to GIF memory use on a 200 MB file.
5. Wake Lock and fullscreen behavior on real iPhone, Android, desktop.
6. Vault crypto: Argon2id timing on a low-end phone.
7. Auth: redirect login on desktop and iOS Safari, callback route outside cross-origin isolation, avatar under COEP, in-app browsers blocked by Google.
8. Command palette search: Fuse.js vs MiniSearch with 100 tools plus 2,000 saved items (p95 under 16 ms per keystroke).
9. CI network audit: Playwright request interception on three Local tools, proving a forbidden POST fails the build.
