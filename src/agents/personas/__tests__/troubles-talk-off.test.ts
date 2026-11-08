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
 * seventies, Ferni without pets); and the dice and model reminders re-taken when
 * THINK_ALOUD and CURIOUS_DETAIL became permanent (flag promotion, 2026-10-31).
 * Every other key is as taken.
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
    out[`request:${name}`] = last(
      withTurnReminder(c, { userData: { services: { sessionId: 'troubles-off' } } })
    );
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
  'model:opening:0': 'ff507ad15344ea27',
  'model:opening:1': '5ce8563c8613e7f9',
  'model:opening:2': '2f541046a327760c',
  'model:opening:3': '823ec1e7f245e69e',
  'model:opening:4': '2f541046a327760c',
  'model:opening:5': '0ebc990f2528d47b',
  'model:hospital:0': '0c06596abea9b49a',
  'model:hospital:1': 'ec2d25ca87e18b70',
  'model:hospital:2': '616fcb6de5127d1b',
  'model:hospital:3': 'ad36a6dae885b3a6',
  'model:hospital:4': '3e650afa109fb288',
  'model:hospital:5': '035568f3b895eb3e',
  'model:dishes:0': '5bac60f27cb0bafd',
  'model:dishes:1': '555d637288150473',
  'model:dishes:2': '0c06596abea9b49a',
  'model:dishes:3': 'a02ef6a8f742dbc1',
  'model:dishes:4': '3a211029749f1384',
  'model:dishes:5': '0c06596abea9b49a',
  'model:laughTrouble:0': '551d7ee33d8ae4da',
  'model:laughTrouble:1': '5bac60f27cb0bafd',
  'model:laughTrouble:2': '0c06596abea9b49a',
  'model:laughTrouble:3': 'c6535f52f162365a',
  'model:laughTrouble:4': '555d637288150473',
  'model:laughTrouble:5': '555d637288150473',
  'model:laughLight:0': '159878ef8024dc36',
  'model:laughLight:1': '6d43894db4b3c803',
  'model:laughLight:2': 'f8f83496b65fad0f',
  'model:laughLight:3': '913fbc52c0a916f1',
  'model:laughLight:4': 'bcfa6249694fb8dc',
  'model:laughLight:5': 'fbfe8ee058b40a54',
  'model:fence:0': '1afcf06c8781c6d4',
  'model:fence:1': '315ac6493d18c6d8',
  'model:fence:2': '470ea53e38c4f158',
  'model:fence:3': '20d88a8be8bea1a6',
  'model:fence:4': 'f45e07e0f8830bfc',
  'model:fence:5': 'cc82e2d68bb8d2c3',
  'model:ack:0': '97d9be55468b7250',
  'model:ack:1': '555d637288150473',
  'model:ack:2': '35b7fbf8b9683b6b',
  'model:ack:3': '555d637288150473',
  'model:ack:4': '5bac60f27cb0bafd',
  'model:ack:5': '555d637288150473',
  'model:request:0': '5bac60f27cb0bafd',
  'model:request:1': '93e08ada79e38b5e',
  'model:request:2': '80ed4320d48ef5f0',
  'model:request:3': 'f45e07e0f8830bfc',
  'model:request:4': '5626d33d00cf0d56',
  'model:request:5': '2ef012d1bc63931c',
  'dice:opening:0': '287df32556720fed',
  'dice:opening:1': '6f390c1ba278015a',
  'dice:opening:2': 'e374e7b60cf03c22',
  'dice:opening:3': 'd764beda0586f106',
  'dice:opening:4': '661967cfaa38233b',
  'dice:opening:5': '471e598d23d16d0d',
  'dice:hospital:0': '48deb4427cc37ee4',
  'dice:hospital:1': 'f095a947a118e8fe',
  'dice:hospital:2': 'e43add22dd7a70c6',
  'dice:hospital:3': '50867c397fe22bc6',
  'dice:hospital:4': '17f4841b1634191c',
  'dice:hospital:5': '50867c397fe22bc6',
  'dice:dishes:0': '5c8374f47837160b',
  'dice:dishes:1': 'a46ccd08b0796e8e',
  'dice:dishes:2': '288b4a819af33650',
  'dice:dishes:3': 'ab72bd58ebc0f215',
  'dice:dishes:4': '61e4f1fdf03b0302',
  'dice:dishes:5': '50867c397fe22bc6',
  'dice:laughTrouble:0': 'eafdd8969ddad1f2',
  'dice:laughTrouble:1': 'b76a60a700b1276b',
  'dice:laughTrouble:2': '50867c397fe22bc6',
  'dice:laughTrouble:3': 'cf65b468fa160d71',
  'dice:laughTrouble:4': '288b4a819af33650',
  'dice:laughTrouble:5': '4b1172b646ebc8b3',
  'dice:laughLight:0': '784009ef42c62da2',
  'dice:laughLight:1': '21d2d00cf33d8744',
  'dice:laughLight:2': '3ed45f4bb5277296',
  'dice:laughLight:3': '4baee5fcdb531700',
  'dice:laughLight:4': 'c14cf2bd2ee09b26',
  'dice:laughLight:5': '21d2d00cf33d8744',
  'dice:fence:0': '288b4a819af33650',
  'dice:fence:1': '50867c397fe22bc6',
  'dice:fence:2': '7687cba273b5e6dc',
  'dice:fence:3': 'eafdd8969ddad1f2',
  'dice:fence:4': 'eafdd8969ddad1f2',
  'dice:fence:5': '6ed42e0ab0ace51b',
  'dice:ack:0': '05ec7a98062e023d',
  'dice:ack:1': '05ec7a98062e023d',
  'dice:ack:2': '5cbf81032f917e53',
  'dice:ack:3': 'a894256c6081d058',
  'dice:ack:4': 'eafdd8969ddad1f2',
  'dice:ack:5': '288b4a819af33650',
  'dice:request:0': '9fdbcebe41c0d34e',
  'dice:request:1': 'f8c72c15589bad22',
  'dice:request:2': 'c14eace7e399a66a',
  'dice:request:3': 'cf65b468fa160d71',
  'dice:request:4': 'af849764ee502c8a',
  'dice:request:5': '0c3d018bbfe147fa',
  'request:opening': 'd0e2c2c29f5c694b',
  'request:hospital': '50f7e78498ca6a6b',
  'request:dishes': 'e18aefab5e9454d6',
  'request:laughTrouble': '50818c8620da247e',
  'request:laughLight': 'ff6e278565f83714',
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
