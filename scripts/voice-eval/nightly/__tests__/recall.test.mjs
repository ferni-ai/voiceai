// The held-out recall eval: seeding (recall-world.mjs), scoring (recall-score.mjs), the runner's
// verdicts and safety checks (recall-eval.mjs), the scorecard rows, and the public sample.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pickWorlds, seedTarget, verdicts } from '../recall-eval.mjs';
import {
  BUCKETS,
  answersOf,
  combinePanel,
  judgePrompt,
  recallValue,
  summarize,
} from '../recall-score.mjs';
import { at, docsFor, historyLines, renderWhen } from '../recall-world.mjs';
import { scoreNight } from '../scorecard.mjs';

const NIGHTLY = join(dirname(fileURLToPath(import.meta.url)), '..');
const caps = JSON.parse(readFileSync(join(NIGHTLY, 'capabilities.json'), 'utf8'));
const sample = JSON.parse(
  readFileSync(join(NIGHTLY, '__tests__/fixtures/recall-sample.json'), 'utf8')
);
const world = sample.worlds[0];
const NOW = new Date('2026-10-27T16:00:00Z'); // a Tuesday, noon in New York
const UID = 'voice-eval-recall-sample-1-20261027120000-ab12';
const paths = (docs) => docs.map((d) => d.path);
const doc = (docs, p) => docs.find((d) => d.path.endsWith(p))?.data;

describe("recall-world: seeding today's stores and the ledger", () => {
  it("places an hour in the world's zone, DST included", () => {
    expect(at(NOW, 'America/New_York', 2, 10).toISOString()).toBe('2026-10-25T14:00:00.000Z');
    expect(at(new Date('2026-11-10T16:00:00Z'), 'America/New_York', 0, 10).toISOString()).toBe(
      '2026-11-10T15:00:00.000Z'
    );
    expect(at(NOW, 'Asia/Tokyo', 0, 9).toISOString()).toBe('2026-10-28T00:00:00.000Z'); // already the 28th there
    expect(at(NOW, 'America/New_York', 0, 0, 13).toISOString()).toBe('2026-10-28T05:00:00.000Z');
  });

  it('renders {d-N} as a weekday and date in the zone', () => {
    expect(renderWhen('on {d-2}, then {d+1}', NOW, 'America/New_York')).toBe(
      'on Sunday, October 25, then Wednesday, October 28'
    );
  });

  it("writes each record where today's readers look, plus one activity doc each", () => {
    const docs = docsFor(world, UID, NOW);
    const u = `bogle_users/${UID}`;
    expect(paths(docs)).toEqual(
      expect.arrayContaining([
        `user_contacts/${UID}/contacts/c-mom`,
        `${u}/on_behalf_calls/call_h2`,
        `${u}/deferred_calls/call_h4`,
        `${u}/reminders/reminder_h6`,
        `${u}/outreach_history/email_h5`,
        `${u}/follow_through/promise_h7`,
        `${u}/activity/call_h2`,
      ])
    );
    expect(docs.filter((d) => d.path.includes('/activity/'))).toHaveLength(6); // all but the number
    const call = doc(docs, 'on_behalf_calls/call_h2');
    expect(call).toMatchObject({
      request: { contactQuery: 'my mom', contactName: 'Marisol' },
      outcome: { status: 'completed' },
      delivered: true,
    });
    expect(call.capturedAt).toBe('2026-10-25T14:00:00.000Z');
    expect(doc(docs, 'deferred_calls/call_h4')).toMatchObject({
      kind: 'on_behalf',
      status: 'pending',
      scheduledFor: '2026-10-28T05:00:00.000Z',
    });
    expect(doc(docs, 'activity/call_h4')).toMatchObject({
      kind: 'call',
      state: 'scheduled',
      reason: 'call_hours',
      revision: 1,
    });
    expect(doc(docs, 'activity/call_h1')).toMatchObject({
      state: 'failed',
      outcome: { status: 'voicemail' },
    });
  });

  it("a result not yet told is seeded undelivered, so today's first-turn reader can tell it", () => {
    const w = {
      ...world,
      history: [
        { id: 'n1', kind: 'call', to: 'c-sis', inHours: -2, status: 'completed', told: false },
      ],
    };
    const d = doc(docsFor(w, UID, NOW), 'on_behalf_calls/call_n1');
    expect(d).toMatchObject({ delivered: false, capturedAt: '2026-10-27T14:00:00.000Z' });
    expect(d.deliveredAt).toBeUndefined();
  });

  it('a contact carries the newest number the owner gave', () => {
    expect(doc(docsFor(world, UID, NOW), 'contacts/c-dad').phone).toBe('+15555550177');
  });

  it('the planted regression seeds contacts only: no record of anything Ferni did', () => {
    const docs = docsFor(world, UID, NOW, { plant: 'no-records' });
    expect(docs.length).toBe(world.contacts.length);
    expect(docs.every((d) => d.path.startsWith(`user_contacts/${UID}/`))).toBe(true);
  });

  it('tells the judge what really happened, scheduled apart from placed', () => {
    const lines = historyLines(world, NOW).join('\n');
    expect(lines).toMatch(/Ferni called mom \(Marisol\): completed; they said: she is driving up/);
    expect(lines).toMatch(/a call to dad \(Walt\) is scheduled, not placed/);
    expect(lines).not.toMatch(/aunt/);
  });
});

