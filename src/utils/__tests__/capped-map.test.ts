import { describe, expect, it } from 'vitest';
import { setCapped } from '../capped-map.js';

describe('setCapped', () => {
  it('keeps at most max keys, dropping the oldest by insertion order', () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 3; i++) expect(setCapped(map, `k${i}`, i, 3)).toBe(0);
    expect(setCapped(map, 'k3', 3, 3)).toBe(1);
    expect([...map.keys()]).toEqual(['k1', 'k2', 'k3']);
  });

  it('counts a re-set key as the newest, with its new value', () => {
    const map = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(setCapped(map, 'a', 10, 3)).toBe(0); // no growth, nothing dropped
    expect(setCapped(map, 'd', 4, 3)).toBe(1);
    expect([...map.entries()]).toEqual([
      ['c', 3],
      ['a', 10],
      ['d', 4],
    ]);
  });

  it('drops every key past the cap when the map was already over it', () => {
    const map = new Map<string, number>(Array.from({ length: 5 }, (_, i) => [`k${i}`, i]));
    expect(setCapped(map, 'new', 5, 2)).toBe(4);
    expect([...map.keys()]).toEqual(['k4', 'new']);
  });
});
