# Open questions: owner decisions needed before coding

_Created: 2026-11-19. Collected from section 12 of every feature spec, `cloud-conventions.md` and `research-notes.md`. Deduplicated._

**This is the list the owner must answer before coding starts.** Tick a box when decided and record the decision in `docs/02-decisions.md` (dated). Each item shows the related feature IDs and a **recommended default** the agent will use if the owner says "go with your defaults". Items marked (spike) are settled by a small experiment from `research-notes.md`, not by opinion.

Priority hint: the first group (backend) and the licenses group block the most work.

## 1. Backend and accounts
- [ ] **Backend provider and region** (P-005, F-028 to F-033). Options: Supabase, Firebase, custom API + Postgres. Recommended: Supabase (Postgres row-level security, Google auth), region chosen for the owner's main audience (EU if unsure), after confirming cost and the 30-day purge/backup behavior.
- [ ] **Token and session model** (P-005). Recommended: own edge issues a `__Host-` HttpOnly cookie, access about 15 min with rotating refresh, 30 days idle, 90 days absolute.
- [ ] **Popup vs redirect login** (P-005). Recommended: redirect only (avoids the COOP popup problem); confirm in spike 7.
- [ ] **Free-tier limits and quotas for cloud tools** (P-005, cloud-conventions). Recommended: no paywall at launch; keep the default quotas (1,000 snippets, 500 notes, 200 TOTP entries, 100 library items, 100 clipboard items).
- [ ] **Other sign-in methods later** (P-005). Recommended: Google only for v1; email magic link and passkeys later.
- [ ] **Realtime, file storage and abuse scanning for clipboard drop** (F-032): provider, virus-scan service, link blocklist, maximum expiry, E2E default for files. Recommended: provider follows the backend choice; scan Class B files; allow 30 days max expiry; E2E available per item, off by default for text and on-by-default prompt for files.
- [ ] **Sync per-tool settings across devices?** (P-005, P-001). Recommended: no for v1 (theme, bookmarks, recents and usage only).
- [ ] **Notifications when the tab is closed** (F-033). Recommended: do not promise it in v1 (needs push); in-tab alerts only.

## 2. Cloud product rules
- [ ] **Sign-out default: Keep or Clear** (P-003, P-005). Recommended: Keep on a normal sign-in, Clear when "shared or public computer" was ticked.
- [ ] **Do version histories count toward quota** (F-029, F-030). Recommended: no; keep the 10-version cap.
- [ ] **Do palettes, gradients and presets share the 100-item limit; guest local cap?** (F-031). Recommended: one shared limit of 100; guests capped at 50 local items.
- [ ] **Guest habits kept locally?** (F-033). Recommended: timer and 90-day local history for guests; habits need sign-in (as specified); day start at 04:00? Recommended: midnight default, setting available; grace day off by default.
- [ ] **Device-only TOTP entries and Google-account 2FA warning** (F-028). Recommended: device-only mode post-v1; show a warning (do not block) when the issuer is Google.
- [ ] **Snippet variable syntax, secrets in default export, item cap** (F-030). Recommended: `{{name}}` with optional default, no choices in v1; exclude flagged secrets from default export; keep 1,000.

## 3. Licenses and libraries
- [ ] **DOCX editing engine and promise** (F-001, F-002; spike 1). Ship SuperDoc only if its license and fidelity pass. Recommended: docx-preview + TipTap + `docx` for v1 with the promise "viewer fidelity high, editor fidelity medium".
- [ ] **AGPL engines (Ghostscript, MuPDF)** (F-004). Recommended: avoid; use pdf-lib + qpdf-wasm and image re-encoding.
- [ ] **Background removal model pair and hosting** (F-009; spike 3). Recommended: MIT/Apache models (verify U2-Net/ISNet/MODNet), weights self-hosted, single-thread WASM acceptable.
- [ ] **PNG lossy quantizer license** (F-006). Recommended: oxipng lossless plus own quantizer unless libimagequant licensing is cleared.
- [ ] **Video encoding scope** (F-011; spike 4): single-thread only or also an isolated fast route; H.264 (GPL/licensing) vs WebM/VP9 plus WebCodecs; MP3 (LAME) or AAC/M4A only; file-size caps. Recommended: single-thread, WebM/VP9 and AAC/M4A in v1, no x264 and no LAME.
- [ ] **APCA contrast** (F-013). Recommended: leave out until licensing is confirmed; WCAG 2.x only.
- [ ] **Word lists and stopword lists, attribution** (F-026, F-027). Recommended: EFF large wordlist with attribution, English only in v1; stopwords only from clearly permissive sources.
- [ ] **Library picks by spike or size check:** Konva vs Fabric (F-008); Fuse.js vs MiniSearch (P-002, spike 8) and note search library (F-029); `@svgr/core` vs own JSX writer (F-015); `curlconverter` vs own parser (F-023); streaming SHA-2 library (F-021); regex explainer parser vs library (F-020); QR scan/decode library (F-028, F-024); DataMatrix in v1 (F-024). Recommended: pick the smallest permissive option that passes the spike; DataMatrix later.
- [ ] **Tailwind version for exports** (F-013, F-014, F-016). Recommended: v4 first, v3 output as an option.

