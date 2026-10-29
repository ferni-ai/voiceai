/**
 * What today's hand-written rules decided for a turn, as plain data, and where
 * the turn reading disagrees with them. The rules are read in the agent layer
 * (agents/personas/understanding-rules.ts); this only compares.
 *
 * @module understanding/compare
 */
import { isoDateOrNull, type TurnReading } from './schema.js';

export interface RulesRead {
  /** answer-turn.ts answersQuestion: the caller answered Ferni's question. */
  answer: boolean;
  /** turn-attunement.ts readCaller: the ATTUNE state. */
  attune: string;
  /** backchannel-context.ts classifyBackchannelContext. */
  backchannel: string | null;
  /** crisis-guard.ts detectCrisis (lexical): indicator names only. */
  crisis: { isCrisis: boolean; severity: number; indicators: string[] };
  /** laugh-ledger.ts callerCue: they laughed, joked or told happy news. */
  laughCue: boolean;
  /** greeting-not-yet.ts commitmentAhead: the words name a day still ahead. */
  dayAhead: boolean;
}

/** The ATTUNE state in the reading's affect labels. */
const ATTUNE_AS_AFFECT: Record<string, TurnReading['affect_text']['label']> = {
  low: 'low',
  sad: 'distress',
  venting: 'distress',
  excited: 'upbeat',
  playful: 'upbeat',
};

/** What both the reading and the rules decide, as comparable values. */
interface SharedFields {
  answered: boolean;
  affect: string;
  bad_news: boolean;
  crisis_risk: boolean;
  humor: boolean;
  day_ahead: boolean;
}

function sharedFromReading(r: TurnReading): SharedFields {
  return {
    answered: r.answered_prior_question === 'yes' || r.answered_prior_question === 'partial',
    affect: r.affect_text.label,
    bad_news: r.affect_situation.valence < 0,
    // The lexical guard's crisis line (0.7) sits below its passive-ideation score (0.75).
    crisis_risk: ['passive', 'active', 'plan'].includes(r.crisis_signal),
    humor: r.humor_cue !== 'none',
    day_ahead: r.time_expressions.some((t) => t.relation !== 'past'),
  };
}

function sharedFromRules(rules: RulesRead): SharedFields {
  return {
    answered: rules.answer,
    affect: ATTUNE_AS_AFFECT[rules.attune] ?? 'neutral',
    bad_news: rules.backchannel === 'bad_news',
    crisis_risk: rules.crisis.isCrisis,
    humor: rules.laughCue,
    day_ahead: rules.dayAhead,
  };
}

type Disagreements = Record<keyof SharedFields, boolean>;

/** True per shared field where the reading and the rules disagree. */
export function disagreements(r: TurnReading, rules: RulesRead): Disagreements {
  const a = sharedFromReading(r);
  const b = sharedFromRules(rules);
  const keys = Object.keys(a) as Array<keyof SharedFields>;
  return Object.fromEntries(keys.map((k) => [k, a[k] !== b[k]])) as Disagreements;
}

/**
 * The reading with no caller words in it: the name becomes a flag, time phrases
 * lose their words, and their dates stay only as ISO dates (resolved dates are
 * not re-validated after parsing, so this checks again).
 */
export function readingForLog(r: TurnReading): Record<string, unknown> {
  const { name_given: name, time_expressions: times, ...labels } = r;
  return {
    ...labels,
    name_given: name !== null,
    time_expressions: times.map(({ text: _t, start_iso, end_iso, ...rest }) => ({
      ...rest,
      start_iso: isoDateOrNull(start_iso),
      end_iso: isoDateOrNull(end_iso),
    })),
  };
}
