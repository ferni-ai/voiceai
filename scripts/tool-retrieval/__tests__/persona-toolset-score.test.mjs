import { describe, expect, it } from 'vitest';
import { split } from '../persona-toolset-score.mjs';

const row = (query, label, labelSent, extra = {}) => ({
  query,
  label,
  labelSent,
  seed: 1,
  ...extra,
});

describe('split', () => {
  const baseline = [
    row('play jazz', 'playMusic', true),
    row('log my run', 'logExercise', true),
    row('show my git diff', 'gitDiff', false), // label no longer registered
  ];

  it('in set: the set holds the label; out of set: registered, not offered; the rest unscored', () => {
    const rows = [
      row('play jazz', 'playMusic', true, { final: 'playMusic' }),
      row('log my run', 'logExercise', false, { final: 'handoffToMaya' }),
      row('show my git diff', 'gitDiff', false, { final: null }),
      row('how are you?', null, false, { final: null }),
      row('play jazz', 'playMusic', true, { error: 'Vertex 400' }),
    ];
    const { inSet, outOfSet } = split(rows, baseline);
    expect(inSet.map((r) => r.query)).toEqual(['play jazz']);
    expect(outOfSet.map((r) => r.query)).toEqual(['log my run']);
  });
});
