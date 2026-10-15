/**
 * What a new call may be told about the last one: its topics, and Ferni's own
 * read of their mood labelled as his, never as how they were.
 *
 * Prod call 2026-10-14 (#1415): the caller said they were doing "pretty good"
 * and Ferni answered that it was a lot better than yesterday, and later "after
 * yesterday... a genuine relief". The caller had said nothing about yesterday.
 * The system prompt carried "You talked yesterday." next to "Last time you
 * talked about: <the summary's first two key points>" (agent-setup.ts), and
 * key points are the summarizer's own insights (summarizer.ts), so an
 * inference like "seemed frustrated and confused" about an odd call read as
 * the caller's bad day. The mood line ("Last time they seemed a bit tired")
 * came from Ferni's own mood tracking, stated as fact the same way.
 *
 * Caller provenance: only what the caller said about themselves may be stated
 * as fact about them. A key point that describes their feelings or state in
 * the summarizer's words is left out of the summary a new call is handed;
 * topics stay, and the mood line says it is Ferni's sense. #1469 labels who said what inside the summary; this is the
 * consumer's side for the last-call line. LAST_CALL_TOPICS_ONLY=off turns it
 * off.
 *
 * @module services/session/summary-topics
 */
import { flagOn, type Env } from '../../config/env-flag.js';

/** A key point about the caller's feelings or state, in someone else's words. */
const STATE_OF_CALLER =
  /\b(?:user|caller|they|he|she|the person)\b[^.;]{0,40}\b(?:felt|feels|feeling|seemed|seems|sounded|sounds|appeared|appears|was|were|is|got|became|expressed|showed|had)\b[^.;]{0,40}\b(?:frustrat\w*|confus\w*|upset|stress\w*|anxious|anxiety|sad|sadness|angry|anger|annoy\w*|irritat\w*|rough|tired|exhaust\w*|overwhelm\w*|struggl\w*|(?<=(?:felt|feels|feeling|seemed|seems|sounded|sounds|was|were|a bit|kind of|pretty|really|so) )(?:down|low)(?![\w-])(?! (?:in|to|at|on|by|from|there|here|key)\b)|lonely|loneliness|worried|worry|hurt|distress\w*|disappoint\w*|agitat\w*|hard (?:time|day)|bad (?:day|mood|time)|tough (?:day|time)|difficult (?:day|time)|emotional)\b/i;

export function lastCallTopicsOnly(env: Env = process.env): boolean {
  return flagOn('LAST_CALL_TOPICS_ONLY', env);
}

/** The key points a new call may be handed: none that read the caller's mood for them. */
export function topicKeyPoints(keyPoints: readonly string[], env: Env = process.env): string[] {
  if (!lastCallTopicsOnly(env)) return [...keyPoints];
  return keyPoints.filter((point) => !STATE_OF_CALLER.test(point));
}

/** A stored last-call summary ("a; b") with any read of the caller's mood left out. */
export function lastCallTopics(summary: string | undefined, env: Env = process.env): string {
  if (!summary?.trim()) return '';
  return topicKeyPoints(summary.split(/;\s*/), env).join('; ').trim();
}

/**
 * The last-call lines for the system prompt: Ferni's own notes, not what the
 * caller said, and none when only a mood read was left. Spread into the list.
 */
export function lastCallNotes(summary: string | undefined, env: Env = process.env): string[] {
  if (!lastCallTopicsOnly(env)) return summary ? [`Last time you talked about: ${summary}`] : [];
  const topics = lastCallTopics(summary, env);
  if (!topics) return [];
  return [
    `Your own notes on what you talked about last time (not their words): ${topics}. ` +
      'Never tell them how their day, mood or last call went unless they tell you on this call.',
  ];
}

/** The last-call mood lines as they were (LAST_CALL_TOPICS_ONLY=off). */
const MOOD_CONTEXT: Record<string, string> = {
  tired_but_present: 'Last time they seemed a bit tired - be gentle.',
  reflective: 'Last time they were in a reflective mood.',
  philosophical: 'Last time they were in a thoughtful, philosophical space.',
  energized: 'Last time they were full of energy!',
  grounded: 'Last time they seemed calm and grounded.',
  playful: 'Last time they were in a playful mood.',
  nostalgic: 'Last time they were feeling nostalgic.',
};

/** The same moods as Ferni's own sense of them. */
const MOOD_SENSE: Record<string, string> = {
  tired_but_present: 'a bit tired',
  reflective: 'reflective',
  philosophical: 'thoughtful',
  energized: 'full of energy',
  grounded: 'calm and grounded',
  playful: 'playful',
  nostalgic: 'nostalgic',
};

/**
 * The last-call mood line for the system prompt (humanizingState.lastMood,
 * from Ferni's own mood tracking): his sense, not something they said, and
 * never to be told back to them. Spread into the list.
 */
export function lastMoodNote(mood: string | undefined, env: Env = process.env): string[] {
  if (!mood || !Object.hasOwn(MOOD_CONTEXT, mood)) return [];
  if (!lastCallTopicsOnly(env)) return [MOOD_CONTEXT[mood]];
  return [
    `Your own sense last time, not something they said: they seemed ${MOOD_SENSE[mood]}. ` +
      'Let it shape your tone; never tell them how they were or how their day went unless they say so on this call.',
  ];
}
