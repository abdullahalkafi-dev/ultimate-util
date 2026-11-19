/** Converts DOCX bytes to clean semantic HTML (images inlined as data URIs, nothing fetched). */
export async function docxToHtml(bytes: Uint8Array): Promise<{ html: string; warnings: string[] }> {
  const mammoth = await import('mammoth');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      styleMap: ['u => u', "p[style-name='Title'] => h1.title:fresh", "p[style-name='Subtitle'] => p.subtitle:fresh"],
    },
  );
  return { html: result.value, warnings: result.messages.map((m) => m.message) };
}
