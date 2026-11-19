import { describe, expect, it } from 'vitest';
import { commit, duplicate, insertBlank, moveBefore, moveBy, redo, remove, rotate, startHistory, undo, type PageItem } from './arrange';

const mk = (uid: string): PageItem => ({ uid, fileId: 'f', index: 0, rotation: 0, width: 100, height: 200 });
const uids = (l: { uid: string }[]) => l.map((p) => p.uid).join('');
const list = ['a', 'b', 'c', 'd', 'e'].map(mk);

describe('arrange', () => {
  it('moves a group before a target, or to the end', () => {
    expect(uids(moveBefore(list, new Set(['d', 'e']), 'b'))).toBe('adebc');
    expect(uids(moveBefore(list, new Set(['a']), null))).toBe('bcdea');
    expect(uids(moveBefore(list, new Set(['a']), 'zzz'))).toBe('abcde');
  });

  it('moves selection by one step without crossing other selected items', () => {
    expect(uids(moveBy(list, new Set(['c']), -1))).toBe('acbde');
    expect(uids(moveBy(list, new Set(['a']), -1))).toBe('abcde');
    expect(uids(moveBy(list, new Set(['d', 'e']), 1))).toBe('abcde');
    expect(uids(moveBy(list, new Set(['b', 'c']), 1))).toBe('adbce');
  });

  it('rotates with wraparound', () => {
    const r = rotate(list, new Set(['a']), -90);
    expect(r[0]?.rotation).toBe(270);
    expect(rotate(r, new Set(['a']), 90)[0]?.rotation).toBe(0);
  });

  it('deletes and duplicates', () => {
    expect(uids(remove(list, new Set(['b', 'd'])))).toBe('ace');
    const d = duplicate(list, new Set(['b']));
    expect(d).toHaveLength(6);
    expect(d[1]?.uid).toBe('b');
    expect(d[2]?.uid).not.toBe('b');
    expect(d[2]?.index).toBe(d[1]?.index);
  });

  it('inserts a blank page sized like its predecessor', () => {
    const l = [{ ...mk('a'), width: 300, height: 400 }, mk('b')];
    const out = insertBlank(l, 'a');
    expect(out[1]?.fileId).toBeNull();
    expect(out[1]?.width).toBe(300);
    expect(insertBlank([], null)[0]?.height).toBe(842);
  });

  it('undo and redo', () => {
    let h = startHistory(list);
    h = commit(h, remove(list, new Set(['a'])));
    expect(h.present).toHaveLength(4);
    h = undo(h);
    expect(h.present).toHaveLength(5);
    h = redo(h);
    expect(h.present).toHaveLength(4);
    expect(commit(h, h.present)).toBe(h);
  });
});
