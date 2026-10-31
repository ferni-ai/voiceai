/**
 * Persona growth, said once (PERSONA_GROWTH): "what you said about X stuck with me".
 *
 * A friend is changed by you too, and says so rarely, in passing, about one
 * real thing you said. persona-growth-after-call.ts keeps that thing: the
 * caller's own words from an earlier call and how they shifted Ferni's view.
 * Session start already loads the stored growth profile into memory
 * (session-init-handler.ts, unified profile), and cleanup saves it back, so
 * this reads what is loaded and adds no store read or model call to the turn.
 *
 * Recall hears every transcript (withGrowth), and the note goes into the chat
 * on its own (persona-growth-note.ts, GROWTH_NOTE_ID), and only:
 * - for a growth kept on an earlier call, with the caller's exact words;
 * - when nothing was offered in the last GROWTH_SPACING_MS, so at most one
 *   per call and rarely across calls;
 * - on a final transcript, after GROWTH_AFTER_TURNS whole caller turns, never
 *   on an interim fragment ("honestly I") of a line not yet said;
 * - never on a call with a crisis signal: crisis words in any line so far, or
 *   a crisis read noted or settling on the call; and none after a handoff;
 * - worded as something to mention lightly if it fits, never a celebration.
 * A crisis signal later in the call takes it back out of the chat, and a
 * crisis-guided reply never sees it (crisis-gate.ts). Any failed check means
 * no note. Offering marks it shared (markGrowthShared), so it never comes back.
 *
 * @module agents/personas/persona-growth-recall
 */

import { flagOn } from '../../config/env-flag.js';
import {
  getPersonaGrowthForPersistence,
  markGrowthShared,
  type PersonaGrowthRecord,
} from '../../services/trust-systems/index.js';
import { crisisRiskThisCall, scoreCrisisLanguage } from '../../services/safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaGrowthRecall' });

export function personaGrowthEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('PERSONA_GROWTH', env);
}

/** A friend says "you changed my mind" rarely: at most one offered per two weeks. */
export const GROWTH_SPACING_MS = 14 * 24 * 60 * 60 * 1000;
const QUOTE_MAX_CHARS = 200;

const time = (d: Date | string | undefined): number => (d ? new Date(d).getTime() : NaN);

/**
 * The growth to offer on a call that started at `callStart`, or null. Only one
 * kept before this call, with the caller's words, never shared, its topic not
 * already shared; none when one was offered within the spacing.
 */
export function growthToOffer(
  records: readonly PersonaGrowthRecord[],
  sharedTopics: readonly string[],
  callStart: number
): PersonaGrowthRecord | null {
  if (records.some((r) => callStart - time(r.sharedAt) < GROWTH_SPACING_MS)) return null;
  const rank = { major: 3, moderate: 2, minor: 1 } as const;
  const candidates = records.filter(
    (r) =>
      !r.sharedAt &&
      !!r.triggerQuote?.trim() &&
      time(r.createdAt) < callStart &&
      !sharedTopics.includes(r.topic.toLowerCase())
  );
  candidates.sort(
    (a, b) => rank[b.significance] - rank[a.significance] || time(b.createdAt) - time(a.createdAt)
  );
  return candidates[0] ?? null;
}

/** The note for the first recall of a call: a friend noticing, not a banner. */
function formatGrowthNote(record: PersonaGrowthRecord): string {
  const quote = (record.triggerQuote ?? '').trim().slice(0, QUOTE_MAX_CHARS);
  return [
    '[SOMETHING THEY CHANGED IN YOU]',
    `On an earlier call they said: "${quote}". It changed how you see ${record.topic}: ${record.afterThinking}.`,
    `If the talk comes near ${record.topic}, you may say so once, lightly, in your own words, the way a friend would ("what you said about ${record.topic} stuck with me"). No thank-you speech, no big moment, and leave it out if they are having a hard time.`,
  ].join('\n');
}

/**
 * Which personas had an agent on each call: one growth is one persona's, and
 * the after-call context doesn't say whose call it was (runAfterCall sets no
 * personaId). Noted when a persona's recall is built (per agent, so a handoff
 * adds one); bounded, oldest calls dropped first.
 */
const personasByCall = new Map<string, Set<string>>();
const CALLS_KEPT = 500;

function notePersonaOnCall(sessionId: string, personaId: string): void {
  const seen = personasByCall.get(sessionId) ?? new Set<string>();
  seen.add(personaId);
  personasByCall.delete(sessionId); // re-insert: newest last
  personasByCall.set(sessionId, seen);
  if (personasByCall.size > CALLS_KEPT) {
    personasByCall.delete(personasByCall.keys().next().value as string);
  }
}

