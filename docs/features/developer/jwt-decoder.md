---
id: F-019
slug: jwt-decoder
title: JWT Decoder & Debugger
category: developer
tier: client
priority: P0
status: planned
depends_on: []
---

# JWT Decoder & Debugger

## 1. Summary
Paste a JSON Web Token and see its header, payload and claims in readable form, with times converted to your timezone and risky settings flagged. Optionally verify the signature locally with WebCrypto. The token never leaves the device and is never stored.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Backend dev | Login returns 401, suspects expiry | Sees `exp` was 14 minutes ago, in local time, with relative text |
| Frontend dev | Needs to check which scopes and roles the token carries | Claims table with standard claim explanations |
| Security reviewer | Audits a service's tokens | Warnings for `alg: none`, weak HS secrets, missing `exp`, HS/RS confusion risk |
| Integrator | Has a JWKS key and a token | Verifies the signature by pasting the JWK or PEM public key |
| Support (non-obvious) | Customer sends a screenshot-copied token with line breaks and "Bearer " | Tool cleans it and decodes without manual editing |

## 3. User flow
1. Empty state: a notice, **Do not paste production tokens into sites you do not trust. This tool never uploads, stores or logs your token. You can verify this in the Network tab.** A textarea and **Try an example** (a sample, expired token with a harmless secret).
2. User pastes. Decoding is live. Three panels appear: **Header**, **Payload**, **Signature**; a summary strip shows status chips (Expired / Valid for 3 h / Not yet valid / Unsigned).
3. Payload shows pretty JSON and a **Claims** table: claim, value, plain-English meaning. Time claims show ISO, local time, UTC and relative text.
4. Optional **Verify signature** section: the tool picks the input type from `alg` (secret for HS*, public key/JWK/PEM for RS*/PS*/ES*/EdDSA if supported). Result: Verified / Not verified / Cannot verify, with reason.
5. Done state: copy header, payload or a single claim; **Clear** button wipes input, keys and results. Optional **Auto-clear after** 5 / 15 / 60 min or on tab hide.

```
[ paste token ......................................... ]  [Clear] Auto-clear [off v]
 Status: Expired 14 min ago | alg HS256 | typ JWT
 Header {..}   Payload {..}   Claims table   Verify signature [secret/key]
```

## 4. Inputs and outputs
- **Inputs:** a compact JWS (3 dot-separated parts) or JWE (5 parts, detected only). Secret text (UTF-8 or Base64/hex toggle), public key as JWK JSON, JWKS (picks by `kid`), PEM SPKI or X.509 certificate PEM (verify certificate support in spike).
- **Outputs:** decoded header and payload JSON (copy/download as `.json`), claims table, verification verdict. Nothing else is generated. No re-signing in v1.

