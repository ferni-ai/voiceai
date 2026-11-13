/**
 * CRISIS_TIMEOUT_CHECKIN through the real gatedReply: a failed crisis read on a line with safety
 * words gets a warm check-in with 988; everything else reads exactly as with the flag off.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { checkin } from '../../../services/safety/index.js';
import { gatedReply } from '../crisis-gate.js';

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '40',
};
const ON = { ...BASE, CRISIS_TIMEOUT_CHECKIN: 'on' };
const OFF = { ...BASE, CRISIS_TIMEOUT_CHECKIN: 'off' };

/** Each way a read can fail to come back: classifyCrisis resolves all of them to no verdict. */
const FAILED: Record<string, CrisisGenerateFn> = {
  throws: async () => {
    throw new Error('provider down');
  },
  'times out': (_prompt, _content, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  'returns nothing': async () => '',
  'returns garbage': async () => 'sure, here is my answer',
};
const THROWS = async (): Promise<string> => {
  throw new Error('provider down');
};
const ANSWERED: Record<string, CrisisGenerateFn> = {
  none: async () => '{"risk":"none","subject":"self"}',
  crisis: async () => '{"risk":"crisis","subject":"self"}',
  imminent: async () => '{"risk":"imminent","subject":"self"}',
};

const PILLS = 'i have a bottle of pills and i want to take them all';
// Safety words the patterns leave to the classifier. "i feel unsafe with myself tonight" was the
// line here until the patterns read it (#3789); it now stands with the lines they read, below.
const UNSAFE = "i'm scared of what i might do tonight";
const ORDINARY = 'what should I cook tonight?';

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      if (text) controller.enqueue(text);
      controller.close();
    },
  });

interface Turn {
  spoken: string;
  /** The text of the last item of every request the model got. */
  asked: string[];
}

async function turn(
  said: string | llm.ChatContext,
  env: Record<string, string>,
  generate: CrisisGenerateFn,
  modelSays: (ctx: llm.ChatContext) => string = () => 'Sounds good.'
): Promise<Turn> {
  resetCrisisClassifierCache();
  // The turn reminder picks its style lines at random: the same picks on every turn compared.
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const model = vi.fn(async (ctx: llm.ChatContext) => streamOf(modelSays(ctx)));
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const ctx = typeof said === 'string' ? request(['user', said]) : said;
  const reply = await gatedReply(ctx, { userData: undefined }, model as never, opener as never, {
    env,
    generate,
  });
  let spoken = '';
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<string>) spoken += chunk;
  const asked = model.mock.calls.map(
    ([sent]) => (sent.items.at(-1) as llm.ChatMessage).textContent ?? ''
  );
  random.mockRestore();
  return { spoken, asked };
}

/** The model follows the check-in guidance when it gets it, and otherwise chats. */
const guidedModel = (ctx: llm.ChatContext): string =>
  ((ctx.items.at(-1) as llm.ChatMessage).textContent ?? '').includes(TIMEOUT_CHECKIN)
    ? "I'm here with you. Are you safe right now? You can call or text 988 any time."
    : 'Sounds good.';

/** The check-in's guidance as the gate's escalation hands it over (the module keeps it private). */
let TIMEOUT_CHECKIN = '';
beforeAll(async () => {
  const pass = { action: 'pass' };
  const read = Promise.resolve(null);
  const turn = { decision: pass, latest: UNSAFE, env: ON };
  TIMEOUT_CHECKIN = ((await checkin.escalation(read, turn, async () => null)) ?? { guidance: '' })
    .guidance;
  expect(TIMEOUT_CHECKIN).toContain('988'); // never an empty string the rows below would pass on
});
beforeEach(() => resetCrisisClassifierCache());

describe('CRISIS_TIMEOUT_CHECKIN: a failed read on a line with safety words', () => {
  for (const line of [PILLS, UNSAFE])
    for (const [how, generate] of Object.entries(FAILED))
      it(`checks in with 988 when the classifier ${how}: "${line}"`, async () => {
        const off = await turn(line, OFF, generate, guidedModel);
        const on = await turn(line, ON, generate, guidedModel);
        // Main today: an ordinary reply, no 988 (red-first, 2026-11-10).
        expect(off.spoken).toBe('Sounds good.');
        expect(off.spoken).not.toContain('988');
        // With the flag on: the held reply is dropped and the model asked with the check-in last.
        expect(on.asked).toHaveLength(2);
        expect(on.asked[1]?.endsWith(`(${TIMEOUT_CHECKIN})`)).toBe(true);
        expect(on.spoken).toContain('Are you safe right now?');
        expect(on.spoken).toContain('988');
        expect(on.spoken).not.toContain('Sounds good.');
      });

  it('says 988 itself when the guided reply lacks it', async () => {
    const on = await turn(PILLS, ON, THROWS, (ctx) =>
      guidedModel(ctx) === 'Sounds good.' ? 'Sounds good.' : "I'm here. Are you safe right now?"
    );
    expect(on.spoken).toBe(
      "I'm here. Are you safe right now? You can also call or text 988 to talk to someone immediately."
    );
  });

  it('asks the safety question itself when the guided reply lacks it', async () => {
    const on = await turn(PILLS, ON, THROWS, (ctx) =>
      guidedModel(ctx) === 'Sounds good.' ? 'Sounds good.' : 'You can call or text 988 any time.'
    );
    expect(on.spoken).toBe('You can call or text 988 any time. Are you safe right now?');
  });

  it('says both when the guided reply has neither, or nothing at all', async () => {
    const plain = await turn(UNSAFE, ON, THROWS, (ctx) =>
      guidedModel(ctx) === 'Sounds good.' ? 'Sounds good.' : "That's a lot to carry."
    );
    expect(plain.spoken).toBe(
      "That's a lot to carry. Are you safe right now? You can also call or text 988 to talk to someone immediately."
    );
    const silent = await turn(UNSAFE, ON, THROWS, (ctx) =>
      guidedModel(ctx) === 'Sounds good.' ? 'Sounds good.' : ''
    );
    expect(silent.spoken).toBe(
      'Are you safe right now? You can also call or text 988 to talk to someone immediately.'
    );
  });

  it('says them in Spanish to a caller speaking Spanish', async () => {
    const es = await turn('no estoy a salvo esta noche', ON, THROWS, (ctx) =>
      guidedModel(ctx) === 'Sounds good.' ? 'Claro.' : 'Estoy aquí contigo.'
    );
    expect(es.spoken).toBe(
      'Estoy aquí contigo. ¿Estás a salvo ahora mismo? Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988.'
    );
  });

  it('the next ordinary turn is ordinary', async () => {
    await turn(PILLS, ON, THROWS, guidedModel);
    const next = await turn(ORDINARY, ON, THROWS, guidedModel);
    expect(next.spoken).toBe('Sounds good.');
    expect(next.asked).toHaveLength(1);
  });
});

