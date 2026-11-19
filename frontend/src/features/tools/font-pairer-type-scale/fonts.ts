export type Category = 'serif' | 'sans' | 'mono' | 'display' | 'handwriting';

export interface FontChoice {
  /** Family name as it appears in CSS and on Google Fonts, or the label of a system stack. */
  name: string;
  category: Category;
  /** Weights offered by the family (static). */
  weights: number[];
  /** True for built-in system stacks: nothing to load or install. */
  system?: boolean;
  /** Full CSS stack for system choices. */
  stack?: string;
}

const W4 = [400, 700];
const W5 = [400, 500, 600, 700];
const W7 = [300, 400, 500, 600, 700, 800];
const W9 = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Modern system font stacks: always available, nothing to load. */
export const SYSTEM_FONTS: FontChoice[] = [
  { name: 'System UI', category: 'sans', weights: W7, system: true, stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
  { name: 'Transitional serif', category: 'serif', weights: W4, system: true, stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif" },
  { name: 'Old-style serif', category: 'serif', weights: W4, system: true, stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif" },
  { name: 'Humanist sans', category: 'sans', weights: W5, system: true, stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif" },
  { name: 'Geometric humanist', category: 'sans', weights: W5, system: true, stack: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif" },
  { name: 'Rounded sans', category: 'sans', weights: W5, system: true, stack: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif" },
  { name: 'Monospace code', category: 'mono', weights: W4, system: true, stack: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace" },
];

/** Google Fonts families used by the curated pairs (metadata only; no font files are loaded). */
const g = (name: string, category: Category, weights: number[]): FontChoice => ({ name, category, weights });

export const GOOGLE_FONTS: FontChoice[] = [
  g('Playfair Display', 'serif', [400, 500, 600, 700, 800, 900]),
  g('Merriweather', 'serif', [300, 400, 700, 900]),
  g('Lora', 'serif', W5),
  g('Source Serif 4', 'serif', W7),
  g('Libre Baskerville', 'serif', W4),
  g('Cormorant Garamond', 'serif', [300, 400, 500, 600, 700]),
  g('EB Garamond', 'serif', [400, 500, 600, 700, 800]),
  g('Crimson Pro', 'serif', W7),
  g('DM Serif Display', 'serif', [400]),
  g('Noto Serif', 'serif', W9),
  g('Inter', 'sans', W9),
  g('Roboto', 'sans', [100, 300, 400, 500, 700, 900]),
  g('Open Sans', 'sans', [300, 400, 500, 600, 700, 800]),
  g('Lato', 'sans', [100, 300, 400, 700, 900]),
  g('Source Sans 3', 'sans', W7),
  g('Montserrat', 'sans', W9),
  g('Poppins', 'sans', W9),
  g('Nunito', 'sans', W7),
  g('Work Sans', 'sans', W9),
  g('DM Sans', 'sans', W9),
  g('Manrope', 'sans', W7),
  g('IBM Plex Sans', 'sans', [100, 200, 300, 400, 500, 600, 700]),
  g('Karla', 'sans', W7),
  g('Raleway', 'sans', W9),
  g('Rubik', 'sans', W7),
  g('Space Grotesk', 'sans', [300, 400, 500, 600, 700]),
  g('Oswald', 'sans', [200, 300, 400, 500, 600, 700]),
  g('Bebas Neue', 'display', [400]),
  g('Archivo Black', 'display', [400]),
  g('Abril Fatface', 'display', [400]),
  g('Fraunces', 'serif', W9),
  g('Noto Sans', 'sans', W9),
  g('Noto Naskh Arabic', 'serif', [400, 500, 600, 700]),
  g('Noto Sans Bengali', 'sans', W9),
  g('Noto Sans Devanagari', 'sans', W9),
  g('Noto Sans JP', 'sans', [100, 300, 400, 500, 700, 900]),
  g('JetBrains Mono', 'mono', [100, 200, 300, 400, 500, 600, 700, 800]),
  g('IBM Plex Mono', 'mono', [100, 200, 300, 400, 500, 600, 700]),
  g('Space Mono', 'mono', W4),
  g('Caveat', 'handwriting', W4),
];

export const ALL_FONTS: FontChoice[] = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

const GENERIC: Record<Category, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  mono: "ui-monospace, Menlo, Consolas, monospace",
  display: "Impact, 'Arial Black', system-ui, sans-serif",
  handwriting: "'Segoe Script', 'Bradley Hand', cursive",
};

export const genericFor = (c: Category) => GENERIC[c];

const quote = (name: string) => (/^[A-Za-z0-9_-]+$/.test(name) ? name : `'${name.replace(/'/g, "\\'")}'`);

/** CSS font-family value: system stacks as defined, others as "Family", generic fallback. */
export function fontStack(f: Pick<FontChoice, 'name' | 'category' | 'system' | 'stack'>): string {
  if (f.system && f.stack) return f.stack;
  return `${quote(f.name)}, ${GENERIC[f.category]}`;
}

export function findFont(name: string): FontChoice | undefined {
  return ALL_FONTS.find((f) => f.name === name);
}

/** A font the user typed that is not in the list; treated as a sans family with all common weights. */
export function customFont(name: string): FontChoice {
  return { name: name.trim().slice(0, 60), category: 'sans', weights: [400, 700] };
}

export interface Pairing {
  heading: string;
  headingWeight: number;
  body: string;
  bodyWeight: number;
  reason: string;
}

const p = (heading: string, headingWeight: number, body: string, bodyWeight: number, reason: string): Pairing => ({ heading, headingWeight, body, bodyWeight, reason });

/** Hand-picked pairs; each has a one-line reason. */
export const PAIRINGS: Pairing[] = [
  p('Playfair Display', 700, 'Source Sans 3', 400, 'High-contrast serif heading over a calm humanist sans'),
  p('Merriweather', 700, 'Open Sans', 400, 'Sturdy serif plus neutral sans, readable on screens'),
  p('Montserrat', 700, 'Merriweather', 400, 'Geometric heading, warm serif body'),
  p('Lora', 600, 'Inter', 400, 'Calligraphic serif with a precise UI sans'),
  p('Poppins', 600, 'Lato', 400, 'Friendly geometric heading, humanist body'),
  p('Raleway', 700, 'Roboto', 400, 'Elegant thin-stroke heading, workhorse body'),
  p('Oswald', 500, 'Lato', 400, 'Condensed headline, open and wide body'),
  p('DM Serif Display', 400, 'DM Sans', 400, 'One designer family: serif display, sans text'),
  p('Space Grotesk', 700, 'Inter', 400, 'Quirky grotesque heading, neutral body'),
  p('Fraunces', 700, 'Work Sans', 400, 'Soft old-style serif, plain geometric sans'),
  p('Cormorant Garamond', 600, 'Montserrat', 400, 'Fashion-style display serif, modern sans'),
  p('Abril Fatface', 400, 'Poppins', 400, 'Poster-weight headline, simple body'),
  p('Bebas Neue', 400, 'Open Sans', 400, 'All-caps display, friendly sans'),
  p('Archivo Black', 400, 'Karla', 400, 'Heavy headline, quirky grotesque body'),
  p('Libre Baskerville', 700, 'Source Sans 3', 400, 'Classic book serif, tidy sans'),
  p('EB Garamond', 600, 'Inter', 400, 'Renaissance serif, contemporary UI sans'),
  p('Crimson Pro', 700, 'Work Sans', 400, 'Literary serif, workmanlike sans'),
  p('Source Serif 4', 700, 'Source Sans 3', 400, 'Matched serif and sans from one design team'),
  p('IBM Plex Sans', 600, 'IBM Plex Mono', 400, 'Technical sans with its monospace sibling'),
  p('JetBrains Mono', 700, 'Inter', 400, 'Developer-flavored heading, neutral reading text'),
  p('Space Mono', 700, 'Space Grotesk', 400, 'Retro-tech mono heading, grotesque body'),
  p('Manrope', 700, 'Inter', 400, 'Modern geometric pair for apps and dashboards'),
  p('Rubik', 600, 'Karla', 400, 'Rounded corners heading, relaxed body'),
  p('Nunito', 800, 'Lora', 400, 'Rounded friendly heading, bookish body'),
  p('Playfair Display', 800, 'Lato', 400, 'Editorial heading, soft and readable body'),
  p('Merriweather', 900, 'Source Sans 3', 400, 'Black-weight serif, light sans: strong weight contrast'),
  p('Caveat', 700, 'Nunito', 400, 'Handwritten accent over rounded sans'),
  p('Noto Serif', 700, 'Noto Sans', 400, 'Same family, serif and sans, broad script support'),
  p('Inter', 800, 'Inter', 400, 'Single family: weight contrast only'),
  p('Roboto', 700, 'Roboto', 400, 'Single family: familiar and neutral'),
  p('Noto Naskh Arabic', 700, 'Noto Sans', 400, 'Arabic heading with a Latin body companion'),
  p('Noto Sans Bengali', 700, 'Noto Sans', 400, 'Bengali heading with a Latin body companion'),
  p('Noto Sans Devanagari', 700, 'Noto Sans', 400, 'Devanagari heading with a Latin body companion'),
  p('Noto Sans JP', 700, 'Inter', 400, 'Japanese heading with a Latin body'),
  p('System UI', 700, 'Transitional serif', 400, 'No font loading at all: system sans with a book serif'),
  p('Geometric humanist', 700, 'Humanist sans', 400, 'System-only pair with a friendly feel'),
];

export const PAIRING_SCRIPTS: Record<string, string> = {
  'Noto Naskh Arabic': 'arabic',
  'Noto Sans Bengali': 'bengali',
  'Noto Sans Devanagari': 'devanagari',
  'Noto Sans JP': 'japanese',
};

export interface SampleText {
  id: string;
  label: string;
  dir: 'ltr' | 'rtl';
  heading: string;
  body: string;
}

export const SAMPLES: SampleText[] = [
  { id: 'en', label: 'English', dir: 'ltr', heading: 'Typography is the voice of text', body: 'Good type disappears into the reading. Pair a distinctive heading with a calm body face, keep lines between 45 and 75 characters, and give paragraphs room to breathe.' },
  { id: 'de', label: 'German', dir: 'ltr', heading: 'Schrift gibt Texten eine Stimme', body: 'Gute Typografie tritt hinter den Inhalt zurück. Kombiniere eine auffällige Überschrift mit einer ruhigen Textschrift und halte die Zeilenlänge zwischen 45 und 75 Zeichen.' },
  { id: 'ar', label: 'Arabic', dir: 'rtl', heading: 'الخط هو صوت النص', body: 'الخط الجيد يختفي داخل القراءة. اختر عنوانًا مميزًا مع خط متن هادئ، وحافظ على طول السطر بين ٤٥ و٧٥ حرفًا.' },
  { id: 'bn', label: 'Bengali', dir: 'ltr', heading: 'অক্ষরই লেখার কণ্ঠস্বর', body: 'ভালো টাইপোগ্রাফি পাঠের মধ্যে মিশে যায়। একটি স্বতন্ত্র শিরোনামের সঙ্গে শান্ত মূল লেখার ফন্ট বেছে নিন।' },
  { id: 'hi', label: 'Hindi', dir: 'ltr', heading: 'टाइपोग्राफी पाठ की आवाज़ है', body: 'अच्छी टाइपोग्राफी पढ़ने में घुल जाती है। एक खास शीर्षक के साथ शांत मुख्य पाठ वाला फ़ॉन्ट चुनें।' },
  { id: 'ja', label: 'Japanese', dir: 'ltr', heading: '文字は文章の声です', body: '良いタイポグラフィは読みやすさの中に溶け込みます。印象的な見出しと落ち着いた本文書体を組み合わせましょう。' },
];

export function isRtl(text: string): boolean {
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(text);
}