## 5. Components and tech
- **UI:** `ToolShell`, `CodeOutput`, `CopyButton`, `Tabs`, `SegmentedControl`, `ErrorBanner`, `Toast`, `EmptyState`, `HelpPopover`, `Tooltip`, `PasswordPrompt` (for secret field, show/hide). New: `ClaimsTable`, `TokenStatusChip`, `PrivacyNotice` (reused by F-021 secrets).
- **APIs:** `atob`/`TextDecoder` for decode; `crypto.subtle` (`importKey`, `verify`) for HMAC SHA-256/384/512, RSASSA-PKCS1-v1_5, RSA-PSS, ECDSA P-256/384/521. EdDSA/Ed25519 in WebCrypto is recent and uneven across browsers (verify the latest-two-versions matrix; ES256K is not available). No JWT library needed; if one is added (e.g. `jose`, MIT, verify) it must run offline.
- **Time:** `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, timezone selector.
- **Where it runs:** main thread (all operations are fast).

## 6. Behavior rules
- Normalization before decode: trim whitespace and line breaks inside the token, strip a leading `Bearer ` (case-insensitive), strip surrounding quotes, accept base64url with or without padding; reject standard-base64 characters `+` and `/` with a hint but offer "Convert to base64url".
- Header and payload are decoded as UTF-8 JSON. If the payload is not JSON (valid in JWS), show as text.
- Time claims `exp`, `iat`, `nbf` (seconds since epoch; if the value looks like milliseconds, show a hint). Show status vs the browser clock and warn that device clock skew affects the verdict. Timezone default: browser; selectable.
- Warnings (each with an icon + text and a "why it matters" line): `alg: none`; missing `exp`; `exp` far in the future (over 1 year); `alg` HS* while the pasted key is an RSA public key (algorithm confusion); `jku`/`x5u`/`jwk` header present (key injection vectors: the tool never fetches these URLs or uses an embedded key); `kid` present (informational: servers that use it in a file path or database lookup without validation are injectable); unknown `crit` entries (RFC 7515: a token with unknown critical headers must be rejected); `typ` missing (info only, it is optional); sensitive-looking claims (email, phone) noted as "readable by anyone, JWT payloads are not encrypted".
- Verification uses the `alg` from the header only to pick an algorithm class, and if the user picks a key type that does not match, verification is refused with an explanation (never "try everything"). `alg: none` is never reported as Verified; it is shown as "Unsigned".
- ECDSA: a JOSE signature is the raw `r||s` concatenation (64 bytes for ES256, 96 for ES384, 132 for ES512), which is exactly what WebCrypto `verify` expects, so no DER conversion is needed. A DER-encoded signature (wrong for JWT) is detected by length and reported as malformed. ES256K (secp256k1) is not supported by WebCrypto; the tool says so.
- Verification checks the signature only. It does not validate `iss`, `aud`, `exp` policy or key trust, and the result says "Signature valid. Claims not validated by this tool." A valid signature does not mean the token should be trusted.
- A key embedded in the token (`jwk` header) or fetched via `jku`/`x5u` is never used for verification automatically; the user supplies the key.
- HS* secrets shorter than the hash output (32 bytes for HS256, 48 for HS384, 64 for HS512; RFC 7518) get a "weak secret" warning. No wordlist or network lookup is used.
- JWE (5 parts or `enc` header): show header only, message "This token is encrypted. The payload cannot be read without the private key. Decryption is not supported."
- **Never persisted:** no localStorage, sessionStorage, IndexedDB, URL, hash, history entries, or analytics. No `autocomplete` on the field (`autocomplete="off"`, `spellcheck=false`). Secrets and keys are held in memory only and cleared with the token.
- No network call, including for `jku`, `x5u`, JWKS URLs or OIDC discovery.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Empty state; no error |
| Two parts only / four parts | Error: "A JWT has 3 parts (JWS) or 5 (JWE). This has 2." |
| Third part empty (`a.b.`) | Treated as unsigned; shown as "No signature"; warns if alg not `none` |
| Base64url with `-` and `_` and no padding | Decoded normally |
| Standard base64 (`+`, `/`, `=`) | Hint + one-click normalize |
| Bearer prefix, newline wraps, quotes, trailing spaces | Cleaned silently with a "Cleaned input" note |
| Header or payload not valid JSON | Error shows which part; raw decoded text displayed |
| Payload with non-ASCII (Arabic, Bengali, emoji) | Decoded as UTF-8; shown correctly, RTL with `dir="auto"` |
| `exp` as string or float or milliseconds | Flag non-standard type; best-effort display with hint |
| `exp` in the past by seconds | "Expired 3 s ago"; note about clock skew leeway |
| `nbf` in the future | Status "Not valid yet, starts in 2 h" |
| `alg: none` / `None` / `nOnE` | Strong warning, case-insensitive detection |
| HS256 token and user pastes RSA public key | Refuse as algorithm confusion, explain |
| Wrong secret | "Signature does not match" (cannot tell wrong secret from altered token) |
| Secret is Base64-encoded vs plain | Toggle for secret encoding; hint when mismatch is likely |
| PEM with wrong header (PRIVATE KEY pasted) | Warn "Private key pasted. Only public keys are needed." Do not use or store it |
| JWKS with several keys | Select by `kid`; if no `kid`, list keys to choose |
| JWE token | Header-only view, message above |
| Huge token (over 100 KB) | Decode with warning; cap at about 1 MB |
| Algorithm unsupported by browser (Ed25519 on older Safari) | "Your browser cannot verify EdDSA" with fallback message |
| WebCrypto unavailable (non-secure context) | Decode still works; verify disabled with explanation |
| User clicks Clear | Input, keys and results wiped; focus returns to field |
| ES256K (secp256k1) or other algorithm WebCrypto lacks | "Cannot verify: algorithm not supported in browsers"; decode still works |
| DER-encoded ECDSA signature or wrong-length `r` and `s` concatenated | "Malformed signature for ES256 (expected 64 bytes, got N)" |
| Reload, back/forward cache or session restore | Token and key fields start empty (`autocomplete="off"`, cleared on `pagehide`); nothing is restored from storage |
| Cancel / timeout | Not applicable: decode and verify are synchronous and under 50 ms; the 1 MB cap is the only guard |
| Token in a URL pasted into the field (`?access_token=...`) | The token value is extracted if exactly one JWT-shaped string is found; otherwise a message asks for the token only |

## 8. Limits, performance, privacy
- Instant (under 50 ms) for typical tokens. Cap at 1 MB.
- Network: none. No requests for `jku`, `x5u`, JWKS, fonts at runtime. Strict CSP keeps third-party scripts out.
- Storage: nothing of the token, secret or key. Only UI preferences (timezone, secret encoding default) in localStorage.
- Auto-clear timer is a visible setting and also clears on `pagehide`.

## 9. Accessibility and mobile
- Status chips use icon + text. Time claims readable by screen readers ("expired 14 minutes ago, on 19 Nov 2026 10:02"). Verification result in `aria-live="polite"`; errors in `role="alert"`.
- Mobile: single column; claims table becomes stacked cards; paste button for clipboard (with `PermissionPrompt` text if needed).

## 10. Data
N/A, client-only. Tokens, secrets and keys are never stored.

## 11. Acceptance criteria
- [ ] A valid HS256 token decodes and verifies with the correct secret and fails with a wrong one.
- [ ] `Bearer ` prefix, whitespace and missing padding do not prevent decoding.
- [ ] `alg: none` shows a prominent warning and is never "Verified".
- [ ] `exp`, `iat`, `nbf` show local time, UTC and relative text.
- [ ] RS256 and ES256 verify with a pasted PEM and JWK (tested with known vectors, including a raw 64-byte ES256 signature).
- [ ] An HS256 token with an RSA public key pasted is refused with the algorithm-confusion explanation.
- [ ] Decoding a 10 KB token takes under 50 ms.
- [ ] A verified token shows "Claims not validated by this tool".
- [ ] JWE tokens show header only and an explanation.
- [ ] After Clear, no token, key or secret remains in the DOM, storage, URL or history.
- [ ] Network tab shows zero requests during decode and verify.

## 12. Future ideas and open questions
- Sign/encode a new JWT for testing (HS256 only, with a "for testing, not for production" notice), JWE decrypt with a private key, OIDC discovery fetch (would need an explicit, user-triggered network call), compare two tokens.
- Open: should "Try an example" token be the only way to show verification, or also offer an example key set? Include Ed25519 given uneven browser support?