describe('recall-score: answers, panel, buckets', () => {
  const run = {
    userSpeech: [
      [0, 1000],
      [5000, 6000],
      [9000, 10000],
    ],
    events: [
      { t: 500, who: 'agent', text: 'Hey Sam!' },
      { t: 2000, who: 'agent', text: 'Sure, go ahead.' },
      { t: 6500, who: 'agent', text: 'Yes, I called her Sunday.' },
      { t: 7000, who: 'user', text: 'what did she say' },
      { t: 7500, who: 'agent', text: 'She was happy.' },
      { t: 11000, who: 'agent', text: 'No aunt call.' },
    ],
  };

  it("pairs each question with Ferni's words up to the next line, after the opener", () => {
    expect(answersOf(run, 2, 1)).toEqual([
      'Yes, I called her Sunday. She was happy.',
      'No aunt call.',
    ]);
    expect(answersOf(run, 3, 1)[2]).toBe(''); // a question never asked has no answer
  });

  it("prompts with the truth and every item, in the panel's order", () => {
    const p = judgePrompt(
      world,
      world.items,
      world.items.map(() => 'x'),
      NOW,
      [9, 0]
    );
    expect(p).toMatch(/What really happened/);
    expect(p.indexOf('ITEM p-10')).toBeLessThan(p.indexOf('ITEM p-01'));
    expect(p).not.toMatch(/ITEM p-02/);
    expect(p).toMatch(/Sunday, October 25/);
  });

  const items = [
    { id: 'a', bucket: 'multi-session', expect: [] },
    { id: 'b', bucket: 'abstention', abstain: true, expect: [] },
    { id: 'c', bucket: 'update', expect: [] },
  ];
  const vote = (a, b, c, inv = false) => ({
    items: [
      { id: 'a', correct: a },
      { id: 'b', correct: b, inventedCall: inv },
      { id: 'c', correct: c },
    ],
  });

  it('takes the panel majority per item; an item no judge graded is wrong and unjudged', () => {
    const g = combinePanel(items, [
      vote(true, false, true, true),
      vote(true, false, false, true),
      vote(false, true, false),
    ]);
    expect(g.map((x) => [x.id, x.correct, x.inventedCall])).toEqual([
      ['a', true, false],
      ['b', false, true],
      ['c', false, false],
    ]);
    const tie = combinePanel(items, [vote(true, true, true, true), vote(false, false, false)]);
    expect(tie.map((x) => [x.correct, x.inventedCall])).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]); // a tie is not a majority
    const none = combinePanel(items, []);
    expect(none.every((x) => !x.correct && x.votes === 0)).toBe(true);
    expect(summarize(none).unjudged).toBe(3);
  });

  it('scores per bucket, abstention precision and invented calls', () => {
    const s = summarize(combinePanel(items, [vote(true, false, true, true)]));
    expect(s).toMatchObject({
      n: 3,
      overall: 0.667,
      recalled: 1,
      abstentionPrecision: 0,
      inventedCalls: 1,
    });
    expect(s.buckets['multi-session']).toEqual({ n: 1, correct: 1, rate: 1 });
    expect(s.buckets.temporal).toEqual({ n: 0, correct: 0, rate: null });
    expect(recallValue(s, 'bucket.update')).toEqual({ value: 1, n: 1 });
    expect(recallValue(s, 'bucket.temporal')).toEqual({ value: null, n: 0 });
    expect(recallValue(null, 'overall')).toEqual({ value: null, n: 0 });
  });
});

const summary = (overall, inventedCalls = 0) => ({
  n: 10,
  overall,
  recalled: overall,
  inventedCalls,
  abstentionPrecision: 1,
  buckets: Object.fromEntries(BUCKETS.map((b) => [b, { n: 2, correct: 1, rate: overall }])),
});

