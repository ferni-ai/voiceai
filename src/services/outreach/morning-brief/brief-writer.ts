/**
 * MORNING_BRIEF_WRITER: Alex writes the morning brief from the day's facts (brief-facts.ts),
 * one model call in his voice (brief-writer-prompt.ts), and the text goes only if the
 * deterministic check passes (brief-check.ts) and the stored-text screen passes it as sent.
 * The same opener as yesterday is written again once. Everything else that goes wrong sends
 * today's template (briefToSend's text), the known-good brief: a model error or an empty
 * reply, a failed check or screen, a keep-ask item (#4390 asks that in its own words), and a
 * crisis read in the last 24 hours (hadCrisisWithin, where an unreadable record counts as one).
 *
 * Logs BRIEF_WRITTEN with counts only, never the words.
 *
 * @module services/outreach/morning-brief/brief-writer
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { storedTextForOwner } from '../../../tools/domains/proactive/outreach/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { factsOf } from './brief-facts.js';
import { checkBrief, openerHash, type CheckFailure } from './brief-check.js';
import type { DayItems } from './brief-job.js';
import { briefPrompt } from './brief-writer-prompt.js';

const log = createLogger({ module: 'MorningBriefWriter' });

export interface BriefWriterDeps {
  /** One reply from the model, or null when there is none. */
  generate: (prompt: string) => Promise<string | null>;
  /** A crisis read for them on a call in the last 24 hours; true when it can't be read. */
  recentCrisis: (userId: string, now: Date) => Promise<boolean>;
  /** The opener hash stored with a day's brief, by local date key. */
  openers: {
    get: (userId: string, dateKey: string) => Promise<string | null>;
    set: (userId: string, dateKey: string, hash: string) => Promise<void>;
  };
}

export interface BriefToWrite {
  userId: string;
  day: DayItems;
  zone: string;
  name?: string;
  now: Date;
  /** Today's local date, YYYY-MM-DD. */
  dateKey: string;
  /** Today's template text: what goes when the written brief can't. */
  template: string;
  env: Env;
}

type Reason = 'written' | 'keep-ask' | 'crisis' | 'model-error' | CheckFailure | 'screen';

export interface WrittenBrief {
  text: string;
  /** Stores this brief's opener hash for tomorrow's check; call it once the brief has gone. */
  sent: () => Promise<void>;
}

async function attempt(
  input: BriefToWrite,
  deps: BriefWriterDeps
): Promise<{ text?: string; reason: Reason; factCount: number }> {
  const facts = factsOf(input.day, input.zone, input.now);
  const factCount = facts.length;
  if (facts.some((f) => f.ref?.keepAsk)) return { reason: 'keep-ask', factCount };
  if (await deps.recentCrisis(input.userId, input.now).catch(() => true)) return { reason: 'crisis', factCount }; // prettier-ignore
  const yesterday = new Date(Date.parse(`${input.dateKey}T12:00:00Z`) - 86_400_000);
  const lastOpener = await deps.openers
    .get(input.userId, yesterday.toISOString().slice(0, 10))
    .catch(() => null);
  for (const retry of [false, true]) {
    const raw = await deps.generate(briefPrompt(facts, input.name, retry)).catch(() => null);
    if (!raw) return { reason: 'model-error', factCount };
    const failed = checkBrief(raw, { facts, name: input.name, lastOpener });
    if (failed === 'same-opener' && !retry) continue;
    if (failed) return { reason: failed, factCount };
    const text = raw.trim().replace(/[’‘]/gu, "'");
    const site = { site: 'morning-brief' as const, userId: input.userId };
    if (!storedTextForOwner([text], site, input.env)) return { reason: 'screen', factCount };
    return { text, reason: 'written', factCount };
  }
  return { reason: 'same-opener', factCount };
}

/** The brief to send: Alex's, when every check passes, else the template; null with the flag off. */
export async function writtenBrief(
  input: BriefToWrite,
  deps: BriefWriterDeps
): Promise<WrittenBrief | null> {
  if (!flagOn('MORNING_BRIEF_WRITER', input.env)) return null;
  const { text, reason, factCount } = await attempt(input, deps);
  const sent = text ?? input.template;
  log.info(
    { source: text ? 'model' : 'template', reason, chars: sent.length, factCount },
    'BRIEF_WRITTEN'
  );
  return {
    text: sent,
    sent: () =>
      deps.openers.set(input.userId, input.dateKey, openerHash(sent)).catch((e: unknown) => {
        log.warn({ error: String(e) }, 'Morning brief opener not stored');
      }),
  };
}
