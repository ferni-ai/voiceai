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
 * With `directs` on, a note the guard drops: it polices delivery, scripts a
 * line or reads as a line of the call by one of `names`. Off, nothing is.
 */
export function misdirects(note: string, callerSaid: string, opts: DirectsFilter = {}): boolean {
  if (!opts.directs) return false;
  return (
    policesDelivery(note) ||
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
