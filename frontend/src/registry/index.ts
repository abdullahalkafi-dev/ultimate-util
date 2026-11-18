import { cloudTools } from './meta/cloud';
import { designTools } from './meta/design';
import { developerTools } from './meta/developer';
import { documentsTools } from './meta/documents';
import { everydayTools } from './meta/everyday';
import { mediaTools } from './meta/media';
import type { CategoryId, ToolMeta } from './types';

export * from './types';
export { categories, getCategory } from './categories';

const all: ToolMeta[] = [
  ...documentsTools,
  ...mediaTools,
  ...designTools,
  ...developerTools,
  ...everydayTools,
  ...cloudTools,
];

/** Fails loudly in development if two tools collide or a field is unusable. */
export function validateRegistry(tools: ToolMeta[] = all): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const t of tools) {
    if (ids.has(t.id)) problems.push(`Duplicate id ${t.id}`);
    if (slugs.has(t.slug)) problems.push(`Duplicate slug ${t.slug}`);
    ids.add(t.id);
    slugs.add(t.slug);
    if (t.description.length > 90) problems.push(`${t.id}: description is over 90 characters`);
    if (t.tier === 'client' && t.guestAccess) problems.push(`${t.id}: guestAccess is for cloud tools only`);
    if (t.tier === 'cloud' && !t.guestAccess) problems.push(`${t.id}: cloud tools need guestAccess`);
  }
  const featured = tools.filter((t) => t.featuredRank !== undefined && t.status !== 'hidden');
  if (featured.length > 1) problems.push('Only one tool may have a featuredRank');
  return problems;
}

/** Tools visible anywhere in the UI (live and coming soon). */
export const visibleTools: ToolMeta[] = all.filter((t) => t.status !== 'hidden');
export const liveTools: ToolMeta[] = all.filter((t) => t.status === 'live');

export const getToolBySlug = (slug: string): ToolMeta | undefined => all.find((t) => t.slug === slug);
export const getToolById = (id: string): ToolMeta | undefined => all.find((t) => t.id === id);
export const toolsInCategory = (id: CategoryId): ToolMeta[] => visibleTools.filter((t) => t.category === id);

/** Counts shown on the home page. Derived, never hardcoded. */
export function registryStats(tools: ToolMeta[] = liveTools) {
  const synced = tools.filter((t) => t.tier === 'cloud').length;
  return { total: tools.length, local: tools.length - synced, synced };
}

export const featuredTool = (): ToolMeta | undefined =>
  visibleTools
    .filter((t) => t.featuredRank !== undefined)
    .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))[0];
