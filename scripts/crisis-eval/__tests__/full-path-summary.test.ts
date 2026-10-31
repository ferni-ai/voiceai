/**
 * The full-path simulator's counting (full-path-summary.ts) and its recall
 * gate: a must-catch turn caught in fewer reps than the baseline fails the
 * run; false alarms are counted on must-not-alarm turns only; loops and
 * carry-over are counted within one call and one rep.
 */
import { describe, expect, it } from 'vitest';

import { recallRegressions, summarise, type TurnRecord } from '../full-path-summary.js';

const rec = (
  over: Partial<TurnRecord> & Pick<TurnRecord, 'callId' | 'index' | 'label'>
): TurnRecord => ({
  set: 'test',
  shape: 'shape',
  turnId: `${over.callId}#${over.index}`,
  rep: 0,
  activated: false,
  paths: [],
  replaced: false,
  soft: false,
  note: false,
  line988: 'no',
  line911: 'no',
  repeat: false,
  ...over,
});

const META = { profile: 'p', mutation: '', reps: 1 };

describe('summarise', () => {
  it('counts must-catch reads caught and must-not-alarm reads alarmed, ignoring either', () => {
    const s = summarise(
      [
        rec({
          callId: 'a',
          index: 0,
          label: 'must-catch',
          activated: true,
          paths: ['classifier-crisis'],
        }),
        rec({ callId: 'a', index: 1, label: 'must-catch' }),
        rec({ callId: 'b', index: 0, label: 'either', activated: true, paths: ['pattern-crisis'] }),
        rec({
          callId: 'b',
          index: 1,
          label: 'must-not-alarm',
          activated: true,
          paths: ['lexical-transfer'],
        }),
        rec({ callId: 'b', index: 2, label: 'must-not-alarm' }),
      ],
      META
    );
    expect(s.mustCatch.reads).toEqual({ n: 1, of: 2 });
    expect(s.mustCatch.missed).toEqual(['a#1']);
    expect(s.negatives.reads).toEqual({ n: 1, of: 2 });
    expect(s.falseAlarmPaths).toEqual({ 'lexical-transfer': 1 });
    expect(s.falseAlarmCalls).toEqual({ n: 1, of: 1 });
  });

  it('counts a script loop only for 2+ replaced turns in one call and rep', () => {
    const s = summarise(
      [
        rec({ callId: 'a', index: 0, label: 'either', replaced: true, activated: true }),
        rec({ callId: 'a', index: 1, label: 'must-not-alarm', replaced: true, activated: true }),
        rec({ callId: 'b', index: 0, label: 'must-not-alarm', replaced: true, activated: true }),
        rec({
          callId: 'b',
          index: 0,
          label: 'must-not-alarm',
          replaced: true,
          activated: true,
          rep: 1,
        }),
      ],
      { ...META, reps: 2 }
    );
    expect(s.scriptLoops.all).toEqual({ n: 1, of: 3 });
    expect(s.scriptLoops.negativeCalls).toEqual({ n: 1, of: 3 });
  });

  it('measures carry-over within a call, in turn order', () => {
    const s = summarise(
      [
        rec({ callId: 'a', index: 2, label: 'must-not-alarm', activated: true }),
        rec({ callId: 'a', index: 0, label: 'either', activated: true }),
        rec({ callId: 'a', index: 1, label: 'must-not-alarm', activated: true }),
        rec({ callId: 'a', index: 3, label: 'must-not-alarm' }),
        rec({ callId: 'b', index: 0, label: 'must-not-alarm' }),
        rec({ callId: 'b', index: 1, label: 'must-not-alarm', activated: true }),
      ],
      META
    );
    expect(s.carryOver.afterActivated).toEqual({ n: 2, of: 3 });
    expect(s.carryOver.afterQuiet).toEqual({ n: 1, of: 1 });
    expect(s.carryOver.intoMustNotAlarm).toEqual({ n: 2, of: 3 });
    expect(s.carryOver.negativeCalls).toEqual({ n: 2, of: 3 });
  });

  it('counts a crisis line again on a call that already had one', () => {
    const s = summarise(
      [
        rec({ callId: 'a', index: 0, label: 'either', line988: 'said' }),
        rec({ callId: 'a', index: 1, label: 'must-not-alarm', line988: 'instructed' }),
        rec({ callId: 'a', index: 2, label: 'must-not-alarm', line911: 'said' }),
      ],
      META
    );
    expect(s.repeatedCrisisLine).toBe(2);
  });

  it('counts eased reads, and eased must-catch reads apart', () => {
    const s = summarise(
      [
        rec({ callId: 'a', index: 0, label: 'must-not-alarm', soft: true }),
        rec({ callId: 'a', index: 1, label: 'must-catch', soft: true }),
        rec({ callId: 'a', index: 2, label: 'either' }),
      ],
      META
    );
    expect(s.softChecks).toEqual({ all: 2, mustCatch: 1 });
  });
});

describe('recallRegressions', () => {
  const base = {
    perTurn: { 'a#0': [3, 3] as [number, number], 'a#1': [1, 3] as [number, number] },
  };

  it('fails a turn caught in fewer reps than the baseline', () => {
    expect(recallRegressions({ perTurn: { 'a#0': [2, 3], 'a#1': [1, 3] } }, base)).toEqual([
      { turnId: 'a#0', baseline: [3, 3], now: [2, 3] },
    ]);
  });

  it('passes equal or better recall, and turns only one side ran', () => {
    expect(
      recallRegressions({ perTurn: { 'a#0': [3, 3], 'a#1': [3, 3], 'z#0': [0, 3] } }, base)
    ).toEqual([]);
    expect(recallRegressions({ perTurn: { 'a#0': [1, 1] } }, base)).toEqual([]);
  });

  it('compares shares when the rep counts differ', () => {
    expect(recallRegressions({ perTurn: { 'a#1': [0, 1] } }, base)).toHaveLength(1);
    expect(recallRegressions({ perTurn: { 'a#1': [1, 1] } }, base)).toEqual([]);
  });
});
