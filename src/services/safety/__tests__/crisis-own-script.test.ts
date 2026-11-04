/**
 * CRISIS_OWN_SCRIPT_NOT_EVIDENCE: Ferni's own crisis script never reaches the
 * classifier as evidence; a safety question keeps a marker that it was asked;
 * the caller's lines never change; flag off sends exactly what main sends.
 * Asserts on what the model is sent (the generate call), not on a helper's
 * return. All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeInput,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisClassifierInput,
} from '../crisis-classifier.js';
import { SCREEN_QUESTION } from '../crisis-grounded-screen.js';
import { inputForRead, OWN_SCRIPT_MARK } from '../crisis-own-script.js';

const SCRIPT_988 =
  "I hear how much pain you're in right now, and I'm really glad you're sharing this with me. " +
  "What you're feeling matters, and you don't have to carry this alone.\n\n" +
  "If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & " +
  'Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.\n\n' +
  "I'm here with you right now. Can you tell me more about what you're going through?";
const ASKED = 'Are you having thoughts of hurting yourself?';

/** Words of Ferni's script that must never reach the model as evidence. */
const SCRIPT_WORDS =
  /988|lifeline|suicid|crisis|carry this alone|hurting|pain you're in|counselors/i;

const ON = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'on' };
const OFF = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'off' };

/** Every input the model was sent for one turn, parsed. */
async function sent(input: CrisisClassifierInput, env: Record<string, string>) {
  resetCrisisClassifierCache();
  const generate = vi.fn(async () => '{"risk":"none","subject":"self"}');
  await startCrisisClassifier(input, { pattern: 'none', generate, env })?.verdict;
  expect(generate).toHaveBeenCalled();
  return generate.mock.calls.map((call) => String((call as unknown[])[1]));
}

afterEach(() => resetCrisisClassifierCache());

describe('CRISIS_OWN_SCRIPT_NOT_EVIDENCE on', () => {
  it('a 988 script before "Hello." reaches the model as a neutral marker', async () => {
    const input = { latest: 'Hello.', earlier: [], companion: SCRIPT_988 };
    // Precondition: with the flag off the script is in what the model reads.
    for (const content of await sent(input, OFF)) expect(content).toMatch(SCRIPT_WORDS);
    for (const content of await sent(input, ON)) {
      expect(content).not.toMatch(SCRIPT_WORDS);
      expect(JSON.parse(content)).toEqual({
        latest: 'Hello.',
        earlier: [],
        companion: OWN_SCRIPT_MARK,
      });
    }
  });

  it('every read of the turn gets the marker, the plain backstop read too', async () => {
    const env = { ...ON, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' };
    // "want to die" is a risk word, so the everyday rules bring a second, plain read.
    const input = { latest: 'i want to die', earlier: [], companion: SCRIPT_988 };
    const contents = await sent(input, env);
    expect(contents).toHaveLength(2);
    for (const content of contents) expect(JSON.parse(content).companion).toBe(OWN_SCRIPT_MARK);
  });

  it.each([
    [ASKED, ASKED],
    [SCREEN_QUESTION, SCREEN_QUESTION],
    ["You don't have to carry this alone. Are you safe right now?", 'Are you safe right now?'],
    [
      `${SCRIPT_988} Are you having thoughts of ending your life?`,
      'Are you having thoughts of ending your life?',
    ],
    // A dropped question mark is still a question.
    ['I care about you. Are you thinking about suicide', 'Are you thinking about suicide'],
  ])(
    'a direct safety question is kept word for word, the rest of the script goes: %s',
    async (companion, question) => {
      for (const latest of ['yeah', 'sometimes', 'kind of', "I don't know"]) {
        const [content] = await sent({ latest, earlier: [], companion }, ON);
        expect(JSON.parse(content)).toEqual({
          latest,
          earlier: [],
          companion: question,
        });
      }
    }
  );

  it("never changes the caller's lines", async () => {
    const earlier = ['I want to die', 'So I was going to'];
    const input = { latest: 'hello', earlier, companion: SCRIPT_988 };
    for (const content of await sent(input, ON)) {
      const seen = JSON.parse(content);
      expect(seen.latest).toBe('hello');
      expect(seen.earlier).toEqual(earlier);
    }
  });

  it.each([
    'You okay with tacos tonight?',
    'Putting a little into an emergency fund each month is a great habit.',
    'Stay safe on the drive!',
    'That sounds like a full day. How did the interview go?',
  ])('an everyday line is not a crisis script and goes as it is: %s', async (companion) => {
    const [content] = await sent({ latest: 'yeah', earlier: [], companion }, ON);
    expect(JSON.parse(content).companion).toBe(companion);
  });
});

describe('CRISIS_OWN_SCRIPT_NOT_EVIDENCE off', () => {
  const FIXTURES: CrisisClassifierInput[] = [
    { latest: 'Hello.', earlier: [], companion: SCRIPT_988 },
    { latest: 'yeah', earlier: [], companion: ASKED },
    { latest: 'hello', earlier: ['I want to die'], companion: SCRIPT_988 },
    { latest: 'same.', earlier: [], companion: 'I made pasta again' },
    { latest: 'hi', earlier: [] },
  ];

  it.each(FIXTURES)('the model gets what main sends: %j', async (input) => {
    // Main sends JSON.stringify(normalizeInput(input)) (classifyCrisis).
    const main = JSON.stringify(normalizeInput(input));
    for (const env of [OFF, { CRISIS_CLASSIFIER_MODE: 'live' }]) {
      for (const content of await sent(input, env)) expect(content).toBe(main);
    }
  });

  it('inputForRead hands back the same object', () => {
    for (const input of FIXTURES) {
      expect(inputForRead(input, {})).toBe(input);
      expect(inputForRead(input, { CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'off' })).toBe(input);
    }
  });
});
