# base64-url-hash: known gaps

- SHA-1/2 use `hash-wasm` for every size (not SubtleCrypto). One code path gives streaming, a single pass for all algorithms and works without a secure context. Spec text suggesting SubtleCrypto for small inputs is therefore not followed; results are identical.
- Text hashing and Base64/URL work run on the main thread. Only file hashing and bcrypt use the worker.
- Base64 of files reads the whole file into memory (chunked encode is not implemented). Warns above 50 MB, refuses above 500 MB.
- Base64 decode of a file (drop a `.b64` file) is not offered; paste text instead.
- Decoded image preview is not shown (type is named by magic bytes; download as file).
- The bcrypt time estimate comes from a manual "Measure speed" run at cost 10 and is scaled by 2^n. The bcrypt worker has no progress percentage (hash-wasm does not report it), so progress is indeterminate with Cancel.
- Progress is announced via the shared ProgressBar `aria-live`, not specifically in 10% steps.
- Verified only with unit tests (25) for the pure logic; the 2 GB memory / 1 s cancel acceptance numbers were not measured in a browser.
- No storage-snapshot test; by construction only the tab id and bcrypt cost are written.
