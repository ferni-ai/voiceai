/**
 * The live inputs of the context packet (CONTEXT_PACKET=on) as the typed input
 * the assembler takes (context-packet.ts): recall's picks, kept per call instead
 * of an unlabelled chat note, and the turn's notes for the one ranker, plus an
 * honesty note when the caller asks how Ferni knows something.
 *
 * @module agents/personas/context-packet/turn-packet
 */

import { createHash } from 'node:crypto';

import { factId, type RecallFact } from '../../../memory/recall/session-recall.js';
import { getDisplayName } from '../../../personas/persona-ids.js';
import type { OpenCommitment } from '../../../services/superhuman/commitment-follow-up.js';
import type { LedgerFact } from '../life-ledger.js';
import type { LifeUpdate } from '../life-updates.js';
import {
  assembleContextPacket,
  type Commitment,
  type ContextPacket,
  type KnownFact,
  type PacketAccounting,
} from './context-packet.js';
import type { GuidanceNote } from './guidance-ranker.js';

/** What one recall picked for the caller's words (memory-recall-hook.ts lastPick). */
export interface RecallPick {
  facts: RecallFact[];
  followUps: string[];
  told: LedgerFact[];
  since: LifeUpdate[];
  checkIns: OpenCommitment[];
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
  return {
    id: opaque('fact', factId(f)),
    text: `${subject} ${f.key.replace(/_/g, ' ')}: ${f.value}`,
    source: f.confidence >= CONFIRMED_FROM ? 'caller-said' : 'unconfirmed',
    at: f.extractedAt,
  };
}

function factsOf(pick: RecallPick, userName?: string): KnownFact[] {
  return [
    ...pick.facts.map((f) => factFromRecall(f, userName)),
    ...pick.followUps.map((t): KnownFact => ({
      id: opaque('thread', t),
      text: t,
      source: 'thread',
    })),
    ...pick.told.map((f): KnownFact => ({
      id: opaque('told', f.fact),
      text: f.fact,
      source: 'i-said',
      at: f.saidAt,
      learnedBy: getDisplayName(f.personaId),
    })),
    // Written for the persona that owns them (recall loads Ferni's): only they tell them.
    ...pick.since.map((u): KnownFact => ({
      id: opaque('since', u.update),
      text: u.update,
      source: 'my-news',
      learnedBy: getDisplayName(u.personaId),
    })),
  ];
}

interface CallMemory {
  /** Newest pick first; each pick in recall's own order (most relevant first). */
  facts: KnownFact[];
  commitments: Map<string, Commitment>;
}
const calls = new WeakMap<object, CallMemory>();

/** Keep what recall picked for this call's packets. A newer pick goes first, in its own order. */
export function rememberForPacket(session: object, pick: RecallPick, userName?: string): void {
  const call: CallMemory = calls.get(session) ?? { facts: [], commitments: new Map() };
  calls.set(session, call);
  const fresh = factsOf(pick, userName);
  const ids = new Set(fresh.map((f) => f.id));
  call.facts = [...fresh, ...call.facts.filter((f) => !ids.has(f.id))];
  for (const c of pick.checkIns) {
    const dueAt = c.targetDate ? new Date(c.targetDate).toISOString() : undefined;
    const id = opaque('promise', c.id);
    call.commitments.set(id, { id, text: c.statement, owner: 'you', dueAt });
  }
}

/** "How do you know", "who told you", "where did you hear that". */
const ASKS_SOURCE =
  /\b(how (do|did|would) you (know|remember)|who told you|where did you (hear|get|learn)|how('d| did) you find out)\b/i;
export const SOURCE_NOTE =
  'They asked how you know: answer honestly from the label on that memory (when and to whom they said it), plainly, without guessing.';

export interface TurnParts {
  /** The speaking persona's id (userData.personaId). */
  personaId?: string;
  userName?: string;
  timeZone?: string;
  /** The caller's words this reply answers. */
  words: string;
  directorNotes: string[];
  /** The background deliberator's thought for this reply (deliberation.ts), or ''. */
  thought?: string;
  told: string;
  team: string;
  game: string;
  /** How the persona is doing right now (ferni-state.ts), or ''. */
  state?: string;
  shape: string;
  /** Crisis guidance for this reply (crisis-gate.ts): the top-ranked note. */
  safety?: string;
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
  const guidance: GuidanceNote[] = [
    ...(p.safety
      ? [{ id: 'safety', kind: 'safety' as const, source: 'crisis-gate.ts', text: p.safety }]
      : []),
    ...(ASKS_SOURCE.test(p.words)
      ? [
          {
            id: 'honesty:source',
            kind: 'honesty' as const,
            source: 'turn-packet.ts',
            text: SOURCE_NOTE,
            axes: { 'say-how-you-know': 1 as const },
          },
        ]
      : []),
    ...p.directorNotes.map((text, i) => ({
      id: `director:${i}`,
      kind: 'director' as const,
      source: 'director-notes.ts',
      text,
    })),
    ...(p.thought
      ? [{ id: 'thought', kind: 'director' as const, source: 'deliberation.ts', text: p.thought }]
      : []),
    ...(p.told
      ? [{ id: 'told', kind: 'director' as const, source: 'told-this-call.ts', text: p.told }]
      : []),
  ];
  return assembleContextPacket({
    persona,
    caller: { name: p.userName },
    rightNow: {
      localTime: localTime(p.now, p.timeZone),
      justHappened: [p.state, p.game].filter((t): t is string => Boolean(t)),
    },
    memories: (call?.facts ?? []).filter((f) => f.source !== 'my-news' || f.learnedBy === persona),
    commitments: call ? [...call.commitments.values()] : [],
    guidance,
    shape: p.shape,
    team: { note: p.team, relevant: Boolean(p.team) },
    now: p.now,
    timeZone: p.timeZone,
  });
}

/**
 * What the CONTEXT_PACKET log line carries: section names and token
 * estimates, and dropped counts by section, kind, source and reason. No text,
 * no ids, no names: nothing a caller said or a note held.
 */
export function packetLogFields(accounting: PacketAccounting): {
  sections: Array<[string, number]>;
  tokens: number;
  dropped: Record<string, number>;
  guidanceDropped: Record<string, number>;
} {
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
