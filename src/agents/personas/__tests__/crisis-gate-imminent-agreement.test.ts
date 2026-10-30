/**
 * CRISIS_IMMINENT_NEEDS_AGREEMENT through the real reply gate and classifier:
 * a benign line cut mid-sentence that only the everyday-rules read calls
 * imminent, then the caller's plain goodbye, got the 911 script twice (dev,
 * synthetic eval call). With the flag on both turns get crisis guidance that
 * names 988; real risk keeps the script.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  CRISIS_EVERYDAY_RULES,
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetImminentAgreement } from '../../../services/safety/crisis-imminent-agreement.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { startCrisisGate, type CrisisGateDecision } from '../crisis-gate.js';

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
};
const OFF = { ...BASE, CRISIS_IMMINENT_NEEDS_AGREEMENT: 'off' };
const ON = { ...BASE, CRISIS_IMMINENT_NEEDS_AGREEMENT: 'on' };
/** The prod-like set: agreement gate on too. */
const ON_AGREEMENT = { ...ON, CRISIS_AGREEMENT_GATE: 'on' };

type Risk = 'imminent' | 'crisis' | 'none';
const reply = (risk: Risk) => JSON.stringify({ risk, subject: 'self' });

/** Per caller line: [read with the everyday rules, read without]. Anything else reads none. */
function classifier(reads: Record<string, [Risk, Risk]>): CrisisGenerateFn {
  return async (prompt, content) => {
    const latest = (JSON.parse(content) as { latest: string }).latest;
    const [ruled, plain] = reads[latest] ?? ['none', 'none'];
    return reply(prompt.includes(CRISIS_EVERYDAY_RULES.trim()) ? ruled : plain);
  };
}

const EARLIER = [
  'Who on your team is good with money stuff?',
  'And who would help me plan a trip?',
];
const FRAGMENT = 'Okay, final question. Tell me her name and the last thing she';
const GOODBYE = 'Great, thanks. Bye for now.';

let calls = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetImminentAgreement();
  calls++;
});

/** What the gate decides for each caller line, in order; Ferni's reply is the gate's text. */
async function call(
  lines: string[],
  generate: CrisisGenerateFn,
  env: Record<string, string>
): Promise<CrisisGateDecision[]> {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  const out: CrisisGateDecision[] = [];
  for (const line of lines) {
    ctx.addMessage({ role: 'user', content: line });
    const gate = startCrisisGate(
      ctx.copy(),
      { services: { sessionId: `call-${calls}` } },
      {
        env,
        generate,
      }
    );
    const decision = (await gate?.escalation) ?? gate?.decision ?? { action: 'pass' };
    out.push(decision);
    const said = decision.action === 'replace' ? decision.script : 'Sure, happy to help.';
    ctx.addMessage({ role: 'assistant', content: said });
  }
  return out;
}

const INCIDENT = classifier({ [FRAGMENT]: ['imminent', 'none'], [GOODBYE]: ['none', 'imminent'] });

describe('the dev false alarm: a fragment, then a goodbye', () => {
  it('flag off: the 911 script on both turns, as on main', async () => {
    const out = await call([...EARLIER, FRAGMENT, GOODBYE], INCIDENT, OFF);
    expect(out.map((d) => d.action)).toEqual(['pass', 'pass', 'replace', 'replace']);
    expect(out[2]?.action === 'replace' && out[2].script).toMatch(/911/);
  });

  it.each([
    ['flag on', ON],
    ['flag on with the agreement gate', ON_AGREEMENT],
  ])('%s: crisis guidance that names 988, never the script', async (_name, env) => {
    const out = await call([...EARLIER, FRAGMENT, GOODBYE], INCIDENT, env);
    expect(out.map((d) => d.action)).toEqual(['pass', 'pass', 'guide', 'guide']);
    for (const d of out.slice(2)) {
      expect(d.action === 'guide' && d.guidance).toMatch(/988/);
    }
  });
});

describe('flag on: real risk keeps the script', () => {
  it.each([
    ['a pattern match', 'I want to kill myself.'],
    ['both reads imminent', "I have the pills counted out and I'm taking them all tonight."],
    [
      'both reads imminent, arranging care',
      "Ask my brother to take the dog tonight. I won't be around.",
    ],
  ])('%s', async (_name, line) => {
    const generate = classifier({ [line]: ['imminent', 'imminent'] });
    const out = await call([...EARLIER, line], generate, ON);
    expect(out.at(-1)?.action).toBe('replace');
  });

  it('quiet preparation only the plain read calls imminent', async () => {
    const line = "Can you text my sister to feed the cats tomorrow? I won't be around.";
    const out = await call([...EARLIER, line], classifier({ [line]: ['none', 'imminent'] }), ON);
    expect(out.at(-1)?.action).toBe('replace');
  });

  it('a split goodbye after risk the reads agreed on earlier in the call', async () => {
    const risky = 'Honestly nothing matters anymore.';
    const generate = classifier({ [risky]: ['crisis', 'crisis'], [GOODBYE]: ['none', 'imminent'] });
    const out = await call([...EARLIER, risky, GOODBYE], generate, ON);
    expect(out.map((d) => d.action)).toEqual(['pass', 'pass', 'guide', 'replace']);
  });

  it('a split goodbye after a line the patterns blocked', async () => {
    const blocked = "I'm going to kill myself tonight.";
    const out = await call([...EARLIER, blocked, GOODBYE], INCIDENT, ON);
    expect(out.map((d) => d.action)).toEqual(['pass', 'pass', 'replace', 'replace']);
  });
});
