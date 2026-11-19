import type { ToolMeta } from '../types';

export const cloudTools: ToolMeta[] = [
  {
    id: 'F-028', slug: 'totp-authenticator', name: '2FA Authenticator', category: 'cloud', tier: 'cloud',
    icon: 'shield', status: 'live', guestAccess: 'gate', vault: true,
    keywords: ['2fa', 'totp', 'authenticator', 'otp', 'codes', 'two factor'],
    description: 'Rotating 6-digit codes, encrypted and backed up.',
  },
  {
    id: 'F-029', slug: 'secure-notes', name: 'Secure Notes', category: 'cloud', tier: 'cloud',
    icon: 'note', status: 'live', guestAccess: 'gate', vault: true,
    keywords: ['notes', 'scratchpad', 'encrypted', 'secrets', 'api keys', 'markdown'],
    description: 'Encrypted notes and API keys on every device.',
  },
  {
    id: 'F-030', slug: 'snippet-prompt-manager', name: 'Snippet & Prompt Manager', category: 'cloud', tier: 'cloud',
    icon: 'code', status: 'live', guestAccess: 'gate',
    keywords: ['snippet', 'prompt', 'code', 'command', 'library', 'tags'],
    description: 'Code, commands and AI prompts, tagged and searchable.',
  },
  {
    id: 'F-031', slug: 'saved-palettes-presets', name: 'Saved Palettes & Presets', category: 'cloud', tier: 'cloud',
    icon: 'palette', status: 'live', guestAccess: 'local',
    keywords: ['palette', 'colors', 'gradient', 'softbox', 'presets', 'brand'],
    description: 'Brand colors and favorite softbox lights, anywhere.',
  },
  {
    id: 'F-032', slug: 'clipboard-drop', name: 'Clipboard & Cross-Device Drop', category: 'cloud', tier: 'cloud',
    icon: 'clip', status: 'live', guestAccess: 'gate',
    keywords: ['clipboard', 'drop', 'send', 'phone', 'transfer', 'share'],
    description: 'Send text, links and small files phone to PC.',
  },
  {
    id: 'F-033', slug: 'pomodoro-habit-tracker', name: 'Pomodoro & Habit Tracker', category: 'cloud', tier: 'cloud',
    icon: 'timer', status: 'live', guestAccess: 'gate',
    keywords: ['pomodoro', 'focus', 'timer', 'habit', 'streak', 'productivity'],
    description: 'Focus sessions and streaks tracked over months.',
  },
];
