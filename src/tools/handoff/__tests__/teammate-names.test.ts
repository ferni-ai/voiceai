/**
 * A caller asking for a teammate is understood when speech-to-text misspells the name.
 *
 * Dev 2026-10-11: the owner said "Can I talk to Nayan?", STT wrote "Can I talk to
 * Naya?", and the exact-name match missed it: the team line didn't name Nayan and
 * askForTeammate("Naya") answered "There's no teammate called Naya".
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import { withTurnReminder } from '../../../agents/personas/turn-request.js';

import type { UserProfile } from '../../../types/user-profile.js';
import type { UnlockView } from '../locked-handoffs.js';
import { answerTeammateRequest, teamStatusNote, teammatesNamedIn } from '../locked-teammates.js';
import {
  HEARD_AS,
  heardTeammateNote,
  misheardTeammates,
  teammateHeardAs,
} from '../teammate-names.js';
import { TEAM_MEMBERS } from '../../../services/team-unlocks.js';

/** A new free caller: only Ferni is open, so every teammate is locked. */
const lockedView: UnlockView = {
  userProfile: { id: 'u', totalConversations: 0 } as unknown as UserProfile,
  tier: 'free',
  bypass: false,
  currentAgentId: 'ferni',
};

describe('teammateHeardAs', () => {
  it.each([
    ['Nayan', 'nayan-patel'],
    ['Naya', 'nayan-patel'],
    ['nyan', 'nayan-patel'],
    ['Nian', 'nayan-patel'],
    ['Nayon', 'nayan-patel'],
    ['Maya', 'maya-santos'],
    ['Mya', 'maya-santos'],
    ['Jordon', 'jordan-taylor'],
    ['Pete', 'peter-john'],
    ['Alex', 'alex-chen'],
  ])('%s is %s', (word, id) => {
    expect(teammateHeardAs(word)).toBe(id);
  });

  it('a word that is no teammate, or another assistant, is nobody', () => {
    expect(teammateHeardAs('Alexa')).toBeNull();
    expect(teammateHeardAs('nine')).toBeNull();
    expect(teammateHeardAs('naan')).toBeNull();
  });

  it('no STT spelling is itself a teammate name', () => {
    const names = new Set(TEAM_MEMBERS.map((m) => m.displayName.toLowerCase()));
    expect(Object.keys(HEARD_AS).filter((w) => names.has(w))).toEqual([]);
  });
});

describe('misheardTeammates and heardTeammateNote', () => {
  it('find "Naya" in the transcript and say it means Nayan', () => {
    expect(misheardTeammates('Can I talk to Naya?')).toEqual([{ heard: 'naya', id: 'nayan-patel' }]);
    expect(heardTeammateNote('Can I talk to Naya?')).toBe(
      '"Naya" is speech-to-text for Nayan, your teammate: they mean Nayan.'
    );
  });

  it('say nothing when the name came through right, or no teammate was named', () => {
    expect(heardTeammateNote('Can I talk to Nayan?')).toBe('');
    expect(heardTeammateNote('My friend Sam says hi')).toBe('');
  });
});

describe('the locked-teammate paths hear "Naya" as Nayan', () => {
  it('teammatesNamedIn picks Nayan out of "Can I talk to Naya?"', () => {
    expect(teammatesNamedIn('Can I talk to Naya?', TEAM_MEMBERS).map((m) => m.memberId)).toEqual([
      'nayan-patel',
    ]);
  });

  it('the team line names Nayan as on the team but not available yet', () => {
    const note = teamStatusNote(lockedView, 'Can I talk to Naya?');
    expect(note).toContain('Nayan is on your team but not available to this caller yet');
    expect(note).toContain("Never say Nayan isn't on your team");
  });

  it('askForTeammate("Naya") answers for Nayan instead of "no teammate called Naya"', async () => {
    const answer = await answerTeammateRequest('Naya', lockedView);
    expect(answer).toMatchObject({ unavailable: true, teammate: 'Nayan' });
    expect(answer).not.toHaveProperty('unknown');
  });
});

describe('the turn reminder', () => {
  /** What the model is sent after the caller's words, for a caller with every teammate open. */
  function reminderFor(words: string): string {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: words });
    const session = {
      userData: {
        personaId: 'ferni',
        services: {
          userProfile: lockedView.userProfile,
          devMode: { enabled: true, bypassUnlocks: true },
        },
      },
    };
    return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
  }

  it('tells the model "Naya" means Nayan, so it reaches for the Nayan handoff', () => {
    expect(reminderFor('Can I talk to Naya?')).toContain('"Naya" is speech-to-text for Nayan');
  });

  it('adds nothing when the caller said the name right', () => {
    expect(reminderFor('Can I talk to Nayan?')).not.toContain('speech-to-text');
  });
});
