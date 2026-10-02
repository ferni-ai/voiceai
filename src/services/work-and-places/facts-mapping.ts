/**
 * Read-only use of extraction's output: facts about the user (dynamic_facts,
 * entityName "user") with work/place keys, and place entities
 * (dynamic_entities type "place").
 *
 * Extraction keeps one fact per (subject, key), so when a job changes the
 * fact's value is replaced. Mapping each new value here into the work store
 * is what keeps the history: the old job becomes `past` instead of vanishing.
 *
 * Pure: no I/O.
 *
 * @module services/work-and-places/facts-mapping
 */

import { cleanText } from './rules.js';
import { dateFromPhrase } from './text-patterns.js';
import type { LifeInput, PlaceCategory } from './types.js';

export interface FactLike {
  readonly id: string;
  readonly text?: string;
  readonly category?: string;
  readonly entityName?: string;
  readonly key?: string;
  readonly value?: string;
  readonly confidence?: number;
  readonly temporalContext?: string;
}

export interface PlaceEntityLike {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

const SELF_SUBJECT = /^(the\s+)?(user|speaker|me|myself|i|caller|self)$/i;

/** Keys extraction is asked to use (see memory/dynamic/extraction-prompts.ts). */
export const WORK_FACT_KEYS: ReadonlySet<string> = new Set([
  'employer',
  'works_at',
  'company',
  'workplace',
  'job',
  'job_title',
  'title',
  'occupation',
  'profession',
  'role',
  'position',
  'team',
  'department',
  'previous_employer',
  'former_employer',
  'used_to_work_at',
]);

export const PLACE_FACT_KEYS: ReadonlySet<string> = new Set([
  'lives_in',
  'location',
  'city',
  'home',
  'home_city',
  'neighborhood',
  'neighbourhood',
  'residence',
  'hometown',
  'grew_up_in',
  'born_in',
  'moved_to',
  'lived_in',
  'previous_city',
  'trip_planned',
  'upcoming_trip',
  'traveling_to',
  'travelling_to',
  'trip_taken',
  'visited',
  'recent_trip',
  'favorite_place',
  'favorite_restaurant',
  'favorite_cafe',
  'favorite_bar',
  'favorite_park',
  'favorite_city',
  'bucket_list',
  'bucket_list_place',
  'dream_destination',
  'engaged_in',
  'married_in',
  'met_in',
]);

function value(f: FactLike): string {
  return cleanText(f.value ?? '', 80).replace(/[.!]+$/, '');
}

function base(f: FactLike, conversationId?: string) {
  return {
    source: 'inferred' as const,
    confidence: Math.min(0.85, (f.confidence ?? 0.6) * 0.95),
    factId: f.id,
    ...(conversationId ? { conversationId } : {}),
  };
}

export interface FactMapping {
  readonly inputs: LifeInput[];
  readonly currentJobPatch?: { role?: string; team?: string; factId?: string };
}

/** Facts about the user with work/place keys → inputs. */
export function inputsFromFacts(
  facts: readonly FactLike[],
  conversationId?: string,
  now: Date = new Date()
): FactMapping {
  const inputs: LifeInput[] = [];
  let patch: { role?: string; team?: string; factId?: string } | undefined;
  for (const f of facts) {
    if (!f.entityName || !SELF_SUBJECT.test(f.entityName.trim())) continue;
    const key = (f.key ?? '').toLowerCase();
    const v = value(f);
    if (!v || v.split(' ').length > 8) continue;
    const b = base(f, conversationId);
    if (WORK_FACT_KEYS.has(key)) {
      if (['employer', 'works_at', 'company', 'workplace'].includes(key)) {
        inputs.push({
          area: 'work',
          kind: 'job',
          subject: v,
          employer: v,
          status: 'current',
          ...b,
        });
      } else if (['previous_employer', 'former_employer', 'used_to_work_at'].includes(key)) {
        inputs.push({ area: 'work', kind: 'job', subject: v, employer: v, status: 'past', ...b });
      } else if (key === 'team' || key === 'department') {
        patch = { ...patch, team: v, factId: f.id };
      } else {
        patch = { ...patch, role: v.replace(/^(a|an)\s+/i, ''), factId: f.id };
      }
      continue;
    }
    if (!PLACE_FACT_KEYS.has(key)) continue;
    const when = f.temporalContext ?? '';
    if (
      [
        'lives_in',
        'location',
        'city',
        'home',
        'home_city',
        'neighborhood',
        'neighbourhood',
        'residence',
        'moved_to',
      ].includes(key)
    ) {
      inputs.push({ area: 'places', kind: 'home', subject: v, place: v, status: 'current', ...b });
    } else if (['hometown', 'grew_up_in', 'born_in', 'lived_in', 'previous_city'].includes(key)) {
      const notes =
        key === 'hometown' || key === 'born_in'
          ? 'Hometown'
          : key === 'grew_up_in'
            ? 'Grew up there'
            : undefined;
      inputs.push({
        area: 'places',
        kind: 'home',
        subject: v,
        place: v,
        status: 'past',
        notes,
        ...b,
      });
    } else if (['trip_planned', 'upcoming_trip', 'traveling_to', 'travelling_to'].includes(key)) {
      inputs.push({
        area: 'places',
        kind: 'trip',
        subject: v,
        place: v,
        status: 'planned',
        startDate: dateFromPhrase(when, now, 'future'),
        ...b,
      });
    } else if (['trip_taken', 'visited', 'recent_trip'].includes(key)) {
      inputs.push({
        area: 'places',
        kind: 'trip',
        subject: v,
        place: v,
        status: 'done',
        startDate: dateFromPhrase(when, now, 'past'),
        ...b,
      });
    } else if (key.startsWith('favorite_')) {
      const category = (key.slice('favorite_'.length) || 'other') as PlaceCategory;
      const known: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'park', 'city'];
      inputs.push({
        area: 'places',
        kind: 'favorite',
        subject: v,
        place: v,
        status: 'current',
        category: known.includes(category) ? category : 'other',
        ...b,
      });
    } else if (['bucket_list', 'bucket_list_place', 'dream_destination'].includes(key)) {
      inputs.push({
        area: 'places',
        kind: 'bucket_list',
        subject: v,
        place: v,
        status: 'planned',
        ...b,
      });
    } else {
      const meaning =
        key === 'engaged_in'
          ? 'Where you got engaged'
          : key === 'married_in'
            ? 'Where you got married'
            : 'Where you met';
      inputs.push({
        area: 'places',
        kind: 'meaningful',
        subject: v,
        place: v,
        meaning,
        status: 'past',
        ...b,
      });
    }
  }
  return { inputs, ...(patch ? { currentJobPatch: patch } : {}) };
}

