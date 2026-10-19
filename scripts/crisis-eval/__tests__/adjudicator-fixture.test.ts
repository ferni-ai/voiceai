/**
 * The adjudicator replay's fixture and plumbing, in CI with a stub model (no
 * network): the 88 cases parse, every case reaches the model with the caller's
 * line last, the model's decision is what comes back, imminent reads are never
 * asked, and the script defaults to the production timeout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adjudicateCrisis,
  adjudicatorEligible,
  DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS,
  normalizeTranscript,
  transcriptFrom,
} from '../../../src/services/safety/crisis-adjudicator.js';
import type { CrisisGenerateFn } from '../../../src/services/safety/crisis-classifier.js';
import {
  FIXTURE_KINDS,
  loadAdjudicatorFixture,
  parseAdjudicatorFixture,
  parseEvalArgs,
  withEverydayContext,
  type AdjudicatorFixtureRow,
} from '../adjudicator-cases.js';

const CHECKIN = '{"caller_risk":"","decision":"checkin","confidence":"high"}';
const ESCALATE = '{"caller_risk":"risk","decision":"escalate","confidence":"high"}';
const rows = loadAdjudicatorFixture();
const turnOf = (row: AdjudicatorFixtureRow, rep = 0) =>
  withEverydayContext(
    { latest: row.text, earlier: row.earlier ?? [], companion: row.companion },
    rep
  );
const eligible = (row: AdjudicatorFixtureRow) =>
  adjudicatorEligible('none', [{ risk: row.read ?? 'crisis', subject: 'self' }]);

describe('fixture schema', () => {
  it('88 cases, each with a known kind and a label that fits it', () => {
    expect(rows).toHaveLength(88);
    for (const kind of FIXTURE_KINDS) expect(rows.some((r) => r.kind === kind)).toBe(true);
    expect(rows.filter((r) => r.label !== 'none')).toHaveLength(56);
    expect(rows.filter((r) => r.label === 'none')).toHaveLength(32);
  });

  it.each([
    ['not an array', {}],
    ['empty text', [{ text: ' ', label: 'none', kind: 'everyday_call_flow' }]],
    ['bad label', [{ text: 'hi', label: 'maybe', kind: 'everyday_call_flow' }]],
    ['bad kind', [{ text: 'hi', label: 'none', kind: 'other' }]],
    ['positive in a benign kind', [{ text: 'hi', label: 'crisis', kind: 'relay1484_benign' }]],
    [
      'earlier not strings',
      [{ text: 'hi', label: 'none', kind: 'everyday_call_flow', earlier: [1] }],
    ],
    ['unknown key', [{ text: 'hi', label: 'none', kind: 'everyday_call_flow', note: 'x' }]],
    ['bad read', [{ text: 'hi', label: 'crisis', kind: 'verifier_standalone', read: 'none' }]],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseAdjudicatorFixture(raw)).toThrow(/fixture/);
  });
});

describe('replay plumbing with a stub model', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('every case, in every rotation, reaches the model with its line last', () => {
    for (const row of rows)
      for (const rep of [0, 1, 2]) {
        const transcript = normalizeTranscript(transcriptFrom(turnOf(row, rep)));
        expect(transcript, row.text).not.toBeNull();
        expect(transcript?.at(-1)).toEqual({ speaker: 'caller', text: row.text.trim() });
      }
  });

  it("the stub's decision comes back; imminent reads are never asked", async () => {
    // The stub answers from the label of the exact transcript it is sent.
    const labels = new Map<string, AdjudicatorFixtureRow['label']>();
    for (const row of rows) {
      const key = JSON.stringify(normalizeTranscript(transcriptFrom(turnOf(row))));
      expect(labels.get(key) ?? row.label, `conflicting labels: ${row.text}`).toBe(row.label);
      labels.set(key, row.label);
    }
    const generate = vi.fn<CrisisGenerateFn>(async (_prompt, transcript) =>
      labels.get(transcript) === 'none' ? CHECKIN : ESCALATE
    );
    let asked = 0;
    for (const row of rows) {
      const expected = eligible(row) && row.label === 'none' ? 'checkin' : 'escalate';
      const result = eligible(row)
        ? await adjudicateCrisis(transcriptFrom(turnOf(row)), generate)
        : { decision: 'escalate', why: 'ineligible' };
      if (eligible(row)) asked++;
      expect(result.decision, row.text).toBe(expected);
    }
    expect(generate).toHaveBeenCalledTimes(asked);
    expect(asked).toBe(rows.filter((r) => r.read !== 'imminent').length);
  });

  it('a model slower than the production timeout escalates every case', async () => {
    vi.useFakeTimers();
    const slow: CrisisGenerateFn = () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve(CHECKIN), DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS + 100);
      });
    const results = Promise.all(
      rows.map((row) => adjudicateCrisis(transcriptFrom(turnOf(row)), slow))
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS + 200);
    for (const r of await results) expect(r).toEqual({ decision: 'escalate', why: 'timeout' });
  });
});

describe('script flags', () => {
  it('defaults to the production timeout', () => {
    expect(parseEvalArgs([])).toEqual({ timeoutMs: 1200, privateFile: undefined });
    expect(DEFAULT_CRISIS_ADJUDICATOR_TIMEOUT_MS).toBe(1200);
  });

  it('--timeout-ms raises it; a bare path is the private file', () => {
    expect(parseEvalArgs(['--timeout-ms=10000', 'fp.jsonl'])).toEqual({
      timeoutMs: 10000,
      privateFile: 'fp.jsonl',
    });
  });

  it.each([['--timeout-ms=0'], ['--timeout-ms=abc'], ['--timeout=5']])('rejects %s', (arg) => {
    expect(() => parseEvalArgs([arg])).toThrow();
  });
});
