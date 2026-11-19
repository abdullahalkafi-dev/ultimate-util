# Saved Palettes & Presets: gaps
- Guest storage is localStorage (`uu-library-v1`, cap 50), not IndexedDB as in the spec. Multi-tab sync via BroadcastChannel.
- Not built: collections, drag/keyboard reorder, thumbnails stored in data, image color extraction, trash/restore (delete has an in-page Undo that re-creates the item), "newer format" flag, offline write queue for signed-in users, SCSS export, "(other device)" conflict copies.
- Tool-side "Open in" links pass `?library=<id>`; the target tools must read it (not verified).
- Merge dialog: "keep both, newest wins on same kind+name, identical content deduped, 100 cap"; local copy cleared only if nothing failed or overflowed. Declining keeps local items separate for the session; the dialog returns on reload.
- Signed-in 401: banner shown only if the list query itself returns 401 (useSession normally maps 401 to guest).
