import type { CategoryId, CategoryMeta } from './types';

export const categories: CategoryMeta[] = [
  { id: 'documents', name: 'Documents', color: 'var(--c-docs)' },
  { id: 'media', name: 'Image & media', color: 'var(--c-media)' },
  { id: 'design', name: 'Design', color: 'var(--c-design)' },
  { id: 'developer', name: 'Developer', color: 'var(--c-dev)' },
  { id: 'everyday', name: 'Everyday', color: 'var(--c-daily)' },
  { id: 'cloud', name: 'Cloud-synced', color: 'var(--c-cloud)' },
];

export const getCategory = (id: CategoryId): CategoryMeta => {
  const found = categories.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category ${id}`);
  return found;
};
