/**
 * TEAMMATE_PRONOUNS=on: the team lines a persona reads every turn give each
 * teammate's canon pronouns (teammate-pronouns.ts), so Jordan is never "he" and
 * Alex never "she". Prod 2026-10-13: Ferni called Jordan both he and she in one
 * call (#1486). Dev 2026-11-11: Maya called Alex "she".
 *
 * Read from what the model is actually sent: the turn reminder built by
 * withTurnReminder (turn-request.ts), as on a live call.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withTurnReminder } from '../../../agents/personas/turn-request.js';
import { getPersonaPronouns } from '../../../personas/persona-pronouns.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { BY_NEED_TEAMMATES, teamByNeedNote } from '../team-by-need-note.js';
import { withPronouns } from '../teammate-pronouns.js';

/** Signed up a minute ago: no conversations, no streak, no subscription. */
const newcomer = { id: 'u1', totalConversations: 0 } as unknown as UserProfile;
const SMALL_TALK = "hey, how's your day going? the weather is lovely";
const ANY_PRONOUNS = /\((he|she|they)\/(him|her|them)\)/;

const flags = (pronouns: boolean, byNeed: boolean) => {
  vi.stubEnv('TEAMMATE_PRONOUNS', pronouns ? 'on' : 'off');
  vi.stubEnv('TEAM_BY_NEED', byNeed ? 'on' : '');
};
afterEach(() => vi.unstubAllEnvs());

/** What the model is told on the caller's turn, with `personaId` speaking. */
function sentText(personaId: string, words = SMALL_TALK): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: words });
  const session = { userData: { personaId, services: { userProfile: newcomer } } };
  return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

describe('TEAM_BY_NEED on (dev today): the "teammates you can bring in" line', () => {
  it('tells Maya that Alex is he/him and Jordan she/her (the dev and prod calls)', () => {
    flags(true, true);
    const sent = sentText('maya-santos');
    expect(sent).toContain('Alex (he/him) for');
    expect(sent).toContain('Jordan (she/her) for');
    expect(sent).toContain('Peter (he/him) for');
    expect(sent).toContain('Nayan (he/him) for');
    expect(sent).not.toContain('Maya (she/her) for'); // she isn't offered to herself
  });

  it("tells Ferni Jordan's and Maya's pronouns", () => {
    flags(true, true);
    const sent = sentText('ferni');
    expect(sent).toContain('Jordan (she/her) for');
    expect(sent).toContain('Maya (she/her) for');
  });

  it('reads every teammate from the canon in persona-pronouns.ts', () => {
    flags(true, true);
    const note = teamByNeedNote('ferni', SMALL_TALK);
    for (const m of BY_NEED_TEAMMATES) {
      const p = getPersonaPronouns(m.id);
      expect(note, m.id).toContain(`${m.name} (${p.subject}/${p.object}) for`);
    }
  });

  it('gives the legends theirs too, when the caller talks investing', () => {
    flags(true, true);
    const note = teamByNeedNote('ferni', 'should I move my 401k into index funds?');
    expect(note).toContain('Henry Caldwell (he/him) for');
    expect(note).toContain('Nate Holloway (he/him) for');
  });

  it('flag off: the line is as before, with no pronouns', () => {
    flags(false, true);
    const sent = sentText('maya-santos');
    expect(sent).toContain('Alex for');
    expect(sent).toContain('Jordan for');
    expect(sent).not.toMatch(ANY_PRONOUNS);
  });
});

describe('TEAM_BY_NEED off: the "only X is available" line', () => {
  it("tells Maya Ferni's pronouns", () => {
    flags(true, false);
    expect(sentText('maya-santos')).toContain(
      "Of your teammates, only Ferni (he/him) is available to this caller; don't bring up the others."
    );
  });

  it('flag off: the line is as before', () => {
    flags(false, false);
    const sent = sentText('maya-santos');
    expect(sent).toContain(
      "Of your teammates, only Ferni is available to this caller; don't bring up the others."
    );
    expect(sent).not.toMatch(ANY_PRONOUNS);
  });
});

describe('withPronouns', () => {
  it('names the teammate with their pronouns only while the flag is on', () => {
    expect(withPronouns('jordan-taylor', 'Jordan', { TEAMMATE_PRONOUNS: 'on' })).toBe(
      'Jordan (she/her)'
    );
    expect(withPronouns('alex-chen', 'Alex', { TEAMMATE_PRONOUNS: 'on' })).toBe('Alex (he/him)');
    expect(withPronouns('jordan-taylor', 'Jordan', { TEAMMATE_PRONOUNS: 'off' })).toBe('Jordan');
    expect(withPronouns('jordan-taylor', 'Jordan', {})).toBe('Jordan');
  });
});
