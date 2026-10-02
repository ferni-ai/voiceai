/**
 * Details that make a profile feel known: pets (species, breed, health,
 * routines, personality, stories), friendships (how they met, closeness,
 * shared history, the friend's own life events, last time they connected,
 * what the user meant to do), and memorial status for anyone who has died.
 *
 * Pure functions over the facts and summary sentences already attributed to
 * one person by people-model.ts.
 *
 * @module services/personal-insights/person-details
 */

import { DAY_MS, isResolved, roleFromText } from './text-utils.js';
import type {
  Closeness,
  ConnectionDetails,
  OpenThread,
  PetDetails,
  SourceFact,
  SourceSummary,
} from './types.js';

/** A summary sentence that mentions the person. */
export interface PersonMention {
  readonly at: number;
  readonly text: string;
  readonly conversationId: string;
}

const MEMORIAL =
  /\b(passed away|passed on|has died|died|put down|put to sleep|crossed the rainbow bridge|rainbow bridge|deceased|we lost (him|her|them)|in memory of|in loving memory|their funeral)\b/i;
const PET_PREDICATE =
  /\b(breed|species|vet|veterinarian|gotcha|adopted|adoption|kibble|leash|litter box|fetch)\b/i;
const DOG_BREED =
  /\b(retriever|labrador|lab|terrier|poodle|doodle|shepherd|bulldog|beagle|husky|corgi|dachshund|chihuahua|pug|spaniel|collie|pit ?bull|boxer|rottweiler|greyhound|schnauzer)\b/i;
const CAT_BREED = /\b(tabby|siamese|persian|maine coon|ragdoll|calico|sphynx|bengal)\b/i;

const LIFE_EVENT =
  /\b(new job|started (a |her |his |their )?(new )?job|got (a )?job|promot\w*|pregnan\w*|had a baby|new baby|baby (boy|girl)|engaged|got married|wedding|moved|moving|new house|bought a house|graduat\w*|diagnos\w*|surgery|in the hospital|sick|ill\b|illness|broke up|divorc\w*|laid off|lost (her|his|their) job|retir\w*)\b/i;
const CONNECT =
  /\b(talked (to|with)|spoke (to|with)|called|texted|saw|met up|hung out|had (lunch|dinner|coffee|drinks) with|visited|caught up with|facetimed|video called)\b/i;
const INTENT =
  /\b(should|need to|needs to|want to|wants to|going to|will|plan(s|ning)? to|meaning to)\s+(call|text|reach out|see|visit|check in|catch up|write|message|invite|get together)\b/i;
const SHARED =
  /\b(memor\w*|story|trip|inside joke|joke|tradition|used to|together|shared|nickname|remember\w*|road trip|college days)\b/i;
const HOW_MET_PLACES =
  /\b(school|high school|college|university|grad school|work|job|office|church|gym|team|camp|online|neighbo(u)?rhood|book club|choir|band|military|army)\b/i;

export function isMemorial(texts: readonly string[]): boolean {
  return texts.some((t) => MEMORIAL.test(t));
}

/** Does what we know about this one read as an animal? */
export function looksLikePet(facts: readonly SourceFact[], roleGroupIsPet: boolean): boolean {
  if (roleGroupIsPet) return true;
  return facts.some(
    (f) =>
      PET_PREDICATE.test(f.predicate.replace(/_/g, ' ')) ||
      DOG_BREED.test(f.value) ||
      CAT_BREED.test(f.value)
  );
}

function speciesOf(facts: readonly SourceFact[], role?: string): string | undefined {
  if (role === 'dog' || role === 'cat') return role;
  for (const f of facts) {
    const r = roleFromText(f.value);
    if (r === 'dog' || r === 'cat') return r;
    if (DOG_BREED.test(f.value)) return 'dog';
    if (CAT_BREED.test(f.value)) return 'cat';
  }
  return undefined;
}

