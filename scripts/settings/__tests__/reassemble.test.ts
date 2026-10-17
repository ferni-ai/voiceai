import { describe, expect, it } from 'vitest';
import { diffSettings, latestSettings, secretLeaks } from '../reassemble.js';

const part = (p: number, parts: number, hash: string, body: Record<string, unknown>) =>
  `[2026-10-17T10:00:00.000Z] [worker] EFFECTIVE_SETTINGS ${JSON.stringify({
    part: p,
    parts,
    commit: 'abc1234',
    hash,
    ...body,
  })}`;

describe('latestSettings', () => {
  it('rejoins a complete set of parts in the order one boot logs them', () => {
    const log = [
      part(1, 2, 'h1', { flags: { ATTUNE: 'on' } }),
      part(2, 2, 'h1', { env: { PERSONA_ID: 'ferni' } }),
    ].join('\n');
    expect(latestSettings(log)).toEqual({
      commit: 'abc1234',
      hash: 'h1',
      flags: { ATTUNE: 'on' },
      env: { PERSONA_ID: 'ferni' },
    });
  });

  it('ignores a set with a missing part and a line cut off by the log pipeline', () => {
    const log = [
      part(1, 2, 'h1', { flags: { ATTUNE: 'on' } }),
      '[worker] EFFECTIVE_SETTINGS {"part":2,"parts":2,"env":{"PERS',
    ].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('does not mix parts from two boots that logged the same hash', () => {
    // Boot A logged both parts; boot B logged part 1, then was cut off before part 2.
    const log = [
      part(1, 2, 'same', { commit: 'A', flags: { ATTUNE: 'on' } }),
      part(2, 2, 'same', { commit: 'A', env: { K: '<set>' } }),
      part(1, 2, 'same', { commit: 'B', flags: { ATTUNE: 'on' } }),
    ].join('\n');
    expect(latestSettings(log)?.commit).toBe('A');
  });

  it('does not accept a set whose part numbers run past its part count', () => {
    const log = [part(1, 2, 'h1', { flags: {} }), part(3, 2, 'h1', { env: {} })].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('keeps a set apart when the part count differs', () => {
    const log = [
      part(1, 2, 'h1', { flags: { ATTUNE: 'on' } }),
      part(1, 3, 'h1', { flags: { ATTUNE: 'on' } }),
      part(2, 3, 'h1', { env: {} }),
    ].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('drops a run when an earlier boot was cut off, so A2 A3 then B1 is not a set', () => {
    const log = [
      part(2, 3, 'same', { env: { K: '<set>' } }),
      part(3, 3, 'same', { env: { K: '<set>' } }),
      part(1, 3, 'same', { commit: 'B', flags: { ATTUNE: 'on' } }),
    ].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('does not combine interleaved lines from two boots with the same hash', () => {
    const log = [
      part(1, 2, 'same', { commit: 'A', flags: { F1: 'A' } }),
      part(1, 2, 'same', { commit: 'B', flags: { F1: 'B' } }),
      part(2, 2, 'same', { commit: 'A', env: { K: 'a' } }),
      part(1, 2, 'same', { commit: 'B', flags: { F1: 'B' } }),
      part(2, 2, 'same', { commit: 'B', env: { K: 'b' } }),
    ].join('\n');
    expect(latestSettings(log)).toEqual({
      commit: 'B',
      hash: 'same',
      flags: { F1: 'B' },
      env: { K: 'b' },
    });
  });

  it('drops a set whose parts carry different commits', () => {
    const log = [
      part(1, 2, 'h1', { commit: 'A', flags: {} }),
      part(2, 2, 'h1', { commit: 'B', env: {} }),
    ].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('does not let a cut-off line hand a later part 2 to an earlier boot', () => {
    const log = [
      part(1, 2, 'h1', { commit: 'A', flags: { F1: 'A' } }),
      '[worker] EFFECTIVE_SETTINGS {"part":2,"parts":2,"commit":"A","hash":"h1","env":{"K":"a"',
      part(2, 2, 'h1', { commit: 'A', env: { K: 'b' } }),
    ].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('ends a run at a malformed part rather than continuing it', () => {
    const log = [
      part(1, 2, 'h1', { commit: 'A', flags: {} }),
      part(0, 2, 'h1', { commit: 'A', env: {} }),
      part(2, 2, 'h1', { commit: 'A', env: {} }),
    ].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('rejects a settings line whose values are not strings', () => {
    const log = [part(1, 1, 'h1', { flags: { ATTUNE: 1 } })].join('\n');
    expect(latestSettings(log)).toBeNull();
  });

  it('takes the most recent complete set when a worker restarted', () => {
    const log = [
      part(1, 1, 'old', { flags: { ATTUNE: 'off' } }),
      part(1, 1, 'new', { flags: { ATTUNE: 'on' } }),
    ].join('\n');
    expect(latestSettings(log)?.hash).toBe('new');
  });

  it('returns null when the log has no settings line', () => {
    expect(latestSettings('[worker] GCE Voice Worker starting')).toBeNull();
  });
});

describe('diffSettings', () => {
  const base = { commit: 'c', hash: 'h', flags: { ATTUNE: 'on' }, env: { PERSONA_ID: 'ferni' } };

  it('lists each name whose value differs, with a missing side shown as undefined', () => {
    const other = { ...base, flags: { ATTUNE: 'off' }, env: { PERSONA_ID: 'ferni', PORT: '8080' } };
    expect(diffSettings(base, other)).toEqual([
      ['ATTUNE', 'on', 'off'],
      ['PORT', undefined, '8080'],
    ]);
  });

  it('reports nothing for identical settings', () => {
    expect(diffSettings(base, { ...base })).toEqual([]);
  });
});

describe('secretLeaks', () => {
  const base = { commit: 'c', hash: 'h', flags: {}, env: {} };

  it('names a secret-classed name whose value is not a marker', () => {
    expect(secretLeaks({ ...base, env: { SPOTIFY_CLIENT_SECRET: 'sk_live_x' } })).toEqual([
      'SPOTIFY_CLIENT_SECRET',
    ]);
  });

  it('names a secret-classed name under flags too', () => {
    expect(secretLeaks({ ...base, flags: { SPOTIFY_CLIENT_SECRET: 'sk_live_x' } })).toEqual([
      'SPOTIFY_CLIENT_SECRET',
    ]);
  });

  it('passes markers and non-secret names', () => {
    expect(
      secretLeaks({ ...base, env: { SPOTIFY_CLIENT_SECRET: '<set>', PERSONA_ID: 'ferni' } })
    ).toEqual([]);
  });
});
