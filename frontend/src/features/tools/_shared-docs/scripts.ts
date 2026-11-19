/** Scripts the bundled PDF font (Roboto: Latin, Cyrillic, Greek) cannot draw. */
const RANGES: { name: string; test: RegExp }[] = [
  { name: 'Arabic', test: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/ },
  { name: 'Hebrew', test: /[֐-׿]/ },
  { name: 'Bengali', test: /[ঀ-৿]/ },
  { name: 'Devanagari', test: /[ऀ-ॿ]/ },
  { name: 'Tamil/Telugu/other Indic', test: /[਀-෿]/ },
  { name: 'Thai', test: /[฀-๿]/ },
  { name: 'Chinese/Japanese/Korean', test: /[぀-ヿ㐀-鿿가-힯]/ },
];

export function findUnsupportedScripts(text: string): string[] {
  return RANGES.filter((r) => r.test.test(text)).map((r) => r.name);
}
