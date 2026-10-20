/**
 * The scene the director sees, with DIRECTOR_SEES_SCENE=on: who the caller is,
 * the speaking persona's own continuity and the caller's world right now, in
 * one compact block (≤ SCENE_MAX_CHARS) before the transcript.
 *
 * Until now the director saw only the last 12 lines and tool state, so its
 * notes could only be about the last exchange. Everything here is read from
 * what the call already computed for the persona: the memory recall and
 * theory-of-mind notes already in the chat (memory-recall-hook.ts,
 * mind-note-hook.ts; their life-ledger section is the persona's own life) and
 * the world-now producers (world-now.ts). No new model call, no I/O, and it
 * is built after the reply, when the director runs, never before one.
 *
 * Notes stay notes: scriptedNote() drops a note that hands the actor a line
 * to say. Direction, never a script.
 *
 * How to measure it (A/B with scripts/persona-eval once that bar lands): run
 * the same caller scripts with DIRECTOR_SEES_SCENE off vs on, DIRECTOR_NOTES=on
 * in both, across Ferni and at least two teammates (maya-santos, jordan-taylor),
 * and compare (1) distinctness: do Maya's replies read less like Ferni's
 * (pairwise persona-confusion rate); (2) humanness: judge score, not worse;
 * (3) insight: notes that name a remembered fact or the time of day and are
 * used in the next reply, from the DIRECTOR_NOTES logs (notes per turn,
 * dropped-as-scripted count). Ship only if (1) or (3) improves with (2) flat.
 *
 * @module agents/personas/director-scene
 */

import { MIND_NOTE_HEADER } from './deliberation-anticipate.js';
import { RECALL_NOTE_ID_PREFIX } from '../multi-agent/turn-context-header.js';
import { callerZoneOf, rightNowLine, worldNowEnabled, worldNowNote } from '../shared/world-now.js';
import { isValidTimeZone } from '../shared/time-context.js';

export const SCENE_MAX_CHARS = 600;
/** Per part, so the whole block fits SCENE_MAX_CHARS with its labels. */
const PART_MAX = { caller: 150, mind: 80, ownLife: 100, worldNow: 110 } as const;

export interface SceneParts {
  /** What the persona remembers about the caller (the recall note's facts). */
  caller?: string;
  /** How they tend to be (the theory-of-mind note), without its header. */
  mind?: string;
  /** What the persona has told this caller about its own life (the life-ledger lines). */
  ownLife?: string;
  /** The caller's local day, time, part of day, holiday and cached weather. */
  worldNow?: string;
}

/** What the director's handler hands Director.observe with the flag on. */
export interface Stage {
  personaId: string;
  scene: SceneParts;
}

const clip = (text: string | undefined, max: number): string => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/** The SCENE block for the director's prompt, '' when there is nothing; never over the cap. */
export function formatScene(parts: SceneParts, speaker = 'the speaker'): string {
  const caller = [
    clip(parts.caller, PART_MAX.caller),
    parts.mind ? `how they tend to be: ${clip(parts.mind, PART_MAX.mind)}` : '',
  ].filter(Boolean);
  const lines = [
    // Shortest and surest first: if a long name pushes past the cap, the cut lands on own life.
    parts.worldNow ? `- Their world now: ${clip(parts.worldNow, PART_MAX.worldNow)}` : '',
    caller.length ? `- The caller: ${caller.join('; ')}` : '',
    parts.ownLife
      ? `- ${speaker}'s own life, as told them: ${clip(parts.ownLife, PART_MAX.ownLife)}`
      : '',
  ].filter(Boolean);
  if (!lines.length) return '';
  const block = `SCENE (background for your direction, never lines to say):\n${lines.join('\n')}`;
  return block.length <= SCENE_MAX_CHARS ? block : `${block.slice(0, SCENE_MAX_CHARS - 1)}…`;
}

interface ChatItem {
  id?: string;
  textContent?: string;
}

/** The bullet lines of the recall-note sections whose header starts with `header`. */
function bullets(note: string, header: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of note.split('\n')) {
    if (/^\[.*\]$/.test(line.trim())) inside = line.trim().startsWith(header);
    else if (inside && line.startsWith('- ')) out.push(line.slice(2).replace(/ \[[^\]]*\]/g, ''));
    else if (!/^Open threads/.test(line)) inside = false;
  }
  return out;
}

/**
 * The persona's model of the caller and of itself, from the notes recall
 * already put in the chat: the newest of each kind, as the persona sees it.
 */
export function sceneFromChat(items: readonly unknown[]): Omit<SceneParts, 'worldNow'> {
  const scene: Omit<SceneParts, 'worldNow'> = {};
  for (const item of [...(items as ChatItem[])].reverse()) {
    if (!item?.id?.startsWith(RECALL_NOTE_ID_PREFIX)) continue;
    const text = item.textContent ?? '';
    if (text.startsWith(MIND_NOTE_HEADER)) {
      scene.mind ??= text.slice(MIND_NOTE_HEADER.length).trim();
      continue;
    }
    const facts = bullets(text, '[WHAT YOU REMEMBER ABOUT');
    if (facts.length) scene.caller ??= facts.join('; ');
    const told = bullets(text, "[WHAT YOU'VE TOLD");
    if (told.length) scene.ownLife ??= told.join('; ');
  }
  return scene;
}

/**
 * The caller's world now: the persona's own "Right now" line when WORLD_NOW
 * is on (time, holiday, cached home weather), else the same producer with the
 * clock only, so the director adds no weather lookup. '' when their zone is
 * unknown: the director should not guess it.
 */
export function worldNowForDirector(session: object, now: Date = new Date()): string {
  const zone = callerZoneOf(session);
  if (!isValidTimeZone(zone)) return '';
  const line = worldNowEnabled()
    ? worldNowNote(session, now)
    : rightNowLine({ now, callerZone: zone });
  return line.replace(/^Right now for the caller: /, '');
}

export function stageFor(session: object, items: readonly unknown[], personaId: string): Stage {
  return { personaId, scene: { ...sceneFromChat(items), worldNow: worldNowForDirector(session) } };
}

const QUOTED = /["“]([^"“”]+)["”]|‘([^‘’]+)’/g;
/** "Say: ...", "tell them: ...", "try saying ...". */
const DIRECT_LINE = /\b(?:say|try saying|tell (?:them|him|her))\b(?: something like)?\s*[:—]\s*\S/i;

/**
 * A note that is a line for the actor to say: "say" with a quote, a direct
 * "Say: ...", or a quoted span of 3+ words that the caller didn't say (a
 * note may quote the caller back to the actor; it may not script the reply).
 */
export function scriptedNote(note: string, callerSaid = ''): boolean {
  if (DIRECT_LINE.test(note)) return true;
  const spans = [...note.matchAll(QUOTED)].map((m) => (m[1] ?? m[2]).trim());
  if (!spans.length) return false;
  if (/\bsay\b/i.test(note)) return true;
  const said = callerSaid.toLowerCase().replace(/\s+/g, ' ');
  return spans.some(
    (q) => q.split(/\s+/).length >= 3 && !said.includes(q.toLowerCase().replace(/[.,!?]+$/, ''))
  );
}