/** Place entities whose attributes say how the user relates to them → inputs. */
export function inputsFromPlaceEntities(
  entities: readonly PlaceEntityLike[],
  conversationId?: string
): LifeInput[] {
  const out: LifeInput[] = [];
  for (const e of entities) {
    if ((e.type ?? '').toLowerCase() !== 'place') continue;
    const name = cleanText(e.name, 80);
    if (name.length < 2) continue;
    const attrs = Object.entries(e.attributes ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join(' ')
      .toLowerCase();
    const common = {
      area: 'places' as const,
      subject: name,
      place: name,
      entityId: e.id,
      source: 'inferred' as const,
      confidence: 0.55,
      ...(conversationId ? { conversationId } : {}),
    };
    if (
      /\b(lives?|living|home|resides?|based)\b/.test(attrs) &&
      !/\b(used to|former|past|previous)\b/.test(attrs)
    ) {
      out.push({ ...common, kind: 'home', status: 'current' });
    } else if (/\b(hometown|grew up|born|used to live|lived)\b/.test(attrs)) {
      out.push({ ...common, kind: 'home', status: 'past' });
    } else if (/\bfavou?rite\b/.test(attrs)) {
      out.push({ ...common, kind: 'favorite', status: 'current' });
    } else if (/\b(bucket list|dream|someday)\b/.test(attrs)) {
      out.push({ ...common, kind: 'bucket_list', status: 'planned' });
    } else if (
      /\b(upcoming|planned|going|will visit)\b/.test(attrs) &&
      /\b(trip|travel|visit|vacation)\b/.test(attrs)
    ) {
      out.push({ ...common, kind: 'trip', status: 'planned' });
    } else if (/\b(visited|trip|vacation|traveled|travelled)\b/.test(attrs)) {
      out.push({ ...common, kind: 'trip', status: 'done' });
    }
  }
  return out;
}
