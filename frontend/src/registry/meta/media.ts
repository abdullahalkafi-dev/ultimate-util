import type { ToolMeta } from '../types';

export const mediaTools: ToolMeta[] = [
  {
    id: 'F-006', slug: 'image-compressor', name: 'Image Compressor', category: 'media', tier: 'client',
    icon: 'shrink', status: 'soon', keywords: ['image', 'compress', 'png', 'jpg', 'webp', 'avif', 'tinypng', 'optimize'],
    description: 'Cut PNG, JPG and WebP size by up to 80%.',
  },
  {
    id: 'F-007', slug: 'bulk-resizer-converter', name: 'Bulk Resizer & Converter', category: 'media', tier: 'client',
    icon: 'resize', status: 'soon', keywords: ['image', 'resize', 'convert', 'batch', 'webp', 'avif', 'heic', 'svg'],
    description: 'Batch resize and convert AVIF, WebP, PNG, JPG, SVG.',
  },
  {
    id: 'F-008', slug: 'image-editor', name: 'Image Editor', category: 'media', tier: 'client',
    icon: 'edit', status: 'soon', keywords: ['image', 'edit', 'crop', 'rotate', 'filter', 'layers', 'annotate', 'blur'],
    description: 'Crop, filters, layers, curves, annotations and blur.',
  },
  {
    id: 'F-009', slug: 'background-remover', name: 'Background Remover', category: 'media', tier: 'client',
    icon: 'wand', status: 'soon', keywords: ['background', 'remove', 'cutout', 'transparent', 'ai', 'portrait'],
    description: 'Cut out subjects with an on-device AI model.',
  },
  {
    id: 'F-010', slug: 'exif-tool', name: 'EXIF Viewer & Stripper', category: 'media', tier: 'client',
    icon: 'tag', status: 'soon', keywords: ['exif', 'metadata', 'gps', 'privacy', 'photo', 'strip'],
    description: 'See camera and GPS data, wipe it before sharing.',
    optInNetwork: ['Map tiles (Show on map)'],
  },
  {
    id: 'F-011', slug: 'video-gif-maker', name: 'Video Trimmer & GIF Maker', category: 'media', tier: 'client',
    icon: 'video', status: 'soon', keywords: ['video', 'gif', 'trim', 'audio', 'mp4', 'ffmpeg', 'convert'],
    description: 'Trim clips, strip audio, turn MP4 into GIF.',
  },
];
