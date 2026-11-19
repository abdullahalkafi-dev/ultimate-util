/** DOM helpers for find. Guarded so they are safe to import during server rendering. */
type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };

function registry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return css?.highlights ?? null;
}

export function findRanges(root: HTMLElement, query: string, matchCase: boolean): Range[] {
  if (!query) return [];
  const needle = matchCase ? query : query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = matchCase ? (node.nodeValue ?? '') : (node.nodeValue ?? '').toLowerCase();
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + needle.length);
      ranges.push(r);
    }
  }
  return ranges;
}

export function paintHighlights(all: Range[], current: Range | null): void {
  const reg = registry();
  const Highlight = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !Highlight) return;
  if (all.length) reg.set('uu-find', new Highlight(...all));
  else reg.delete('uu-find');
  if (current) reg.set('uu-find-current', new Highlight(current));
  else reg.delete('uu-find-current');
}

export function scrollToRange(range: Range): void {
  const el = range.startContainer.parentElement;
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
