/**
 * What Ferni knows about you, in one place: the people in your life, your
 * life now, the dates that matter, what you like, how Ferni reads you, and
 * (behind its own flag) what he's been thinking about since you talked.
 *
 * A friend's memory is invisible; this one isn't. Each item says where it
 * came from ("you said on Oct 9 ...", "I noticed ...") so nothing reads as
 * more certain than it is. Every source is read under the caller's own path
 * (bogle_users/{uid}/...), and only what the live readers would use is shown:
 * facts recall uses (memory-control.ts), world facts still current, theory of
 * mind patterns established enough to act on, and the latest pondering.
 *
 * Off unless MEMORY_VIEW=on. Pondering also follows MEMORY_VIEW_PONDERING, on
 * unless set off (the kill switch, src/config/flags/MEMORY_VIEW_PONDERING.ts). Only
 * the ponder job writes that doc, so most callers get an empty section, which the
 * web leaves out.
 *
 * The Firestore side lives with the route (api/routes/known-store.ts), so this
 * module reads no store itself.
 *
 * @module intelligence/memory-view/known
 */
import { createHash } from 'node:crypto';
import { flagOn } from '../../config/env-flag.js';
import { isForgotten } from '../../memory/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { TemporalFact } from '../world-model/temporal/types.js';
import type { MindModel, Pattern } from '../theory-of-mind/types.js';
import type { Pondering } from '../pondering/index.js';

const log = createLogger({ module: 'MemoryView' });

type Env = Record<string, string | undefined>;

export function isMemoryViewOn(env: Env = process.env): boolean {
  return env.MEMORY_VIEW === 'on';
}

export function isMemoryViewPonderingOn(env: Env = process.env): boolean {
  return isMemoryViewOn(env) && flagOn('MEMORY_VIEW_PONDERING', env);
}

/** Which store an item lives in, so an action reaches the right one. */
export type KnownKind = 'fact' | 'world' | 'pattern' | 'sensitivity' | 'ponder';

export interface KnownItem {
  /** Unique within its kind; [A-Za-z0-9_-] only, safe in a path. */
  id: string;
  kind: KnownKind;
  /** What Ferni knows, in plain words. */
  text: string;
  /** Who it is about, when it is someone else ("Mindy"). */
  about?: string;
  /** How they relate to the caller ("sister"). */
  relation?: string;
  /** told: the caller said it. noticed: Ferni's own reading. */
  source: 'told' | 'noticed';
  /** The caller's words or Ferni's paraphrase of the moment, when kept. */
  quote?: string;
  /** When it was said or last seen (ISO). */
  at?: string;
  /** YYYY-MM-DD, for dates. */
  day?: string;
  /** A newer fact replaced it; shown as how things were. */
  earlier?: boolean;
  /** The caller corrected this one themselves. */
  fromYou?: boolean;
}

export interface KnownView {
  people: KnownItem[];
  lifeNow: KnownItem[];
  dates: KnownItem[];
  preferences: KnownItem[];
  readsYou: KnownItem[];
  /** Absent when the pondering section is off. */
  thinkingAbout?: KnownItem[];
}

/** The pondering document; dismissed: calls the caller put an item from down (actions.ts). */
export type StoredPondering = Pondering & { generatedAt?: string; dismissed?: string[] };

/** A fact recall uses, as memory/recall/memory-control.ts lists it. */
export interface KnownFact {
  id: string;
  /** Who or what the fact is about; "you" for the caller. */
  subject: string;
  detail: string;
  learnedAt?: string;
  earlier?: boolean;
  fromYou?: boolean;
}

/** The slices of the caller's record the view reads; each only ever for one uid. */
export interface KnownStore {
  facts: (userId: string) => Promise<KnownFact[]>;
  worldFacts: (userId: string) => Promise<TemporalFact[]>;
  mindModel: (userId: string) => Promise<MindModel | null>;
  pondering: (userId: string) => Promise<StoredPondering | null>;
  /** YYYY-MM-DD of the caller's summaries with these ids, for pondering's provenance. */
  summaryDays: (userId: string, ids: string[]) => Promise<Map<string, string>>;
  /** Topics the caller asked Ferni to forget (memory/recall/forget.ts). Throws if unreadable. */
  forgotten: (userId: string) => Promise<string[] | null>;
}

