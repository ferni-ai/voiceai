import { describe, expect, it } from 'vitest';

import { type CpuProfile, shortUrl, summarizeCpuProfile } from '../cpu-profile-summary.js';

const frame = (functionName: string, url = '', lineNumber = 0) => ({
  functionName,
  url,
  lineNumber,
});

// root -> wireHandlers (ours) -> stringify (pkg) ; root -> (idle) ; root -> (garbage collector)
const profile: CpuProfile = {
  startTime: 1_000_000,
  endTime: 1_010_000,
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 4, 5] },
    {
      id: 2,
      callFrame: frame('wireHandlers', 'file:///app/dist/agents/setup.js', 9),
      children: [3],
    },
    {
      id: 3,
      callFrame: frame('toJsonSchema', 'file:///app/node_modules/zod-to-json-schema/index.js', 0),
    },
    { id: 4, callFrame: frame('(idle)') },
    { id: 5, callFrame: frame('(garbage collector)') },
  ],
  // Each delta is 1 ms; a sample is charged the time to the next one.
  samples: [3, 3, 3, 4, 4, 5, 3, 4],
  timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
};

describe('summarizeCpuProfile', () => {
  it('charges package frames to the nearest frame of our own code', () => {
    const s = summarizeCpuProfile(profile);
    expect(s.ownerTop[0]).toEqual({ name: 'wireHandlers agents/setup.js:10', ms: 4 });
    expect(s.selfTop[0].name).toBe('toJsonSchema zod-to-json-schema/index.js:1');
    expect(s.gcMs).toBe(1);
    expect(s.idleMs).toBe(2);
    expect(s.busyMs).toBe(5);
  });

  it('ranks what ran inside a window on the profile clock', () => {
    // Samples 0..2 sit at 1_000_000..1_002_000.
    const s = summarizeCpuProfile(profile, [
      { label: 'stall', startUs: 1_000_000, endUs: 1_002_500 },
    ]);
    expect(s.windows).toEqual([
      { label: 'stall', busyMs: 3, owners: [{ name: 'wireHandlers agents/setup.js:10', ms: 3 }] },
    ]);
  });
});

describe('shortUrl', () => {
  it('keeps the part of a path a reader needs', () => {
    expect(shortUrl('file:///app/dist/agents/x.js')).toBe('agents/x.js');
    expect(
      shortUrl('file:///app/node_modules/.pnpm/a@1/node_modules/@livekit/agents/dist/v.js')
    ).toBe('@livekit/agents/dist/v.js');
  });
});
