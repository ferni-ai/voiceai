/**
 * The check-in alert's screen never costs a crisis signal. Before the screen,
 * the sponsor got the concern's words in full, whoever they were about. The
 * crisis guard reads third-person crisis too ("she said she doesn't want to be
 * here anymore", crisis-third-person.ts), and it must still reach the sponsor
 * whenever the screen withholds or cuts the words: as crisisCallerLine.
 * Fictional people and numbers only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sent = vi.hoisted(() => ({ messages: [] as string[] }));

vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: (v: unknown) => v,
}));
vi.mock('../../llm-utils.js', () => ({ callLLM: vi.fn() }));
vi.mock('../urgent-alert.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../urgent-alert.js')>()),
  sendUrgentAlert: vi.fn(async (_user: string, message: string) => {
    sent.messages.push(message);
  }),
}));

import { callLLM } from '../../llm-utils.js';
import { crisisCallerLine, crisisRead, riskyCallerLine } from '../caller-text.js';
import { handleCheckinCallComplete } from '../../family/family-checkin-caller.js';
import { generateUrgentNotification } from '../checkin-urgent-alert.js';

const NAME = 'Priya';
const CRISIS = crisisCallerLine(NAME);
const MONEY = riskyCallerLine(NAME);
const CHECK_IN = 'You may want to check in with them.';

/** Crisis about someone else, which the shared guard reads (it missed all three before). */
const THIRD_PERSON = [
  "she said she doesn't want to be here anymore",
  'he talked about ending it',
  "she fell and can't get up",
];

function alertFor(description: unknown, recommendedAction?: unknown, urgency = 'urgent') {
  return generateUrgentNotification({
    familyMemberName: NAME,
    concernsIdentified: [{ urgency, description, recommendedAction }],
  });
}

describe('check-in alert: third-person crisis', () => {
  it.each(THIRD_PERSON)('the shared guard reads "%s" as crisis', (line) => {
    expect(crisisRead(line)).toBe(true);
  });

  it.each(THIRD_PERSON)('"%s" in full reaches the sponsor word for word', (line) => {
    expect(alertFor(line)).toBe(`Important: During my call with ${NAME}, ${line}. ${CHECK_IN}`);
  });

  it.each(THIRD_PERSON)('"%s" next to a number gives crisisCallerLine', (line) => {
    const alert = alertFor(`${line}, and gave the number 555 0123`);
    expect(alert).not.toMatch(/\d/);
    expect(alert).toContain(CRISIS);
  });

  it.each(THIRD_PERSON)('"%s" with a risky suggestion keeps both', (line) => {
    const alert = alertFor(line, 'Send $200 to Marcus at 555 0188');
    // Changed (owner decision): the money line names money. Main ended with CHECK_IN.
    expect(alert).toBe(`Important: During my call with ${NAME}, ${line}. ${CRISIS} ${MONEY}`);
  });

  it.each(THIRD_PERSON)('"%s" past the 200-character cap gives crisisCallerLine', (line) => {
    const description = `${'she talked about the garden in Maplewood '.repeat(6)}${line}`;
    expect(description.indexOf(line)).toBeGreaterThan(200);
    const alert = alertFor(description);
    expect(alert).not.toContain(line);
    expect(alert).toContain(CRISIS);
  });

  it.each(THIRD_PERSON)('"%s" past the 10,000-character window gives crisisCallerLine', (line) => {
    const description = `${'she talked about the garden and the tomatoes '.repeat(224)}${line}`;
    expect(description.indexOf(line)).toBeGreaterThan(10_000);
    expect(alertFor(description)).toContain(CRISIS);
    expect(alertFor('mentioned chest pain', description)).toContain(CRISIS);
  });

  it.each(THIRD_PERSON)('"%s" inside an array is read as its words', (line) => {
    expect(alertFor([[line]])).toBe(`Important: During my call with ${NAME}, ${line}. ${CHECK_IN}`);
  });

  it.each(THIRD_PERSON)('"%s" inside an object gives crisisCallerLine', (line) => {
    expect(alertFor({ text: line })).toContain(CRISIS);
    expect(alertFor('mentioned chest pain', { text: line })).toContain(CRISIS);
  });
});

describe('check-in alert: the crisis guard reads both fields in full', () => {
  it('reads a phrase split across the fields past the first 200 characters', () => {
    const description = `${'she talked about the garden '.repeat(6)}and said she wants to end`;
    const recommendedAction = 'her life';
    expect(description.length).toBeLessThanOrEqual(200); // each field goes out in full
    expect(`${description} ${recommendedAction}`.indexOf('her life')).toBeGreaterThan(190);
    expect(crisisRead(description)).toBe(false);
    expect(crisisRead(recommendedAction)).toBe(false);

    expect(alertFor(description, recommendedAction)).toBe(
      `Important: During my call with ${NAME}, ${description}. ${CRISIS} ${recommendedAction}`
    );
  });
});

describe('check-in alert: high urgency gets the same screen', () => {
  it('screens a high-urgency concern', () => {
    const alert = alertFor('asked that you send $400 to account 4417 2290', undefined, 'high');
    expect(alert).not.toMatch(/\d/);
    expect(alert).toContain(CRISIS);
  });

  it('gives nothing for a medium concern', () => {
    expect(alertFor("she said she doesn't want to be here anymore", undefined, 'medium')).toBe(
      null
    );
  });
});

describe('check-in alert: the send path', () => {
  beforeEach(() => {
    sent.messages = [];
  });

  it('a high-urgency third-person crisis next to a number reaches the sponsor', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(
      JSON.stringify({
        mood: 'worried',
        summary: 'Priya sounded worried.',
        concerns: [
          {
            description: 'Her neighbour Marcus said he talked about ending it, call 555 0147',
            urgency: 'high',
            category: 'safety',
          },
        ],
      })
    );
    // Reaches the alert through the lazy import in family-checkin-caller.ts.
    await handleCheckinCallComplete('call-test-4', 'sponsor-test-1', {
      status: 'completed',
      transcript: [
        { role: 'assistant', content: 'How are you doing today?' },
        { role: 'user', content: 'Not great.' },
      ],
      familyMemberName: NAME,
      relationship: 'grandmother',
    });
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).not.toMatch(/\d/);
    expect(sent.messages[0]).toContain(CRISIS);
  });
});