// Lines main left to the classifier (so a failed read checked in) that the patterns now guide
// (#3789), by the means modes they guide under.
const MEANS_LIVE = { CRISIS_MEANS_IN_HAND: 'live', CRISIS_MEANS_NOMINATE: 'live' };
const GUIDED: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['i feel unsafe with myself tonight', {}],
  ['i feel unsafe with myself tonight', MEANS_LIVE],
  [PILLS, MEANS_LIVE],
];

describe('CRISIS_TIMEOUT_CHECKIN: a pattern-guided line whose read failed keeps the 988', () => {
  for (const [line, means] of GUIDED)
    for (const [how, generate] of Object.entries(FAILED))
      it(`code says 988 after a guided reply without it, the classifier ${how}: "${line}" ${
        means.CRISIS_MEANS_IN_HAND ?? 'default'
      }`, async () => {
        const on = await turn(line, { ...ON, ...means }, generate);
        const off = await turn(line, { ...OFF, ...means }, generate);
        // The guided reply is the one held: never asked again, and the model's words stay.
        expect(on.asked).toEqual(off.asked);
        expect(off.spoken).toBe('Sounds good.');
        expect(on.spoken).toBe(
          'Sounds good. Are you safe right now? You can also call or text 988 to talk to someone immediately.'
        );
      });

  it('a guided reply that already asks and says 988 is spoken as the model said it', async () => {
    const said = "I'm right here. Are you safe right now? You can call or text 988 any time.";
    const on = await turn('i feel unsafe with myself tonight', ON, THROWS, () => said);
    expect(on.spoken).toBe(said);
  });

  it('a classifier that answered none leaves the guided reply to the model', async () => {
    const on = await turn('i feel unsafe with myself tonight', ON, ANSWERED.none);
    expect(on.spoken).toBe('Sounds good.');
  });
});

describe('CRISIS_TIMEOUT_CHECKIN: everything else reads as with the flag off', () => {
  it('reads the flag from the gate env: unset is off, and off is main', async () => {
    const unset = await turn(PILLS, BASE, THROWS, guidedModel);
    const off = await turn(PILLS, OFF, THROWS, guidedModel);
    expect(off).toEqual(unset);
    expect(off.asked.join('')).not.toContain(TIMEOUT_CHECKIN);
  });

  /** The same turn with the flag on and off: the check-in must not change it. */
  const unchanged = async (said: string, generate: CrisisGenerateFn): Promise<Turn> => {
    const on = await turn(said, ON, generate, guidedModel);
    expect(on).toEqual(await turn(said, OFF, generate, guidedModel));
    expect(on.asked.join('')).not.toContain(TIMEOUT_CHECKIN);
    return on;
  };

  for (const [how, generate] of Object.entries(FAILED))
    for (const line of [ORDINARY, "my phone is dead and i'm dying to see that movie"])
      it(`a failed read (${how}) on a line without safety words: "${line}"`, async () => {
        await unchanged(line, generate);
      });

  for (const [risk, generate] of Object.entries(ANSWERED))
    for (const line of [PILLS, UNSAFE])
      it(`a classifier that answered ${risk}, on safety words: "${line}"`, async () => {
        await unchanged(line, generate);
      });

  it.each([
    "I hope I don't wake up tomorrow", // the patterns guide
    'I want to kill myself tonight', // the patterns replace
  ])('a line the patterns already read stands unchanged: "%s"', async (line) => {
    await unchanged(line, THROWS);
  });

  it('only the latest caller line counts', async () => {
    const ctx = request(
      ['user', 'i keep thinking about a bottle of pills'],
      ['assistant', 'I hear you.'],
      ['user', 'anyway, what should I cook tonight?']
    );
    const on = await turn(ctx, ON, THROWS, guidedModel);
    expect(on).toEqual(await turn(ctx, OFF, THROWS, guidedModel));
    expect(on.asked.join('')).not.toContain(TIMEOUT_CHECKIN);
    // The same call, with the safety words in the latest line, checks in.
    const latest = request(
      ['user', 'anyway, what should I cook tonight?'],
      ['assistant', 'Pasta?'],
      ['user', PILLS]
    );
    expect((await turn(latest, ON, THROWS, guidedModel)).spoken).toContain('988');
  });
});
