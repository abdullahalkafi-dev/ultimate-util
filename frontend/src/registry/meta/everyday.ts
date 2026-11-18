import type { ToolMeta } from '../types';

export const everydayTools: ToolMeta[] = [
  {
    id: 'F-024', slug: 'qr-barcode', name: 'QR & Barcode', category: 'everyday', tier: 'client',
    icon: 'qr', status: 'soon', keywords: ['qr', 'barcode', 'scan', 'wifi', 'vcard', 'generate'],
    description: 'Make Wi-Fi, vCard and URL codes. Scan from webcam.',
  },
  {
    id: 'F-025', slug: 'unit-timezone-converter', name: 'Unit & Timezone Converter', category: 'everyday', tier: 'client',
    icon: 'ruler', status: 'soon', keywords: ['unit', 'convert', 'timezone', 'time', 'length', 'weight', 'data', 'temperature'],
    description: 'Length, weight, data size and world clocks.',
  },
  {
    id: 'F-026', slug: 'password-generator', name: 'Password Generator', category: 'everyday', tier: 'client',
    icon: 'lock', status: 'soon', keywords: ['password', 'passphrase', 'diceware', 'random', 'secure', 'entropy'],
    description: 'Random passwords and passphrases with strength meter.',
  },
  {
    id: 'F-027', slug: 'word-counter', name: 'Word & Reading Counter', category: 'everyday', tier: 'client',
    icon: 'count', status: 'live', keywords: ['word', 'count', 'characters', 'reading time', 'keyword', 'text'],
    description: 'Counts, keyword density and reading time.',
  },
];
