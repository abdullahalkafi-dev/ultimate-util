import { describe, expect, it } from 'vitest';
import { analyze, countGraphemes, formatDuration, keywords } from './count';

describe('analyze', () => {
  it('counts an empty string as zero everywhere', () => {
    expect(analyze('')).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0, sentences: 0, paragraphs: 0, lines: 0 });
  });

  it('counts words, characters and sentences', () => {
    const s = analyze('Hello, world! This is a test.');
    expect(s.words).toBe(6);
    expect(s.sentences).toBe(2);
    expect(s.charactersNoSpaces).toBe(24);
  });

  it('counts paragraphs split by blank lines and lines', () => {
    const s = analyze('One.\n\nTwo.\r\n\r\nThree.');
    expect(s.paragraphs).toBe(3);
    expect(s.lines).toBe(5);
  });

  it('counts an emoji family as one character', () => {
    expect(countGraphemes('a👨‍👩‍👧b')).toBe(3);
  });

  it('counts languages without spaces', () => {
    expect(analyze('私は学生です').words).toBeGreaterThan(1);
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0, 238)).toBe('0 sec');
    expect(formatDuration(238, 238)).toBe('1 min');
    expect(formatDuration(357, 238)).toBe('1 min 30 sec');
    expect(formatDuration(10, 238)).toBe('3 sec');
  });
});

describe('keywords', () => {
  it('ranks repeated words and skips filler', () => {
    const k = keywords('The cat and the dog. Cat food, cat toys, dog toys.');
    expect(k[0]).toMatchObject({ word: 'cat', count: 3 });
    expect(k.map((x) => x.word)).not.toContain('the');
  });
});
