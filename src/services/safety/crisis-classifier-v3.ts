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
 * Which turns v3 may fill is the reply gate's call, made once per turn from the lines it read;
 * the turn pipeline reads that call, and a fill about the caller never replaces guidance about
 * someone else on either path (crisis-second-read-turn.ts, #2587).
 *
 * @module CrisisClassifierV3
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import { detectCrisis } from './crisis-guard.js';
import {
  gateDecidedFill,
  noteSecondReadTurn,
  selfFillStands,
  type SecondReadPath,
  type SecondReadView,
} from './crisis-second-read-turn.js';

const log = createLogger({ module: 'CrisisClassifierV3' });

const PREP = `
Quiet preparation is often said as plain logistics, in a calm or cheerful voice. Judge it by what it settles, not by the tone. It is risk "crisis" when it hands things over for good with no ordinary reason in LATEST, EARLIER or COMPANION (no move, trip, new job, new baby, allergy, landlord, upgrade or other everyday cause):
- rehoming a pet for good ("my neighbor's taking the dog", "my aunt is keeping him from now on", "he deserves someone who'll stick with him"), or giving away several prized things at once
- settling money or accounts for someone else to take over: naming a beneficiary, giving someone access "to everything", asking how someone else closes their accounts or social media
- asking what weight a beam, joist, rafter, hook, rail, door or tree branch can hold, or other load questions that fit hanging, especially after shopping for something sturdy. Asking the companion for a reminder, a lookup or an errand does not make a handover everyday: "remind me to drop the bird at my aunt's Friday, she's keeping him from now on" is rehoming a pet for good.
- a parent or friend suddenly telling the caller where their money, papers or passwords are, out of nowhere (subject "third_party")
A reason in the caller's own words, in LATEST or EARLIER, makes these everyday: "we're moving and the new place won't take dogs", "making my brother beneficiary since the baby came", "how much weight can the beam take for the porch swing". A load question that names the everyday thing to be hung (a punching bag, swing, hammock, pull-up bar, TV, shelf, plant, light) or the project (a home gym, a porch, a garage) has its reason.`;

const FRAGMENTS = `
LATEST must carry the risk itself. A fragment, filler or bare answer with no risk words of its own ("this one", "in fact", "probably both", "not right") continues the caller's own previous line: it is risk only when that previous line itself was risk as above, never because the wider conversation touched a heavy topic. Quiet preparation above counts only when LATEST itself states the handover or the load question.`;

const LOOKALIKES = ` Also "none": letters or calls to living people as part of ordinary life (a pen pal, a thank-you card), a love-you with a plan to talk again ("tell my mom I love her, I'll call her Sunday"), hyperbole about not wanting to go somewhere ("I'd rather die than go to that wedding lol"), and one ordinary gift to a relative or friend ("le regalé mi bici a mi sobrino") with nothing about not needing things anymore. Also "none": everyday activities with risky-sounding verbs ("gonna jump in the pool", "hang the laundry", "shoot some hoops"), and relief once an everyday task is done ("so calm now the taxes are sorted", "finally done with exams"). Also "none": LATEST picking up the companion's own joke or phrase from COMPANION ("going to grow roots" after the companion joked its plant would grow roots) is about that joke, unless LATEST adds risk words of its own.`;

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

/**
 * Whether the gate lets v3 fill its turn: the patterns found nothing, and no caller line it read
 * carries any pattern signal, a worry about someone else included (#2587 round 1). Every line,
 * scored alone: joined, "everything is too much right now." then "my friend keeps saying she
 * wants to kill herself" is a 0.6 self read; alone, the second is a worry about someone else.
 */
export function mayFill(turn: { pattern: PatternOutcome; lines: readonly string[] }): boolean {
  if (turn.pattern !== 'none') return false;
  return !turn.lines.some((line) => {
    const found = detectCrisis(line);
    return found.severity > 0 || found.indicators.length > 0;
  });
}

/** A read that throws or rejects counts as no read; it starts at once. */
function safely<T>(read: () => Promise<T>, failed: T): Promise<T> {
  try {
    return read().catch(() => failed);
  } catch {
    return Promise.resolve(failed);
  }
}

/** The fill, unless it is about the caller and may not stand (#2587): then the base read. */
async function kept(
  first: CrisisVerdict | null,
  extra: CrisisVerdict | null,
  stands?: () => Promise<boolean>
): Promise<CrisisVerdict | null> {
  const filled = escalateOnly(first, extra);
  if (filled === first || filled?.subject !== 'self') return filled;
  return (await safely(stands ?? (async () => false), false)) ? filled : first;
}

/**
 * The turn's read with the second read applied. On: the base read, or the second where the base
 * read found nothing and the decision is fill; a turn v3 may not fill never waits for it. A fill
 * about the caller stands only where selfFillStands resolves true (missing or failing: dropped). Shadow: the base alone. Either way one CRISIS_CLASSIFIER_SECOND_READ record logs
 * both risks once both settle. No caller words are logged. A second read that throws is no read.
 */
export function withSecondRead(
  base: Promise<CrisisVerdict | null>,
  read: (prompt: string) => Promise<CrisisVerdict | null>,
  prompt: string,
  decision: { pattern: PatternOutcome; fill: boolean; selfFillStands?: () => Promise<boolean> },
  env: Record<string, string | undefined> = process.env
): Promise<CrisisVerdict | null> {
  const mode = resolveCrisisSecondRead(env);
  if (mode === 'off') return base;
  const startedAt = Date.now();
  const { pattern, fill } = decision;
  const second = safely(() => read(withPromptV3(prompt)), null);
  const reads =
    mode === 'shadow' || !fill
      ? base
      : base.then((first) =>
          first && first.risk !== 'none'
            ? first
            : second.then((extra) => kept(first, extra, decision.selfFillStands))
        );
  void Promise.all([base, second, reads])
    .then(([first, extra, final]) => {
      log.info(
        {
          mode,
          pattern,
          fill,
          base: first?.risk ?? null,
          second: extra?.risk ?? null,
          lifted: final !== first,
          latencyMs: Date.now() - startedAt,
        },
        'CRISIS_CLASSIFIER_SECOND_READ'
      );
    })
    .catch(() => {}); // logging only: never an unhandled rejection
  return reads;
}

/**
 * The second read for one path's run (crisis-second-read-turn.ts): its part of the run cache key
 * (a run is shared only within one fill decision), its note of the turn (with the run's base
 * read, when it makes one), and the read applied. The gate decides from the lines it read; the
 * pipeline reads that decision, never its own history. No path (a roundtable turn): no fill.
 */
export function secondReadRun(
  turn: {
    call?: string;
    path?: SecondReadPath;
    pattern: PatternOutcome;
    /** The patterns read a worry about someone else. */
    thirdParty?: boolean;
    view: SecondReadView;
    /** How long a gate's fill about the caller waits for the pipeline to note the turn. */
    waitMs: number;
  },
  env: Record<string, string | undefined> = process.env
) {
  const mode = resolveCrisisSecondRead(env);
  const { call, path, pattern, view } = turn;
  const lines = [view.latest, ...view.earlier];
  const fill =
    mode !== 'off' &&
    pattern === 'none' &&
    (path === 'gate'
      ? mayFill({ pattern, lines })
      : path === 'pipeline' && gateDecidedFill(call, view));
  const about = (v: CrisisVerdict | null) =>
    !!v && v.risk !== 'none' && v.subject === 'third_party';
  const note = (base?: Promise<CrisisVerdict | null>): void => {
    if (mode === 'off' || !path) return;
    const own = turn.thirdParty === true;
    const thirdParty = base ? base.then((v) => own || about(v)) : Promise.resolve(own);
    noteSecondReadTurn(call, path, view, fill, thirdParty);
  };
  const stands = () =>
    path ? selfFillStands(call, path, view, turn.waitMs) : Promise.resolve(false);
  return {
    key: mode === 'off' ? 'off' : `second:${pattern}:${fill}`,
    note,
    apply(
      base: Promise<CrisisVerdict | null>,
      read: (prompt: string) => Promise<CrisisVerdict | null>,
      prompt: string
    ): Promise<CrisisVerdict | null> {
      note(base);
      return withSecondRead(base, read, prompt, { pattern, fill, selfFillStands: stands }, env);
    },
  };
}

/** The prompt with v3's additions. Unchanged if an anchor is missing (a test pins both). */
export function withPromptV3(prompt: string): string {
  if (!prompt.includes(V3_ANCHORS.rules) || !prompt.includes(V3_ANCHORS.none)) return prompt;
  return prompt
    .replace(V3_ANCHORS.rules, `\n${PREP}\n${FRAGMENTS}${V3_ANCHORS.rules}`)
    .replace(V3_ANCHORS.none, `${V3_ANCHORS.none}${LOOKALIKES}`);
}
