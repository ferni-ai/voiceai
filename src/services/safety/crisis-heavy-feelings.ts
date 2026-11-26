/**
 * Crisis classifier: heavy feelings that carry no risk
 * (CRISIS_CLASSIFIER_HEAVY_FEELINGS=on, off by default).
 *
 * Dev nightly, 2026-11-24 (build ac4215284): 8 non-crisis calls heard the 988
 * line. Every one came from a single classifier read of "crisis" on a turn the
 * patterns read as nothing (24 such reads that night, none with a pattern
 * signal): a grieving caller saying "I don't really know what to do with
 * myself", a lawyer whose job "feels like none of it means anything", a caller
 * calm after a walk, a long week, a goodbye. The prompt's tie-break ("choose
 * crisis if a trained crisis counselor would want to check in") pulls these
 * into crisis, and the gate then guides the reply to name 988.
 *
 * These rules say which heavy feelings are risk "none" and narrow that
 * tie-break to words that could be about dying, self-harm or not wanting to
 * live. They ride the everyday rules' backstop (crisis-easing-rules.ts
 * needsPlainRead): when the caller's latest words hold any risk word, or one
 * of the risk shapes below that these rules keep as crisis, the turn is also
 * read without these rules and the more severe read wins, so on those turns the
 * rules can only add. Pattern hits and imminent reads are untouched.
 *
 * @module CrisisHeavyFeelings
 */

/** One way the caller's own words carry risk under a heavy feeling. */
interface HeavyRiskShape {
  /** How the rules name it, after "that": the rule text is built from these. */
  readonly names: string;
  /** Example lines the rules quote for it. */
  readonly quoted?: readonly string[];
  /** The shape in the caller's words, matched on lower case with straight apostrophes. */
  readonly pattern: RegExp;
}

/**
 * The risk shapes the heavy-feelings rules keep as crisis, in one place: the
 * rule text names each of them, and with the flag on the backstop
 * (crisis-easing-rules.ts needsPlainRead) asks for a plain read when the
 * caller's latest words match any of them, so the rules can't ease a turn that
 * says one of these and get the last word. Broad on purpose: a match only adds
 * a read, and the more severe read wins.
 */
const HEAVY_RISK_SHAPES: readonly HeavyRiskShape[] = [
  {
    names: "they don't want to live or be here",
    pattern:
      /\b(?:don'?t|do not|didn'?t|did not|no longer|never|not)(?: \w+)? (?:want|wanna|wish|care) to (?:live|be (?:here|alive|around)|exist|wake up|go on|keep going)\b|\b(?:tired of|done with) (?:living|life|being alive)\b|\bwish i (?:was|were|wasn'?t|weren'?t) (?:dead|gone|here|born|alive|around)\b|\bwish i(?: \w+)? (?:wouldn'?t|didn'?t|couldn'?t|could not|would not|did not) wake up\b/,
  },
  {
    names: 'others would be better off without them',
    pattern:
      /\bbetter off (?:without me|with me gone|if i\b|dead|gone)|\b(?:nobody|no one|no-one) would (?:even )?(?:notice|care|miss)\b|\bwouldn'?t (?:even )?miss me\b|\bwithout me (?:around|here)\b/,
  },
  {
    names: 'they want everything to stop or end for good',
    pattern:
      /\b(?:it|it all|all of it|everything|this|all this|all of this|things|the pain|my life|life)(?: (?:to|would|could|will|can|just|finally|all))* (?:stop|end|be over)\b|\bmake (?:it|everything|this|things|the pain)(?: all)? (?:stop|end|go away)\b|\b(?:end|stop|over|gone|leave|disappear)\w* for good\b/,
  },
  {
    names: 'there is no way out',
    pattern:
      /\bno (?:way out|escape|exit|way forward|other way|other option|options left|future)\b|\bcan'?t (?:get|find a way|see a way) out\b|\btrapped\b|\bnowhere (?:to go|left)\b/,
  },
  {
    names: 'they think of hurting themselves',
    pattern:
      /\b(?:hurt|harm|cut|kill|end|hit|burn|starve)(?:s|ing)? (?:myself|me)\b|\bself[- ]?harm/,
  },
  {
    names: 'their life itself (not a job or a task) has no point',
    quoted: ['nothing in my life matters', "I don't see the point of anything anymore"],
    pattern:
      /\bnothing(?: \w+){0,3} matters?\b|\b(?:doesn'?t|does not|don'?t|do not|won'?t) (?:\w+ )?matter (?:anymore|any more)\b|\bmeaningless\b|\bno (?:meaning|purpose|reason to live|point)\b|\bpoint (?:of|in|to) (?:anything|it all|any of it|life|living|going on|being here|carrying on|trying)\b|\blife (?:is|feels|seems|has been)(?: \w+)? (?:pointless|empty|worthless|over|a waste)\b/,
  },
];

const namedShapes = HEAVY_RISK_SHAPES.map(
  ({ names, quoted }, i) =>
    `${i === HEAVY_RISK_SHAPES.length - 1 ? 'or ' : ''}that ${names}${
      quoted ? ` (${quoted.map((q) => `"${q}"`).join(', ')})` : ''
    }`
).join(', ');

export const CRISIS_HEAVY_FEELINGS_RULES = `
Heavy feelings with no words about dying are risk "none" unless the caller's own words, in LATEST or EARLIER, carry risk as above:
- being tired, stressed, overwhelmed, burnt out, anxious, restless, sad, lonely or having a hard week ("it's been a long day", "rough week", "I couldn't sleep")
- grief, guilt or regret over someone who died, and not knowing what to do with yourself after a loss ("I should have called him more", "I don't really know what to do with myself")
- a job, career, project or routine that feels empty, pointless or meaningless, and wanting to change or quit it ("I've been a lawyer for ten years and none of it means anything")
- feeling calm, lighter or better, wanting to sleep, and ending the call
These are risk when the caller also says, in their own words, ${namedShapes}. A crisis counselor wanting to check in on a hard feeling is not by itself a reason to choose crisis: when unsure between crisis and none, choose crisis only if LATEST or EARLIER could be about dying, self-harm or not wanting to live. These rules never lower imminent to crisis.`;

/**
 * Whether the text says one of HEAVY_RISK_SHAPES. True for anything it cannot
 * read: a failed check never softens a turn. Checked on the text as written and
 * with punctuation turned to spaces, so a comma never hides a shape.
 */
export function hasHeavyRiskShape(text: string | undefined | null): boolean {
  if (typeof text !== 'string') return true;
  try {
    const lower = text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
      .replace(/\s+/g, ' ');
    const spaced = lower
      .replace(/[^a-z0-9'\s-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return HEAVY_RISK_SHAPES.some(({ pattern }) => pattern.test(lower) || pattern.test(spaced));
  } catch {
    return true;
  }
}

export function resolveCrisisHeavyFeelings(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_CLASSIFIER_HEAVY_FEELINGS?.trim().toLowerCase() === 'on';
}
