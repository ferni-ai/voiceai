/**
 * FAMILY_TABLE (off by default, cohort-capable): a handoff is a small family moment, not a
 * switchboard transfer.
 *
 * Prod 2026-10-18: four handoffs in four minutes, each a stock line ("Maya's perfect for
 * this. One moment.", banter.ts). With the flag on, the departing persona says one fond,
 * specific line about the teammate, from canon only, and the teammate's first words may
 * hand a word back ("Ferni's been bragging again, hasn't he?") before serving the caller.
 *
 * - The lines live in each persona's `identity/family-table.json` (fond: about a teammate;
 *   back: to the one who just handed over), so they are edited as content, not code.
 * - No line about a teammate twice in one call, and the word back once per pair per call.
 * - Never on a heavy moment: after the crisis gate guided or replaced a reply on this call,
 *   on a hard turn or mood, or when the caller asked to be put through urgently. Then a
 *   plain, warm line, and no word back.
 * - The word back goes in front of the arrival line after its grounding check
 *   (handoff-brief.ts), so it never meets the caller-facts filter; it names only teammates.
 *
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

function familyTableEnabled(env: Env = process.env): boolean {
  return flagOn('FAMILY_TABLE', env);
}

/** One persona's lines: fond[teammate] when handing over, back[teammate] when handed to. */
export interface FamilyLines {
  fond: Record<string, string[]>;
  back: Record<string, string>;
}

const EMPTY: FamilyLines = { fond: {}, back: {} };
const tables = new Map<string, FamilyLines>();

/** The persona's identity/family-table.json, read once; empty when it has none. */
export function familyLines(personaId: string): FamilyLines {
  const cached = tables.get(personaId);
  if (cached) return cached;
  let lines = EMPTY;
  for (const root of getBundleSearchPaths()) {
    try {
      const raw = JSON.parse(
        readFileSync(join(root, personaId, 'identity', 'family-table.json'), 'utf8')
      ) as Partial<FamilyLines>;
      lines = { fond: raw.fond ?? {}, back: raw.back ?? {} };
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn({ personaId, root, error: String(error) }, 'Unreadable family table');
      }
    }
  }
  tables.set(personaId, lines);
  return lines;
}

interface CallTable {
  /** Fond lines already said on this call. */
  said: Set<string>;
  /** "from>to" pairs whose word back was said. */
  answered: Set<string>;
  /** The last departure was fond: the arriving teammate may answer it. */
  pending?: string;
}

const MAX_CALLS = 500;
const calls = new Map<string, CallTable>();

function callTable(callId: string): CallTable {
  let call = calls.get(callId);
  if (!call) {
    if (calls.size >= MAX_CALLS) calls.delete(calls.keys().next().value as string);
    call = { said: new Set(), answered: new Set() };
    calls.set(callId, call);
  }
  return call;
}

/** Their voice read heavy (the handoff request's userEmotion). */
const HEAVY_MOOD =
  /^(?:sad|hurt|anxious|fearful|scared|angry|grief|grieving|distressed|stressed|negative|overwhelmed|upset|lonely|crisis)$/i;
/** Put through urgently: "right now", "quick", "asap". Whole words only. */
const URGENT =
  /\b(?:right now|right away|asap|hurry|urgent|urgently|emergency|immediately|quick|quickly|now please)\b/i;

/** Why this handoff gets a plain line, or undefined when a fond one fits. */
function heavyHandoff(
  session: unknown,
  userEmotion: string | undefined,
  callerTurns: string[]
): string | undefined {
  if (crisisDecidedOn(session)) return 'crisis';
  if (HEAVY_MOOD.test(userEmotion?.trim() ?? '')) return 'mood';
  if (isHeavyMoment(callerTurns)) return 'heavy';
  if (URGENT.test(callerTurns.at(-1) ?? '')) return 'urgent';
  return undefined;
}

const firstName = (personaId: string): string => getPersonaDisplayName(personaId).split(/\s+/)[0];

/** The warm handoff for a hard moment: no joke, no teammate trivia. */
export const plainHandoff = (to: string): string => `Okay. I'll get ${firstName(to)} for you.`;

/**
 * The departing persona's line. Off: today's line (handoff-brief.ts). On: one fond line
 * about the teammate not yet said on this call, or the plain line on a heavy moment.
 */
export function familyDeparture(
  agent: { personaId: string; session: unknown },
  request: { targetPersonaId: string; userEmotion?: string },
  callId: string,
  env: Env = process.env
): string {
  const from = agent.personaId;
  const to = request.targetPersonaId;
  if (!familyTableEnabled(env)) return departureLine(from, to, env);
  const call = callTable(callId);
  call.pending = undefined;
  const callerTurns = readConversation(agent.session)
    .turns.filter((t) => t.speaker === 'caller')
    .map((t) => t.text);
  const heavy = heavyHandoff(agent.session, request.userEmotion, callerTurns);
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

/**
 * The arriving teammate's first words: a word back to whoever handed over fondly (once per
 * pair per call), then `firstLine` (the briefed line) or the canned arrival line.
 */
export function familyArrival(
  to: string,
  from: string,
  callId: string,
  firstLine?: string,
  env: Env = process.env
): string {
  const line = firstLine ?? arrivalLine(to, from, env);
  if (!familyTableEnabled(env)) return line;
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
