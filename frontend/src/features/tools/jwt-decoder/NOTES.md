# F-019 — JWT Decoder

Status: shipped (local JWT inspection, claim timeline, security warnings, and optional local signature verification).

## Implementation notes
- Token and verification secrets live strictly in React component state (never persisted to storage, URL hash, or network requests) with an optional auto-clear inactivity timer (`Off`, `1 min`, `5 min`, `15 min`).
- Decodes header and claims, formats local/UTC timestamps with live relative countdowns, flags weak HMAC secrets or dangerous header claims (`tokenWarnings`), and supports local JWS signature verification (`verifySignature`).

## Known limitations
- JWE encrypted payloads cannot be decrypted without keys and are reported structurally; remote JWKS URLs are not fetched automatically so zero user tokens or metadata leave the browser.
