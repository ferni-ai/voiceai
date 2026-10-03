import { describe, expect, it } from 'vitest';
import {
  isWebTeamMember,
  keepTimestampIfUnchanged,
  type GeneratedConfig,
} from '../generate-frontend-personas.js';

describe('frontend persona roster', () => {
  it("shows Ferni's team only, not other teams' personas", () => {
    expect(isWebTeamMember({ team: { membership: 'ferni-team' } })).toBe(true);
    expect(isWebTeamMember({ team: { membership: 'financial-legends' } })).toBe(false);
    expect(isWebTeamMember({})).toBe(true); // no team named: the old default
  });
});

describe('keepTimestampIfUnchanged', () => {
  const config = (timestamp: string, coordinatorId = 'ferni'): GeneratedConfig =>
    ({
      _generated: { timestamp, source: 'x', version: '1.0.0' },
      personas: {},
      teamOrder: ['ferni'],
      coordinatorId,
    }) as unknown as GeneratedConfig;
  const old = JSON.stringify(config('2026-10-01T00:00:00.000Z'), null, 2);

  it('keeps the old timestamp when nothing else changed', () => {
    expect(keepTimestampIfUnchanged(config('2026-10-02T10:00:00.000Z'), old)._generated.timestamp).toBe(
      '2026-10-01T00:00:00.000Z'
    );
  });

  it('takes the new timestamp when the content changed', () => {
    const next = config('2026-10-02T10:00:00.000Z', 'maya');
    expect(keepTimestampIfUnchanged(next, old)._generated.timestamp).toBe('2026-10-02T10:00:00.000Z');
  });

  it('writes the new config when there is no previous file', () => {
    expect(keepTimestampIfUnchanged(config('t'), null)._generated.timestamp).toBe('t');
  });
});
