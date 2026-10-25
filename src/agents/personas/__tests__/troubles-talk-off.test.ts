/**
 * TROUBLES_TALK off (or unset): every prompt it touches is byte for byte what
 * origin/main builds without it (d41e88e46, re-taken when main was merged in;
 * before that c8ee11d96, first taken on 2705bbda6). The hashes below were taken on that commit with
 * this same file; a change to any of these prompts that is
 * not behind the flag fails here. One deliberate change outside the flag
 * since: character:ferni re-taken when the games section of Ferni's
 * tool-usage-guidance.md stopped naming tools a call lacks (#2020); and
 * character:ferni, character:maya-santos and character:peter-john re-taken when
 * their bundles took one canon (#2816: Maya Filipino-Brazilian, Peter in his late
 * seventies, Ferni without pets). Every other key is as taken.
 *
 * Regenerate (only for a deliberate change outside the flag):
 *   PRINT_TROUBLES_BASELINE=1 corepack pnpm vitest run troubles-talk-off
 */
import { createHash } from 'node:crypto';
import { llm } from '@livekit/agents';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import { formatLedger, type LedgerStore } from '../life-ledger.js';
import { loadSystemPrompt } from '../prompt-loader.js';
import { withTurnReminder } from '../turn-request.js';
import { rngFor, turnShapeFor } from '../turn-shape.js';

const TURNS = {
  opening: 'Do you have a minute to talk?',
  hospital: "My dad's back in the hospital.",
  dishes:
    "My roommate keeps leaving dirty dishes everywhere and I'm so annoyed I could scream about it.",
  laughTrouble: 'haha I got fired today, I mean what even is my life right now',
  laughLight: 'haha my dog stole a whole pizza right off the counter',
  fence: 'I finally finished painting the fence today, took me all weekend.',
  ack: 'Yeah.',
  request: 'What should I do about my sister?',
};

/** The flags a prod call runs with that these prompts read (generate.ts "prod on"). */
const PROD_LIKE = {
  LAUGH_ALONG: 'on',
  ASK_ADVICE: 'on',
  HUMAN_TEXTURE: 'on',
  PROMPT_MODE: 'character',
};
const TOUCHED = [
  'TROUBLES_TALK',
  'TURN_SHAPE',
  'TURN_LENGTH',
  'TURN_TEXTURE',
  'CANDOR',
  'RECALL_BRIDGE',
  'LISTEN_FIRST',
  ...Object.keys(PROD_LIKE),
];

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const last = (c: llm.ChatContext): string =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

async function prompts(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const mode of ['model', 'dice'] as const) {
    for (const [name, text] of Object.entries(TURNS)) {
      // Several draws per turn, so the random lines (second story, ask advice) show up.
      for (let i = 0; i < 6; i++)
        out[`${mode}:${name}:${i}`] = turnShapeFor(text, rngFor(`${i}:${text}`), mode).reminder;
    }
  }
  for (const [name, text] of Object.entries(TURNS)) {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'user', content: text });
    out[`request:${name}`] = last(withTurnReminder(c, {}));
  }
  out['ledger'] = formatLedger(
    [{ personaId: 'ferni', fact: "Ferni's goat got out", saidAt: '2026-10-10T00:00:00Z' }],
    'Sam',
    Date.parse('2026-10-16T00:00:00Z')
  ) as string;
  const ledgerStore: LedgerStore = {
    save: async () => undefined,
    recent: async () => [
      { personaId: 'ferni', fact: "Ferni's goat got out", saidAt: new Date().toISOString() },
    ],
  };
  for (const [name, text] of Object.entries({ opening: TURNS.opening, fence: TURNS.fence })) {
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: { facts: async () => [], summaries: async () => [] },
      ledgerStore,
    });
    await recall.ready;
    out[`recall:${name}`] = recall.noteFor(text) ?? '';
  }
  for (const persona of ['ferni', 'peter-john', 'maya-santos', 'alex-chen'])
    out[`character:${persona}`] = await loadSystemPrompt(persona);
  return out;
}

