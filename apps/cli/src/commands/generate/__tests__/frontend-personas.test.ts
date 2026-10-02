import { describe, expect, it } from 'vitest';
import { isWebTeamMember } from '../generate-frontend-personas.js';

describe('frontend persona roster', () => {
  it("shows Ferni's team only, not other teams' personas", () => {
    expect(isWebTeamMember({ team: { membership: 'ferni-team' } })).toBe(true);
    expect(isWebTeamMember({ team: { membership: 'financial-legends' } })).toBe(false);
    expect(isWebTeamMember({})).toBe(true); // no team named: the old default
  });
});