export function petDetails(facts: readonly SourceFact[], role?: string): PetDetails {
  let breed: string | undefined;
  let age: string | undefined;
  let owner: string | undefined;
  const health: string[] = [];
  const routines: string[] = [];
  const personality: string[] = [];
  const stories: string[] = [];
  for (const f of facts) {
    const p = f.predicate.toLowerCase().replace(/_/g, ' ');
    const hay = `${p} ${f.value}`.toLowerCase();
    if (/\b(name|named|called|relationship|relation|species|type)\b/.test(p)) continue;
    if (/\bbreed\b/.test(p)) breed = f.value;
    else if (/\b(age|years old)\b/.test(hay)) age = f.value;
    else if (/\b(owner|belongs)\b/.test(p)) owner = f.value;
    else if (
      /\b(vet|med|medicine|medication|pill|surgery|injur\w*|paw|limp\w*|sick|allerg\w*|diagnos\w*|shots?|vaccin\w*|health|arthritis)\b/.test(
        hay
      )
    )
      health.push(f.text);
    else if (
      /\b(walks?|walking|feed\w*|food|breakfast|dinner|groom\w*|routine|bath|park|treats?)\b/.test(
        hay
      )
    )
      routines.push(f.text);
    else if (
      /\b(personality|loves|likes|hates|afraid|scared|temperament|favou?rite|energetic|lazy|shy|cuddl\w*|playful|goofy)\b/.test(
        hay
      )
    )
      personality.push(f.text);
    else if (!/\b(birthday|bday|born|gotcha)\b/.test(hay)) stories.push(f.text);
  }
  return {
    species: speciesOf(facts, role),
    breed,
    age,
    personality: personality.slice(0, 4),
    health: health.slice(0, 4),
    routines: routines.slice(0, 3),
    owner,
    stories: stories.slice(0, 4),
  };
}

export interface ConnectionInput {
  readonly role?: string;
  readonly facts: readonly SourceFact[];
  readonly mentions: readonly PersonMention[];
  readonly mentionCount: number;
  /** Mean sentiment of mentions, -1..1. */
  readonly sentiment: number;
  readonly summaries: readonly SourceSummary[];
  readonly nowMs: number;
}

const LIFE_EVENT_WINDOW_DAYS = 60;

function howMetOf(role: string | undefined, facts: readonly SourceFact[]): string | undefined {
  if (role === 'coworker' || role === 'boss') return 'work';
  if (role === 'neighbor' || role === 'roommate') return role;
  if (role === 'classmate') return 'school';
  for (const f of facts) {
    const hay = `${f.predicate.replace(/_/g, ' ')} ${f.value}`;
    if (!/\b(met|meet|know|known|knows|from|went to|how)\b/i.test(hay)) continue;
    const m = hay.match(HOW_MET_PLACES);
    if (m) return m[1].toLowerCase();
  }
  return undefined;
}

export function connectionDetails(input: ConnectionInput): ConnectionDetails {
  const { facts, mentions, nowMs } = input;
  const factTexts = facts.map((f) => ({
    at: f.at,
    text: f.text,
    conversationId: f.conversationIds[0] ?? '',
  }));
  const all = [...factTexts, ...mentions];

  const close =
    input.role === 'best_friend' ||
    facts.some((f) =>
      /\b(close friend|best friend|like a (sister|brother)|oldest friend)\b/i.test(f.text)
    ) ||
    (input.mentionCount >= 5 && input.sentiment >= 0);
  const closeness: Closeness = close
    ? 'close'
    : input.mentionCount >= 2
      ? 'regular'
      : 'acquaintance';

  const toThread = (m: PersonMention): OpenThread => ({
    text: m.text,
    mentionedAt: m.at,
    sourceConversationIds: m.conversationId ? [m.conversationId] : [],
  });
  const lifeEvents = all
    .filter((m) => LIFE_EVENT.test(m.text) && nowMs - m.at <= LIFE_EVENT_WINDOW_DAYS * DAY_MS)
    .map(toThread);
  const connected = mentions.filter((m) => CONNECT.test(m.text)).map((m) => m.at);
  const intentions = all
    .filter((m) => INTENT.test(m.text))
    .map(toThread)
    .filter((t) => !isResolved(t, input.summaries));

  return {
    howMet: howMetOf(input.role, facts),
    closeness,
    sharedHistory: facts
      .filter((f) => SHARED.test(`${f.predicate} ${f.text}`))
      .map((f) => f.text)
      .slice(0, 4),
    lifeEvents: dedupe(lifeEvents).slice(-3),
    lastConnectedAt: connected.length ? Math.max(...connected) : undefined,
    intentions: dedupe(intentions).slice(-2),
  };
}

function dedupe(items: readonly OpenThread[]): OpenThread[] {
  const seen = new Map<string, OpenThread>();
  for (const i of [...items].sort((a, b) => a.mentionedAt - b.mentionedAt))
    seen.set(i.text.toLowerCase(), i);
  return [...seen.values()];
}