## 4. Platform and technical support
- [ ] **Isolated (COOP/COEP) route for video** (F-011, P-005). Recommended: one route only, no sign-in callback there, no third-party resources.
- [ ] **Self-host fonts** (P-001, F-016). Recommended: yes, self-host Space Grotesk, Inter and Fontsource families; no Google Fonts CDN.
- [ ] **Softbox details on real devices** (F-012; spike 5): OKLCH wheel default or option; OLED pixel-shift default; Wake Lock behavior in iOS home-screen apps. Recommended: HSL wheel default with OKLCH option; pixel-shift off by default.
- [ ] **Advanced image editor on phones** (F-008). Recommended: open in reduced mode with a notice, do not block.
- [ ] **Autosave in the image editor** (F-008). Recommended: optional, off by default, with a Clear button.
- [ ] **Timezone data** (F-022, F-025): bundled city database vs IANA ids only; use `Temporal` when available; Kubernetes versions for `timeZone`; DST gap/overlap wording. Recommended: IANA ids plus a small bundled city list; no Temporal dependency in v1; describe DST as "depends" with an example.
- [ ] **Tool code structure** (all): the owner's preferred structure comes after these answers (AGENT.md rule 1).

## 5. Product scope and defaults
- [ ] **Home page defaults** (P-001, P-003): keep 4 default bookmarks for new visitors; how the featured tool is chosen; grouped-sections threshold (60); static category pages for SEO. Recommended: keep F-001, F-012, F-018, F-024 as defaults; featured tool set manually through registry `featuredRank`; threshold 60; add category pages after launch.
- [ ] **Bookmark limits and recents** (P-003). Recommended: 24 bookmarks, 10 recents, recents only in the palette and home row (not in the strip).
- [ ] **Mixed-tool badge** (P-004): "Local, optional sync" (extension of the approved mockup), extra "Not saved to your account" line, publish CI audit results. Recommended: keep the label, no extra line, publish a "what each tool sends" page after launch.
- [ ] **Palette behavior** (P-002): index Class A titles at all; prefill selected text; search saved-item bodies. Recommended: opt-in for Class A titles (off by default), selection prefill off, titles and tags only.
- [ ] **Batch and format caps** (F-006, F-007): batch cap 50 or 200; animated image support; animated WebP/GIF output only in F-011; HEIC output; final preset list; link to F-015 for SVG. Recommended: cap 50, animated images later, GIF output only in F-011, HEIC read-only.
- [ ] **EXIF defaults** (F-010): HEIC write in v1; ICC profile on "everything". Recommended: HEIC read plus re-encode; keep ICC and tell the user.
- [ ] **PDF edge decisions** (F-003, F-004): owner-password-only PDFs mergeable (restrictions dropped); build an own outline/bookmark copier or drop that feature; unlock tab in v1 (only removes a password the user already has). Recommended: mergeable with a visible notice; drop bookmark preservation in v1; include unlock.
- [ ] **Developer tool defaults** (F-018, F-019, F-020, F-023): keep or drop duplicate JSON keys, BOM-less output; example key set for JWT verification, Ed25519; include test text in regex share links; redaction default in the cURL inspector (F-023 spec already assumes on). Recommended: warn and keep duplicates, BOM-less output; offer an example key set, skip Ed25519 in v1; test text excluded by default; redaction on by default.
- [ ] **Generator defaults** (F-026, F-027, F-014, F-017): clipboard auto-clear attempt vs reminder; reading speed 238 or 200 WPM; weighted character counting default; clip-path and an HTML snippet in v1; faker version pinning, `.test` domains only for fake emails. Recommended: reminder only; 238 WPM; plain counting; clip-path later; pin faker and use reserved domains by default.
- [ ] **Backlog candidates** (01-feature-spec idea list): offline PWA, Markdown editor, spreadsheet/PPTX viewers, image to PDF, invoice/resume generator, PDF signer, tool chaining, per-tool SEO pages. Recommended: decide after launch data; none in v1.

## 6. Legal and privacy
- [ ] **Privacy Policy and Terms of Service** (P-005): required before launch; who writes them. Recommended: draft from a standard template, reviewed by the owner or a lawyer.
- [ ] **Device frame artwork** (F-017): generic frames only vs licensed branded frames. Recommended: generic only.
- [ ] **Map provider for EXIF location** (F-010). Recommended: no map in v1 (coordinates are copyable text); if added, opt-in only and named in the privacy line.
- [ ] **Third-party fonts CDN** (F-016): sends visitor IP to Google. Recommended: not used by default; opt-in only for the exported snippet text, no live requests.
- [ ] **Optional server engine for PDF to DOCX** (F-002). Recommended: no; it would break the "no upload" promise.
- [ ] **Analytics** (P-001, P-004): none, or anonymous page and tool counts only. Recommended: none at launch; cookieless counts later; honor Do Not Track.
- [ ] **Data residency, backups and deletion promises** (P-005, cloud-conventions): 30-day purge, backups kept up to 30 more days. Recommended: state both plainly in the delete dialog and the policy.
