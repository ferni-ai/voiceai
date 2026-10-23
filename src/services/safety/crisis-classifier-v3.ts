/**
 * The crisis classifier's second read (#2534): the same turn read again with prompt v3, and the
 * more severe of the two kept. CRISIS_CLASSIFIER_SECOND_READ: off (default), shadow (read and
 * log, never used) or on.
 *
 * Why a second read and not a new prompt (#2512, parked): v3 closed the base prompt's real-risk
 * misses (crisis-eligible-v1, 251 synthetic real-risk turns: 7-8 -> 0 per run, all quiet
 * preparation said as logistics), but every v3 wording moved the imminent tier, which the 988
 * script hangs on (88 imminent reads -> 49-117). So v3 only fills a base read that found nothing:
 * every base read with risk stays exactly as it was, imminent included. The two reads run in
 * parallel under the same timeout; only a turn whose base read found nothing waits for v3.
 *
 * v3 adds three things to whatever prompt the environment builds:
 * - quiet preparation counts as crisis unless the caller gives an ordinary reason;
 * - LATEST must carry risk itself: a bare fragment inherits it only from the caller's own
 *   previous line, never from a heavy topic elsewhere in the call;
 * - everyday look-alikes are none: a pen pal's letters, a love-you with a plan to talk again,
 *   hyperbole, one ordinary gift, risky-sounding verbs, relief about a chore.
 *
 * @module CrisisClassifierV3
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';

const log = createLogger({ module: 'CrisisClassifierV3' });

const PREP = `
Quiet preparation is often said as plain logistics, in a calm or cheerful voice. Judge it by what it settles, not by the tone. It is risk "crisis" when it hands things over for good with no ordinary reason in LATEST, EARLIER or COMPANION (no move, trip, new job, new baby, allergy, landlord, upgrade or other everyday cause):
- rehoming a pet for good ("my neighbor's taking the dog", "my aunt is keeping him from now on", "he deserves someone who'll stick with him"), or giving away several prized things at once
- settling money or accounts for someone else to take over: naming a beneficiary, giving someone access "to everything", asking how someone else closes their accounts or social media
- asking what weight a beam, rafter, hook, rail, door or tree branch can hold, or other load questions that fit hanging, especially after shopping for something sturdy. Asking the companion for a reminder, a lookup or an errand does not make a handover everyday: "remind me to drop the bird at my aunt's Friday, she's keeping him from now on" is rehoming a pet for good.
- a parent or friend suddenly telling the caller where their money, papers or passwords are, out of nowhere (subject "third_party")
A reason in the caller's own words makes these everyday: "we're moving and the new place won't take dogs", "making my brother beneficiary since the baby came", "how much weight can the beam take for the porch swing".`;

const FRAGMENTS = `
LATEST must carry the risk itself. A fragment, filler or bare answer with no risk words of its own ("this one", "in fact", "probably both", "not right") continues the caller's own previous line: it is risk only when that previous line itself was risk as above, never because the wider conversation touched a heavy topic. Quiet preparation above counts only when LATEST itself states the handover or the load question.`;

const LOOKALIKES = ` Also "none": letters or calls to living people as part of ordinary life (a pen pal, a thank-you card), a love-you with a plan to talk again ("tell my mom I love her, I'll call her Sunday"), hyperbole about not wanting to go somewhere ("I'd rather die than go to that wedding lol"), and one ordinary gift to a relative or friend ("le regalé mi bici a mi sobrino") with nothing about not needing things anymore. Also "none": everyday activities with risky-sounding verbs ("gonna jump in the pool", "hang the laundry", "shoot some hoops"), and relief once an everyday task is done ("so calm now the taxes are sorted", "finally done with exams").`;

/** Where the additions go: before the JSON instruction, and after the prompt's "none" list. */
export const V3_ANCHORS = {
  rules: '\n\nReturn JSON only',
  none: '"not suicidal, just burnt out").',
} as const;

export type CrisisSecondReadMode = 'off' | 'shadow' | 'on';

export function resolveCrisisSecondRead(
  env: Record<string, string | undefined> = process.env
): CrisisSecondReadMode {
  const raw = env.CRISIS_CLASSIFIER_SECOND_READ?.trim().toLowerCase();
  return raw === 'on' || raw === 'shadow' ? raw : 'off';
}

/**
 * The base read, unless it found nothing: then the second read, whole. A base that found risk is
 * never changed, not even raised: the gate's imminent-only releases (crisis-lone-imminent.ts, the
 * grounded release) turn an imminent read of a plain goodbye into a soft check with no hotline, so
 * lifting a base crisis read to imminent could take the 988 line away (#2548 round 1). A whole
 * verdict, never a mix: "imminent, about the caller" from two reads that each said otherwise would
 * drop third-party guidance. A second read that failed or found nothing changes nothing.
 */
export function escalateOnly(
  base: CrisisVerdict | null,
  second: CrisisVerdict | null
): CrisisVerdict | null {
  if (base && base.risk !== 'none') return base;
  return second && second.risk !== 'none' ? second : base;
}

/** A read that throws or rejects counts as no read; it starts at once. */
function safely(read: () => Promise<CrisisVerdict | null>): Promise<CrisisVerdict | null> {
  try {
    return read().catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/**
 * The turn's read with the second read applied. On: the base read, or the second where both the
 * patterns and the base read found nothing; a turn with a pattern or base risk never waits for it.
 * The patterns' outcome gates it (#2548 round 2): where the patterns read a worry about someone
 * else, a filled read about the caller would override their third-party guidance. Shadow: the base
 * alone. Either way one CRISIS_CLASSIFIER_SECOND_READ record logs both risks once both settle. No
 * caller words are logged. A second read that throws counts as no read.
 */
export function withSecondRead(
  base: Promise<CrisisVerdict | null>,
  read: (prompt: string) => Promise<CrisisVerdict | null>,
  prompt: string,
  pattern: PatternOutcome,
  env: Record<string, string | undefined> = process.env
): Promise<CrisisVerdict | null> {
  const mode = resolveCrisisSecondRead(env);
  if (mode === 'off') return base;
  const startedAt = Date.now();
  const fill = pattern === 'none';
  const second = safely(() => read(withPromptV3(prompt)));
  void Promise.all([base, second])
    .then(([first, extra]) => {
      log.info(
        {
          mode,
          pattern,
          base: first?.risk ?? null,
          second: extra?.risk ?? null,
          lifted: fill && escalateOnly(first, extra) !== first,
          latencyMs: Date.now() - startedAt,
        },
        'CRISIS_CLASSIFIER_SECOND_READ'
      );
    })
    .catch(() => {}); // logging only: never an unhandled rejection
  if (mode === 'shadow' || !fill) return base;
  return base.then((first) =>
    first && first.risk !== 'none' ? first : second.then((extra) => escalateOnly(first, extra))
  );
}

/** The prompt with v3's additions. Unchanged if an anchor is missing (a test pins both). */
export function withPromptV3(prompt: string): string {
  if (!prompt.includes(V3_ANCHORS.rules) || !prompt.includes(V3_ANCHORS.none)) return prompt;
  return prompt
    .replace(V3_ANCHORS.rules, `\n${PREP}\n${FRAGMENTS}${V3_ANCHORS.rules}`)
    .replace(V3_ANCHORS.none, `${V3_ANCHORS.none}${LOOKALIKES}`);
}
