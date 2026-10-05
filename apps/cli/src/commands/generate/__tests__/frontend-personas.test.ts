import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { findProjectRoot } from '../../../utils/project-root.js';
import {
  isFinancialLegend,
  isWebTeamMember,
  keepTimestampIfUnchanged,
  manifestToLegend,
  type GeneratedConfig,
} from '../generate-frontend-personas.js';

const bundle = (id: string): string => join(findProjectRoot(), 'src', 'personas', 'bundles', id);
const manifestOf = (id: string): Parameters<typeof manifestToLegend>[0] =>
  JSON.parse(readFileSync(join(bundle(id), 'persona.manifest.json'), 'utf-8'));

describe('frontend persona roster', () => {
  it("shows Ferni's team only, not other teams' personas", () => {
    expect(isWebTeamMember({ team: { membership: 'ferni-team' } })).toBe(true);
    expect(isWebTeamMember({ team: { membership: 'financial-legends' } })).toBe(false);
    expect(isWebTeamMember({})).toBe(true); // no team named: the old default
  });
});

describe('Financial Legends (generated so the web can show who is speaking)', () => {
  it('are recognised by their team, and only them', () => {
    expect(isFinancialLegend(manifestOf('peter-lynch'))).toBe(true);
    expect(isFinancialLegend(manifestOf('john-bogle'))).toBe(true);
    expect(isFinancialLegend(manifestOf('peter-john'))).toBe(false);
  });

  it('build a speaker card from the bundle: own name, initials and title, not a team member', async () => {
    const lynch = await manifestToLegend(manifestOf('peter-lynch'), bundle('peter-lynch'));
    expect(lynch).toMatchObject({
      id: 'peter-lynch',
      name: 'Peter Lynch',
      initials: 'PL',
      subtitle: 'Stock Picking Guide',
      role: 'standalone',
      skills: [],
    });
    expect(lynch.transition.emoji).toBe('');
    const joel = await manifestToLegend(manifestOf('joel-dickson'), bundle('joel-dickson'));
    expect(joel.subtitle).toBe('Life Mentor');
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
    expect(
      keepTimestampIfUnchanged(config('2026-10-02T10:00:00.000Z'), old)._generated.timestamp
    ).toBe('2026-10-01T00:00:00.000Z');
  });

  it('takes the new timestamp when the content changed', () => {
    const next = config('2026-10-02T10:00:00.000Z', 'maya');
    expect(keepTimestampIfUnchanged(next, old)._generated.timestamp).toBe(
      '2026-10-02T10:00:00.000Z'
    );
  });

  it('writes the new config when there is no previous file', () => {
    expect(keepTimestampIfUnchanged(config('t'), null)._generated.timestamp).toBe('t');
  });
});
