/**
 * The urgent family check-in alert is written from the family member's words
 * on the call (an unverified caller), then texted or pushed to the sponsor. Its
 * description and suggested action go through the caller-text screen first:
 * no link, number or money request is passed on, and crisis wording always is.
 * Fictional people and numbers only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent = vi.hoisted(() => ({ messages: [] as string[] }));

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: (v: unknown) => v,
}));
vi.mock('../../llm-utils.js', () => ({ callLLM: vi.fn() }));
vi.mock('../../outreach/urgent-alert.js', () => ({
  sendUrgentAlert: vi.fn(async (_user: string, message: string) => {
    sent.messages.push(message);
  }),
}));

import { callLLM } from '../../llm-utils.js';
import {
  crisisCallerLine,
  crisisRead,
  isRiskyCallerText,
  riskyCallerLine,
} from '../../outreach/caller-text.js';
import { handleCheckinCallComplete } from '../family-checkin-caller.js';
import { generateUrgentNotification } from '../family-checkin-summary.js';
import type { CheckinCallRecord, FlaggedConcern } from '../proactive-family-checkin.js';

const NAME = 'Rosa';
const CHECK_IN = 'You may want to check in with them.';

function alertFor(concern: Partial<FlaggedConcern>): string | null {
  const record: CheckinCallRecord = {
    id: 'call-test-1',
    scheduleId: 'schedule-test-1',
    sponsorUserId: 'sponsor-test-1',
    sponsoredIdentityId: 'identity-test-1',
    familyMemberName: NAME,
    callStartedAt: '2026-01-05T15:00:00.000Z',
    status: 'completed',
    concernsIdentified: [
      { description: 'mentioned chest pain', urgency: 'urgent', category: 'health', ...concern },
    ],
    sponsorBriefed: false,
  };
  return generateUrgentNotification(record);
}

const DIGITS = /\d/;

describe('urgent family check-in alert: caller text screen', () => {
  it('passes a clean concern through exactly as before', () => {
    expect(alertFor({ recommendedAction: 'Call her doctor today' })).toBe(
      `Important: During my call with ${NAME}, mentioned chest pain. Call her doctor today`
    );
    expect(alertFor({})).toBe(
      `Important: During my call with ${NAME}, mentioned chest pain. ${CHECK_IN}`
    );
  });

  it('never passes on a number or money request from the description', () => {
    const alert = alertFor({ description: 'asked that you send $400 to account 4417 2290 today' });
    expect(alert).not.toMatch(DIGITS);
    expect(alert).not.toContain('send');
    expect(alert).toContain(riskyCallerLine(NAME).replace(/\.$/, ''));
  });

  it('drops a risky suggested action for Ferni’s own line', () => {
    const alert = alertFor({ recommendedAction: 'Wire $400 to pay-rosa.example.test/r/4417 now' });
    expect(alert).not.toMatch(DIGITS);
    expect(alert).not.toContain('example.test');
    expect(alert).not.toContain('Wire');
    expect(alert?.endsWith(CHECK_IN)).toBe(true);
  });

  it('crisis wording reaches the sponsor intact', () => {
    const words = 'said she does not want to be alive anymore';
    const alert = alertFor({ description: words, category: 'emotional' });
    expect(alert).toContain(words);
    expect(alert).not.toContain(crisisCallerLine(NAME));
  });

  it('keeps crisis wording when it came with a risky suggested action', () => {
    const alert = alertFor({
      recommendedAction: 'She said she wants to end her life; wire $400 to 4417 2290',
    });
    expect(alert).not.toMatch(DIGITS);
    expect(alert).toContain(crisisCallerLine(NAME));
    expect(alert?.endsWith(CHECK_IN)).toBe(true);
  });
});

describe('urgent family check-in alert: text split across the two fields', () => {
  it('replaces both fields when they only form a number once joined', () => {
    const description = 'gave the number 555 01';
    const recommendedAction = '23 for her neighbour';
    expect(isRiskyCallerText(description)).toBe(false);
    expect(isRiskyCallerText(recommendedAction)).toBe(false);

    const alert = alertFor({ description, recommendedAction });
    expect(alert).toBe(
      `Important: During my call with ${NAME}, ${riskyCallerLine(NAME).replace(/\.$/, '')}. ${CHECK_IN}`
    );
  });

  it('says crisisCallerLine for a crisis phrase split across the two fields', () => {
    const description = 'said she wants to end';
    const recommendedAction = 'her life';
    expect(crisisRead(description)).toBe(false);
    expect(crisisRead(recommendedAction)).toBe(false);

    expect(alertFor({ description, recommendedAction })).toContain(crisisCallerLine(NAME));
  });

  it('keeps crisisCallerLine when the joined fields are replaced', () => {
    const alert = alertFor({
      description: 'said she wants to end her life at 555 01',
      recommendedAction: '23 tonight',
    });
    expect(alert).not.toMatch(DIGITS);
    expect(alert).toContain(crisisCallerLine(NAME));
    expect(alert?.endsWith(CHECK_IN)).toBe(true);
  });
});

/** Everyday words, then a fictional number past the screen's 10,000-char window. */
const PAST_WINDOW = `${'she talked about the garden and the tomatoes '.repeat(224)}call 555 0142`;

