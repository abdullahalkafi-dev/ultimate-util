import { checkDocxBytes, DOCX_SOFT_LIMIT } from '../_shared-docs/docxFile';
import { detectFidelityIssues, readFidelityParts, type FidelityIssue } from '../_shared-docs/fidelity';
import { docxToHtml } from '../_shared-docs/docxToHtml';

export interface OpenedDocx {
  name: string;
  bytes: Uint8Array;
  issues: FidelityIssue[];
  large: boolean;
}

export class OpenError extends Error {}

/** Validates (magic bytes, zip limits) and inspects a file without modifying it. */
export async function openDocx(file: File): Promise<OpenedDocx> {
  if (file.size === 0) throw new OpenError('This file is empty.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkDocxBytes(bytes, file.name);
  if (!check.ok) throw new OpenError(check.message);
  let issues: FidelityIssue[] = [];
  try {
    issues = detectFidelityIssues(await readFidelityParts(bytes));
  } catch {
    throw new OpenError('The Word file is damaged and could not be read.');
  }
  return { name: file.name, bytes, issues, large: file.size > DOCX_SOFT_LIMIT };
}

/** Mammoth HTML for the editor. External image references are never fetched. */
export async function docxToEditorHtml(bytes: Uint8Array): Promise<{ html: string; warnings: string[] }> {
  const { html, warnings } = await docxToHtml(bytes);
  const DOMPurify = (await import('dompurify')).default;
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['target'], ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp);)/i });
  return { html: clean, warnings };
}
