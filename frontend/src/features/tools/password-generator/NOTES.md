# Password generator: gaps and decisions

- Wordlist: `wordlist.ts` holds 7,776 unique lowercase words (12.92 bits per word), copied from the EFF-derived diceware dictionary shipped inside `@zxcvbn-ts/language-common`. I could not compare it word for word against eff_large_wordlist.txt offline. It has no hyphenated words, so it may differ from the official file in a few entries. Entropy math only needs 7,776 unique words, which a test checks. The UI attributes the EFF list under CC BY 3.0 US.
- Only one wordlist is offered (no short list, no other languages).
- Single-key shortcuts (R / C) are not implemented (optional in the spec, WCAG 2.1.4 risk).
- "Check mine" runs zxcvbn-ts on the main thread, not in a worker; input is truncated to 100 characters so it stays fast.
- The passphrase "add a number" option appends one random digit to one random word.
- Required classes are enforced by rejection sampling (uniform over valid outputs) instead of "pick one per class then shuffle", so the displayed entropy is exact (DP count), not an estimate.
- Auto clipboard clearing is only done on the "Clear clipboard now" click; a 60 s toast reminder also fires on tab focus.
