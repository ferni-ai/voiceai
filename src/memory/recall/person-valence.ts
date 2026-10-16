/**
 * How the caller's people are doing, as far as Ferni remembers: for the name
 * lift (agents/realtime/name-lift.ts), the avatar's reaction the instant a
 * remembered person is named.
 *
 * Read from the recall snapshot (dynamic_facts plus open threads). Each
 * person gets one of three effects, or none:
 * - comfort: anything about a death, grief, conflict or estrangement, in any
 *   fact or thread that names them. This always wins, so a happy fact can
 *   never make a grieving name sparkle.
 * - attentive: something still pending or uncertain (surgery next week,
 *   waiting on results), or good and pending news mixed with no clear newest.
 * - brighten: only good news (the surgery went well, she got engaged).
 * - none: nothing with a feeling to it (where they live, what they like).
 *
 * Words are matched whole, never inside other words.
 *
 * @module memory/recall/person-valence
 */
import type { RecallFact, RecallSnapshot } from './session-recall.js';

export type NameLiftEffect = 'brighten' | 'attentive' | 'comfort';

export interface RememberedPerson {
  /** The names the caller may use: the entity name and any known alias. */
  names: string[];
  effect: NameLiftEffect;
}

type Tone = 'comfort' | 'pending' | 'good' | null;

/** Whole words, any run of spaces between them ("passed  away"). */
const w = (body: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${body.replace(/ /g, '\\s+')})(?![\\p{L}\\p{N}])`, 'iu');

/** Death, grief, conflict, estrangement, and hardship that should never sparkle. */
const COMFORT = w(
  [
    'pass(?:ed|ing) away',
    'passed on',
    // "passed in the spring", but not "passed the bar"
    'passed(?! (?:her|his|their|the|a|an|my|our|its) )',
    'lost (?:him|her|them)',
    'lost (?:\\S+ ){1,2}to',
    'no longer with us',
    'took (?:his|her|their) own life',
    'died',
    'dies',
    'dead',
    'deaths?',
    'deceased',
    'funerals?',
    'memorial',
    'buried',
    'burial',
    'grie(?:f|ve|ves|ving|ved)',
    'mourn(?:s|ed|ing)?',
    'late (?:husband|wife|mother|father|mom|dad|son|daughter|brother|sister|partner|grandma|grandpa)',
    'miscarriage',
    'stillborn',
    'hospice',
    'terminal(?:ly)?',
    'suicide',
    'overdosed?',
    'killed',
    'estrange(?:d|ment)',
    '(?:not|never|no longer) (?:talking|speaking|talked|spoken|talk|speak)',
    'stopped (?:talking|speaking)',
    'cut (?:off|ties)',
    'fall(?:ing)?[- ]out',
    'fell out',
    'feud(?:ing)?',
    'conflicts?',
    'argu(?:e|ed|es|ing|ment|ments)',
    'fight(?:s|ing)?',
    'fought',
    'divorc(?:e|ed|es|ing)',
    'separat(?:ed|ion)',
    'broke up',
    'break[- ]?up',
    'split up',
    'betray(?:ed|al)?',
    'cheat(?:ed|ing)',
    'abus(?:e|ed|ive)',
    'restraining order',
    'resent(?:s|ment)?',
    '(?:angry|mad|furious|upset) (?:at|with)',
    'fired',
    'laid off',
    'devastated',
    'arrested',
    'jail',
    'prison',
    'dementia',
    "alzheimer['’]?s?",
    'addiction',
    'rehab',
  ].join('|')
);

/** Not settled yet: the future, waiting, worry. Wins over good words in the same fact. */
const UNCERTAIN = w(
  'next (?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|' +
    'upcoming|future|soon|tomorrow|scheduled|planned|planning|waiting|awaiting|pending|' +
    'will|going to|gonna|hop(?:e|es|ing)|worr(?:y|ied|ies)|nervous|anxious|uncertain|' +
    'unsure|might|maybe|trying'
);

/** Good news. */
const GOOD = w(
  'went well|going well|(?:doing|recovering|healing) (?:well|great|better)|recovered|' +
    'full recovery|all clear|clean bill|cancer[- ]free|in remission|good news|great news|' +
    'promot(?:ed|ion)|got engaged|engaged|got married|graduated|new baby|was born|' +
    "won(?!['’]t)|award|accepted|got the job|new job|proud|thriving|excited|" +
    'celebrat(?:e|ed|ing)|success(?:ful)?|' +
    'passed (?:her|his|their|the) (?:exam|test|bar|boards|driving test)'
);

/** Hard but not grief: illness and tests. Uncertain unless good news says otherwise. */
const HARD = w(
  'surgery|operation|biops(?:y|ies)|diagnos(?:is|ed)|results|tests?|hospital(?:ized)?|' +
    'icu|chemo|cancer|stroke|sick|ill|illness|injur(?:y|ed)|treatment|recovering|' +
    'struggling|stressed|pregnan(?:t|cy)|expecting'
);

/** "don't", "isn't": the contraction sits inside the word, so it has no leading boundary. */
const NT = "n['’]t(?![\\p{L}\\p{N}])";
const NOT_SPEAKING = new RegExp(`${NT}\\s+(?:talk|speak|spoken|talked)`, 'iu');
const NEGATED = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:not|never|no longer|hardly|barely)(?![\\p{L}\\p{N}])|${NT}`,
  'iu'
);

