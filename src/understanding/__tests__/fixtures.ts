import type { TurnInput, TurnReading } from '../schema.js';

/** A valid v0.1 reading: "oh fantastic, my car broke down again" after "How was the drive in?". */
export function carReading(over: Partial<TurnReading> = {}): TurnReading {
  return {
    speech_act: 'answer',
    answered_prior_question: 'yes',
    affect_text: { label: 'upbeat', valence: 2 },
    affect_situation: { valence: -1 },
    arousal: 'med',
    affect_target: 'caller',
    sarcasm: true,
    explicit_self_report: false,
    time_expressions: [],
    temporal_orientation: 'past_report',
    crisis_signal: 'none',
    name_given: null,
    humor_cue: 'none',
    action_claim: { kind: 'none', tense: null, own_life: null },
    ...over,
  };
}

export const CAR_INPUT: TurnInput = {
  ferniLast: 'How was the drive in?',
  callerTurn: 'oh fantastic, my car broke down again',
  priorCallerTurns: ['morning'],
  callTimestamp: '2026-10-22T10:00:00-04:00',
  callerTimezone: 'America/New_York',
  callerName: 'Sam',
};
