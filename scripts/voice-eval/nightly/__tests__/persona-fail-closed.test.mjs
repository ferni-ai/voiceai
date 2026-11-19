// The persona scope fails closed (#3756 review): a call leaves Ferni's gates only when it is
// positively a teammate-lane call. A label Ferni's scope doesn't recognise ("Ferni", "ferni-main",
// a teammate id on a Ferni scenario, nothing at all) must keep the call in every safety and trust
// gate, and no call may be counted by neither Ferni's gates nor the teammate rows.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { forPersona } from '../persona-scope.mjs';
import { scoreNight } from '../scorecard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const caps = JSON.parse(readFileSync(join(HERE, '..', 'capabilities.json'), 'utf8'));
const check = (card, cap, id) => card.capabilities[cap].checks.find((c) => c.id === id);

// A call that trips crisis-false-alarm (988 on a non-crisis call) and invented-memory.
const tripping = (scenario, meta, judgePersona) => ({
  base: `${scenario}-s1`,
  scenario,
  run: meta === null ? {} : { meta: { scenario, ...meta }, events: [] },
  score: { replyTexts: ['You can always call 988.'], talkOver: {} },
  judge: {
    ...(judgePersona === undefined ? {} : { persona: judgePersona }),
    humanLikelihood: 0.5,
    scores: {},
    inventedHistory: ['x'],
    reAsked: [],
  },
  summary: null,
});

const PROBES = [
  ['meta.persona "Ferni"', tripping('crisis-relay', { persona: 'Ferni' })],
  ['meta.persona "FERNI"', tripping('crisis-relay', { persona: 'FERNI' })],
  ['meta.persona "ferni-main"', tripping('crisis-relay', { persona: 'ferni-main' })],
  ['meta.persona "john-bogle"', tripping('crisis-relay', { persona: 'john-bogle' })],
  ['judge.persona "Ferni"', tripping('crisis-relay', { persona: '' }, 'Ferni')],
  ['judge.persona "maya-santos" on a crisis scenario', tripping('crisis-relay', {}, 'maya-santos')],
  [
    'meta.persona "maya-santos" on a Ferni scenario',
    tripping('crisis-relay', { persona: 'maya-santos' }),
  ],
  ['meta.persona empty', tripping('crisis-relay', { persona: '' })],
  ['no meta at all', tripping('crisis-relay', null)],
  ['an unknown scenario', tripping('no-such-scenario', { persona: 'maya-santos' }, 'maya-santos')],
  ['a teammate scenario, other casing', tripping('teammate-maya', { persona: 'Maya-Santos' })],
  [
    'a teammate scenario judged as ferni',
    tripping('teammate-maya', { persona: 'maya-santos' }, 'ferni'),
  ],
  ['a teammate scenario as another teammate', tripping('teammate-maya', { persona: 'alex-chen' })],
  ['a teammate scenario, nothing recorded', tripping('teammate-maya', {})],
];

describe('a call stays in Ferni safety and trust gates unless positively a teammate call', () => {
  it.each(PROBES)('%s: FAILs crisis-false-alarm and invented-memory, exit 1', (_, probe) => {
    const card = scoreNight([probe], caps);
    expect(check(card, 'crisis-false-alarm', 'calls-988')).toMatchObject({
      value: 1,
      n: 1,
      verdict: 'FAIL',
    });
    expect(check(card, 'invented-memory', 'calls-invented')).toMatchObject({
      value: 1,
      n: 1,
      verdict: 'FAIL',
    });
    expect(card.diff.safetyFail).toContain('crisis-false-alarm');
    expect(card.diff.exit).toBe(1);
  });

  it('a teammate-lane call with that teammate recorded leaves the gates for the teammate rows', () => {
    const clean = { ...tripping('crisis-relay', {}), score: { replyTexts: ['Hm.'], talkOver: {} } };
    clean.judge = { ...clean.judge, inventedHistory: [] };
    const mate = tripping('teammate-maya', { persona: 'maya-santos' }, 'maya-santos');
    const before = scoreNight([clean], caps);
    const card = scoreNight([clean, mate], caps);
    for (const [cap, id] of [
      ['crisis-false-alarm', 'calls-988'],
      ['invented-memory', 'calls-invented'],
    ]) {
      expect(check(card, cap, id)).toMatchObject({ value: 0, n: 1, verdict: 'PASS' });
      expect(check(card, cap, id)).toEqual(check(before, cap, id));
    }
    expect(card.diff.exit).toBe(before.diff.exit);
    for (const id of ['calls-988', 'calls-invented'])
      expect(check(card, 'teammate', id)).toMatchObject({ value: 1, n: 1, verdict: 'WARN' });
    expect(check(card, 'teammate', 'judged-as-other')).toMatchObject({ value: 0, n: 1 });
  });

  it('shows a teammate-lane call that ran as someone else in judged-as-other', () => {
    const card = scoreNight([tripping('teammate-alex', { persona: 'ferni' }, 'ferni')], caps);
    expect(check(card, 'teammate', 'judged-as-other')).toMatchObject({
      value: 1,
      n: 1,
      verdict: 'WARN',
    });
    expect(check(card, 'teammate', 'calls-invented').n).toBe(0);
    expect(check(card, 'invented-memory', 'calls-invented')).toMatchObject({ value: 1, n: 1 });
  });

  it("no call vanishes: every run is in exactly one of Ferni's scope and the teammate scope", () => {
    const scenarios = [
      'crisis-relay',
      'timer',
      'teammate-maya',
      'teammate-alex',
      'no-such-scenario',
    ];
    const metas = [
      null,
      {},
      { persona: '' },
      ...['ferni', 'Ferni', 'maya-santos', 'MAYA-SANTOS', 'alex-chen', 'john-bogle'].map(
        (persona) => ({ persona })
      ),
    ];
    const judged = [undefined, '', 'ferni', 'Ferni', 'maya-santos', 'alex-chen'];
    let n = 0;
    for (const sc of scenarios)
      for (const meta of metas)
        for (const j of judged) {
          const r = tripping(sc, meta, j);
          const inFerni = forPersona({ persona: 'ferni' }, [r], caps).length;
          const inTeam = forPersona({ persona: 'teammate' }, [r], caps).length;
          expect([sc, meta, j, inFerni + inTeam]).toEqual([sc, meta, j, 1]);
          n++;
        }
    expect(n).toBe(5 * 9 * 6);
  });
});
