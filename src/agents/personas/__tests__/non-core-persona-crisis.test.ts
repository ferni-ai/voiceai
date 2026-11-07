/**
 * Marketplace P0 (docs/plans/2026-11-07-marketplace-return.md, rule 1): the per-turn crisis gate
 * answers a caller the same way whichever persona is on the call. "test-companion" is a
 * fictional id outside the core six; every crisis line gets the core persona's exact bytes.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { riskCorpus } from '../../../services/wellbeing-tracking/__tests__/crisis-corpus.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ORDINARY = 'what should I cook tonight?';
let call = 0;

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are a companion.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

/** The persona's userData for a fresh call, so no call's crisis memory reaches another. */
const userData = (personaId: string) => ({ personaId, services: { sessionId: `p0-${++call}` } });

/** What the caller would hear, plus every word the model was asked with (it echoes them). */
async function heard(text: string, personaId: string, env: Record<string, string>) {
  resetCrisisClassifierCache();
  const model = vi.fn(async (ctx: llm.ChatContext) => {
    const said = ctx.items.map((item) => (item as llm.ChatMessage).textContent ?? '').join('\n');
    return new ReadableStream<unknown>({
      start: (c) => {
        c.enqueue(said);
        c.close();
      },
    });
  });
  const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
  const stream = await gatedReply(
    request(text),
    { userData: userData(personaId) },
    model as never,
    opener as never,
    { env, generate: async () => '{"risk":"crisis","subject":"self"}' }
  );
  const out: unknown[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out.push(chunk);
  return out.join('');
}

/** Corpus lines the patterns alone don't pass, in corpus order. */
const crisisLines = riskCorpus()
  .filter(
    (line) =>
      startCrisisGate(request(line), userData('ferni'), { env: PATTERNS_ONLY })?.decision.action !==
      'pass'
  )
  .slice(0, 12);

describe('crisis gate with a non-core persona', () => {
  it('has at least 10 corpus lines the gate acts on, and some get the 988 script', async () => {
    expect(crisisLines.length).toBeGreaterThanOrEqual(10);
    const scripts = await Promise.all(
      crisisLines.map((line) => heard(line, 'ferni', PATTERNS_ONLY))
    );
    expect(scripts.filter((s) => s.includes('988')).length).toBeGreaterThan(0);
  });

  it.each([
    ['patterns only', PATTERNS_ONLY],
    ['patterns + classifier', LIVE],
  ])(
    'says byte-for-byte what a core persona says on every crisis line (%s)',
    async (_mode, env) => {
      for (const line of crisisLines) {
        // One call at a time: each resets the shared classifier cache.
        // eslint-disable-next-line no-await-in-loop
        const core = await heard(line, 'ferni', env);
        // eslint-disable-next-line no-await-in-loop
        expect(await heard(line, 'test-companion', env), line).toBe(core);
      }
    }
  );

  it('passes an ordinary line to the model with the same gate decision for both personas', async () => {
    // The model request itself differs: the per-turn reminder names teammates and style per persona.
    const decision = (personaId: string) =>
      JSON.stringify(
        startCrisisGate(request(ORDINARY), userData(personaId), { env: PATTERNS_ONLY })
      );
    expect(decision('ferni')).toContain('"action":"pass"');
    expect(decision('test-companion')).toBe(decision('ferni'));
    const said = [
      await heard(ORDINARY, 'ferni', PATTERNS_ONLY),
      await heard(ORDINARY, 'test-companion', PATTERNS_ONLY),
    ];
    for (const words of said) {
      expect(words).toContain(ORDINARY);
      expect(words).not.toContain('988');
    }
  });
});
