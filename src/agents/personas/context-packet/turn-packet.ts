/**
 * The live inputs of the context packet (CONTEXT_PACKET=on) as the typed input
 * the assembler takes (context-packet.ts): the facts recall picked, kept per
 * call and labelled with where they came from (the rest of recall's note is sent
 * as before, word for word), and the turn's notes exactly as the plain
 * reminder carries them, in its order (turn-request.ts), plus an honesty note
 * when the caller asks how Ferni knows something.
 *
 * @module agents/personas/context-packet/turn-packet
 */

import { createHash } from 'node:crypto';

import { contextPacketEnabled } from '../../../config/context-packet-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  addRecallNote,
  type MemoryRecall,
  type RecallAgent,
} from '../../multi-agent/memory-recall-hook.js';
import { dropForgottenNotes } from '../../multi-agent/recall-note.js';
import { forgottenCheckNow } from '../../../memory/recall/forget-every-reader.js';

import { forgottenInProcess } from '../../../memory/recall/forget.js';
import {
  factId,
  isForgotten,
  RECALL_RULE,
  type RecallFact,
} from '../../../memory/recall/session-recall.js';
import { getDisplayName } from '../../../personas/persona-ids.js';
import {
  assembleContextPacket,
  type ContextPacket,
  type KnownFact,
  type PacketAccounting,
} from './context-packet.js';

const log = createLogger({ module: 'ContextPacket' });

/** One recall note, split (memory-recall-hook.ts lastPick). */
export interface RecallPick {
  /** The facts about the caller it picked: labelled in the packet instead. */
  facts: RecallFact[];
  userName?: string;
  /**
   * The rest of the note, word for word as recall writes it and on the same
   * turns (check-ins, threads, inside jokes, opener, summaries, people, his own
   * life and its footer, life updates, episodes, self-recall); null when only
   * facts. Still sent as recall's chat note, so no recall flag changes.
   */
  rest: string | null;
}

const SELF = /^(speaker|user|me)$/i;

/**
 * Ids that carry no text: recall's own keys hold the fact itself
 * ("sam|phone|555..."), and ids reach the accounting the turn receipt logs.
 */
