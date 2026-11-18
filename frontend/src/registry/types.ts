import type { IconName } from '@/components/ui/icons';

export type CategoryId = 'documents' | 'media' | 'design' | 'developer' | 'everyday' | 'cloud';

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  /** CSS variable holding the category color. */
  color: string;
}

/**
 * One entry per tool. The home grid, command palette, badges, counts and the
 * /tools/[slug] route all read from this. See docs/features/_shared/conventions.md.
 */
export interface ToolMeta {
  /** Matches the spec ID, e.g. F-001. */
  id: string;
  slug: string;
  name: string;
  category: CategoryId;
  tier: 'client' | 'cloud';
  icon: IconName;
  keywords: string[];
  /** One line, under 90 characters. */
  description: string;
  isNew?: boolean;
  /** live = usable, soon = listed but not clickable, hidden = not shown anywhere. */
  status: 'live' | 'soon' | 'hidden';
  /** Lowest rank is shown as the wide featured card (at most one tool). */
  featuredRank?: number;
  /** Client tool that can optionally save presets to the account. Still counts as Local. */
  sync?: 'optional';
  /** Cloud tools only. gate = sign-in wall for guests, local = usable as a guest with local data. */
  guestAccess?: 'gate' | 'local';
  /** Needs the vault passphrase (class A data). */
  vault?: boolean;
  /** Network requests that only happen after an explicit user click. */
  optInNetwork?: string[];
}