const BASELINE: Record<string, string> = {
  'model:opening:0': '2f541046a327760c',
  'model:opening:1': '8dcae602b42c71e8',
  'model:opening:2': 'bbc3d84cd417943f',
  'model:opening:3': '21eda078c6b26739',
  'model:opening:4': 'bbc3d84cd417943f',
  'model:opening:5': 'd787789e959fb9d4',
  'model:hospital:0': '0c06596abea9b49a',
  'model:hospital:1': '8825a1b6f220b9c3',
  'model:hospital:2': '551d7ee33d8ae4da',
  'model:hospital:3': '215f9a00b6a19ca5',
  'model:hospital:4': '1afcf06c8781c6d4',
  'model:hospital:5': '59f143028fe76520',
  'model:dishes:0': '5bac60f27cb0bafd',
  'model:dishes:1': '20d88a8be8bea1a6',
  'model:dishes:2': '551d7ee33d8ae4da',
  'model:dishes:3': '421323abdaf1b072',
  'model:dishes:4': '23948d7c54784fd4',
  'model:dishes:5': '0c06596abea9b49a',
  'model:laughTrouble:0': '551d7ee33d8ae4da',
  'model:laughTrouble:1': '75d68478443a5b04',
  'model:laughTrouble:2': '0c06596abea9b49a',
  'model:laughTrouble:3': '96c4b73276b3fc48',
  'model:laughTrouble:4': '555d637288150473',
  'model:laughTrouble:5': '555d637288150473',
  'model:laughLight:0': '0891acd3bc17339e',
  'model:laughLight:1': '6d43894db4b3c803',
  'model:laughLight:2': '714245ae06a7143c',
  'model:laughLight:3': '38dfe499eedbc7ef',
  'model:laughLight:4': 'bcfa6249694fb8dc',
  'model:laughLight:5': '800805e28ba42b05',
  'model:fence:0': '555d637288150473',
  'model:fence:1': 'e8e6c55d2a56c4cf',
  'model:fence:2': 'b9795adaed764733',
  'model:fence:3': '3e650afa109fb288',
  'model:fence:4': '225b3a22d56df1f2',
  'model:fence:5': '75d68478443a5b04',
  'model:ack:0': '39fa1324715552f9',
  'model:ack:1': '555d637288150473',
  'model:ack:2': '35b7fbf8b9683b6b',
  'model:ack:3': '555d637288150473',
  'model:ack:4': '5bac60f27cb0bafd',
  'model:ack:5': '555d637288150473',
  'model:request:0': '5bac60f27cb0bafd',
  'model:request:1': '4dcfda8b49b946d2',
  'model:request:2': 'b0b6569d7990a235',
  'model:request:3': '20d88a8be8bea1a6',
  'model:request:4': '9358b1b08aec1f82',
  'model:request:5': '5bac60f27cb0bafd',
  'dice:opening:0': '640bce89df90ffdb',
  'dice:opening:1': '254423594a918cd9',
  'dice:opening:2': '6715cde3d0b8b745',
  'dice:opening:3': '55b242a6f5cfafe4',
  'dice:opening:4': '6f4d274ae4d4abcd',
  'dice:opening:5': '70bc146a06fa50bb',
  'dice:hospital:0': '48deb4427cc37ee4',
  'dice:hospital:1': 'd53ad87d5fe31c7f',
  'dice:hospital:2': '4dfbcaf7ce8848fd',
  'dice:hospital:3': '50867c397fe22bc6',
  'dice:hospital:4': '93503580694dff92',
  'dice:hospital:5': '50867c397fe22bc6',
  'dice:dishes:0': '8ce9fe9296344603',
  'dice:dishes:1': 'a46ccd08b0796e8e',
  'dice:dishes:2': '288b4a819af33650',
  'dice:dishes:3': '676a3a726c550328',
  'dice:dishes:4': '61e4f1fdf03b0302',
  'dice:dishes:5': '50867c397fe22bc6',
  'dice:laughTrouble:0': 'eafdd8969ddad1f2',
  'dice:laughTrouble:1': '5ece9a52affedd9e',
  'dice:laughTrouble:2': '50867c397fe22bc6',
  'dice:laughTrouble:3': 'a46ccd08b0796e8e',
  'dice:laughTrouble:4': '288b4a819af33650',
  'dice:laughTrouble:5': '4b1172b646ebc8b3',
  'dice:laughLight:0': '459ec57a7e631b20',
  'dice:laughLight:1': '21d2d00cf33d8744',
  'dice:laughLight:2': '29ae2b54ef55bfd9',
  'dice:laughLight:3': '4baee5fcdb531700',
  'dice:laughLight:4': 'c14cf2bd2ee09b26',
  'dice:laughLight:5': '21d2d00cf33d8744',
  'dice:fence:0': '288b4a819af33650',
  'dice:fence:1': '50867c397fe22bc6',
  'dice:fence:2': '1d14436c818ea435',
  'dice:fence:3': '0285aabaa66ef575',
  'dice:fence:4': 'eafdd8969ddad1f2',
  'dice:fence:5': '865e6b10e6f54007',
  'dice:ack:0': '05ec7a98062e023d',
  'dice:ack:1': '05ec7a98062e023d',
  'dice:ack:2': '5cbf81032f917e53',
  'dice:ack:3': 'a894256c6081d058',
  'dice:ack:4': 'eafdd8969ddad1f2',
  'dice:ack:5': '288b4a819af33650',
  'dice:request:0': 'a1b5d09b13023ff3',
  'dice:request:1': '93503580694dff92',
  'dice:request:2': 'cf65b468fa160d71',
  'dice:request:3': '8163454abb970fd9',
  'dice:request:4': 'a1b5d09b13023ff3',
  'dice:request:5': 'ef9e2d64540503cf',
  'request:opening': '6ee1fe8eacd556cb',
  'request:hospital': '50f7e78498ca6a6b',
  'request:dishes': '617d208e487a60b0',
  'request:laughTrouble': '532e47b6559ae321',
  'request:laughLight': 'f4756f3812c0dd06',
  'request:fence': '89233209adad80e2',
  'request:ack': '25d548b98270752e',
  'request:request': 'a0a854fa4ce60df1',
  ledger: '969858475dd1023e',
  'recall:opening': 'b3e7205e818a3418',
  'recall:fence': 'b3e7205e818a3418',
  'character:ferni': '697b379e7adc2788',
  'character:peter-john': 'e8f1cef9957aa617',
  'character:maya-santos': 'f5c43cb55d293f43',
  'character:alex-chen': '5198aec44e53e80c',
};

describe('TROUBLES_TALK off', () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of TOUCHED) saved[k] = process.env[k];
    for (const k of TOUCHED) delete process.env[k];
    Object.assign(process.env, PROD_LIKE);
    // withTurnReminder seeds each call with Math.random.
    vi.spyOn(Math, 'random').mockReturnValue(0.4242);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('builds the same prompts as before the flag, unset or off', async () => {
    const unset = Object.fromEntries(Object.entries(await prompts()).map(([k, v]) => [k, sha(v)]));
    if (process.env.PRINT_TROUBLES_BASELINE) console.log(JSON.stringify(unset, null, 2));
    process.env.TROUBLES_TALK = 'off';
    const off = Object.fromEntries(Object.entries(await prompts()).map(([k, v]) => [k, sha(v)]));
    delete process.env.TROUBLES_TALK;
    expect(Object.keys(unset).length).toBeGreaterThan(100);
    expect(off).toEqual(unset);
    expect(unset).toEqual(BASELINE);
  });
});
