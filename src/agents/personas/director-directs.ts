/**
 * DIRECTOR_DIRECTS: the director recast as a director, not a style critic.
 *
 * Measured 2026-10-18 (scripts/persona-eval, multi-turn): a quarter to a third
 * of the live director's notes corrected delivery ("Drop the cheerleader
 * voice", "watch his filler words"), and only 7-14% noticed anything about the
 * caller. Its instructions were mostly "never do X", so it policed. When the
 * shared scripts came out of the turn (SCRIPT_FREE_REMINDER), the model's own
 * defaults came back for every persona alike: replies ending on a question
 * went from 28% to 94%, opening with Oh/Yeah/Hmm from 7% to 59%.
 *
 * With the flag on, the director gives direction the way a theatre or film
 * director gives it to an actor: what the moment is really about, the
 * subtext, what in the caller's life bears on it, what this character cares
 * about or wants here, and an action verb for the beat. It knows the persona
 * on the call from that persona's own character sheet, so the job the shared
 * scripts did (no question every turn, no reaction-word opener) becomes the
 * character's intention, per persona, when it fits. It never corrects the
 * delivery and never writes lines: notes that do are dropped (policesDelivery,
 * scriptedNote). The deliberator's private thought is framed for the same
 * persona.
 *
 * Off (the default), every prompt is byte-identical to before
 * (director-directs.test.ts compares them with a golden from origin/main).
 *
 * The persona-framing idea comes from director-cast.ts (#2164); scriptedNote()
 * is director-scene.ts's. With DIRECTOR_SEES_SCENE also on, the director's
 * prompt carries the SCENE block too (director-notes.ts).
 *
 * @module agents/personas/director-directs
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { toCanonical } from '../../personas/persona-ids.js';
import { getPersonaPronouns, type PersonaPronouns } from '../../personas/persona-pronouns.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { CHARACTER_FILE, readBundleFile } from './character-spark.js';
import { teamNote } from './director-persona.js';
import type { Cast as SceneCast } from './director-cast.js';
import { guardRuleFor } from './director-guard.js';
import { scriptedNote } from './director-scene.js';

export function directorDirects(env: Env = process.env): boolean {
  return flagOn('DIRECTOR_DIRECTS', env);
}

/** The persona being directed: the name the speaker labels use, pronouns, and who they are. */
export interface Cast {
  name: string;
  p: PersonaPronouns;
  /** The sheet's "How you are with people" and "How you talk", as written to the persona; '' without a bundle. */
  sheet: string;
}

/** The sheet sections the director reads: how the character is with people and how they talk. */
const SECTIONS = ['How you are with people', 'How you talk'];
const MAX_SHEET = 2600;

