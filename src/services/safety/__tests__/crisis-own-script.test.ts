/**
 * CRISIS_OWN_SCRIPT_NOT_EVIDENCE: Ferni's own crisis script reaches the
 * classifier as a neutral marker only before a turn that answers nothing in it
 * (a greeting, a teammate by name, a request to repeat). Every answer reads
 * exactly what main sends; the caller's lines never change; flag off sends
 * exactly what main sends. Asserts on what the model is sent (the generate
 * call). All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IN_DANGER_NOW } from '../../../agents/safety/crisis-guard.js';
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
/** Ferni's scripts that end in a question the caller may answer. */
const SCRIPTS = {
  block: SCRIPT_988,
  safe: `${SCRIPT_988} Are you safe right now?`,
  imminent:
    "I'm really glad you told me. Your safety matters most right now.\n\n" +
    `If you've taken something or you're in danger right now, ${IN_DANGER_NOW}\n\n` +
    "I'm staying right here with you. Is anyone nearby who can be with you?",
  asked: `${SCRIPT_988} Are you having thoughts of hurting yourself?`,
  screen: SCREEN_QUESTION,
};

/** Words of Ferni's script that must never reach the model before a non-answer. */
const SCRIPT_WORDS =
  /988|lifeline|suicid|crisis|carry this alone|hurting|pain you're in|counselors/i;

const ON = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'on' };
const OFF = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'off' };

/** Every input the model was sent for one turn. */
async function sent(input: CrisisClassifierInput, env: Record<string, string>) {
  resetCrisisClassifierCache();
  const generate = vi.fn(async () => '{"risk":"none","subject":"self"}');
  await startCrisisClassifier(input, { pattern: 'none', generate, env })?.verdict;
  expect(generate).toHaveBeenCalled();
  return generate.mock.calls.map((call) => String((call as unknown[])[1]));
}

/** What main sends the model for this input (classifyCrisis). */
const main = (input: CrisisClassifierInput) => JSON.stringify(normalizeInput(input));

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

  it.each([
    'Hello?',
    'hi',
    'Hey, you there?',
    'Hello? Can you hear me?',
    'I want to talk to Maya.',
    'No, I want to talk to Maya.',
    'Can I talk to Jordan please',
    'Let me talk to Peter.',
    'switch to Alex',
    'Maya?',
    'nah, put Maya on',
    'no, can I talk to Alex',
    'What did you say?',
    'Sorry, what?',
    'Can you repeat that?',
    'Say that again?',
  ])('a turn that answers nothing reads the marker after every script: %s', async (latest) => {
    for (const companion of Object.values(SCRIPTS)) {
      const [content] = await sent({ latest, earlier: [], companion }, ON);
      expect(JSON.parse(content).companion).toBe(OWN_SCRIPT_MARK);
    }
  });

  it.each([
    'no',
    'nope',
    'No.',
    'no, nobody',
    "no I'm not",
    'not really',
    'yeah',
    'yes',
    'kind of',
    'sometimes',
    "I don't know",
    'maybe',
    'So I was going to',
    'and then the',
    'I want to talk to Maya about wanting to die',
    'Can I talk to someone else on your team?',
    'hello I took all of them',
    // The list matches the whole turn: a listed opening never carries what follows.
    "Can I talk to Maya, I don't want to be here anymore",
    'hello… I took them all',
    "can you hear me? I'm not okay",
    // A bare name after "no" or "nah" can answer the script to the persona.
    'No, Maya.',
    'nah, Maya',
    'No, Alex.',
    'no maya',
    'no ferni',
    'nah',
    // A bare "sorry" (or "huh", "what") has readings other than "say that again".
    'sorry',
    'sorry?',
    'huh',
    'What?',
    'wait what',
  ])('every other turn reads exactly what main sends, after every script: %s', async (latest) => {
    for (const companion of Object.values(SCRIPTS)) {
      const input = { latest, earlier: [], companion };
      for (const content of await sent(input, ON)) expect(content).toBe(main(input));
    }
  });

  it("never changes the caller's lines, even ones the script pattern matches", async () => {
    const earlier = ['I called the 988 lifeline last week', 'I keep thinking about suicide'];
    const input = { latest: 'Hello?', earlier, companion: SCRIPT_988 };
    for (const content of await sent(input, ON)) {
      const seen = JSON.parse(content);
      expect(seen.companion).toBe(OWN_SCRIPT_MARK);
      expect(seen.latest).toBe('Hello?');
      expect(seen.earlier).toEqual(earlier);
    }
  });

  it.each([
    'You okay with tacos tonight?',
    'Putting a little into an emergency fund each month is a great habit.',
    'Stay safe on the drive!',
  ])('an everyday line is not a crisis script and goes as it is: %s', async (companion) => {
    const [content] = await sent({ latest: 'hello', earlier: [], companion }, ON);
    expect(JSON.parse(content).companion).toBe(companion);
  });
});

describe('CRISIS_OWN_SCRIPT_NOT_EVIDENCE off', () => {
  const FIXTURES: CrisisClassifierInput[] = [
    { latest: 'Hello.', earlier: [], companion: SCRIPT_988 },
    { latest: 'I want to talk to Maya.', earlier: [], companion: SCRIPTS.asked },
    { latest: 'hello', earlier: ['I want to die'], companion: SCRIPT_988 },
    { latest: 'same.', earlier: [], companion: 'I made pasta again' },
    { latest: 'hi', earlier: [] },
  ];

  it.each(FIXTURES)('the model gets what main sends: %j', async (input) => {
    for (const env of [OFF, { CRISIS_CLASSIFIER_MODE: 'live' }]) {
      for (const content of await sent(input, env)) expect(content).toBe(main(input));
    }
  });

  it('inputForRead hands back the same object', () => {
    for (const input of FIXTURES) {
      expect(inputForRead(input, {})).toBe(input);
      expect(inputForRead(input, { CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'off' })).toBe(input);
    }
  });
});
