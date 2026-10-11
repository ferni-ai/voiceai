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
 * Off unless MEMORY_VIEW=on; pondering also needs MEMORY_VIEW_PONDERING=on,
 * since it is the private side of a feature still being tuned.
 *
 * @module intelligence/memory-view/known
 */
import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { listRemembered, type RememberedFact } from '../../memory/recall/memory-control.js';
import { MAX_OPEN_FACTS } from '../world-model/temporal/store.js';
import type { TemporalFact } from '../world-model/temporal/types.js';
import type { MindModel, Pattern } from '../theory-of-mind/types.js';
import type { Pondering } from '../pondering/pondering.js';

type Env = Record<string, string | undefined>;

export function isMemoryViewOn(env: Env = process.env): boolean {
  return env.MEMORY_VIEW === 'on';
}

export function isMemoryViewPonderingOn(env: Env = process.env): boolean {
  return isMemoryViewOn(env) && env.MEMORY_VIEW_PONDERING === 'on';
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

export type StoredPondering = Pondering & { generatedAt?: string };

/** The slices of the caller's record the view reads; each only ever for one uid. */
export interface KnownStore {
  facts: (userId: string) => Promise<RememberedFact[]>;
  worldFacts: (userId: string) => Promise<TemporalFact[]>;
  mindModel: (userId: string) => Promise<MindModel | null>;
  pondering: (userId: string) => Promise<StoredPondering | null>;
  /** YYYY-MM-DD of the caller's summaries with these ids, for pondering's provenance. */
  summaryDays: (userId: string, ids: string[]) => Promise<Map<string, string>>;
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

function fromFact(f: RememberedFact): KnownItem {
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

function fromWorld(f: TemporalFact): KnownItem {
  const attribute = f.attribute.replace(/_/g, ' ');
  return {
    id: f.id,
    kind: 'world',
    text: attribute && attribute !== 'status' ? `${attribute}: ${f.value}` : f.value,
    ...(f.subjectKind === 'person' && { about: f.subject }),
    ...(f.relation && { relation: f.relation }),
    source: 'told',
    ...(f.source?.quote && { quote: f.source.quote }),
    at: f.observedAt,
    ...(f.eventDate && { day: f.eventDate }),
  };
}

function fromPattern(p: Pattern): KnownItem {
  const latest = p.moments[p.moments.length - 1];
  return {
    id: p.key,
    kind: 'pattern',
    text: p.statement,
    source: 'noticed',
    ...(latest?.cue && { quote: latest.cue }),
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
  facts: RememberedFact[];
  world: TemporalFact[];
  mind: MindModel | null;
  pondering: StoredPondering | null;
  summaryDays: Map<string, string>;
}

/** Group what is stored into the view's sections. Pure: the caller passes the time. */
export function buildKnownView(parts: KnownParts, now: Date, withPondering: boolean): KnownView {
  const view: KnownView = { people: [], lifeNow: [], dates: [], preferences: [], readsYou: [] };
  for (const f of parts.facts) fileLife(view, fromFact(f));
  const earliest = new Date(now.getTime() - DATES_LOOKBACK_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  for (const w of parts.world.filter((f) => f.validTo === null && SAFE_ID.test(f.id))) {
    const item = fromWorld(w);
    if (item.day === undefined) fileLife(view, item);
    else if (item.day >= earliest) view.dates.push(item);
  }
  view.dates.sort((a, b) => (a.day ?? '').localeCompare(b.day ?? ''));
  const established = (parts.mind?.patterns ?? []).filter(
    (p) => p.moments.length >= ESTABLISHED_MOMENTS && p.confidence > 0 && SAFE_ID.test(p.key)
  );
  view.readsYou.push(...established.map(fromPattern));
  for (const s of parts.mind?.sensitivities ?? []) {
    const text = `${s.topic}: ${s.how}`;
    view.readsYou.push({
      id: hashId(s.topic),
      kind: 'sensitivity',
      text,
      source: 'told',
      at: s.at,
    });
  }
  if (withPondering) {
    const p = parts.pondering;
    const items = [...(p?.followUps ?? []), ...(p?.thinkingOf ?? [])];
    view.thinkingAbout = items.map((i) => fromPonder(i, parts.summaryDays.get(i.basis)));
  }
  return view;
}

/** The caller's view. Each source is read independently; one failing leaves its section empty. */
export async function loadKnownView(
  userId: string,
  store: KnownStore = firestoreKnownStore,
  { now = new Date(), env = process.env }: { now?: Date; env?: Env } = {}
): Promise<KnownView> {
  const withPondering = isMemoryViewPonderingOn(env);
  const [facts, world, mind, pondering] = await Promise.all([
    store.facts(userId),
    store.worldFacts(userId).catch(() => []),
    store.mindModel(userId).catch(() => null),
    withPondering ? store.pondering(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const bases = [...(pondering?.followUps ?? []), ...(pondering?.thinkingOf ?? [])].map(
    (i) => i.basis
  );
  const summaryDays = bases.length
    ? await store.summaryDays(userId, [...new Set(bases)]).catch(() => new Map<string, string>())
    : new Map<string, string>();
  return buildKnownView({ facts, world, mind, pondering, summaryDays }, now, withPondering);
}

function asMindModel(data: unknown): MindModel | null {
  const d = data as Partial<MindModel> | undefined;
  if (!d || d.version !== 1 || !Array.isArray(d.patterns) || !Array.isArray(d.sensitivities)) {
    return null;
  }
  return d as MindModel;
}

function dayOf(ts: unknown): string | undefined {
  if (typeof ts === 'string' && !Number.isNaN(Date.parse(ts))) {
    return new Date(ts).toISOString().slice(0, 10);
  }
  const toDate = (ts as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(ts).toISOString().slice(0, 10) : undefined;
}

export function createFirestoreKnownStore(
  getDb: () => Firestore | null = getFirestoreDb
): KnownStore {
  const user = (userId: string): FirebaseFirestore.DocumentReference | null =>
    getDb()?.collection('bogle_users').doc(userId) ?? null;
  return {
    facts: async (userId) => listRemembered(userId),
    async worldFacts(userId) {
      const snap = await user(userId)
        ?.collection('world_facts')
        .where('validTo', '==', null)
        .limit(MAX_OPEN_FACTS)
        .get();
      return snap ? snap.docs.map((d) => ({ ...(d.data() as TemporalFact), id: d.id })) : [];
    },
    async mindModel(userId) {
      const doc = await user(userId)?.collection('mind_model').doc('current').get();
      return doc?.exists ? asMindModel(doc.data()) : null;
    },
    async pondering(userId) {
      const doc = await user(userId)?.collection('predictive_intelligence').doc('pondering').get();
      return doc?.exists ? ((doc.data() as StoredPondering | undefined) ?? null) : null;
    },
    async summaryDays(userId, ids) {
      const root = user(userId);
      const db = getDb();
      const days = new Map<string, string>();
      if (!root || !db) return days;
      const docs = await db.getAll(...ids.map((id) => root.collection('summaries').doc(id)));
      for (const d of docs) {
        const day = d.exists ? dayOf(d.get('timestamp')) : undefined;
        if (day) days.set(d.id, day);
      }
      return days;
    },
  };
}

export const firestoreKnownStore: KnownStore = createFirestoreKnownStore();