describe('recall-eval: verdicts and safety', () => {
  it('fails the run when recall drops below the threshold (the planted regression)', () => {
    const fail = caps.capabilities['recall-ledger'].checks.find((c) => c.id === 'recalled').fail;
    expect(verdicts(summary(fail + 0.1), caps).exit).toBe(0);
    const v = verdicts(summary(fail - 0.1), caps);
    expect(v.exit).toBe(1);
    expect(v.rows.find((r) => r.id === 'recalled')).toMatchObject({ verdict: 'FAIL', fails: true });
  });

  it('fails on any invented call (zero tolerance, above a known gap)', () => {
    const gate = caps.capabilities['invented-call'].checks[0];
    const max = gate.known?.max ?? 0;
    expect(verdicts(summary(0.9, max), caps).exit).toBe(0);
    expect(verdicts(summary(0.9, max + 1), caps).exit).toBe(1);
  });

  it("never seeds prod's database or a real account", () => {
    expect(seedTarget('dev', UID, {})).toBe('ferni-dev');
    expect(() => seedTarget('prod', UID, {})).toThrow(/prod/);
    expect(() => seedTarget('dev', UID, { EVAL_DEV_DATABASE: '(default)' })).toThrow(/prod/);
    expect(() => seedTarget('dev', 'owner-uid-123', {})).toThrow(/voice-eval-/);
  });

  it('rotates the nightly worlds so every one comes round', () => {
    const ws = ['a', 'b', 'c', 'd', 'e'];
    const seen = new Set();
    for (let d = 0; d < 5; d++)
      pickWorlds(ws, 2, new Date(d * 86_400_000)).forEach((w) => seen.add(w));
    expect(seen.size).toBe(5);
    expect(pickWorlds(ws, 0, NOW)).toEqual(ws);
  });

  it('a dry run plans each world and touches nothing', () => {
    const r = spawnSync(
      process.execPath,
      [
        join(NIGHTLY, 'recall-eval.mjs'),
        '--set',
        join(NIGHTLY, '__tests__/fixtures/recall-sample.json'),
        '--dry-run',
      ],
      { encoding: 'utf8', env: { ...process.env, EVAL_DEV_DATABASE: '' } }
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^PLAN sample-1: 15 docs, 10 questions$/m);
  });
});

describe('scorecard: the recall-ledger row and the invented-call gate', () => {
  const card = (recall) => scoreNight([], caps, null, { recall });

  it('recall-ledger is report only: a FAIL never exits 1', () => {
    const c = card(summary(0.01));
    expect(c.capabilities['recall-ledger']).toMatchObject({ reportOnly: true, verdict: 'FAIL' });
    expect(c.diff.reportOnly).toContain('recall-ledger');
    expect(c.diff.newFail).not.toContain('recall-ledger');
  });

  it('an invented call above the known gap exits 1; no recall run is no data, not a pass', () => {
    const max = caps.capabilities['invented-call'].checks[0].known?.max ?? 0;
    expect(card(summary(0.9, max + 1)).diff.gateFail).toContain('invented-call');
    expect(card(summary(0.9, max + 1)).diff.exit).toBe(1);
    const none = card(null);
    expect(none.capabilities['invented-call'].verdict).toBe('WARN');
    expect(none.diff.gateNoData).toContain('invented-call');
  });

  it("a planted-regression summary is never read as a night's score", () => {
    expect(
      card({ ...summary(0.05, 9), plant: 'no-records' }).capabilities['invented-call'].verdict
    ).toBe('WARN');
  });
});

describe('the public sample', () => {
  const all = sample.worlds.flatMap((w) => w.items);

  it('is small, synthetic and covers every bucket', () => {
    expect(all.length).toBeLessThanOrEqual(10);
    expect(new Set(all.map((i) => i.bucket))).toEqual(new Set(BUCKETS));
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    expect(all.every((i) => i.q && i.expect.length)).toBe(true);
    expect(all.filter((i) => i.abstain).every((i) => i.bucket === 'abstention')).toBe(true);
  });

  it('uses only fictional 555-01xx numbers', () => {
    const text = JSON.stringify(sample);
    const nums = text.match(/\+\d{11}/g) ?? [];
    expect(nums.length).toBeGreaterThan(0);
    expect(nums.every((n) => /^\+155555501\d\d$/.test(n))).toBe(true);
    expect((text.match(/\b\d{3}-\d{4}\b/g) ?? []).every((n) => /^555-01\d\d$/.test(n))).toBe(true);
  });
});

describe('run.sh reads scenarios from EVAL_SCENARIO_DIR', () => {
  it('plans a call from a scenario outside the repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recall-scen-'));
    writeFileSync(join(dir, 'recall-x.txt'), 'Hello.\n');
    const r = spawnSync(
      'zsh',
      [
        join(NIGHTLY, '../run.sh'),
        'dev',
        'recall-x',
        'r',
        'voice-eval-recall-x-20261027120000-ab12',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, EVAL_DRY_RUN: '1', EVAL_SCENARIO_DIR: dir, EVAL_OUT_DIR: dir },
      }
    );
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      scenario: 'recall-x',
      json: join(dir, 'recall-x-r.json'),
    });
  });
});
