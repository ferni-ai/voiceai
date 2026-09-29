import { describe, expect, it } from 'vitest';

import { greetingFamiliarity } from '../greeting-familiarity.js';
import { personaMoodCarryover } from '../persona-mood-carryover.js';

describe('greetingFamiliarity', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('falls back to the neutral greeting before the profile loads', () => {
    expect(greetingFamiliarity(undefined, now)).toEqual({
      isReturningUser: false,
      relationshipStage: 'friend',
      facts: {},
    });
    expect(greetingFamiliarity(null, now).facts).toEqual({});
  });

  it('knows a first conversation', () => {
    const f = greetingFamiliarity({ totalConversations: 0 }, now);
    expect(f.isReturningUser).toBe(false);
    expect(f.relationshipStage).toBe('stranger');
    expect(f.facts['how well you know them']).toBe('this is your first conversation');
  });

  it('greets an old friend like one, with how long it has been', () => {
    const f = greetingFamiliarity(
      {
        totalConversations: 14,
        relationshipStage: 'old_friend',
        lastContact: new Date('2026-09-28T09:00:00Z'),
      },
      now
    );
    expect(f.isReturningUser).toBe(true);
    expect(f.relationshipStage).toBe('trusted_advisor');
    expect(f.facts).toEqual({
      'how well you know them': 'you have talked 14 times',
      'last talked': 'yesterday',
    });
  });

  it('describes a long gap in weeks or months', () => {
    const weeks = greetingFamiliarity(
      { totalConversations: 3, lastContact: new Date('2026-09-08T12:00:00Z') },
      now
    );
    expect(weeks.facts['last talked']).toBe('about 3 weeks ago');
  });
});

describe('personaMoodCarryover', () => {
  it("speaks of the persona's own mood, never the caller's", () => {
    const line = personaMoodCarryover('tired_but_present');
    expect(line).toContain('You left your last conversation with them a little tired but present');
    expect(line).toContain('it is your mood, not theirs');
    expect(line).not.toMatch(/they seemed/i);
  });

  it('says nothing for an unknown or missing mood', () => {
    expect(personaMoodCarryover(undefined)).toBeUndefined();
    expect(personaMoodCarryover('grumpy')).toBeUndefined();
  });
});
