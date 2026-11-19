import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const cloudLoaders: ToolLoaders = {
  'totp-authenticator': () => import('../totp-authenticator'),
  'secure-notes': () => import('../secure-notes'),
  'snippet-prompt-manager': () => import('../snippet-prompt-manager'),
  'saved-palettes-presets': () => import('../saved-palettes-presets'),
  'clipboard-drop': () => import('../clipboard-drop'),
  'pomodoro-habit-tracker': () => import('../pomodoro-habit-tracker'),
};
