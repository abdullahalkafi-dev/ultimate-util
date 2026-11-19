# F-027 — Word & Reading Counter

Status: shipped (local counting, grapheme awareness, reading/speaking time, keyword density, and social limit bars).

## Implementation notes
- Uses `Intl.Segmenter` (`word`, `grapheme`, `sentence`) in `count.ts` with regex fallbacks so emoji/combining characters and multi-script text count accurately.
- Reports reading time (`238` WPM) and speaking time (`150` WPM), extracts top keywords filtering common English stopwords, and shows social/metadata character-limit meters.

## Known limitations
- Keyword density filtering (`STOPWORDS`) uses an English stopword list; non-English filler words are counted as keywords.
- Document/file import is text-paste or `.txt`/plain-text drop based rather than parsing `.docx`/`.pdf` directly inside this lightweight tool.
