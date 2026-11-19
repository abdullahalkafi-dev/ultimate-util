# F-016 — Font Pairer & Type Scale

Status: shipped (offline font pairing, modular/fluid type scale generator, and code snippet exporter).

## Implementation notes
- Displays paired specimens with curated Latin, Arabic, Bengali, Devanagari, and Japanese samples, RTL detection (`isRtl`), and local system/installed-font detection (`isFontInstalled`).
- Computes modular and CSS `clamp()` fluid type scales (`scale.ts`) exported as CSS variables, Tailwind tokens, SCSS, or JSON.
- Generates copyable Google Fonts `<link>`, Fontsource npm/import snippets, and CSS declarations alongside an explicit GDPR/privacy notice (`GOOGLE_PRIVACY_NOTE`).

## Known limitations
- Privacy-by-default: the tool itself never makes network requests to `fonts.googleapis.com`; previews render with fonts already installed on the user's device and fall back to generic system stacks when absent.
