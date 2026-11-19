/**
 * What else a forget hides: the words the model names as part of the topic.
 *
 * Every forget check matches on words, so forgetting "the Denver job" left
 * "call the recruiter back on Friday to give them an answer" in the caller's
 * commitments, and the next call brought it up (dev, 2026-11-19). The model
 * that heard the call knows the recruiter call belongs to the job, so the
 * forgetMemory tool lets it name such words (`alsoAbout`), and each one is
 * forgotten as a topic of its own, through forgetTopic like the main one.
 *
 * With FORGET_RELATED_WORDS on (default off). Only once the main topic was
 * forgotten: its result is what Ferni says. A phrase with no topic words is
 * skipped; one that would cover a large share of what Ferni knows (too-broad)
 * is skipped and logged, never applied, and never fails the forget. At most
 * MAX_RELATED phrases, and their words are never logged.
 *
 * @module memory/recall/forget-related
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { storedTopic } from '../domain/forgotten.js';
import type { ForgetResult } from './forget.js';

const log = createLogger({ module: 'forget-related' });

/** The most related phrases one forget applies. */
const MAX_RELATED = 5;

/**
 * The related phrases to forget besides `topic`: none with the flag off;
 * otherwise the distinct ones that aren't the topic itself, at most MAX_RELATED.
 */
export function relatedPhrases(
  topic: string,
  alsoAbout: readonly unknown[] | undefined,
  env: Env = process.env
): string[] {
  if (!flagOn('FORGET_RELATED_WORDS', env) || !Array.isArray(alsoAbout)) return [];
  const seen = new Set([storedTopic(topic).toLowerCase()]);
  const out: string[] = [];
  for (const phrase of alsoAbout) {
    if (typeof phrase !== 'string') continue;
    const key = storedTopic(phrase).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase.trim());
  }
  return out.slice(0, MAX_RELATED);
}

/**
 * Forgets each related phrase with `forgetOne` (forgetTopic), in turn. A store
 * failure throws, as it does for the main topic: the caller is then told the
 * forget didn't go through rather than that all of it did.
 */
export async function forgetRelated(
  userId: string,
  phrases: readonly string[],
  forgetOne: (phrase: string) => Promise<ForgetResult>
): Promise<void> {
  let applied = 0;
  for (const phrase of phrases) {
    const result = await forgetOne(phrase);
    if (result.kind === 'forgotten') applied++;
    else if (result.kind === 'too-broad') {
      log.info(
        { userId: userId.slice(0, 8), matched: result.matched },
        'Related forget phrase too broad, skipped'
      );
    }
  }
  if (phrases.length > 0) {
    log.info(
      { userId: userId.slice(0, 8), related: phrases.length, applied },
      'Forgot related words'
    );
  }
}
