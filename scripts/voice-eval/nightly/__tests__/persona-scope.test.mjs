// Teammate calls in the nightly (#3752): each is checked to have been judged as that teammate,
// and their judge scores land in the teammate row, never in Ferni's judge row or bar targets.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { calledPersona, scenarioPersona } from '../persona-scope.mjs';
import { loadNight, metric, scoreNight } from '../scorecard.mjs';
import { loadBar, scoreBar } from '../superhuman.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const caps = JSON.parse(readFileSync(join(HERE, '..', 'capabilities.json'), 'utf8'));
const bar = loadBar(join(HERE, '..', 'superhuman-bar.json'));
const night1021 = loadNight(join(HERE, 'fixtures', '2026-10-21'));
const TEAM = {
  'teammate-maya': 'maya-santos',
  'teammate-alex': 'alex-chen',
  'teammate-peter': 'peter-john',
  'teammate-jordan': 'jordan-taylor',
  'teammate-nayan': 'nayan-patel',
};
const check = (card, cap, id) => card.capabilities[cap].checks.find((c) => c.id === id);
const values = (card, cap) =>
  card.capabilities[cap].checks.filter((c) => c.id !== 'missing').map((c) => [c.id, c.value, c.n]);

// A teammate call as run.sh writes it (meta.persona) with its judge verdict.
const teammateRun = (scenario, judgedAs, scores = { endearing: 5, conduct: 5 }) => ({
  base: `${scenario}-s1`,
  scenario,
  run: { meta: { scenario, persona: TEAM[scenario] }, events: [] },
  score: { replyTexts: ['hey'], talkOver: {} },
  judge: { persona: judgedAs, humanLikelihood: 1, scores, inventedHistory: [], reAsked: [] },
  summary: null,
});
const team = (mislabel = null) =>
  Object.entries(TEAM).map(([sc, id]) => teammateRun(sc, sc === mislabel ? 'ferni' : id));

describe('which persona a call was with', () => {
  it("reads each teammate scenario's #@persona line, and none for a Ferni scenario", () => {
    for (const [sc, id] of Object.entries(TEAM)) expect(scenarioPersona(sc)).toBe(id);
    expect(scenarioPersona('timer')).toBeNull();
    expect(scenarioPersona('no-such-scenario')).toBeNull();
  });

  it('prefers meta.persona, then the judged persona, then the scenario line, then ferni', () => {
    expect(calledPersona({ scenario: 'timer', run: { meta: { persona: 'alex-chen' } } })).toBe(
      'alex-chen'
    );
    expect(
      calledPersona({
        scenario: 'teammate-maya',
        run: { meta: {} },
        judge: { persona: 'alex-chen' },
      })
    ).toBe('alex-chen');
    expect(calledPersona({ scenario: 'teammate-maya', run: { meta: {} } })).toBe('maya-santos');
    expect(calledPersona({ scenario: 'timer', run: { meta: {} } })).toBe('ferni');
  });
});

describe('the teammate capability', () => {
  it('lists the five teammate scenarios and has no threshold that can FAIL', () => {
    const cap = caps.capabilities.teammate;
    expect([...cap.scenarios].sort()).toEqual(Object.keys(TEAM).sort());
    expect(cap.reportOnly).toBe(true);
    expect(cap.reportOnlyWhy).toMatch(/first week/);
    expect(cap.checks.map((c) => c.fail ?? null)).toEqual(cap.checks.map(() => null));
    for (const c of cap.checks) expect(c.why).toMatch(/baseline/);
  });

  it('PASSes judged-as-other when every teammate was judged as themself', () => {
    const card = scoreNight(team(), caps);
    expect(check(card, 'teammate', 'judged-as-other')).toMatchObject({
      value: 0,
      n: 5,
      verdict: 'PASS',
    });
  });

  it('goes red (WARN) when a teammate call is judged as ferni, and never exits 1', () => {
    const prev = { capabilities: scoreNight(team(), caps).capabilities };
    const card = scoreNight(team('teammate-alex'), caps, prev);
    expect(check(card, 'teammate', 'judged-as-other')).toMatchObject({ value: 1, verdict: 'WARN' });
    expect(card.capabilities.teammate.verdict).toBe('WARN');
    expect(card.diff.reportOnly).toContain('teammate');
    expect(card.diff.regressions).toEqual([]);
  });

  it("is no data, not a PASS, when the verdicts don't name a persona", () => {
    const runs = team().map((r) => ({ ...r, judge: { ...r.judge, persona: undefined } }));
    expect(check(scoreNight(runs, caps), 'teammate', 'judged-as-other')).toMatchObject({
      value: null,
      verdict: 'WARN',
      reason: 'no data',
    });
  });
});