const PREFERENCE =
  /\b(?:like|likes|love|loves|prefer|prefers|favou?rite|enjoy|enjoys|hate|hates)\b/i;
/** Patterns are shown once Ferni would act on them (theory-of-mind/update.ts). */
const ESTABLISHED_MOMENTS = 2;
const DAY_MS = 86_400_000;
/** Dates more than this far past are history, not dates that matter now. */
const DATES_LOOKBACK_DAYS = 14;

export const hashId = (text: string): string =>
  createHash('sha1').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);

const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

function fromFact(f: KnownFact): KnownItem {
  return {
    id: f.id,
    kind: 'fact',
    text: f.detail,
    ...(f.subject !== 'you' && { about: f.subject }),
    source: 'told',
    ...(f.learnedAt && { at: f.learnedAt }),
    ...(f.earlier && { earlier: true }),
    ...(f.fromYou && { fromYou: true }),
  };
}

function fromWorld(f: TemporalFact, kept: Kept): KnownItem {
  const attribute = f.attribute.replace(/_/g, ' ');
  return {
    id: f.id,
    kind: 'world',
    text: attribute && attribute !== 'status' ? `${attribute}: ${f.value}` : f.value,
    ...(f.subjectKind === 'person' && { about: f.subject }),
    ...(f.relation && { relation: f.relation }),
    source: 'told',
    // The quote is shown words too: it goes when it names a forgotten topic.
    ...(f.source?.quote && kept(f.source.quote) && { quote: f.source.quote }),
    at: f.observedAt,
    ...(f.eventDate && { day: f.eventDate }),
  };
}

function fromPattern(p: Pattern, kept: Kept): KnownItem {
  const latest = p.moments[p.moments.length - 1];
  return {
    id: p.key,
    kind: 'pattern',
    text: p.statement,
    source: 'noticed',
    ...(latest?.cue && kept(latest.cue) && { quote: latest.cue }),
    at: p.lastSeen,
  };
}

function fromPonder(i: { text: string; basis: string; when?: string }, said?: string): KnownItem {
  return {
    id: hashId(i.text),
    kind: 'ponder',
    text: i.text,
    source: 'noticed',
    ...(said !== undefined && { at: `${said}T12:00:00.000Z` }),
    ...(i.when !== undefined && { day: i.when }),
  };
}

/** Facts and world facts: about someone else, a liking, or the caller's life now. */
function fileLife(view: KnownView, item: KnownItem): void {
  if (item.about !== undefined) view.people.push(item);
  else if (item.kind === 'fact' && PREFERENCE.test(item.text)) view.preferences.push(item);
  else view.lifeNow.push(item);
}

export interface KnownParts {
  facts: KnownFact[];
  world: TemporalFact[];
  mind: MindModel | null;
  pondering: StoredPondering | null;
  summaryDays: Map<string, string>;
  /** Forgotten topics: matched exactly as the recall readers match them (isForgotten). */
  forgotten: readonly string[];
}

type Kept = (text: string) => boolean;

/** Established patterns (noticed) and sensitivities (told), less anything forgotten. */
function readings(mind: MindModel | null, kept: Kept): KnownItem[] {
  const established = (mind?.patterns ?? []).filter(
    (p) =>
      p.moments.length >= ESTABLISHED_MOMENTS &&
      p.confidence > 0 &&
      SAFE_ID.test(p.key) &&
      kept(p.statement)
  );
  const sensitivities = (mind?.sensitivities ?? []).filter((x) => kept(`${x.topic} ${x.how}`));
  return [
    ...established.map((p) => fromPattern(p, kept)),
    ...sensitivities.map((s): KnownItem => ({
      id: hashId(s.topic),
      kind: 'sensitivity',
      text: `${s.topic}: ${s.how}`,
      source: 'told',
      at: s.at,
    })),
  ];
}