/** The parts of a character sheet the director needs, verbatim. Pure, for tests. */
export function sheetForDirector(sheet: string | null): string {
  if (!sheet) return '';
  const parts = sheet.split(/^## /m).slice(1);
  const kept = parts
    .filter((part) => SECTIONS.some((s) => part.startsWith(`${s}\n`)))
    .map((part) => part.slice(part.indexOf('\n') + 1).trim());
  const text = kept.join('\n\n');
  return text.length <= MAX_SHEET ? text : text.slice(0, MAX_SHEET).replace(/\s+\S*$/, '');
}

const casts = new Map<string, Promise<Cast>>();

/** The cast for a persona id, read once per process from its bundle. Never throws. */
export async function castFor(personaId: string | undefined): Promise<Cast> {
  const id = toCanonical(personaId || 'ferni');
  let cast = casts.get(id);
  if (!cast) {
    cast = readBundleFile(id, CHARACTER_FILE)
      .catch(() => null)
      .then((sheet) => ({
        name: getPersonaDisplayName(id),
        p: getPersonaPronouns(id),
        sheet: sheetForDirector(sheet),
      }));
    casts.set(id, cast);
  }
  return cast;
}

/** director-guard.ts's rule takes director-cast.ts's Cast: name and pronouns are all it reads. */
const guardCast = (c: Cast): SceneCast => ({ name: c.name, brief: '', p: c.p });

const cares = (c: Cast): string => (c.p.subject === 'they' ? 'care' : 'cares');

/** Who the character is, as their own sheet says it, for a prompt. */
const whoTheyAre = (c: Cast): string =>
  c.sheet
    ? `Who ${c.name} is, from ${c.p.possessive} own character sheet (written to ${c.p.object}, as "you"):\n${c.sheet}`
    : '';

/** The director's instructions with DIRECTOR_DIRECTS on, for the persona on the call. */
export function directsSystem(c: Cast, opts: { tools?: boolean } = {}): string {
  const { name, p } = c;
  return [
    `You direct ${name} on a live, unscripted phone call with someone ${p.subject} ${cares(c)} about. ${name} improvises every word, in character. Between ${p.possessive} turns you give ${p.object} at most two private notes of direction for ${p.possessive} next reply, the way a great theatre or film director talks to an actor: about the scene and the person in it, never about the delivery.`,
    whoTheyAre(c),
    `Direction is one of these, naming the actual detail from this call:
- what this moment is really about for the caller, the subtext under what they said
- something in their life, as they have told it, that bears on this and is worth noticing now
- what ${name}, being who ${p.subject} is, cares about or wants for them here
- the action for the beat, as a verb with its reason: to reassure, to tease, to dig in, to celebrate, to let it land, to sit with it, to lighten it
Give each note with its reason in under 20 words. Write the note itself, without naming which kind it is.`,
    `Play the character's intention. A real person doesn't end every reply on a question or open every one by reacting. For each beat, weigh what ${name}, being who ${p.subject} is, would actually do: when ${p.subject} wouldn't ask anything here, or would start straight with what ${p.subject} thinks, say so as ${p.possessive} intention and what ${p.subject} would do instead (say what ${p.subject} makes of it, tell a bit of ${p.possessive} own, leave room).`,
    guardRuleFor(guardCast(c)), // director-guard.ts (#2266): no note erodes a boundary, honesty or tool truth
    `How ${name} sounds is ${p.possessive} craft, not yours: never comment on ${p.possessive} tone, words, fillers, energy or length, and never tell ${p.object} to drop, avoid, stop or tone down anything. Never write lines or quote words for ${p.object} to say.`,
    `${name} reads your notes only after the caller has spoken again, and what they say next comes first: direct the person and the scene, not a reply to one earlier line.`,
    `A friend, not a therapist: never direct ${p.object} to acknowledge, validate, support or ask about feelings. Pauses, short answers and unanswered questions are normal; never push on them. Don't pin a hidden motive or mood on the caller. When they ask something, the next reply answers it.`,
    `Each line of the call is labelled with who said it. Never tell ${name} to say who ${p.subject} is or to correct who the caller thinks they are talking to. ${teamNote(name)}`,
    ...(opts.tools
      ? [
          `${name} has tools (music, timers, reminders, weather, calls and more). The tool calls on this call are listed after the transcript: one that is running or done is real. Never claim ${name} can't do something or lacks a tool; you can't see the full set.`,
        ]
      : []),
    `If ${name} is already in the scene and nothing needs directing, reply NONE. Reply with only the notes, one per line, no numbering, or exactly NONE.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The deliberator's instructions with DIRECTOR_DIRECTS on: the character's own private thought. */
export function directsDeliberationSystem(c: Cast): string {
  const { name, p } = c;
  return [
    `You are ${name}'s private thoughts during a live phone call with someone ${p.subject} ${cares(c)} about. ${name} answers in real time, in character; you have a little longer.`,
    whoTheyAre(c),
    `Think it over the way ${name} would, from who ${p.subject} is, then keep AT MOST ONE thing ${p.subject} might bring up in the next turn or two, and only if it is worth more than what ${p.subject} would say anyway:
- insight: what this is really about for them, the thing under what they said
- question: the one question ${name} would actually want answered, and only if ${p.subject} would ask one here
- connection: two things they said (on this call, or in what ${name} remembers) that bear on each other
- reframe: a truer or kinder way to see what they described, the way ${name} sees things
Ground it in what they actually said and name the detail. Never invent facts, history or people. No diagnoses, clinical labels or therapy-speak, no advice they did not ask for dressed up as insight, no flattery: honest the way a good friend is. It is a thought, not a line: never words for ${p.object} to say.
Return JSON only, either {"kind":"none"} or {"kind":"insight"|"question"|"connection"|"reframe","note":"the thought, under 22 words","confidence":0.0-1.0,"whyNow":"under 12 words","doNotUseIf":"when bringing it up would be wrong, under 10 words"}`,
    guardRuleFor(guardCast(c), { thought: true }), // director-guard.ts (#2266)
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * A note that corrects the delivery instead of directing the scene: "Drop the
 * cheerleader voice", "watch his filler words", "less upbeat", "too many
 * questions". The character's intention ("Nayan has nothing he needs to ask
 * here") is direction and stays.
 */
const CORRECTIVE =
  /\b(?:drop|avoid|stop|cut|lose|ditch|skip|kill|tone down|dial (?:it |that )?(?:down|back)|ease up on|watch|careful with|enough with|no more|less|fewer|too many|too much)\b[^.;]{0,30}\b(?:filler|fillers|filler words|cheerleader|cheerleading|voice|tone|exclamations?|questions?|opener|openers|words|wording|phrasing|language|metaphors?|delivery|upbeat|peppy|energy|hedg\w*|ums?|uhs?|sentences?|length|rambl\w*|repeating|jargon|clich\w*|therapy[- ]speak|enthusiasm|check-ins?)\b/i;
const SOUNDS_LIKE =
  /\b(?:you|he|she|ferni|alex|maya|peter|jordan|nayan|don'?t|doesn'?t) (?:sound|sounds|sounded|are sounding|is sounding) (?:too|like a|like an|so|very|a bit|robotic|scripted|forced|fake|clinical|stiff)\b|\b(?:keep|make) (?:the|your|his|her|their) (?:delivery|tone|voice)\b/i;

export function policesDelivery(note: string): boolean {
  return CORRECTIVE.test(note) || SOUNDS_LIKE.test(note);
}

/** Feelings a note can name on the caller. */
const FELT =
  '(?:worried|anxious|nervous|scared|afraid|terrified|overwhelmed|exhausted|stressed|lonely|isolated|insecure|guilty|relieved|defensive|vulnerable|exposed|helpless|ashamed|embarrassed|resentful|unsettled|restless|overshadowed|pressured|judged|self-conscious)';
/**
 * What a guess can pin on the caller: "might be feeling", "might mean", "might feel a
 * bit overshadowed", "must be exhausted". Not "a long answer might feel like a lecture".
 */
const GUESSED = `(?:feeling|needing|wanting|hiding|using|looking|trying|carrying|waiting|thinking|dealing|dreading|bursting|panicking|processing|need|needs|want|wants|mean|means|feel (?:a bit |a little |so |more |very )?${FELT}|${FELT})`;
/** Emotions a note can give as the reason for what the caller said or did. */
const EMOTION =
  '(?:afraid|scared|terrified|fear|fears|insecure|anxious|anxiety|nervous|nerves|worried|vulnerable|ashamed|embarrassed|guilty|guilt|dread|dreading|stress|stressful|stressed|overwhelmed|lonely|exposed|uncomfortable|pressure|panic|wired)';
/** Not inside a question: "ask how they are actually feeling", "name the thing they are dreading". */
const NOT_ASKED = String.raw`(?<!\b(?:how|what|if|whether|why|ask|asking|name)\b[^.;:]{0,25})`;
/** Not something the actor would cause: "without making her feel guilty". */
const NOT_MADE = String.raw`(?<!\b(?:make|makes|making|made|let|letting) (?:\w+ )?)`;
/**
 * The ways a note pins a feeling or motive on the caller that they haven't
 * said, each a family of phrasing, on word boundaries. Built from the labelled
 * notes in __tests__/director-mind-reading.fixture.json.
 */
const READS_MIND: readonly RegExp[] = [
  // A guess at their inner state: "Riley is likely hiding some anxiety", "is probably
  // feeling", "might be feeling self-conscious", "her silence might mean", "how exhausted
  // they must be". Not the adjective ("Priya's likely reaction"), not a thing that
  // "might feel too heavy".
  /(?<!\b(?:the|a|their|her|his) )\b(?:likely|probably|presumably)\b(?! (?:reaction|response|outcome|answer|reply)\b)/i,
  new RegExp(
    String.raw`(?<!["”] )\b(?:might|may|must|could)(?: just| also| still| really| secretly)?(?: be)? ${GUESSED}\b`,
    'i'
  ),
  /\bhow \w+ (?:they|she|he) (?:must|might) (?:be|feel)\b/i,
  // Reading it off what they did: "a 'weird' week usually means they're feeling", "asking
  // for a second opinion means they are stuck".
  /\b(?<!(?:doesn'?t|does not|don'?t) )means? (?:that )?(?:they|she|he)(?:'re| are| is|'s|’re|’s| feels?)\b/i,
  // A hidden state, or the real one under the shown one.
  /\b(?:secretly|deep down|underneath|beneath|underlying|unexpressed|unspoken|hiding|masking|bottl(?:ed|ing) (?:it )?up|under the (?:excitement|surface|jokes?)|a deeper \w+)\b/i,
  new RegExp(
    String.raw`${NOT_ASKED}\b(?:(?:is|are|'s|'re|’s|’re) (?:actually|really|secretly) (?:feeling|hiding|worried|anxious|nervous|scared|afraid|terrified|overwhelmed|insecure|guilty|relieved|proud|thrilled|dreading|lonely)|(?:they|she|he) (?:actually|really|secretly) (?:value|values|care|cares|love|loves|hate|hates|fear|fears|feel|feels|doubt|doubts))\b`,
    'i'
  ),
  /\bthe real reason\b/i,
  // A motive for what they said: "using the car trouble to escape", "deflecting because",
  // "changed the subject because", "a distraction from her anxiety".
  /\busing\b[^.;:]{0,50}?\b(?:to (?:avoid|escape|dodge|distract|deflect|hide|cope|numb|stall|put off|pre-?emptively|feel)|as (?:a|an) (?:way|excuse|distraction|shield|cover))\b/i,
  /\b(?:deflect(?:s|ed|ing)?|dodg(?:e|es|ed|ing)|escap(?:e|es|ed|ing)) (?:to|into|from|the|by|because|it)\b/i,
  /\b(?:to avoid|avoid(?:s|ing)?) (?:winding|facing|sitting|talking|thinking|admitting|feeling|dealing|the (?:anxiety|stress|pressure|vulnerability|scary|reality|quiet|fear))\b/i,
  new RegExp(
    String.raw`\b(?:pivot|turn|run|hid|escap)\w* away from (?:the |her |his |their )?(?:\w+ )?${EMOTION}\b`,
    'i'
  ),
  /\b(?:is|are|'s|'re|’s|’re) trying to (?:punish|outrun|escape|distract|hide|numb|prove)\b/i,
  // Saying they changed the subject is an observation; giving the hidden reason is not.
  /\b(?:changed|changing|changes) the subject\b[^.;]{0,40}\bbecause\b|\b(?:shifted|shifting) the topic\b[^.;]{0,40}\bbecause\b|\bbrought up\b[^.;]{0,30}\bto (?:feel|avoid|deflect)\b|\bbringing up \w+ because\b/i,
  /\bdistract(?:ion|ing (?:themselves|herself|himself)) from\b|\bwants? (?:a )?distraction\b|\bgiving (?:them|him|her) (?:a reason|an excuse) to\b/i,
  new RegExp(
    String.raw`\bbecause (?:they|she|he|talking|asking|the)\b[^.;]{0,50}\b(?:are|is|'re|'s|’re|’s|feels?|makes?|making) (?:\w+ ){0,3}${EMOTION}\b`,
    'i'
  ),
  /\bbecause (?:they|she|he) (?:feel|feels|felt|trust|trusts)\b|\b(?:called|calling|coming to) you because\b/i,
  new RegExp(String.raw`\bout of ${EMOTION}\b`, 'i'),
  /\blooking for (?:permission|validation|approval|an excuse|a script|a distraction|a way out|an out)\b|\b(?:wants?|needs?) you to (?:justify|validate|approve)\b|\bhelp (?:them|her|him) justify\b/i,
  // A feeling nothing they said points to, as fact: "Riley is feeling guilty", "feels
  // lonely in this decision", "already anxious about the review", "the guilt", "their
  // fear of the meeting", "self-conscious about how much they'll miss her".
  new RegExp(
    String.raw`${NOT_MADE}\b(?:is|are|'s|'re|’s|’re|feels?|feeling|been) (?:\w+ ){0,2}(?:guilty|lonely|isolated|defensive|insecure|helpless|ashamed|caught(?! up)|overshadowed|resentful|jealous|unsettled|restless|alone and|misunderstood)\b`,
    'i'
  ),
  /(?<!["“])\b(?:guilt|lonely|nervous (?:tension|energy))\b/i,
  new RegExp(
    String.raw`${NOT_ASKED}\b(?:'s|is|are|'re|’s|’re|been) (?:already |still )?(?:anxious|nervous|worried|scared|afraid) about\b|\b(?:has|had|have) (?:had )?(?:doubts|second thoughts|reservations)\b`,
    'i'
  ),
  /\b(?:their|her|his) (?:fear|anxiety|worry|insecurity|shame) (?:of|about)\b/i,
  /\b(?:self-conscious|insecure|embarrassed|ashamed) about (?:how much|how deeply|showing)\b/i,
  new RegExp(String.raw`${NOT_ASKED}\b(?:is|are|'s|'re|’s|’re) dreading\b`, 'i'),
];

/**
 * A note that pins a hidden feeling or motive on the caller: "Riley is using the
 * car trouble to escape the pressure of the upcoming raise conversation", "Riley
 * is likely hiding some anxiety about the big move". The prompt already says not
 * to, and MIND_READING in parseNotes doesn't catch these: with DIRECTOR_DIRECTS on
 * they went from 2/193 notes to 45/276 (regex count, bar run M2c, 2026-10-18);
 * hand-labelled, 217 of the 1063 notes of four flag-on arms. Subtext grounded in
 * what they said ("she keeps hearing it: the goodbye is the scene") stays.
 * Labelled set: __tests__/director-mind-reading.fixture.json.
 */
export function readsMind(note: string): boolean {
  return READS_MIND.some((re) => re.test(note));
}

/**
 * A note written as a line of the call ("Riley: yes! They called me..."): the
 * model continuing the transcript, inventing what someone says. Smoke run
 * 2026-10-18, Maya's director.
 */
export function transcriptNote(note: string, names: readonly string[]): boolean {
  const label = /^([^:]{1,40}):/.exec(note)?.[1]?.trim().toLowerCase();
  return label !== undefined && names.some((n) => n.toLowerCase() === label);
}

/** A note that is a line for the actor to say: director-scene.ts's check, shared with DIRECTOR_SEES_SCENE. */
export { scriptedNote };

/** parseNotes' DIRECTOR_DIRECTS options: guard on, and who speaks on the call (director-notes.ts). */
export interface DirectsFilter {
  directs?: boolean;
  names?: readonly string[];
}

/**
 * With `directs` on, a note the guard drops: it polices delivery, pins an
 * unsaid feeling or motive on the caller, scripts a line or reads as a line of
 * the call by one of `names`. Off, nothing is.
 */
export function misdirects(note: string, callerSaid: string, opts: DirectsFilter = {}): boolean {
  if (!opts.directs) return false;
  return (
    policesDelivery(note) ||
    readsMind(note) ||
    scriptedNote(note, callerSaid) ||
    transcriptNote(note, opts.names ?? [])
  );
}

/** The director's request for the persona on the call, as DIRECTOR_DIRECTS frames it. */
export async function directsAsk(
  personaId: string | undefined,
  tools: boolean
): Promise<{ system: string; speaking: string }> {
  const cast = await castFor(personaId);
  return { system: directsSystem(cast, { tools }), speaking: cast.name };
}
