# F-028 — 2FA / TOTP Authenticator

Status: shipped (E2EE cloud vault tool for TOTP/HOTP codes, QR/migration import, and passphrase-encrypted backups).

## Implementation notes
- Requires an unlocked vault key (`useVaultKey`); secrets are encrypted/decrypted locally using AES-GCM (`encryptJson` / `decryptJson`) before API persistence (`resources.api`), with per-entry isolation on decryption errors.
- Supports manual entry, `otpauth://` URI parsing, image/webcam QR decoding (`qr.ts` + `jsqr`), Google Authenticator `otpauth-migration://` import (`migration.ts`), clock-drift offset calibration, reveal/hide timeouts, and passphrase-protected encrypted backup export (`backup.ts`).

## Known limitations
- Requires an active signed-in session and running backend/MongoDB to sync encrypted vault items (`QUOTA = 200` entries).
- Live webcam QR scanning requires `getUserMedia` permission and camera hardware; image file QR decode works on any device.
