import type { ToolMeta } from '../types';

export const documentsTools: ToolMeta[] = [
  {
    id: 'F-001', slug: 'docx-editor', name: 'DOCX Viewer & Editor', category: 'documents', tier: 'client',
    icon: 'doc', isNew: true, featuredRank: 1, status: 'live',
    keywords: ['word', 'docx', 'pdf', 'editor', 'resume', 'document', 'viewer'],
    description: 'Open any Word file, edit with a live preview and export to PDF.',
  },
  {
    id: 'F-002', slug: 'pdf-docx-converter', name: 'PDF ⇄ DOCX Converter', category: 'documents', tier: 'client',
    icon: 'swap', status: 'live', keywords: ['pdf', 'word', 'docx', 'convert'],
    description: 'Convert between PDF and Word locally, no upload.',
  },
  {
    id: 'F-003', slug: 'pdf-merge-split-reorder', name: 'PDF Merge, Split & Reorder', category: 'documents', tier: 'client',
    icon: 'layers', status: 'live', keywords: ['pdf', 'merge', 'split', 'combine', 'pages', 'reorder', 'rotate'],
    description: 'Combine files, pull out pages, drag to reorder.',
  },
  {
    id: 'F-004', slug: 'pdf-compress-protect', name: 'PDF Compress & Protect', category: 'documents', tier: 'client',
    icon: 'shrink', status: 'live', keywords: ['pdf', 'compress', 'password', 'encrypt', 'unlock', 'size'],
    description: 'Shrink size for email, add or remove a password.',
  },
  {
    id: 'F-005', slug: 'ocr', name: 'OCR: Image or PDF to Text', category: 'documents', tier: 'client',
    icon: 'scan', status: 'live', keywords: ['ocr', 'text', 'scan', 'image', 'tesseract', 'extract'],
    description: 'Pull selectable text out of scans and screenshots.',
  },
];
