import { describe, expect, it } from 'vitest';
import { searchTools } from '@/lib/search';
import { featuredTool, getToolBySlug, liveTools, registryStats, validateRegistry, visibleTools } from './index';

describe('registry', () => {
  it('has no problems', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('lists all 33 tools with 27 client and 6 cloud', () => {
    expect(visibleTools).toHaveLength(33);
    expect(visibleTools.filter((t) => t.tier === 'cloud')).toHaveLength(6);
  });

  it('derives stats from live tools only', () => {
    const stats = registryStats();
    expect(stats.total).toBe(liveTools.length);
    expect(stats.local + stats.synced).toBe(stats.total);
  });

  it('finds tools by slug and features the DOCX editor', () => {
    expect(getToolBySlug('jwt-decoder')?.id).toBe('F-019');
    expect(featuredTool()?.slug).toBe('docx-editor');
  });
});

describe('searchTools', () => {
  it('ranks name matches first', () => {
    expect(searchTools(visibleTools, 'jwt')[0]?.slug).toBe('jwt-decoder');
  });
  it('matches keywords', () => {
    expect(searchTools(visibleTools, 'tinypng')[0]?.slug).toBe('image-compressor');
  });
  it('needs every word to match', () => {
    expect(searchTools(visibleTools, 'pdf banana')).toEqual([]);
  });
  it('returns nothing for an empty query', () => {
    expect(searchTools(visibleTools, '  ')).toEqual([]);
  });
});
