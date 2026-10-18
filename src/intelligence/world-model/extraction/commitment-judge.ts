/**
 * After a call, one model read of the whole transcript that judges what the
 * caller said they would do (COMMITMENT_SINGLE_WRITER). The turn-path regex
 * saw one turn at a time, and a word-list gate on it (#1896) dropped real plans
 * ("I'll run tomorrow"), kept a third to a half of new slang goodbyes, and
 * still showed "call her this afternoon". Only a read of the conversation can
 * tell a plan from a goodbye and name the "her". Evaluated by
 * scripts/commitments/eval-judge.ts.
 *
 * @module intelligence/world-model/extraction/commitment-judge
 */
import type { JudgedCommitment } from '../../../services/superhuman/index.js';
import {
  transcriptOf,
  type CallFacts,
  type CallTurn,
  type ExtractionLlm,
} from './after-call-extraction.js';
import { callMomentFor, type CallMoment } from './extraction-prompt.js';
import { validDate } from './parse-observations.js';

const MAX_STATEMENT = 120;
const MAX_QUOTE = 200;
/** More than this from one call is the model listing everything. */
const MAX_ITEMS = 8;

export function buildCommitmentJudgePrompt(transcript: string, moment: CallMoment): string {
  return `You read a phone call between a person (CALLER) and their friend Ferni (FERNI, an AI). Find what the CALLER said they would do, so Ferni can ask how it went next time. Judge every line where the caller might have said they would do something, including the ones that turn out not to be plans.

The call happened on ${moment.weekday} ${moment.date} (${moment.timezone}).

Return JSON only: {"commitments": [ ... ]}. Each item:
- statement: the action as it would follow "you said you'd": no "I", "I'll" or "gonna" at the start, in plain words, spoken to the caller ("call your sister", never "my sister"). Replace every pronoun with who or what it means from earlier in the call ("call her" after "my aunt Rosa" is "call Rosa"; "get it looked at" after "the fridge is leaking" is "get the fridge looked at"). Keep the whole meaning of a run-on: "my cousin lent me twenty, I'll pay her back Monday" is "pay your cousin back the twenty Monday". Keep their day words ("tomorrow", "Friday"). If the call never says who or what a pronoun means, keep the pronoun and give confidence 0.5 or less: no one can ask about it.
- person: the person it involves, by name if the call gives one, else by relation ("sister"); omit if none
- due: YYYY-MM-DD when they named a day that resolves to one day after ${moment.date}; omit otherwise
- isCommitment: true when the caller said they will do a concrete thing in their own life, big or small ("I'll bike to work tomorrow", "dishes tonight", "gotta get my license renewed", "I'll be at Nina's game Saturday"). False for:
  - goodbyes and ways of ending the call, however they are said, even with a time in them ("okay I'm hopping off", "talk to you this weekend", "I'll let you get on with your night", "gotta scoot", "I'll call it a day")
  - thanks, agreement and pleasantries ("that works", "fair enough", "I'll be alright", "I'll remember that")
  - stances, maybes and deliberating ("I'll mull it over", "let me chew on it", "we'll see how it goes", a bare "I'll try", "maybe", "I'm considering it"); trying a named thing counts ("I'll try the spin class Monday")
  - things about this conversation or Ferni ("I'll ring you back", "I'll fill you in later"), requests to Ferni, questions
  - what someone else will do, what already happened, and anything Ferni said it would do
- confidence: 0..1, how sure you are of isCommitment
- quote: the caller's own words it came from, at most 25 words

Return {"commitments": []} when the caller said nothing like this.

TRANSCRIPT:
${transcript}`;
}

function str(x: unknown, max: number): string | undefined {
  if (typeof x !== 'string') return undefined;
  const t = x.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}

/** One item of the reply, or null when it lacks a statement or a verdict. */
function toJudged(raw: unknown, callDate: string): JudgedCommitment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const statement = str(r.statement, MAX_STATEMENT);
  if (!statement || typeof r.isCommitment !== 'boolean') return null;
  const c = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0;
  const person = str(r.person, 60);
  const due = validDate(r.due, callDate);
  const quote = str(r.quote, MAX_QUOTE);
  return {
    statement,
    isCommitment: r.isCommitment,
    confidence: Math.min(1, Math.max(0, c)),
    ...(person && { person }),
    ...(due && due >= callDate && { due }),
    ...(quote && { quote }),
  };
}

/** The judged items in a model reply; [] when the reply has no usable JSON. */
export function parseJudgedCommitments(reply: string | null, callDate: string): JudgedCommitment[] {
  const json = reply?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  let items: unknown;
  try {
    items = (JSON.parse(json) as { commitments?: unknown }).commitments;
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, MAX_ITEMS)
    .map((raw) => toJudged(raw, callDate))
    .filter((j): j is JudgedCommitment => j !== null);
}

/** The call's judged commitment candidates; [] when the caller said nothing or the model failed. */
export async function judgeCallCommitments(
  turns: CallTurn[],
  call: CallFacts,
  llm: ExtractionLlm
): Promise<JudgedCommitment[]> {
  if (!turns.some((t) => t.role === 'user' && (t.content?.trim() ?? '') !== '')) return [];
  const moment = callMomentFor(call.startedAt, call.timezone ?? 'UTC');
  const reply = await llm(buildCommitmentJudgePrompt(transcriptOf(turns), moment));
  return parseJudgedCommitments(reply, moment.date);
}
