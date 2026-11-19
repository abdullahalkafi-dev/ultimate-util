export interface FidelityIssue {
  id: string;
  label: string;
}

const CHECKS: { id: string; label: string; part: RegExp; marker: RegExp }[] = [
  { id: 'textbox', label: 'Text boxes or shapes (their text may be lost in the editor)', part: /^word\/document\.xml$/, marker: /<w:txbxContent|<wps:wsp/ },
  { id: 'tracked', label: 'Tracked changes (the editor keeps the final text only)', part: /^word\/document\.xml$/, marker: /<w:ins\s|<w:del\s/ },
  { id: 'equation', label: 'Equations', part: /^word\/document\.xml$/, marker: /<m:oMath/ },
  { id: 'fields', label: 'Complex fields (tables of contents, cross references)', part: /^word\/document\.xml$/, marker: /<w:fldChar|<w:instrText/ },
  { id: 'smartart', label: 'SmartArt or charts', part: /^word\/document\.xml$/, marker: /drawingml\/2006\/chart|drawingml\/2006\/diagram/ },
  { id: 'comments', label: 'Comments (shown in the viewer, not carried into the editor)', part: /^word\/comments\.xml$/, marker: /<w:comment\s/ },
  { id: 'headers', label: 'Headers and footers (not editable, dropped on export)', part: /^word\/(header|footer)\d*\.xml$/, marker: /<w:t[\s>]/ },
  { id: 'macros', label: 'Macros (never run, removed)', part: /^word\/vbaProject\.bin$/, marker: /^/ },
];

/** `parts` maps part names to their XML text (binary parts may be empty strings). */
export function detectFidelityIssues(parts: Record<string, string>): FidelityIssue[] {
  return CHECKS.filter((c) => Object.entries(parts).some(([name, text]) => c.part.test(name) && c.marker.test(text))).map(({ id, label }) => ({ id, label }));
}

const XML_PARTS = /^word\/(document|comments|header\d*|footer\d*)\.xml$/;

/** Reads only the parts needed for the check (document-sized XML, bounded by the zip scan). */
export async function readFidelityParts(bytes: Uint8Array): Promise<Record<string, string>> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes, { filter: (f) => XML_PARTS.test(f.name) || f.name === 'word/vbaProject.bin' ? f.originalSize < 100 * 1024 * 1024 : false });
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(files)) out[name] = name.endsWith('.bin') ? '' : strFromU8(data);
  return out;
}
