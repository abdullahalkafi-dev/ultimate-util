import type { ToolMeta } from '../types';

export const designTools: ToolMeta[] = [
  {
    id: 'F-012', slug: 'color-wheel-softbox', name: 'Color Wheel & Softbox Light', category: 'design', tier: 'client',
    icon: 'sun', status: 'soon', sync: 'optional',
    keywords: ['color', 'wheel', 'picker', 'softbox', 'light', 'fullscreen', 'hsl', 'oklch', 'face light'],
    description: 'Pick colors, or go fullscreen and use your screen as a soft face light.',
  },
  {
    id: 'F-013', slug: 'palette-contrast', name: 'Palette & Contrast Checker', category: 'design', tier: 'client',
    icon: 'palette', status: 'soon', sync: 'optional',
    keywords: ['palette', 'color', 'contrast', 'wcag', 'accessibility', 'harmony', 'scheme'],
    description: 'Harmonious schemes and WCAG AA/AAA checks.',
  },
  {
    id: 'F-014', slug: 'css-tailwind-generators', name: 'CSS & Tailwind Generators', category: 'design', tier: 'client',
    icon: 'css', status: 'soon', keywords: ['css', 'tailwind', 'grid', 'flexbox', 'shadow', 'gradient', 'glassmorphism'],
    description: 'Grid, flexbox, shadows, glass and mesh gradients.',
  },
  {
    id: 'F-015', slug: 'svg-optimizer-jsx', name: 'SVG Optimizer & JSX', category: 'design', tier: 'client',
    icon: 'svg', status: 'soon', keywords: ['svg', 'optimize', 'svgo', 'jsx', 'react', 'vue', 'figma'],
    description: 'Clean exported SVGs, convert to React or Vue.',
  },
  {
    id: 'F-016', slug: 'font-pairer-type-scale', name: 'Font Pairer & Type Scale', category: 'design', tier: 'client',
    icon: 'type', status: 'soon', keywords: ['font', 'type', 'typography', 'scale', 'pairing', 'rem'],
    description: 'Compare font pairs and build a modular type scale.',
    optInNetwork: ['Google Fonts CDN (only if the tool itself loads from Google)'],
  },
  {
    id: 'F-017', slug: 'placeholder-mockup-generator', name: 'Placeholder & Mockups', category: 'design', tier: 'client',
    icon: 'frame', status: 'soon', keywords: ['placeholder', 'mockup', 'device', 'fake data', 'dummy', 'image'],
    description: 'Dummy images, device frames and fake user data.',
  },
];