const GENERIC = `Important: During my call with ${NAME}, ${riskyCallerLine(NAME).replace(/\.$/, '')}. ${CHECK_IN}`;

describe('urgent family check-in alert: text too long to screen in full', () => {
  it('caps a long safe description instead of passing all of it on', () => {
    const description = `mentioned ${'a long walk by the lake '.repeat(22)}`.trim();
    expect(description.length).toBeGreaterThan(490);

    const alert = alertFor({ description });
    expect(alert).toContain(`During my call with ${NAME}, mentioned a long walk by the lake`);
    expect(alert).not.toContain(description);
    expect(alert!.length).toBeLessThan(300);
  });

  it('sends the generic alert when a number sits past the screen window', () => {
    expect(PAST_WINDOW.length).toBeGreaterThan(10_000);
    expect(PAST_WINDOW.indexOf('555')).toBeGreaterThan(10_000);
    expect(isRiskyCallerText(PAST_WINDOW)).toBe(false); // the prefix-only read misses it

    expect(alertFor({ description: PAST_WINDOW })).toBe(GENERIC);
    expect(alertFor({ recommendedAction: PAST_WINDOW })).toBe(GENERIC);
  });

  it('keeps crisisCallerLine when a crisis phrase sits past the screen window', () => {
    const description = PAST_WINDOW.replace('call 555 0142', 'and said she wants to end her life');
    expect(description.indexOf('end her life')).toBeGreaterThan(10_000);

    const alert = alertFor({ description });
    expect(alert).toContain(crisisCallerLine(NAME));
    expect(alert?.endsWith(CHECK_IN)).toBe(true);
  });

  it('treats a field that is not text as empty instead of throwing', () => {
    const alert = alertFor({
      description: 5550142 as never,
      recommendedAction: ['555 0142'] as never,
    });
    expect(alert).toBe(`Important: During my call with ${NAME}, something came up. ${CHECK_IN}`);
  });
});

describe('urgent family check-in alert: the sponsor send path', () => {
  beforeEach(() => {
    sent.messages = [];
  });

  it('sends the sponsor the screened alert, not the raw concern', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({
        mood: 'worried',
        summary: 'Rosa sounded worried.',
        concerns: [
          {
            description: 'asked that you send $400 to account 4417 2290',
            urgency: 'urgent',
            category: 'financial',
            recommendedAction: 'Wire it to pay-rosa.example.test today',
          },
        ],
      })
    );
    await handleCheckinCallComplete('call-test-2', 'sponsor-test-1', {
      status: 'completed',
      transcript: [
        { role: 'assistant', content: 'How are you doing today?' },
        { role: 'user', content: 'Fine, dear.' },
      ],
      familyMemberName: NAME,
      relationship: 'grandmother',
    });
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).not.toMatch(DIGITS);
    expect(sent.messages[0]).not.toContain('example.test');
    expect(sent.messages[0]).toContain(`During my call with ${NAME}`);
  });

  it('sends the generic alert for a description too long to screen in full', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({
        mood: 'worried',
        summary: 'Rosa sounded worried.',
        concerns: [{ description: PAST_WINDOW, urgency: 'urgent', category: 'other' }],
      })
    );
    await handleCheckinCallComplete('call-test-3', 'sponsor-test-1', {
      status: 'completed',
      transcript: [
        { role: 'assistant', content: 'How are you doing today?' },
        { role: 'user', content: 'Fine, dear.' },
      ],
      familyMemberName: NAME,
      relationship: 'grandmother',
    });
    expect(sent.messages).toEqual([GENERIC]);
  });
});
