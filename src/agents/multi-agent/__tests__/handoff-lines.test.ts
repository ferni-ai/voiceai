import { afterEach, describe, expect, it, vi } from 'vitest';

const banter = vi.hoisted(() => ({
  handoff: null as string | null,
  arriving: null as string | null,
}));
vi.mock('../../../services/team-engagement/banter.js', () => ({
  getHandoffBanter: () => banter.handoff,
  getArrivingBanter: () => banter.arriving,
}));
vi.mock('../../../config/generative-model.js', () => ({ getGenerativeModel: vi.fn() }));

import { arrivalLine, departureLine } from '../handoff-brief.js';

const ON = { HANDOFF_ASK_FIRST: 'on' };

describe('handoff lines with no banter written for the pair', () => {
  afterEach(() => {
    banter.handoff = null;
    banter.arriving = null;
  });

  it('keeps the old lines when HANDOFF_ASK_FIRST is off', () => {
    expect(departureLine('ferni', 'peter-john', {})).toMatch(/^Let me hand you off to Peter/);
    expect(arrivalLine('peter-john', 'ferni', {})).toBe("Hey! What's up?");
  });

  it('says yes and has the teammate say who they are when it is on', () => {
    expect(departureLine('ferni', 'peter-john', ON)).toBe("Sure, here's Peter.");
    expect(arrivalLine('peter-john', 'ferni', ON)).toBe("Hey, it's Peter.");
  });

  it('never makes the caller start over with "What\'s up?" when it is on', () => {
    expect(arrivalLine('jordan-taylor', 'ferni', ON)).not.toMatch(/what'?s up/i);
  });

  it('prefers written banter in both states', () => {
    banter.handoff = 'Peter, you are up!';
    banter.arriving = 'Did someone say index funds?';
    expect(departureLine('ferni', 'peter-john', ON)).toBe('Peter, you are up!');
    expect(arrivalLine('peter-john', 'ferni', {})).toBe('Did someone say index funds?');
  });
});