/** The one persona on this call, or undefined: unknown, or a handoff happened. */
export function onlyPersonaOnCall(sessionId: string | undefined): string | undefined {
  const seen = sessionId ? personasByCall.get(sessionId) : undefined;
  return seen?.size === 1 ? [...seen][0] : undefined;
}

/** A crisis read noted or still settling on this call, or crisis words in these caller words. */
function crisisIn(sessionId: string, text: string): boolean {
  return crisisRiskThisCall(sessionId, text) || scoreCrisisLanguage(text).isCrisis;
}

/** Caller turns heard whole, and calm, before the note may come. */
export const GROWTH_AFTER_TURNS = 2;

export interface GrowthRecall {
  /**
   * Every transcript of the call, interim or final, as recall hears it. Each
   * is checked for crisis words, and the call for crisis risk, so a signal on
   * any line so far keeps the note away for the rest of the call. The note is
   * decided only here, on a final transcript after GROWTH_AFTER_TURNS calm
   * caller turns, and waits for take().
   */
  heard(text: string, final?: boolean): void;
  /** The agent started replying: a caller turn with a final transcript is complete. */
  newTurn(): void;
  /** The note decided on the last transcript, once; null on a call with a crisis signal. */
  take(): string | null;
  /** A crisis signal on this call so far, or in `said`: the note comes back out. Fails closed. */
  crisisNow(said?: string): boolean;
}

/** Recall hands its words to its growth (withGrowth); sendGrowth finds it by the recall. */
const growthByRecall = new WeakMap<object, GrowthRecall>();

export function growthOf(recall: object): GrowthRecall | undefined {
  return growthByRecall.get(recall);
}

interface HearsTurns {
  noteFor(transcript: string, opts?: { final?: boolean }): string | null;
  newTurn(): void;
}

/** `recall`, also telling `growth` every transcript and every new turn (memory-recall-hook.ts). */
export function withGrowth<R extends HearsTurns>(growth: GrowthRecall, recall: R): R {
  const heard: R = {
    ...recall,
    noteFor: (transcript, opts) => {
      growth.heard(transcript, opts?.final);
      return recall.noteFor(transcript, opts);
    },
    newTurn: () => {
      growth.newTurn();
      recall.newTurn();
    },
  };
  growthByRecall.set(heard, growth);
  return heard;
}

/** For one persona agent on one call; `now` is when the call's recall started. */
export function growthRecallFor(
  userId: string,
  personaId: string,
  sessionId?: string,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now()
): GrowthRecall {
  if (sessionId) notePersonaOnCall(sessionId, personaId);
  let decided = false; // one note a call: decided once, whatever came of it
  let pending: string | null = null;
  let crisis = false; // once a crisis signal shows on this call, nothing is offered on it
  let finalThisTurn = false;
  let calmTurns = 0;

  const check = (text: string): boolean => {
    try {
      // No call id: the call's risk can't be read, so none is offered.
      crisis ||= !sessionId || crisisIn(sessionId, text);
    } catch (error) {
      log.warn({ error: String(error) }, 'Persona growth crisis check failed');
      crisis = true; // fail closed
    }
    if (crisis) pending = null;
    return crisis;
  };

  const decide = (): void => {
    decided = true;
    // A handoff on the call: this persona didn't hear all of it, so nothing.
    if (onlyPersonaOnCall(sessionId) !== personaId) return;
    // Loaded at session start; not there yet (or never kept) means nothing this call.
    const profile = getPersonaGrowthForPersistence(userId, personaId);
    const record = profile && growthToOffer(profile.growthRecords, profile.sharedTopics, now);
    if (!record) return;
    pending = formatGrowthNote(record);
    markGrowthShared(record.id);
    log.info(
      { growthType: record.growthType, significance: record.significance },
      'PERSONA_GROWTH_OFFERED'
    );
  };

  return {
    heard(text, final) {
      const said = text.trim();
      if (!said || !personaGrowthEnabled(env) || check(said) || final !== true) return;
      finalThisTurn = true;
      if (decided || calmTurns < GROWTH_AFTER_TURNS) return;
      try {
        decide();
      } catch (error) {
        log.warn({ error: String(error) }, 'Persona growth note not decided');
        pending = null; // fail closed
      }
    },
    newTurn() {
      if (finalThisTurn && !crisis) calmTurns++;
      finalThisTurn = false;
    },
    take() {
      const note = crisis ? null : pending;
      pending = null;
      return note;
    },
    crisisNow(said) {
      return check(said?.trim() ?? '');
    },
  };
}
