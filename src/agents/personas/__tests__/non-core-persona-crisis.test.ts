/**
 * Marketplace P0 (docs/plans/2026-11-07-marketplace-return.md, rule 1): the per-turn crisis gate
 * treats a caller the same whichever persona is on the call, on every path: the pattern script,
 * pattern guidance, and a classifier escalation of a line the patterns pass. The classifier stub
 * reads each fixture line by its label (block = imminent). The model echoes its whole request,
 * turn reminder included, minus only the persona's own identity and team sentences, taken from the
 * production code that writes them. "test-companion" is a fictional non-core id.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';
import { teamStatusNote, unlockViewFor } from '../../../tools/handoff/locked-teammates.js';
import { CRISIS_HELDOUT } from '../../__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../__tests__/fixtures/crisis-test-blind.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';
import { teammateIdentityNote } from '../teammate-identity.js';
import { withTurnReminder } from '../turn-request.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const MODES = ['patterns only', 'patterns+classifier'];
const NON_CORE = 'test-companion';
type Line = { text: string; label: string };
const has988 = (s: string) => /\b988\b/.test(s);
let call = 0;
/** A fresh call each time, so no call's crisis memory reaches another. */
const userData = (personaId: string) => ({ personaId, services: { sessionId: `p0-${++call}` } });
/** Both personas draw the same per-call style (callSeed in turn-request-style.ts is Math.random). */
async function sameDice<T>(run: () => T | Promise<T>): Promise<T> {
  const dice = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    return await run();
  } finally {
    dice.mockRestore();
  }
}

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are a companion.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

/** The persona's own reminder sentences, as production writes them: who is speaking
 * (teammate-identity.ts, both script-free forms) and who this caller can reach (locked-teammates.ts). */
function identitySentences(personaId: string, words: string): string[] {
  const view = unlockViewFor({ personaId });
  const who = [false, true].map((plain) => teammateIdentityNote(personaId, process.env, plain));
  return [...new Set([...who, teamStatusNote(view, words)])].filter(Boolean);
}

/** The reminder minus exactly those sentences, each with the one space that joined it. */
function withoutIdentity(reminder: string, personaId: string, words: string): string {
  let out = reminder;
  for (const s of identitySentences(personaId, words)) {
    const cut = [`${s} `, ` ${s}`, s].find((c) => out.includes(c));
    if (cut) out = out.slice(0, out.indexOf(cut)) + out.slice(out.indexOf(cut) + cut.length);
  }
  return out;
}

/** What the caller hears, each request the model got (identity out), raw reminders, classifier reads,
 * and per request: how many identity sentences were cut, and any other bytes the cut removed. */
async function heard(line: Line, personaId: string, env: Record<string, string>) {
  resetCrisisClassifierCache();
  const [sent, reminders]: string[][] = [[], []];
  const [found, extra]: number[][] = [[], []];
  const model = vi.fn(async (ctx: llm.ChatContext) => {
    const items = ctx.items as llm.ChatMessage[];
    const last = items.map((m) => m.role).lastIndexOf('user');
    const reminder = String(items[last].content[1]);
    if (!reminder.includes(teamStatusNote(unlockViewFor({ personaId }), line.text)))
      throw new Error('no turn reminder');
    reminders.push(reminder);
    const part = (p: unknown, i: number, j: number) =>
      i === last && j === 1 ? withoutIdentity(reminder, personaId, line.text) : String(p);
    const text = items
      .map((m, i) => `${m.role}: ${m.content.map((p, j) => part(p, i, j)).join('|')}`)
      .join('\n');
    sent.push(text);
    const raw = items.map((m) => `${m.role}: ${m.content.map(String).join('|')}`).join('\n');
    const cut = identitySentences(personaId, line.text).filter((s) => reminder.includes(s));
    found.push(cut.length);
    extra.push(raw.length - text.length - cut.reduce((n, s) => n + s.length + 1, 0));
    return new ReadableStream<unknown>({ start: (c) => (c.enqueue(text), c.close()) });
  });
  const risk = line.label === 'block' ? 'imminent' : line.label;
  const generate = vi.fn(async () => `{"risk":"${risk}","subject":"self"}`);
  const opener = { wrap: (s: unknown) => s } as never;
  const [ask, session] = [request(line.text), { userData: userData(personaId) }];
  const reply = await sameDice(async () => {
    const stream = await gatedReply(ask, session, model as never, opener, { env, generate });
    const out: unknown[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<unknown>) out.push(chunk);
    return out.join('');
  });
  return { reply, sent, reminders, found, extra, reads: generate.mock.calls.length };
}

/** How often each crisis word appears in `text`, by whole word, any case. */
const CRISIS_WORDS = ['988', 'hotline', 'hotlines', 'lifeline', 'crisis', 'emergency'];
const crisisWords = (text: string) => {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return CRISIS_WORDS.map((w) => words.filter((x) => x === w).length);
};

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
  it('withoutIdentity strips exactly the production identity and team sentences', async () => {
    const words = 'I feel low';
    const reminder = (id: string) =>
      sameDice(() =>
        withTurnReminder(request(words), { userData: userData(id) }).items.at(-1)
      ).then((m) => String((m as llm.ChatMessage).content[1]));
    const [core, other] = [await reminder('ferni'), await reminder(NON_CORE)];
    expect(other).not.toBe(core); // the persona's sentences differ before removal
    const cut = identitySentences(NON_CORE, words).filter((s) => other.includes(s));
    expect(cut.length).toBe(2); // who is speaking + who they can reach
    const stripped = withoutIdentity(other, NON_CORE, words);
    expect(other.length - stripped.length).toBe(cut.reduce((n, s) => n + s.length + 1, 0));
    expect(stripped).toBe(withoutIdentity(core, 'ferni', words));
    expect(withoutIdentity(`${other} Keep it short.`, NON_CORE, words)).toBe(
      `${stripped} Keep it short.`
    );
    expect(withoutIdentity('Keep it short.', NON_CORE, words)).toBe('Keep it short.');
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
  it.each(cases)('%s, %s lines: same 988, model calls and request as core', async (mode, b) => {
    const env = mode === 'patterns only' ? PATTERNS_ONLY : LIVE;
    for (const line of BUCKETS[b]) {
      // One at a time: each call resets the shared classifier cache.
      const core = await heard(line, 'ferni', env); // eslint-disable-line no-await-in-loop
      const other = await heard(line, NON_CORE, env); // eslint-disable-line no-await-in-loop
      expect(has988(other.reply), line.text).toBe(has988(core.reply)); // (a) the 988 line
      expect(other.sent.length, line.text).toBe(core.sent.length); // (b) model calls
      // The cut took exactly the persona's sentences (core: team; non-core: who + team), nothing else.
      expect([core.found, other.found], line.text).toEqual([
        core.sent.map(() => 1),
        other.sent.map(() => 2),
      ]);
      expect([...core.extra, ...other.extra], line.text).toEqual(
        [...core.sent, ...other.sent].map(() => 0)
      );
      other.reminders.forEach((r, i) => {
        expect(r, line.text).not.toBe(core.reminders[i]); // the removal has work to do
        crisisWords(r).forEach((n, w) =>
          expect(n, `${CRISIS_WORDS[w]}: ${line.text}`).toBeLessThanOrEqual(
            crisisWords(core.reminders[i])[w]
          )
        );
      });
      expect(other.sent, line.text).toEqual(core.sent); // (c) the whole request, identity out
      expect(other.reply, line.text).toBe(core.reply);
    }
  });
});
