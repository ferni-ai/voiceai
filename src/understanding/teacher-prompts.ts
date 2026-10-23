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

const valence = z.number().int().min(-2).max(2);
const TEACHER_ONLY = {
  answered_prior_question: true,
  affect_text: true,
  affect_situation: true,
} as const;
const CORE = TURN_READING_ZOD.omit({ ...TEACHER_ONLY, sarcasm: true });
const ANSWERED = TURN_READING_ZOD.pick({ answered_prior_question: true });
const CLASH = z
  .object({ affect_text: valence, affect_situation: valence, sincere: z.boolean() })
  .strict();
const SINGLE = CORE.extend({ ...ANSWERED.shape, ...CLASH.shape }).strict();

const CORE_PROMPT = `You label one caller turn on a phone call with their friend Ferni. CALLER is the turn to label; FERNI is Ferni's line just before it; EARLIER are the caller's turns before that. Labels:
speech_act: answer (replies to what Ferni asked), greeting (hello), self_id ("Seth here", "it's me"), pleasantry ("good thanks", "you?" after a hello), question, request (asks Ferni to do something), statement (tells something new), topic_change ("anyway", moves on), backchannel ("mm", "yeah" while Ferni talks), closing (goodbye). "Good thanks" after "how are you?" in a hello is pleasantry; after "how did the interview go?" it is answer.
affect: the caller's feeling: label low|neutral|upbeat|mixed|distress, valence -2..2, arousal low|med|high. Judge the events, not the surface words: "oh fantastic, my car broke down again" is negative.
affect_target: who the feeling is about: caller (their life), ferni, other (someone or something else), none.
action_claim: an action the caller says was, is or will be done: kind none|send|call|schedule|book|remember|other, tense past|present|future, own_life true when it is the caller's own doing (false when they ask Ferni to do it or report someone else's). "I just sent it" = send, past, true. No action: kind none, tense present, own_life false.
explicit_self_report: they state their own feeling or state outright ("I'm exhausted", "I feel great").
time_expressions: every time phrase, verbatim text, kind point|span, start_iso/end_iso resolved against NOW in TZ (null if unresolvable), relation to NOW future|ongoing|past. "on the 30th" (later this month) and "in two weeks" are future.
temporal_orientation: the turn as a whole: future_plan, past_report, ongoing, none.
crisis_signal: none; distress (sad, stressed, hurting, no thought of dying); passive (wishes they were not around, burden); active (thoughts of killing themselves); plan (method, time or means).
name_given: the name they give for themselves this turn, else null.
humor_cue: laugh (they laugh: haha, lol), joke (they are kidding), good_news (happy news), none.`;

const ANSWERED_PROMPT = `QUESTION is Ferni's last line; REPLY is what the caller said next. Does REPLY answer the question asked in QUESTION? yes, partial, or no; n/a when QUESTION asks nothing. "Good thanks" answers "how are you?" but not "what time works?" or "did you send it?". A hello or a name answers only a question about who it is.`;

const CLASH_PROMPT = `Score from -2 (very bad) to 2 (very good): affect_text, how the caller's evaluative words sound on their own ("fantastic", "awful"), 0 if none; affect_situation, how good or bad the events they describe are for them, 0 if none. sincere: false when the words are ironic about the events. "oh fantastic, my car broke down again": 2, -2, false.`;

/** Words and events pull hard in opposite directions. */
export function clash(text: number, situation: number): boolean {
  return text * situation < 0 && Math.abs(text - situation) >= 3;
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
  return { ...rest, sarcasm: !sincere && clash(rest.affect_text, rest.affect_situation) };
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
    const system = `${CORE_PROMPT}\nanswered_prior_question: ${ANSWERED_PROMPT} (QUESTION is FERNI, REPLY is CALLER)\naffect_text, affect_situation, sincere: ${CLASH_PROMPT}`;
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
