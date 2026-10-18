/**
 * FAMILY_TABLE (off by default, cohort-capable): prod 2026-10-18 had four handoffs, four stock
 * lines (banter.ts). On, the departing persona says one fond canon line about the teammate,
 * and the teammate may hand a word back. Lines: each persona's identity/family-table.json.
 * No fond line twice a call; never on a heavy moment (crisis gate acted, hard turn or mood,
 * urgent ask). The word back is joined after the arrival line's grounding check.
 * @module agents/multi-agent/family-table
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { flagOn, type Env } from '../../config/env-flag.js';
import { getBundleSearchPaths } from '../../personas/bundles/loader.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { createLogger } from '../../utils/safe-logger.js';
import { crisisDecidedOn } from '../safety/crisis-gate-signal.js';
import { arrivalLine, departureLine, readConversation } from './handoff-brief.js';

const log = createLogger({ module: 'FamilyTable' });

export interface FamilyLines {
  fond: Record<string, string[]>;
  back: Record<string, string>;
}

const tables = new Map<string, FamilyLines>();

/** The persona's identity/family-table.json, read once; empty when it has none. */
export function familyLines(personaId: string): FamilyLines {
  let lines = tables.get(personaId);
  if (lines) return lines;
  lines = { fond: {}, back: {} };
  for (const root of getBundleSearchPaths()) {
    const file = join(root, personaId, 'identity', 'family-table.json');
    try {
      lines = { ...lines, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<FamilyLines>) };
      break;
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!missing) log.warn({ file, error: String(error) }, 'Unreadable family table');
    }
  }
  tables.set(personaId, lines);
  return lines;
}

/** Per call: fond lines said, pairs answered, and the fond pair just handed over. */
interface CallTable {
  said: Set<string>;
  answered: Set<string>;
  pending?: string;
}
const calls = new Map<string, CallTable>();

function callTable(callId: string): CallTable {
  let call = calls.get(callId);
  if (!call) {
    if (calls.size >= 500) calls.delete(calls.keys().next().value as string);
    call = { said: new Set(), answered: new Set() };
    calls.set(callId, call);
  }
  return call;
}

const HEAVY_MOOD =
  /^(?:sad|hurt|anxious|fearful|scared|angry|grief|grieving|distressed|stressed|negative|overwhelmed|upset|lonely|crisis)$/i;
const URGENT =
  /\b(?:right now|right away|asap|hurry|urgent|urgently|emergency|immediately|quick|quickly|now please)\b/i;

/** Why this handoff gets a plain line, or undefined when a fond one fits. */
function heavyHandoff(session: unknown, said: string[], mood?: string): string | undefined {
  if (crisisDecidedOn(session)) return 'crisis';
  if (HEAVY_MOOD.test(mood?.trim() ?? '')) return 'mood';
  if (isHeavyMoment(said)) return 'heavy';
  return URGENT.test(said.at(-1) ?? '') ? 'urgent' : undefined;
}

/** The warm handoff for a hard moment: no joke, no teammate trivia. */
export const plainHandoff = (to: string): string =>
  `Okay. I'll get ${getPersonaDisplayName(to).split(/\s+/)[0]} for you.`;

/** The departing line: off, today's; on, a fond line not yet said this call, or the plain one. */
export function familyDeparture(
  agent: { personaId: string; session: unknown },
  request: { targetPersonaId: string; userEmotion?: string },
  callId: string,
  env: Env = process.env
): string {
  const { personaId: from, session } = agent;
  const to = request.targetPersonaId;
  if (!flagOn('FAMILY_TABLE', env)) return departureLine(from, to, env);
  const call = callTable(callId);
  call.pending = undefined;
  const said = readConversation(session).turns.flatMap((t) =>
    t.speaker === 'caller' ? t.text : []
  );
  const heavy = heavyHandoff(session, said, request.userEmotion);
  if (heavy) {
    log.info({ from, to, heavy }, 'Family table: plain handoff');
    return plainHandoff(to);
  }
  const fresh = (familyLines(from).fond[to] ?? []).filter((l) => !call.said.has(l));
  if (fresh.length === 0) return departureLine(from, to, env);
  const line = fresh[Math.floor(Math.random() * fresh.length)];
  call.said.add(line);
  call.pending = `${from}>${to}`;
  return line;
}

/** The arrival: a word back after a fond handover (once per pair a call), then `firstLine`. */
export function familyArrival(
  to: string,
  from: string,
  callId: string,
  firstLine?: string,
  env: Env = process.env
): string {
  const line = firstLine ?? arrivalLine(to, from, env);
  if (!flagOn('FAMILY_TABLE', env)) return line;
  const call = callTable(callId);
  const pair = `${from}>${to}`;
  const fond = call.pending === pair;
  call.pending = undefined;
  const back = familyLines(to).back[from];
  if (!fond || !back || call.answered.has(pair)) return line;
  call.answered.add(pair);
  return `${back} ${line}`;
}

/** For tests: forgets every call and every loaded table. */
export function resetFamilyTable(): void {
  calls.clear();
  tables.clear();
}
