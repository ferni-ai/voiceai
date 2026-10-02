/**
 * Read-only use of extraction's output: facts about the user
 * (`dynamic_facts`, entityName "user") with life story, value and belief keys
 * (see memory/dynamic/extraction-prompts.ts). Pure: no I/O.
 *
 * @module services/life-story/facts-mapping
 */

import { sensitiveCategoriesOf } from '../memory-consent/classifier.js';
import { peopleIn } from './detect.js';
import { cleanText, isValidStoryDate } from './rules.js';
import type { BeliefKind, BeliefInput, StoryInput, StoryKind, ValueInput } from './types.js';

export interface FactLike {
  readonly id: string;
  readonly text?: string;
  readonly category?: string;
  readonly entityName?: string;
  readonly key?: string;
  readonly value?: string;
  readonly factType?: string;
  readonly confidence?: number;
  readonly temporalContext?: string;
}

const SELF_SUBJECT = /^(the\s+)?(user|speaker|me|myself|i|caller|self)$/i;

export const STORY_FACT_KEYS: Readonly<Record<string, StoryKind>> = {
  family_of_origin: 'family',
  grew_up_with: 'family',
  siblings: 'family',
  school: 'school',
  college: 'school',
  university: 'school',
  studied: 'school',
  childhood_memory: 'story',
  told_story: 'story',
  story: 'story',
  formative_moment: 'moment',
  turning_point: 'turning_point',
  life_chapter: 'chapter',
  life_theme: 'theme',
  decision_style: 'decision',
};

/** Origin keys are also places (work & places keeps the place; we keep the story). */
export const ORIGIN_FACT_KEYS: ReadonlySet<string> = new Set(['grew_up_in', 'hometown', 'born_in']);

export const VALUE_FACT_KEYS: ReadonlySet<string> = new Set([
  'core_value',
  'value',
  'values',
  'what_matters',
]);

export const BELIEF_FACT_KEYS: Readonly<Record<string, BeliefKind>> = {
  religion: 'faith',
  faith: 'faith',
  spiritual_practice: 'practice',
  religious_practice: 'practice',
  belief: 'belief',
  philosophy: 'belief',
  faith_questioning: 'questioning',
};

export interface FactInputs {
  readonly stories: StoryInput[];
  readonly values: ValueInput[];
  readonly beliefs: BeliefInput[];
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function periodFrom(temporal: string | undefined): { period?: string; date?: string } {
  const t = cleanText(temporal, 40);
  if (!t) return {};
  if (isValidStoryDate(t)) return { date: t };
  return { period: t };
}

/** Facts about the user with story/value/belief keys → store inputs. */
export function inputsFromFacts(facts: readonly FactLike[], conversationId?: string): FactInputs {
  const stories: StoryInput[] = [];
  const values: ValueInput[] = [];
  const beliefs: BeliefInput[] = [];
  for (const f of facts) {
    if (!f.entityName || !SELF_SUBJECT.test(f.entityName.trim())) continue;
    const key = (f.key ?? '').toLowerCase();
    const value = cleanText(f.value ?? '', 200).replace(/[.!]+$/, '');
    if (!value) continue;
    const base = {
      source: 'inferred' as const,
      confidence: Math.min(0.85, (f.confidence ?? 0.6) * 0.95),
      factId: f.id,
      ...(conversationId ? { conversationId } : {}),
    };
    const labelledBelief =
      ['belief', 'beliefs', 'faith'].includes((f.factType ?? f.category ?? '').toLowerCase()) ||
      key in BELIEF_FACT_KEYS;
    if (
      labelledBelief ||
      (VALUE_FACT_KEYS.has(key) && sensitiveCategoriesOf(value).includes('beliefs'))
    ) {
      beliefs.push({
        area: 'beliefs',
        kind: BELIEF_FACT_KEYS[key] ?? 'faith',
        title: cap(value),
        ...base,
      });
    } else if (VALUE_FACT_KEYS.has(key)) {
      if (value.split(' ').length <= 6)
        values.push({ label: value.toLowerCase(), statement: f.text ?? value, ...base });
    } else if (ORIGIN_FACT_KEYS.has(key)) {
      if (value.split(' ').length <= 6) {
        stories.push({
          area: 'story',
          kind: 'origin',
          title: `${key === 'born_in' ? 'Born' : 'Grew up'} in ${value}`,
          place: value,
          period: 'childhood',
          ...base,
        });
      }
    } else if (STORY_FACT_KEYS[key]) {
      stories.push({
        area: 'story',
        kind: STORY_FACT_KEYS[key],
        title: cap(value),
        people: peopleIn(value),
        ...periodFrom(f.temporalContext),
        ...base,
      });
    }
  }
  return { stories, values, beliefs };
}
