import { describe, expect, it } from 'vitest';
import { findChunkCycles } from '../../../vite-plugins/no-chunk-cycles';

const graph = (edges: Record<string, string[]>) => new Map(Object.entries(edges));

describe('findChunkCycles', () => {
  it('accepts a layered graph', () => {
    expect(
      findChunkCycles(
        graph({
          index: ['core-3', 'vendor'],
          'core-3': ['core-2', 'core-1'],
          'core-2': ['core-1'],
          'core-1': [],
          vendor: [],
        })
      )
    ).toEqual([]);
  });

  it('reports a two-chunk cycle', () => {
    expect(findChunkCycles(graph({ a: ['b'], b: ['a'] }))).toEqual([['a', 'b', 'a']]);
  });

  it('reports a longer cycle through a shared chunk', () => {
    const cycles = findChunkCycles(
      graph({ index: ['ui-a'], 'ui-a': ['ui-b'], 'ui-b': ['services'], services: ['ui-a'] })
    );
    expect(cycles).toEqual([['ui-a', 'ui-b', 'services', 'ui-a']]);
  });
});