/** The latest pondering, less dismissed calls and forgotten topics (as ponder-user.ts drops them). */
function thoughts(parts: KnownParts, kept: Kept): KnownItem[] {
  const p = parts.pondering;
  const dismissed = new Set(p?.dismissed ?? []);
  return [...(p?.followUps ?? []), ...(p?.thinkingOf ?? [])]
    .filter((i) => !dismissed.has(i.basis) && kept(i.text))
    .map((i) => fromPonder(i, parts.summaryDays.get(i.basis)));
}

/** Group what is stored into the view's sections. Pure: the caller passes the time. */
export function buildKnownView(parts: KnownParts, now: Date, withPondering: boolean): KnownView {
  const view: KnownView = { people: [], lifeNow: [], dates: [], preferences: [], readsYou: [] };
  // What recall would leave out is not shown either: the same matcher, on the same words
  // each reader matches (session-recall.ts, world ingest, ponder-user.ts).
  const kept = (text: string): boolean => !isForgotten(text, parts.forgotten);
  for (const f of parts.facts.filter((x) => kept(`${x.subject} ${x.detail}`))) {
    fileLife(view, fromFact(f));
  }
  const earliest = new Date(now.getTime() - DATES_LOOKBACK_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const current = parts.world.filter(
    (f) =>
      f.validTo === null && SAFE_ID.test(f.id) && kept(`${f.subject} ${f.attribute} ${f.value}`)
  );
  for (const w of current) {
    const item = fromWorld(w, kept);
    if (item.day === undefined) fileLife(view, item);
    else if (item.day >= earliest) view.dates.push(item);
  }
  view.dates.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''));
  view.readsYou.push(...readings(parts.mind, kept));
  if (withPondering) view.thinkingAbout = thoughts(parts, kept);
  return view;
}

/** A source that can't be read leaves its section empty, and says so in the log. */
function unread<T>(source: string, empty: T): (error: unknown) => T {
  return (error) => {
    log.warn({ source, error: String(error) }, 'Memory view source not read');
    return empty;
  };
}

/**
 * What the caller asked Ferni to forget couldn't be read (a throw, or the
 * forget store's null): the view is refused (503), never shown unfiltered.
 */
export class ForgottenTopicsUnreadable extends Error {
  constructor(cause?: unknown) {
    super('Forgotten topics unreadable', { cause });
    this.name = 'ForgottenTopicsUnreadable';
  }
}

/** The topics, or ForgottenTopicsUnreadable; never [] standing in for a failed read. */
async function readForgotten(store: KnownStore, userId: string): Promise<string[]> {
  const topics = await store.forgotten(userId).catch((error: unknown) => {
    throw new ForgottenTopicsUnreadable(error);
  });
  if (!Array.isArray(topics) || !topics.every((t) => typeof t === 'string')) {
    throw new ForgottenTopicsUnreadable();
  }
  return topics;
}

/**
 * The caller's view. The forgotten topics must be read or nothing is shown;
 * otherwise each source is read independently, one failing leaving its section empty.
 */
export async function loadKnownView(
  userId: string,
  store: KnownStore,
  { now = new Date(), env = process.env }: { now?: Date; env?: Env } = {}
): Promise<KnownView> {
  const withPondering = isMemoryViewPonderingOn(env);
  // Read first and alone: if it fails, nothing else is read or returned.
  const forgotten = await readForgotten(store, userId);
  const [facts, world, mind, pondering] = await Promise.all([
    store.facts(userId),
    store.worldFacts(userId).catch(unread('world facts', [])),
    store.mindModel(userId).catch(unread('mind model', null)),
    withPondering
      ? store.pondering(userId).catch(unread('pondering', null))
      : Promise.resolve(null),
  ]);
  const bases = [...(pondering?.followUps ?? []), ...(pondering?.thinkingOf ?? [])].map(
    (i) => i.basis
  );
  const summaryDays = bases.length
    ? await store
        .summaryDays(userId, [...new Set(bases)])
        .catch(unread('summary days', new Map<string, string>()))
    : new Map<string, string>();
  const parts = { facts, world, mind, pondering, summaryDays, forgotten };
  return buildKnownView(parts, now, withPondering);
}