/** One fact or thread. Negated good news ("not doing well") is uncertain, never good. */
export function toneOf(text: string): Tone {
  if (COMFORT.test(text) || NOT_SPEAKING.test(text)) return 'comfort';
  if (UNCERTAIN.test(text)) return 'pending';
  if (GOOD.test(text)) return NEGATED.test(text) ? 'pending' : 'good';
  if (HARD.test(text)) return 'pending';
  return null;
}

/** Roles the extractor uses as entity names: "Mom | surgery = next week". */
const ROLE = w(
  'mom|mum|mother|dad|father|wife|husband|partner|spouse|sister|brother|son|daughter|grandma|grandpa|grandmother|grandfather|aunt|uncle|cousin|niece|nephew|girlfriend|boyfriend|fianc[eé]e?|friend|best friend|boss|coworker|colleague|roommate|neighbor'
);
const SELF = /^(?:speaker|user|me)$/i;
const ALIAS_KEY = /^(?:nickname|alias|goes by|also known as|known as|called|short name)$/i;
const PROPER = /^[A-Z][\p{L}'’-]+(?: [A-Z][\p{L}'’-]+)?$/u;

const escape = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

/**
 * True when `name` is said in `text` as a whole word: "Sam" is not in
 * "Samuel", "sister" is not in "sister-in-law". Proper names match only
 * capitalised ("Will", never "I will"); roles match in any case ("my mom").
 */
export function saysName(text: string, name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const flags = PROPER.test(n) && !ROLE.test(n) ? 'u' : 'iu';
  return new RegExp(`(?<![\\p{L}\\p{N}-])${escape(n)}(?![\\p{L}\\p{N}-])`, flags).test(text);
}

const textOf = (f: RecallFact): string =>
  `${f.key.replace(/_/g, ' ')} ${f.value} ${f.temporalContext ?? ''}`;

/** A person, not a pet or a place: a role, a relationship fact, or a relation word about them. */
function isPerson(entity: string, own: readonly RecallFact[]): boolean {
  if (ROLE.test(entity) && entity.split(/\s+/).length <= 2) return true;
  return own.some((f) => f.factType === 'relationship' || ROLE.test(`${f.key} ${f.value}`));
}

/** The newest tone when every signal is dated and one is strictly newest; else null. */
function newestTone(signals: Array<{ tone: Tone; at: number }>): Tone {
  if (signals.some((s) => Number.isNaN(s.at))) return null;
  const sorted = [...signals].sort((a, b) => b.at - a.at);
  return sorted.length > 1 && sorted[0].at === sorted[1].at ? null : sorted[0].tone;
}

function effectOf(texts: Array<{ text: string; at: number }>): NameLiftEffect | null {
  const signals = texts
    .map(({ text, at }) => ({ tone: toneOf(text), at }))
    .filter((s) => s.tone !== null);
  if (signals.length === 0) return null;
  if (signals.some((s) => s.tone === 'comfort')) return 'comfort';
  if (signals.every((s) => s.tone === 'good')) return 'brighten';
  if (signals.every((s) => s.tone === 'pending')) return 'attentive';
  // Good and pending mixed: the newest, if it is clear; otherwise never sparkle.
  return newestTone(signals) === 'good' ? 'brighten' : 'attentive';
}

/**
 * The people Ferni remembers who have a feeling attached, with the effect
 * for each. People with nothing felt about them are left out.
 */
export function rememberedPeople(snapshot: RecallSnapshot): RememberedPerson[] {
  const byEntity = new Map<string, { name: string; own: RecallFact[]; aliases: Set<string> }>();
  for (const f of snapshot.facts) {
    const name = f.entity.trim();
    if (!name || SELF.test(name)) continue;
    const entry = byEntity.get(name.toLowerCase()) ?? { name, own: [], aliases: new Set() };
    entry.own.push(f);
    if (ALIAS_KEY.test(f.key.replace(/_/g, ' ').trim()) && PROPER.test(f.value.trim())) {
      entry.aliases.add(f.value.trim());
    }
    byEntity.set(name.toLowerCase(), entry);
  }
  const people: RememberedPerson[] = [];
  for (const { name, own, aliases } of byEntity.values()) {
    if (!isPerson(name, own)) continue;
    const names = [name, ...aliases];
    const named = (text: string): boolean => names.some((n) => saysName(text, n));
    // Every fact and thread that names them counts, under any entity:
    // "User | loss = Dad passed away" must stop "Dad" from ever sparkling.
    const texts = [
      ...snapshot.facts
        .filter((f) => own.includes(f) || named(`${f.entity} ${textOf(f)}`))
        .map((f) => ({ text: textOf(f), at: f.extractedAt ? Date.parse(f.extractedAt) : NaN })),
      // Open threads are questions to ask, not news: they count only for comfort.
      ...snapshot.followUps
        .filter((t) => named(t) && toneOf(t) === 'comfort')
        .map((text) => ({ text, at: NaN })),
    ];
    const effect = effectOf(texts);
    if (effect) people.push({ names, effect });
  }
  return people;
}
