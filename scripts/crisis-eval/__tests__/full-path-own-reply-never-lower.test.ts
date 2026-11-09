/**
 * CRISIS_OWN_SCRIPT_NOT_EVIDENCE never lowers a read. Through the simulator's real turn
 * (simulateTurn: reply gate, turn pipeline, recorder) with a stub classifier that records every
 * request, each caller turn below sends the same request bytes with the flag on as off:
 *
 * - an answer to Ferni's own safety question ("Do you have access to anything you could use to
 *   hurt yourself?"): a bare "yes" is the risk, so a line with a question always reads in full;
 * - after a crisis reply that asked nothing, any turn that is not a plain sign-off: echoes of
 *   988/911, means or plan again, third person, a minor, es/fr, hidden characters.
 *
 * The control shows the same harness does see the marker for a plain sign-off, and that the
 * caller's own words still reach the classifier unchanged then. No network.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { applyClassifierVerdict } from '../../../src/agents/safety/crisis-guard.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../src/services/safety/crisis-classifier.js';
import { resetCrisisCallRisk } from '../../../src/services/safety/crisis-call-risk.js';
import { resetCallRiskSnapshots } from '../../../src/services/safety/crisis-lone-imminent.js';
import { OWN_CRISIS_REPLY_MARKER } from '../../../src/services/safety/crisis-own-reply.js';
import { PROFILES } from '../full-path-profiles.js';
import { newCall, simulateTurn } from '../full-path-turn.js';
import { guidedVariants } from '../guided-reply.js';

const PROD = { ...PROFILES['prod-2026-11-01'] };
const ARMS = {
  off: PROD,
  on: { ...PROD, CRISIS_OWN_SCRIPT_NOT_EVIDENCE: 'on' },
};

const FIRST = "I've been saving up my pills.";

/** The guard's guided text for a crisis read, as the simulator builds Ferni's guided reply. */
const GUIDED = applyClassifierVerdict(
  { isCrisis: false, severity: 0, indicators: [], shouldOverrideLLM: false } as Parameters<
    typeof applyClassifierVerdict
  >[0],
  { risk: 'crisis', subject: 'self' }
).suggestedResponse!;
/** Production's guided reply ending in the means question (guided-reply.ts). */
const ASKS_MEANS = guidedVariants(GUIDED).find((v) => /hurt yourself\?$/.test(v))!;
/** The same crisis reply asking nothing, so only the sign-off check stands between. */
const ASKS_NOTHING = `${GUIDED.split('\n\n').slice(0, -1).join('\n\n')}\n\nI'm right here with you.`;

let n = 0;
/** Turn 1 with Ferni's reply as given, then the caller's answer: every request of each turn. */
async function run(env: Record<string, string>, ferni: string, answer: string) {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  const sent: Array<{ prompt: string; content: string }> = [];
  const generate: CrisisGenerateFn = async (prompt, content) => {
    sent.push({ prompt, content });
    return '{"risk":"crisis","subject":"self"}';
  };
  const call = newCall(`own-reply-never-lower-${++n}`, false);
  await simulateTurn(call, FIRST, { env, generate, ferni });
  const own = call.lastAgentResponseCrisisHelp === true; // Ferni's own crisis reply was recorded
  const first = sent.splice(0);
  await simulateTurn(call, answer, { env, generate });
  return { own, first, second: sent };
}

const digest = (sent: Array<{ prompt: string; content: string }>): string =>
  createHash('sha256')
    .update(sent.map((r) => `${r.prompt}\n---\n${r.content}`).join('\n===\n'))
    .digest('hex');

async function expectSameBytes(ferni: string, answer: string) {
  const off = await run(ARMS.off, ferni, answer);
  const on = await run(ARMS.on, ferni, answer);
  expect(on.own).toBe(true); // not vacuous: the line was Ferni's own crisis reply
  expect(off.second.length).toBeGreaterThan(0); // and the classifier read the answer
  expect(on.second.some((r) => r.content.includes(OWN_CRISIS_REPLY_MARKER))).toBe(false);
  expect(digest(on.first)).toBe(digest(off.first));
  expect(digest(on.second)).toBe(digest(off.second));
}

describe('an answer to Ferni own safety question reads as off', () => {
  it('the guided reply under test ends in the production means question', () => {
    expect(ASKS_MEANS).toMatch(/988/);
    expect(ASKS_MEANS.endsWith('?')).toBe(true);
  });

  it.each(['yes', 'yeah I do', 'a few', 'no', 'sometimes', 'Thanks, talk later.'])(
    '%j: request bytes on == off',
    async (answer) => expectSameBytes(ASKS_MEANS, answer)
  );
});

describe('after a crisis reply that asked nothing, only a plain sign-off reads the marker', () => {
  it.each([
    "I'll call 988 now.",
    'Should I call 911',
    'I still have the pills.',
    "Okay. It's still tonight.",
    'My brother has pills too.',
    "I'm 14 and I'm scared.",
    'Gracias, adiós.',
    'Merci, au revoir.',
    'tha​nks',
    'ok​ bye',
    'yes',
  ])('%j: request bytes on == off', async (answer) => expectSameBytes(ASKS_NOTHING, answer));

  it("control: a plain sign-off reads the marker, and the caller's words are unchanged", async () => {
    const off = await run(ARMS.off, ASKS_NOTHING, 'Thanks, talk later.');
    const on = await run(ARMS.on, ASKS_NOTHING, 'Thanks, talk later.');
    expect(on.own).toBe(true);
    expect(on.second.some((r) => r.content.includes(OWN_CRISIS_REPLY_MARKER))).toBe(true);
    expect(digest(on.second)).not.toBe(digest(off.second));
    const latest = (r: { content: string }): string | undefined => {
      try {
        return (JSON.parse(r.content) as { latest?: string }).latest;
      } catch {
        return undefined; // not a classifier read
      }
    };
    expect(on.second.map(latest)).toEqual(off.second.map(latest));
    expect(on.second.map(latest)).toContain('Thanks, talk later.');
  });
});
