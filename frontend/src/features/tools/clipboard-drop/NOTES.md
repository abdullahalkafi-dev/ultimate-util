# Clipboard Drop: gaps
- Registry entry has no `vault: true`, so no VaultStatus/UnlockGate is shown by the shell; the tool embeds `VaultGate` in a dialog for the E2E toggle.
- E2E items are limited to ~270 KB because the API cipher `ct` max is 400,000 chars. Encrypted items carry text, file name, MIME type and file bytes inside the ciphertext; the list shows size only.
- Not built: offline send queue, multi-tab SSE leader election (each tab opens its own EventSource), GPS EXIF stripping option, abuse reports. Text over 50 KB is converted to text.txt file automatically.
- Expiry is chosen at send time (API has no update); the setting is per browser.
- Image previews: only image MIME types, fetched with credentials and shown via blob URL; downloads re-typed as octet-stream.
