import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/** Insert with editor.chain().focus().insertContent({ type: 'pageBreak' }). */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }],
  renderHTML: () => ['div', { 'data-page-break': '', 'aria-label': 'Page break', style: 'page-break-after: always' }],
});

export function createExtensions() {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ allowBase64: true, inline: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    PageBreak,
    Placeholder.configure({ placeholder: 'Start writing…' }),
  ];
}
