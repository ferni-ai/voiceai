/**
 * The teacher's questions. Few-shot LLMs label dialogue acts poorly as one big
 * classification (31% on MRDA, Qamar et al. ACL 2025, mostly "good thanks" read
 * as an acknowledgement) but answer one focused yes/no about one (question,
 * reply) pair well (kappa >= 0.90). So "did they answer?" is its own question
 * about that pair alone, and sarcasm is two valences (the words, the events)
 * whose clash the code reads, unless the model judges the caller sincere.
 *
 * @module understanding/teacher-prompts
 */
import { z } from 'zod';
import { jsonSchemaOf, TURN_READING_ZOD, type TurnInput, type TurnReading } from './schema.js';

const SPLIT = { answered_prior_question: true, affect_text: true, affect_situation: true } as const;
const CORE = TURN_READING_ZOD.omit({ ...SPLIT, sarcasm: true });
const ANSWERED = TURN_READING_ZOD.pick({ answered_prior_question: true });
const CLASH = TURN_READING_ZOD.pick({ affect_text: true, affect_situation: true })
  .extend({ sincere: z.boolean() })
  .strict();
const SINGLE = CORE.extend({ ...ANSWERED.shape, ...CLASH.shape }).strict();

// Definitions follow the golden set's guidelines v0.1 (tools/guidelines.json).
const CORE_PROMPT = `You label one caller turn on a phone call with their friend Ferni. CALLER is the turn to label; FERNI is the latest Ferni line before it; EARLIER are the caller's turns before that; NOW is the caller's local time. Labels:
speech_act: the main job of the turn; if several apply, the first of answer > request > question > self_id > closing > greeting > topic_change > statement > pleasantry > backchannel. "Good thanks" after a hello's "how are you?" is pleasantry; after "how did the interview go?" it is answer.
arousal: energy of the expression: low (subdued, tired), med, high (excited, agitated).
affect_target: what the emotion is about: caller (their own state or life), ferni, other, none (no emotion).
explicit_self_report: true when the caller states their OWN current state (mood, energy, health, feelings) in the first person, including elliptical answers to how-are-you.
time_expressions: every date, time or duration, resolved against NOW. kind point (one moment or day) or span (range or duration); start_iso/end_iso full ISO with offset for clock times, YYYY-MM-DD for whole days, null for vague ones ("soon"); relation to NOW future|ongoing|past. "In two weeks" is +14 days; a bare weekday equal to today's means next week's; "the 30th" is the next upcoming 30th.
temporal_orientation: where the turn's content sits in time as a whole: future_plan, past_report, ongoing, none.
crisis_signal: graded risk to the caller's own safety: none (including idioms like "this traffic is killing me" and ordinary sadness), distress, passive (wishes not to be around), active (thoughts of killing themselves), plan (method, time or means).
name_given: the name the caller gives for THEMSELVES in this turn, else null (not third parties, not "it's me").
humor_cue: the most salient of laugh > joke > good_news, else none.
action_claim: the concrete action the turn claims, promises or asks about: kind none|send|call|schedule|book|remember|other (requests to Ferni count; mere mentions are none); tense past|present|future; own_life true when the caller acts in their own life ("I sent it"), false for Ferni or someone else; tense and own_life null when kind is none.`;

const ANSWERED_PROMPT = `QUESTION is Ferni's latest line; REPLY is what the caller said next. If QUESTION asks something: yes = REPLY answers it ("I don't know" counts); partial = answers only part or hedges; no = ignores it, changes topic or asks something else. n/a = QUESTION asks nothing or is empty. "Good thanks" answers "how are you?" but not "what time works?" or "did you send it?".`;

const CLASH_PROMPT = `affect_text: the tone of the caller's WORDS alone (what a reader of the text would feel): label low|neutral|upbeat|mixed|distress and valence -2..2. affect_situation: valence -2..2 of the EVENTS described, whatever the wording (0 when there is none). sincere: false for mock enthusiasm or irony; genuine silver-lining talk ("well, at least I'm okay") and teasing that means what it says are sincere. "Oh fantastic, the car's dead again": text upbeat +2, situation -1, not sincere.`;

/** The words and the events point opposite ways. */
export function clash(text: number, situation: number): boolean {
  return text * situation < 0;
}

export interface TeacherCall {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  parse: (raw: string) => Partial<TurnReading> | null;
}

function call<T extends z.ZodType>(
  system: string,
  user: object,
  schema: T,
  map: (v: z.infer<T>) => Partial<TurnReading>
): TeacherCall {
  return {
    system,
    user: JSON.stringify(user),
    schema: jsonSchemaOf(schema),
    parse: (raw) => {
      try {
        const r = schema.safeParse(JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? ''));
        return r.success ? map(r.data) : null;
      } catch {
        return null;
      }
    },
  };
}

function fromClash<T extends z.infer<typeof CLASH>>({
  sincere,
  ...rest
}: T): Omit<T, 'sincere'> & { sarcasm: boolean } {
  return {
    ...rest,
    sarcasm: !sincere && clash(rest.affect_text.valence, rest.affect_situation.valence),
  };
}

/** The calls for one turn: one combined call, or the focused ones to run in parallel. */
export function teacherCalls(input: TurnInput, mode: 'single' | 'parallel'): TeacherCall[] {
  const context = {
    FERNI: input.ferniLast,
    CALLER: input.callerTurn,
    EARLIER: input.priorCallerTurns.slice(-2),
    NOW: input.callTimestamp,
    TZ: input.callerTimezone ?? 'unknown',
    KNOWN_NAME: input.callerName ?? null,
  };
  if (mode === 'single') {
    const system = `${CORE_PROMPT}\nanswered_prior_question: ${ANSWERED_PROMPT} (QUESTION is FERNI, REPLY is CALLER)\n${CLASH_PROMPT}`;
    return [call(system, context, SINGLE, (v) => fromClash(v))];
  }
  return [
    call(CORE_PROMPT, context, CORE, (v) => v),
    call(
      ANSWERED_PROMPT,
      { QUESTION: input.ferniLast, REPLY: input.callerTurn },
      ANSWERED,
      (v) => v
    ),
    call(CLASH_PROMPT, { FERNI: input.ferniLast, CALLER: input.callerTurn }, CLASH, (v) =>
      fromClash(v)
    ),
  ];
}
