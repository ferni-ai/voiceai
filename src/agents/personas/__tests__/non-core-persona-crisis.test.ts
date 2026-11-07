/**
 * Marketplace P0 (docs/plans/2026-11-07-marketplace-return.md, rule 1): the per-turn crisis gate
 * treats a caller the same whichever persona is on the call, on every path: the pattern script,
 * pattern guidance, and a classifier escalation of a line the patterns pass. The classifier stub
 * reads each fixture line by its label (block = imminent). The model echoes its request minus the
 * turn reminder, which names the persona by design. "test-companion" is a fictional non-core id.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { CRISIS_HELDOUT } from '../../__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../__tests__/fixtures/crisis-test-blind.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';
import { withTurnReminder } from '../turn-request.js';
import { withTurnStyleReminder } from '../turn-style.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const MODES = ['patterns only', 'patterns+classifier'];
type Line = { text: string; label: string };
const has988 = (s: string) => /\b988\b/.test(s);
let call = 0;
/** A fresh call each time, so no call's crisis memory reaches another. */
const userData = (personaId: string) => ({ personaId, services: { sessionId: `p0-${++call}` } });

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are a companion.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

/** The request as text minus the turn reminder: part 1 of the caller's message, after their words
 * and before any crisis guidance. Every reminder carries the team line; any other part 1 throws. */
function withoutTurnReminder(ctx: llm.ChatContext): string {
  const items = ctx.items as llm.ChatMessage[];
  const last = items.map((m) => m.role).lastIndexOf('user');
  const parts = items[last]?.content ?? [];
  if (parts.length > 1 && !/teammate/.test(String(parts[1]))) throw new Error('no turn reminder');
  const text = (m: llm.ChatMessage, i: number) => m.content.filter((_, j) => i !== last || j !== 1);
  return items.map((m, i) => `${m.role}: ${text(m, i).join('')}`).join('\n');
}

/** What the caller hears, each request the model got (reminder out), and classifier reads. */
async function heard(line: Line, personaId: string, env: Record<string, string>) {
  resetCrisisClassifierCache();
  const sent: string[] = [];
  const model = vi.fn(async (ctx: llm.ChatContext) => {
    sent.push(withoutTurnReminder(ctx));
    return new ReadableStream<unknown>({ start: (c) => (c.enqueue(sent.at(-1)), c.close()) });
  });
  const risk = line.label === 'block' ? 'imminent' : line.label;
  const generate = vi.fn(async () => `{"risk":"${risk}","subject":"self"}`);
  const opener = { wrap: (s: unknown) => s } as never;
  const [ask, session] = [request(line.text), { userData: userData(personaId) }];
  const stream = await gatedReply(ask, session, model as never, opener, { env, generate });
  const out: unknown[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out.push(chunk);
  return { reply: out.join(''), sent, reads: generate.mock.calls.length };
}

const action = (text: string) =>
  startCrisisGate(request(text), userData('ferni'), { env: PATTERNS_ONLY })?.decision.action;
const risky = [...CRISIS_TEST_BLIND, ...CRISIS_HELDOUT].filter((c) => c.label !== 'none');
const pick = (n: number, act: string, label?: string) =>
  risky.filter((c) => action(c.text) === act && (!label || c.label === label)).slice(0, n);
const BUCKETS: Record<string, Line[]> = {
  replace: pick(6, 'replace'),
  guide: pick(6, 'guide'),
  'classifier-only': [...pick(3, 'pass', 'block'), ...pick(3, 'pass', 'crisis')],
  ordinary: [{ text: 'what should I cook tonight?', label: 'none' }],
};

describe('crisis gate with a non-core persona', () => {
  it('withoutTurnReminder strips the turn reminder and nothing else', () => {
    const ask = request('I feel low');
    const guided = withTurnStyleReminder(withTurnReminder(ask, { userData: userData('x') }), 'G');
    expect((guided.items.at(-1) as llm.ChatMessage).content).toHaveLength(3);
    expect(withoutTurnReminder(guided)).toBe(
      'system: You are a companion.\nuser: I feel low\n\n(G)'
    );
    expect(withoutTurnReminder(ask)).toBe('system: You are a companion.\nuser: I feel low');
    expect(() => withoutTurnReminder(withTurnStyleReminder(ask, 'G'))).toThrow('no turn reminder');
  });

  it('has >=5 lines per path, each reaching its stage, with 988 for core', async () => {
    for (const [bucket, act] of [['replace'], ['guide'], ['classifier-only', 'pass']]) {
      expect(BUCKETS[bucket].length, bucket).toBeGreaterThanOrEqual(5);
      for (const l of BUCKETS[bucket]) expect(action(l.text), l.text).toBe(act ?? bucket);
    }
    const passed = BUCKETS['classifier-only'].map((l) => l.text).join(' ');
    expect(passed).toMatch(/rope.*oxys.*whole bottle/s);
    for (const [bucket, lines] of Object.entries(BUCKETS)) {
      for (const l of lines) {
        const core = await heard(l, 'ferni', LIVE); // eslint-disable-line no-await-in-loop
        expect(has988(core.reply), l.text).toBe(l.label !== 'none');
        if (bucket === 'classifier-only') expect(core.reads, l.text).toBeGreaterThan(0);
        if (bucket === 'ordinary') expect(core.reply).toContain(l.text);
      }
    }
  });

  const cases = MODES.flatMap((m) => Object.keys(BUCKETS).map((b) => [m, b]));
  it.each(cases)('%s, %s lines: same 988, model calls and guidance as core', async (mode, b) => {
    const env = mode === 'patterns only' ? PATTERNS_ONLY : LIVE;
    for (const line of BUCKETS[b]) {
      // One at a time: each call resets the shared classifier cache.
      const core = await heard(line, 'ferni', env); // eslint-disable-line no-await-in-loop
      const other = await heard(line, 'test-companion', env); // eslint-disable-line no-await-in-loop
      expect(has988(other.reply), line.text).toBe(has988(core.reply)); // (a) the 988 line
      expect(other.sent.length, line.text).toBe(core.sent.length); // (b) model calls
      expect(other.sent, line.text).toEqual(core.sent); // (c) guidance and system text
      expect(other.reply, line.text).toBe(core.reply);
    }
  });
});