describe("Ferni's judge numbers stay Ferni's", () => {
  // origin/main's numbers on the 10-21 night, before teammate calls existed.
  const FERNI_1021 = [
    ['human', 0.369, 46],
    ['endearing', 2.685, 46],
    ['conduct', 2.185, 46],
  ];

  it('are unchanged on the 10-21 night, which has no teammate call', () => {
    expect(values(scoreNight(night1021, caps), 'judge')).toEqual(FERNI_1021);
    const sh = scoreBar(night1021, bar, caps, metric);
    const t = (id) => sh.targets.find((x) => x.id === id);
    expect([t('judge.endearing').value, t('judge.endearing').n]).toEqual([2.685, 46]);
    expect([t('human-likelihood').value, t('human-likelihood').n]).toEqual([0.369, 46]);
  });

  it("leave the teammates' scores out of Ferni's row and bar, and in the teammate row", () => {
    const card = scoreNight([...night1021, ...team()], caps);
    expect(values(card, 'judge')).toEqual(FERNI_1021);
    expect(values(card, 'teammate').slice(0, 4)).toEqual([
      ['judged-as-other', 0, 5],
      ['human', 1, 5],
      ['endearing', 5, 5],
      ['conduct', 5, 5],
    ]);
    const sh = scoreBar([...night1021, ...team()], bar, caps, metric);
    const t = (id) => sh.targets.find((x) => x.id === id);
    expect([t('judge.endearing').value, t('judge.endearing').n]).toEqual([2.685, 46]);
    expect([t('human-likelihood').value, t('human-likelihood').n]).toEqual([0.369, 46]);
  });
});

// A teammate call that trips every Ferni gate it could reach: 988 on a non-crisis call, a claimed
// text, an invented memory, a re-ask, tool errors, an unknown L50, a slow reply, sounds into silence.
const trap = () => ({
  ...teammateRun('teammate-jordan', 'jordan-taylor'),
  score: {
    replyTexts: ['You can always call 988.', "I've texted her for you."],
    talkOver: {},
    sounds: { intoSilence: 2, repeats: 2 },
  },
  judge: {
    persona: 'jordan-taylor',
    humanLikelihood: 0,
    scores: {},
    inventedHistory: ['x'],
    reAsked: ['y'],
  },
  summary: {
    file: 'teammate-jordan-s1.json',
    reply_gaps: [9000],
    tool_errors: 3,
    l50: ['L50 boom'],
    handoff_lines: [],
  },
});
// A Ferni night where every gate the trap could reach PASSes.
const ferni = (scenario, replyTexts) => ({
  base: `${scenario}-s1`,
  scenario,
  run: { meta: { scenario }, events: [] },
  score: { replyTexts, talkOver: {}, sounds: { intoSilence: 0, repeats: 0 } },
  judge: {
    humanLikelihood: 0.6,
    scores: { endearing: 3, conduct: 3 },
    inventedHistory: [],
    reAsked: [],
  },
  summary: {
    file: `${scenario}-s1.json`,
    reply_gaps: [1500],
    tool_errors: 0,
    l50: [],
    handoff_lines: [],
  },
});
const cleanNight = [
  ferni('sweep-crisis-real', ['Please call 988 now.']),
  ferni('crisis-relay', ['That sounds like a lot.']),
  ferni('timer', ['Your timer went off.']),
];
const notTeammate = (card) =>
  Object.fromEntries(Object.entries(card.capabilities).filter(([id]) => id !== 'teammate'));

describe('teammate calls never move a Ferni gate (#3756 review)', () => {
  const GATES = [
    ['crisis-false-alarm', 'calls-988'],
    ['invented-memory', 'calls-invented'],
    ['re-asked', 'calls-re-asked'],
    ['tool-health', 'tool-errors'],
    ['tool-health', 'l50'],
    ['turn-taking', 'reply-gap-p50'],
    ['listening-sounds', 'into-silence'],
    ['false-done', 'claimed-contact'],
  ];

  it('leave every Ferni gate PASS with the same value and n, and the same exit', () => {
    const prev = { capabilities: scoreNight(cleanNight, caps).capabilities };
    const before = scoreNight(cleanNight, caps, prev);
    const after = scoreNight([...cleanNight, trap()], caps, prev);
    for (const [cap, id] of GATES) expect(check(before, cap, id).verdict).toBe('PASS');
    expect(notTeammate(after)).toEqual(notTeammate(before));
    expect(after.diff.exit).toBe(before.diff.exit);
    expect(after.diff.regressions).toEqual([]);
  });

  it('leave the 10-21 night (with its FAILs) and its exit code as they were', () => {
    const before = scoreNight(night1021, caps);
    const after = scoreNight([...night1021, trap()], caps);
    expect(notTeammate(after)).toEqual(notTeammate(before));
    expect(after.diff.exit).toBe(before.diff.exit);
  });

  it("show up as WARN in the teammate row's trust checks", () => {
    const card = scoreNight([...cleanNight, trap()], caps);
    for (const id of ['calls-invented', 'calls-re-asked', 'calls-988', 'claimed-contact'])
      expect(check(card, 'teammate', id)).toMatchObject({ value: 1, n: 1, verdict: 'WARN' });
    expect(card.capabilities.teammate.verdict).toBe('WARN');
  });

  it('every check that can see a teammate call and can change the exit is persona-scoped', () => {
    const ALLOW = {}; // check id -> reason it may count teammate calls; none today
    const teammateScenario = (sc) => scenarioPersona(sc) !== null;
    const unscoped = Object.entries(caps.capabilities)
      .filter(([id, cap]) => id !== 'teammate' && !cap.reportOnly)
      .flatMap(([id, cap]) =>
        cap.checks
          .filter((c) => c.scope === 'all' || cap.scenarios.some(teammateScenario))
          .filter((c) => [c.fail, c.warn, c.maxDrop].some((t) => t !== null && t !== undefined))
          .filter((c) => !c.persona && !ALLOW[`${id}.${c.id}`])
          .map((c) => `${id}.${c.id}`)
      );
    expect(unscoped).toEqual([]);
  });
});
