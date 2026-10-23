import type { TurnInput, TurnReading } from '../schema.js';

/** A valid v0.1 reading: "oh fantastic, my car broke down again" after "How was the drive in?". */
export function carReading(over: Partial<TurnReading> = {}): TurnReading {
  return {
    speech_act: 'answer',
    answered_prior_question: 'yes',
    affect: { label: 'distress', valence: -1, arousal: 'med' },
    affect_text: 2,
    affect_situation: -2,
    affect_target: 'caller',
    sarcasm: true,
    action_claim: { kind: 'none', tense: 'present', own_life: false },
    explicit_self_report: false,
    time_expressions: [],
    temporal_orientation: 'past_report',
    crisis_signal: 'distress',
    name_given: null,
    humor_cue: 'none',
    ...over,
  };
}

export const CAR_INPUT: TurnInput = {
  ferniLast: 'How was the drive in?',
  callerTurn: 'oh fantastic, my car broke down again',
  priorCallerTurns: ['morning'],
  callTimestamp: '2026-10-22T14:00:00.000Z',
  callerTimezone: 'America/New_York',
  callerName: 'Sam',
};
