/**
 * A teammate's insight in another persona's prompt as what came up on the caller's call
 * with them ("From Jordan: …" read as news from a Jordan in their life). Behind
 * TEAMMATE_TALK_FILTER; off, each persona keeps its own wording.
 * @module memory/cross-persona/teammate-note
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { CrossPersonaInsight } from './shared-memory-api.js';

type Insight = Pick<CrossPersonaInsight, 'fromPersona' | 'content'>;

export function teammateNote(i: Insight): string {
  const name = i.fromPersona.charAt(0).toUpperCase() + i.fromPersona.slice(1);
  return `- From the caller's call with your teammate ${name}: ${i.content}`;
}

/** The insight's line: teammateNote with the flag on, else the persona's own format. */
export function insightText<T extends Insight>(
  i: T,
  own: (i: T) => string,
  env: Env = process.env
): string {
  return flagOn('TEAMMATE_TALK_FILTER', env) ? teammateNote(i) : own(i);
}