const opaque = (kind: string, key: string): string =>
  `${kind}:${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
/** Facts the extractor was unsure of are labelled unconfirmed (recall drops those under 0.4). */
const CONFIRMED_FROM = 0.6;

function factFromRecall(f: RecallFact, userName?: string): KnownFact {
  const subject = SELF.test(f.entity) ? userName || 'they' : f.entity;
  // Like formatRecall: a replaced fact still shows, marked as how things were.
  const was = f.supersededAt ? ' [no longer true: how things were before]' : '';
  return {
    id: opaque('fact', factId(f)),
    text: `${subject} ${f.key.replace(/_/g, ' ')}: ${f.value}${was}`,
    source: f.confidence >= CONFIRMED_FROM ? 'caller-said' : 'unconfirmed',
    at: f.extractedAt,
  };
}

/** Most picked facts a call keeps for its packets; the packet carries them whole, so this bounds it. */
const MAX_CALL_FACTS = 20;

interface CallMemory {
  /** Newest pick first; each pick in recall's own order (most relevant first). */
  facts: KnownFact[];
  /** The latest pick's note already carried the rule (RECALL_RULE), so the packet leaves it out. */
  ruleInChat: boolean;
}
/** Held by the call's session object, so it goes when the call does (nothing outlives it). */
const calls = new WeakMap<object, CallMemory>();

/** Keep the facts recall picked for this call's packets. A newer pick goes first, in its own order. */
export function rememberForPacket(
  session: object,
  pick: RecallPick,
  userName = pick.userName
): void {
  const call: CallMemory = calls.get(session) ?? { facts: [], ruleInChat: false };
  calls.set(session, call);
  const fresh = pick.facts.map((f) => factFromRecall(f, userName));
  const ids = new Set(fresh.map((f) => f.id));
  call.facts = [...fresh, ...call.facts.filter((f) => !ids.has(f.id))].slice(0, MAX_CALL_FACTS);
  call.ruleInChat = pick.rest?.includes(RECALL_RULE) ?? false;
}

/**
 * A recall note, sent: CONTEXT_PACKET=on keeps what recall picked for the
 * turn's packet, labelled, and adds only the rest (RecallPick.rest) as recall's
 * chat note. Off: the note as before (memory-recall-hook.ts addRecallNote).
 * `said` is the transcript the note was built for (PREEMPT_STABLE_CONTEXT).
 * FORGET_EVERY_READER=on: every turn, recall notes already in the chat are
 * checked again (a topic forgotten mid-call takes them out), and a new note
 * about a forgotten topic is not sent.
 */
export function sendRecall(
  agent: RecallAgent,
  session: object,
  recall: MemoryRecall,
  note: string | null,
  said?: string,
  userId?: string
): void {
  const forgotten = forgottenCheckNow(userId);
  dropForgottenNotes(agent, forgotten, said);
  if (!note || forgotten?.(note)) return;
  const pick = contextPacketEnabled() ? recall.lastPick() : null;
  if (!pick) return addRecallNote(agent, note, said);
  rememberForPacket(session, pick);
  if (pick.rest) addRecallNote(agent, pick.rest, said);
}

/** "How do you know", "who told you", "where did you hear that". */
const ASKS_SOURCE =
  /\b(how (do|did|would) you (know|remember)|who told you|where did you (hear|get|learn)|how('d| did) you find out)\b/i;
export const SOURCE_NOTE =
  'They asked how you know: answer honestly from the label on that memory (when they said it), plainly, without guessing.';

export interface TurnParts {
  personaId?: string;
  userName?: string;
  timeZone?: string;
  words: string;
  /**
   * The turn's notes exactly as the plain reminder carries them, in its order
   * (turn-request.ts): told, team, director, thought, game, state, beats, ...,
   * style, exit, self-share, invite, hard rule. Never reordered or dropped.
   */
  notes: readonly string[];
  /** Where their life stands now, labelled (world-model/temporal/in-call.ts); none when empty. */
  life?: readonly string[];
  now: number;
}

function localTime(now: number, timeZone: string | undefined): string | undefined {
  if (!timeZone) return undefined;
  try {
    const at = { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone } as const;
    return new Date(now).toLocaleString('en-US', at);
  } catch {
    return undefined; // not an IANA zone
  }
}

export function turnPacket(session: object, p: TurnParts): ContextPacket {
  const call = calls.get(session);
  const persona = getDisplayName(p.personaId ?? 'ferni');
  // Topics they asked us to forget (forget.ts) are never said back, even from a pick made earlier.
  const userId = (session as { userData?: { userId?: string } }).userData?.userId;
  const forgotten = userId ? forgottenInProcess(userId) : [];
  const memories = (call?.facts ?? []).filter((f) => !isForgotten(f.text, forgotten));
  // The honesty note leads the turn's own notes, which keep the plain order.
  const honesty = ASKS_SOURCE.test(p.words) ? [SOURCE_NOTE] : [];
  return assembleContextPacket({
    persona,
    caller: { name: p.userName },
    rightNow: { localTime: localTime(p.now, p.timeZone) },
    life: p.life,
    // Recall budgets its facts per turn; once picked they stay, like its notes in the chat.
    memories,
    memoriesWhole: true,
    memoryRule: call?.ruleInChat ? undefined : RECALL_RULE,
    turn: [...honesty, ...p.notes],
    now: p.now,
    timeZone: p.timeZone,
  });
}

/**
 * CONTEXT_PACKET=on: the turn's reminder as one labelled packet, for
 * withTurnReminder. Logged as counts only (packetLogFields): no text, ids or names.
 */
export function packetReminder(
  session: object,
  words: string,
  notes: readonly string[],
  life?: readonly string[]
): string {
  const userData = (session as { userData?: unknown }).userData as
    { personaId?: string; userName?: string; callerTimezone?: string } | undefined;
  const { text, accounting } = turnPacket(session, {
    personaId: userData?.personaId,
    userName: userData?.userName,
    timeZone: userData?.callerTimezone,
    words,
    notes,
    life,
    now: Date.now(),
  });
  log.info(packetLogFields(accounting), 'CONTEXT_PACKET'); // counts only, never text
  return text;
}

/**
 * What the CONTEXT_PACKET log line carries: section names and token
 * estimates, and dropped counts by section, kind, source and reason. No text,
 * no ids, no names: nothing a caller said or a note held.
 */
export function packetLogFields(accounting: PacketAccounting) {
  const count = (keys: string[]): Record<string, number> =>
    keys.reduce<Record<string, number>>((n, k) => ({ ...n, [k]: (n[k] ?? 0) + 1 }), {});
  return {
    sections: accounting.sections.filter((s) => s.lines > 0).map((s) => [s.name, s.tokensEst]),
    tokens: accounting.totalTokensEst,
    dropped: count(accounting.dropped.map((d) => `${d.section}:${d.reason}`)),
    guidanceDropped: count(
      accounting.guidanceDropped.map((d) => `${d.kind}:${d.source}:${d.reason}`)
    ),
  };
}
