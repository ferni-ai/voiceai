import { describe, expect, it } from 'vitest';
import { diffSettings, latestSettings } from '../reassemble.js';

const part = (p: number, parts: number, hash: string, body: Record<string, unknown>) =>
  `[2026-10-17T10:00:00.000Z] [worker] EFFECTIVE_SETTINGS ${JSON.stringify({
    part: p,
    parts,
    commit: 'abc1234',
    hash,
    ...body,
  })}`;

describe('latestSettings', () => {
  it('rejoins a complete set of parts, whatever their order', () => {
    const log = [
      part(2, 2, 'h1', { env: { PERSONA_ID: 'ferni' } }),
      part(1, 2, 'h1', { flags: { ATTUNE: 'on' } }),
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
