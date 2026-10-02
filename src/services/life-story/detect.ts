/**
 * High-precision, first-person detection of life story, values and beliefs in
 * the user's own words. Pure: no I/O.
 *
 *   "I grew up in Ohio"                          → origin
 *   "I'm the youngest of four"                   → family of origin
 *   "I went to Ohio State"                       → school
 *   "When I was nine my brother and I built..."  → a story they told
 *   "I'll never forget the day..."               → formative moment
 *   "Everything changed when..."                 → turning point
 *   "Those were my Berlin years"                 → life chapter
 *   "I've always been the one who..."            → recurring theme
 *   "I always sleep on big decisions"            → how they decide
 *   "Family matters most to me"                  → value (not gated)
 *   "I go to mass on Sundays" / "I'm Buddhist"   → belief (only stored with consent)
 *
 * Classification between a value and a belief uses the shared sensitive
 * classifier: anything it calls `beliefs` is a belief, never a value.
 *
 * @module services/life-story/detect
 */

import { sensitiveCategoriesOf } from '../memory-consent/classifier.js';
import { cleanText } from './rules.js';
import type { BeliefKind, StoryKind } from './types.js';

export interface DetectedStory {
  readonly kind: StoryKind;
  readonly title: string;
  readonly detail?: string;
  readonly period?: string;
  readonly date?: string;
  readonly place?: string;
  readonly people?: string[];
}

export interface DetectedValue {
  readonly label: string;
  readonly statement: string;
}

export interface DetectedBelief {
  readonly kind: BeliefKind;
  readonly title: string;
  readonly detail?: string;
}

export interface Detection {
  readonly stories: DetectedStory[];
  readonly values: DetectedValue[];
  readonly beliefs: DetectedBelief[];
}

const PLACE = `([A-Z][\\w'.-]+(?:[ ,]+(?:[A-Z][\\w'.-]+|de|da|del|upon|on)){0,3})`;

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const tidy = (s: string, max = 120): string =>
  cleanText(s.replace(/^[,;:\s-]+|[,;:\s-]+$/g, ''), max);

/** "my brother and I built" → "their brother and they built" (for the prompt). */
export function toThirdPerson(text: string): string {
  return text
    .replace(/\bI'm\b/g, "they're")
    .replace(/\bI've\b/g, "they've")
    .replace(/\bI'd\b/g, "they'd")
    .replace(/\bI\b/g, 'they')
    .replace(/\bmy\b/gi, 'their')
    .replace(/\bme\b/gi, 'them')
    .replace(/\bmyself\b/gi, 'themselves')
    .replace(/\bmine\b/gi, 'theirs');
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

const NEGATED = /\b(?:don'?t|didn'?t|never|not|wasn'?t|haven'?t|no longer)\b/i;
const OTHER_PERSON_START =
  /^(?:my (?:mom|dad|mother|father|brother|sister|friend|wife|husband|partner|son|daughter|boss)|he|she|they)\b/i;

const NAME_RE =
  /\b(?:my )?(?:brother|sister|mom|dad|mother|father|grandma|grandpa|grandmother|grandfather|aunt|uncle|cousin|best friend|friend)(?: ([A-Z][a-z]+))?/g;

/** People mentioned in a story: a name after a relation ("my brother Sam"), else the relation. */
export function peopleIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NAME_RE)) {
    const name = m[1] ?? m[0].replace(/^my /, '');
    if (!out.includes(name)) out.push(name);
  }
  return out.slice(0, 4);
}

const NUMBER_WORDS =
  'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen'.split(
    ' '
  );

function periodOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const r = raw.trim().toLowerCase();
  if (/^\d{1,2}(?: years old)?$/.test(r)) return `age ${parseInt(r, 10)}`;
  const word = NUMBER_WORDS.indexOf(r.replace(/ years old$/, ''));
  if (word >= 0) return `age ${word + 1}`;
  if (/^(?:a kid|a child|little|young)$/.test(r)) return 'childhood';
  if (/teen/.test(r)) return 'teens';
  const school = /in (high school|middle school|college|grade school|elementary school)/.exec(r);
  return school ? school[1] : cleanText(r, 40);
}

// ---------------------------------------------------------------------------
// Beliefs (checked first: "I don't believe in God" is a belief, not a negation)
// ---------------------------------------------------------------------------

