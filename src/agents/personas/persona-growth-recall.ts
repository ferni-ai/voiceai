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
 * It joins the first recall note of a call (memory-recall-hook.ts), and only:
 * - for a growth kept on an earlier call, with the caller's exact words;
 * - when nothing was offered in the last GROWTH_SPACING_MS, so at most one
 *   per call and rarely across calls;
 * - worded as something to mention lightly if it fits, never a celebration.
 * Offering marks it shared (markGrowthShared), so it never comes back.
 *
 * @module agents/personas/persona-growth-recall
 */

import { flagOn } from '../../config/env-flag.js';
import {
  getPersonaGrowthForPersistence,
  markGrowthShared,
  type PersonaGrowthRecord,
} from '../../services/trust-systems/index.js';
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

export interface GrowthRecall {
  /** The growth note, or null. The first non-null answer marks the growth shared and is kept. */
  note(): string | null;
}

/** For one persona agent on one call; `now` is when the call's recall started. */
export function growthRecallFor(
  userId: string,
  personaId: string,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now()
): GrowthRecall {
  let offered: string | null = null;
  return {
    note() {
      if (offered || !personaGrowthEnabled(env)) return offered;
      // Loaded at session start; not there yet (or never kept) means nothing this call.
      const profile = getPersonaGrowthForPersistence(userId, personaId);
      const record = profile && growthToOffer(profile.growthRecords, profile.sharedTopics, now);
      if (!record) return null;
      offered = formatGrowthNote(record);
      markGrowthShared(record.id);
      log.info(
        { growthType: record.growthType, significance: record.significance },
        'PERSONA_GROWTH_OFFERED'
      );
      return offered;
    },
  };
}