const FAITHS =
  'Catholic|Christian|Protestant|Muslim|Jewish|Hindu|Buddhist|Sikh|Mormon|Quaker|Pagan|Wiccan|Jain|Taoist|Baptist|Methodist|Lutheran|Anglican|Orthodox|Evangelical|Episcopalian|Presbyterian|atheist|agnostic|humanist|Stoic|spiritual but not religious|spiritual|not (?:very )?religious|religious';

const BELIEF_RULES: ReadonlyArray<[RegExp, BeliefKind, (m: RegExpMatchArray) => string]> = [
  [
    new RegExp(
      `\\bI(?:'m| am) (?:a |an )?((?:(?:practicing|practising|devout|lapsed|non-practicing|born-again|cultural|pretty|very) )?(?:${FAITHS}))\\b`,
      'i'
    ),
    'faith',
    (m) => cap(m[1]),
  ],
  [
    /\bI (?:go to|attend|never miss) (mass|church|temple|the temple|mosque|synagogue|shul|services|gurdwara|bible study|confession|friday prayers)((?: (?:every|on|each) \w+(?: \w+)?)?)/i,
    'practice',
    (m) => `Goes to ${m[1].toLowerCase()}${m[2] ? m[2].toLowerCase() : ''}`,
  ],
  [
    /\bI pray((?: (?:every|each|daily|at night|in the morning|before \w+|a lot|five times a day)[\w ]{0,20})?)/i,
    'practice',
    (m) => `Prays${m[1] ? m[1].toLowerCase() : ''}`.trim(),
  ],
  [
    /\bI (?:keep kosher|keep halal|observe (?:the )?sabbath|observe ramadan|fast (?:for|during) (?:ramadan|lent|yom kippur)|celebrate (?:diwali|passover|eid|vesak))\b/i,
    'practice',
    (m) => cap(m[0].replace(/^I /i, '')),
  ],
  [
    /\bI(?:'ve| have) been (questioning|doubting|struggling with|losing|rethinking) my (faith|beliefs|religion)\b/i,
    'questioning',
    (m) => `Has been ${m[1].toLowerCase()} their ${m[2].toLowerCase()}`,
  ],
  [
    /\bI (lost|left|found|came back to|returned to) (?:my )?(faith|religion|the church|god)\b/i,
    'questioning',
    (m) =>
      `${cap(m[1].toLowerCase())} ${m[2].toLowerCase() === 'god' ? 'God' : `their ${m[2].toLowerCase()}`}`,
  ],
  [
    /\bI (don'?t |do not |do |really |still )?believe in (god|heaven|hell|an afterlife|the afterlife|karma|reincarnation|fate|a higher power)\b/i,
    'belief',
    (m) =>
      `${m[1] && /n'?t|not/i.test(m[1]) ? "Doesn't believe" : 'Believes'} in ${m[2].toLowerCase() === 'god' ? 'God' : m[2].toLowerCase()}`,
  ],
  [
    /\bI follow (Stoicism|Buddhism|Taoism|the teachings of [\w ]{3,30})/i,
    'belief',
    (m) => `Follows ${m[1]}`,
  ],
  [/\bI converted to (\w+)/i, 'faith', (m) => `Converted to ${m[1]}`],
  [
    /\bmy faith (?:is|matters|means|keeps|helps|gets|has)\b.{3,80}/i,
    'faith',
    (m) => cap(toThirdPerson(tidy(m[0]))),
  ],
];

function detectBeliefs(sentence: string): DetectedBelief[] {
  const out: DetectedBelief[] = [];
  for (const [re, kind, title] of BELIEF_RULES) {
    const m = sentence.match(re);
    if (m) out.push({ kind, title: tidy(title(m)), detail: tidy(sentence, 300) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Values and how they decide
// ---------------------------------------------------------------------------

const VALUE_RULES: readonly RegExp[] = [
  /\bwhat matters (?:most|more than anything) to me is ([\w\s']{3,50}?)(?:[.,!?]|$| and )/i,
  /\b((?:my |being |having )?[a-z][\w']*(?: [a-z][\w']*){0,2}) (?:matters?|means?) (?:the )?(?:most|everything|more than anything) to me\b/i,
  /\b((?:my |being |having )?[a-z][\w']*(?: [a-z][\w']*){0,2}) (?:is|are) (?:really |so |very |super )?important to me\b/i,
  /\bI (?:really |deeply |truly )?value ([\w\s']{3,40}?)(?:[.,!?]|$| above| more| over| and )/i,
  /\b((?:my )?[a-z][\w']*(?: [a-z][\w']*)?) (?:comes?|always comes?) first\b/i,
  /\bI believe in (honesty|hard work|kindness|loyalty|fairness|treating people [\w ]{3,20}|second chances|family)\b/i,
];

const NOT_A_VALUE =
  /^(?:this|that|it|the|getting|finishing|winning|doing|making|today|tomorrow|work|what|which|who|nothing|everything|something|it all)\b/i;

function detectValues(sentence: string): DetectedValue[] {
  const out: DetectedValue[] = [];
  for (const re of VALUE_RULES) {
    const m = sentence.match(re);
    if (!m) continue;
    const label = tidy(m[1].replace(/^(?:my|being|having) /i, ''), 50).toLowerCase();
    if (label.length < 3 || NOT_A_VALUE.test(label) || label.split(' ').length > 4) continue;
    if (!out.some((v) => v.label === label)) out.push({ label, statement: tidy(sentence, 300) });
  }
  return out;
}

const DECISION_RULES: readonly RegExp[] = [
  /\bI (?:always |usually |tend to |like to )?(sleep on (?:it|big decisions|decisions|things)|go with my gut|trust my gut|make (?:a )?pros and cons lists?|talk (?:it|things|big decisions) (?:over|through) with [\w ]{2,30}|need time to decide|decide (?:fast|quickly|slowly))/i,
  /\bwhen I (?:make|have to make|'m making) (?:a |big )?decisions?,? I ([^.!?]{5,100})/i,
];

function detectDecision(sentence: string): DetectedStory | null {
  for (const re of DECISION_RULES) {
    const m = sentence.match(re);
    if (m) return { kind: 'decision', title: cap(tidy(m[1], 100)), detail: tidy(sentence, 300) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Life story
// ---------------------------------------------------------------------------

type StoryRule = [
  RegExp,
  (m: RegExpMatchArray, sentence: string, prev?: string) => DetectedStory | null,
];

const STORY_RULES: readonly StoryRule[] = [
  [
    new RegExp(`\\bI (?:grew up|was raised|was born(?: and raised)?) in ${PLACE}`),
    (m, s) => ({
      kind: 'origin',
      title: `${/born/.test(m[0]) && !/raised/.test(m[0]) ? 'Born' : 'Grew up'} in ${m[1].replace(/[ ,.]+$/, '')}`,
      place: m[1].replace(/[ ,.]+$/, ''),
      period: 'childhood',
      detail: tidy(s, 300),
    }),
  ],
  [
    new RegExp(`\\bmy hometown is ${PLACE}`),
    (m, s) => ({
      kind: 'origin',
      title: `Grew up in ${m[1].replace(/[ ,.]+$/, '')}`,
      place: m[1].replace(/[ ,.]+$/, ''),
      period: 'childhood',
      detail: tidy(s, 300),
    }),
  ],
  [
    /\bI grew up (on a farm|by the (?:sea|ocean|coast)|in the (?:countryside|country|city|suburbs)|in a small town|poor|with (?:not much|very little) money|moving around(?: a lot)?|in foster care)/i,
    (m, s) => ({
      kind: 'origin',
      title: `Grew up ${m[1].toLowerCase()}`,
      period: 'childhood',
      detail: tidy(s, 300),
    }),
  ],
  [
    /\bI(?:'m| am| was) (?:the )?(oldest|eldest|youngest|middle) (?:child|kid|one|sibling|of (\w+))|\bI(?:'m| am| was) an only child\b/i,
    (m, s) =>
      m[1]
        ? {
            kind: 'family',
            title: cap(`the ${m[1].toLowerCase()}${m[2] ? ` of ${m[2].toLowerCase()}` : ' child'}`),
            detail: tidy(s, 300),
          }
        : { kind: 'family', title: 'An only child', detail: tidy(s, 300) },
  ],
  [
    /\bI grew up with (?:my )?((?:a |an |two |three |four |five |\d+ )?(?:older |younger |big |little |twin )?(?:brothers?|sisters?|siblings|step-?\w+|half-?\w+|cousins|grandparents|grandmother|grandfather|single (?:mom|mother|dad|father))(?: and (?:a |an |two |three |\d+ )?(?:older |younger )?(?:brothers?|sisters?))?)/i,
    (m, s) => ({
      kind: 'family',
      title: `Grew up with ${m[1].toLowerCase()}`,
      period: 'childhood',
      detail: tidy(s, 300),
      people: peopleIn(s),
    }),
  ],
  [
    /\bI was raised by (?:my )?((?:single )?(?:mom|mother|dad|father|grandmother|grandma|grandparents|aunt|uncle|grandfather|foster parents)(?: and (?:my )?\w+)?)/i,
    (m, s) => ({
      kind: 'family',
      title: `Raised by ${m[1].toLowerCase()}`,
      period: 'childhood',
      detail: tidy(s, 300),
    }),
  ],
  [
    /\bmy parents (?:got )?(divorced|split up|separated)(?: when I was (\d{1,2}|a kid|little|young))?/i,
    (m, s) => ({
      kind: 'family',
      title: `Parents ${m[1].toLowerCase()}`,
      period: periodOf(m[2]),
      detail: tidy(s, 300),
    }),
  ],
  [
    /\bI (?:went to|studied at|graduated from|dropped out of) ((?:high school|college|university|law school|med school|medical school|grad school|art school|boarding school|community college|[A-Z][\w'.-]*(?: (?:[A-Z][\w'.-]*|of|de))*(?: (?:University|College|School|High))?))(?: in (\d{4}))?/,
    (m, s) => {
      const verb = /dropped out/.test(m[0])
        ? 'Dropped out of'
        : /graduated/.test(m[0])
          ? 'Graduated from'
          : 'Went to';
      return { kind: 'school', title: `${verb} ${m[1]}`, date: m[2], detail: tidy(s, 300) };
    },
  ],
  [
    /\bI majored in ([a-z][\w ]{2,30}?)(?:[.,!?]|$| at| and)/i,
    (m, s) => ({ kind: 'school', title: `Majored in ${m[1].toLowerCase()}`, detail: tidy(s, 300) }),
  ],
  [
    /\b(?:everything changed|my life changed) (?:when|after) ([^.!?]{8,160})/i,
    (m, s) => ({
      kind: 'turning_point',
      title: cap(tidy(m[1])),
      detail: tidy(s, 300),
      people: peopleIn(s),
    }),
  ],
  [
    /\bthe moment I (?:realized|knew|decided) ([^.!?]{8,160})/i,
    (m, s) => ({
      kind: 'turning_point',
      title: cap(tidy(`realizing ${m[1]}`)),
      detail: tidy(s, 300),
    }),
  ],
  [
    /\b(?:that|it|this) (?:was|became) (?:a |the |my )?(?:real )?turning point\b|\b(?:that|it) changed (?:my life|everything|who I am)\b/i,
    (_m, s, prev) => {
      const before = s.split(/\b(?:that|it|this) (?:was|became|changed)\b/i)[0];
      const subject = tidy(before.length > 15 ? before : (prev ?? ''));
      return subject.length >= 8
        ? { kind: 'turning_point', title: cap(subject), detail: tidy(`${prev ?? ''} ${s}`, 300) }
        : null;
    },
  ],
  [
    /\bI(?:'ll| will) never forget (?:when |the time |the day |how )?([^.!?]{8,180})/i,
    (m, s) => ({
      kind: 'moment',
      title: cap(tidy(m[1])),
      detail: tidy(s, 300),
      people: peopleIn(s),
    }),
  ],
  [
    /\b(?:those|these) were my ([\w-]+(?: [\w-]+)?) years\b/i,
    (m, s) => ({ kind: 'chapter', title: `My ${m[1]} years`, period: m[1], detail: tidy(s, 300) }),
  ],
  [
    /\bI spent (\w+|\d+) years (in|at|as|working at|living in) ([^,.!?]{3,60})/i,
    (m, s) => ({
      kind: 'chapter',
      title: `${cap(m[1])} years ${m[2].toLowerCase()} ${tidy(m[3], 60)}`,
      detail: tidy(s, 300),
    }),
  ],
  [
    /\b(?:in|during|through) my (teens|twenties|thirties|forties|fifties|20s|30s|40s|50s),? (I [^.!?]{8,160})/i,
    (m, s) => ({
      kind: 'chapter',
      title: cap(tidy(m[2])),
      period: m[1].toLowerCase(),
      detail: tidy(s, 300),
    }),
  ],
  [
    /\bwhen I was (a kid|a child|little|young|a teenager|in (?:high school|middle school|college|grade school|elementary school)|(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen)(?: years old)?),? ([^.!?]{10,200})/i,
    (m, s) => ({
      kind: 'story',
      title: cap(tidy(m[2])),
      period: periodOf(m[1]),
      detail: tidy(s, 300),
      people: peopleIn(s),
    }),
  ],
  [
    /\bI (?:still )?remember (?:when |the time |how )([^.!?]{10,200})/i,
    (m, s) => ({
      kind: 'story',
      title: cap(tidy(m[1])),
      detail: tidy(s, 300),
      people: peopleIn(s),
    }),
  ],
  [
    /\bI(?:'ve| have) always been the ((?:one who|person who) [^.!?,]{5,80}|[\w-]+(?: [\w-]+){0,2} one)\b/i,
    (m, s) => ({ kind: 'theme', title: `Always the ${tidy(m[1], 90)}`, detail: tidy(s, 300) }),
  ],
  [
    /\bI always (?:end up|seem to) ([^.!?,]{5,80})/i,
    (m, s) => ({ kind: 'theme', title: `Always ends up ${tidy(m[1], 80)}`, detail: tidy(s, 300) }),
  ],
  [
    /\bit(?:'s| has) always been hard for me to ([^.!?,]{4,60})/i,
    (m, s) => ({
      kind: 'theme',
      title: `Finds it hard to ${tidy(m[1], 60)}`,
      detail: tidy(s, 300),
    }),
  ],
];

const ALLOW_NEGATION: ReadonlySet<StoryKind> = new Set([
  'turning_point',
  'moment',
  'story',
  'theme',
]);

function detectStories(sentence: string, prev?: string): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const [re, make] of STORY_RULES) {
    const m = sentence.match(re);
    if (!m) continue;
    const story = make(m, sentence, prev);
    if (!story || story.title.length < 4) continue;
    if (
      !ALLOW_NEGATION.has(story.kind) &&
      NEGATED.test(sentence.slice(0, (m.index ?? 0) + m[0].length))
    )
      continue;
    out.push(story);
    if (story.kind !== 'origin' && story.kind !== 'school') break; // one narrative per sentence
  }
  return out;
}

/** Everything in the user's own words. */
export function detectInUserText(text: string): Detection {
  const stories: DetectedStory[] = [];
  const values: DetectedValue[] = [];
  const beliefs: DetectedBelief[] = [];
  const list = sentences(text);
  list.forEach((sentence, i) => {
    if (OTHER_PERSON_START.test(sentence) && !/\bI\b/.test(sentence)) return;
    beliefs.push(...detectBeliefs(sentence));
    const touchesBeliefs = sensitiveCategoriesOf(sentence).includes('beliefs');
    for (const v of detectValues(sentence)) {
      if (touchesBeliefs || sensitiveCategoriesOf(v.label).includes('beliefs')) {
        if (!beliefs.length)
          beliefs.push({
            kind: 'faith',
            title: cap(toThirdPerson(tidy(sentence))),
            detail: tidy(sentence, 300),
          });
      } else if (!NEGATED.test(sentence)) {
        values.push(v);
      }
    }
    const decision = detectDecision(sentence);
    if (decision) stories.push(decision);
    else stories.push(...detectStories(sentence, list[i - 1]));
  });
  return { stories, values, beliefs };
}

const SUMMARY_RULES: readonly StoryRule[] = [
  [
    new RegExp(
      `\\b(?:They|She|He|The user|User) (?:grew up|was raised|was born(?: and raised)?) in ${PLACE}`
    ),
    (m) => ({
      kind: 'origin',
      title: `Grew up in ${m[1].replace(/[ ,.]+$/, '')}`,
      place: m[1].replace(/[ ,.]+$/, ''),
      period: 'childhood',
    }),
  ],
  [
    /\b(?:shared|told|recounted|described|reminisced about) (?:a |the |an old )?(?:story|memory|childhood memory) (?:about|of) ([^.;]{8,160})/i,
    (m, s) => ({
      kind: 'story',
      title: cap(tidy(m[1])),
      detail: tidy(s, 300),
      people: peopleIn(s),
    }),
  ],
];

/** Third-person summary ("They grew up in Ohio and shared a story about..."). */
export function detectInSummary(summary: string): DetectedStory[] {
  const out: DetectedStory[] = [];
  for (const sentence of sentences(summary)) {
    for (const [re, make] of SUMMARY_RULES) {
      const m = sentence.match(re);
      const story = m ? make(m, sentence) : null;
      if (story) out.push(story);
    }
  }
  return out;
}
