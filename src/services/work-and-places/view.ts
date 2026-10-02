/**
 * API views for the memory page: items with their status as of today, people
 * linked to the people model (personal insights) instead of duplicated, and
 * colleagues taken from that model.
 *
 * @module services/work-and-places/view
 */

import { findPerson, getPeople, type PersonProfile } from '../personal-insights/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { effectiveStatus } from './rules.js';
import { listLifeItems } from './store.js';
import type { LifeArea, LifeItem, LifeStatus } from './types.js';

const log = createLogger({ module: 'WorkAndPlacesView' });

export interface LinkedPerson {
  readonly name: string;
  readonly personId?: string;
}

export type LifeItemView = Omit<LifeItem, 'withPeople' | 'status'> & {
  readonly status: LifeStatus;
  readonly withPeople?: readonly LinkedPerson[];
};

export interface Colleague {
  readonly id: string;
  readonly name: string;
  readonly relationship?: string;
}

export interface WorkView {
  readonly items: LifeItemView[];
  readonly colleagues: Colleague[];
  readonly updatedAt: string | null;
}

export interface PlacesView {
  readonly items: LifeItemView[];
  readonly updatedAt: string | null;
}

async function people(userId: string): Promise<PersonProfile[]> {
  try {
    return await getPeople(userId);
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'People model unavailable');
    return [];
  }
}

/** Pure: today's status and people links. */
export function toView(
  item: LifeItem,
  known: readonly PersonProfile[],
  today: string
): LifeItemView {
  const { withPeople: names, ...rest } = item;
  const withPeople = names?.map((name): LinkedPerson => {
    const person = findPerson(known, name);
    return person ? { name, personId: person.id } : { name };
  });
  return { ...rest, status: effectiveStatus(item, today), ...(withPeople ? { withPeople } : {}) };
}

function newest(items: readonly LifeItem[]): string | null {
  return items.reduce<string | null>(
    (max, i) => (!max || i.updatedAt > max ? i.updatedAt : max),
    null
  );
}

export async function getWorkView(userId: string): Promise<WorkView> {
  const [items, known] = await Promise.all([listLifeItems(userId, 'work'), people(userId)]);
  const today = new Date().toISOString().slice(0, 10);
  const colleagues = known
    .filter((p) => p.kind === 'person' && p.group === 'work')
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.relationship ? { relationship: p.relationship.replace(/_/g, ' ') } : {}),
    }));
  return {
    items: items.map((i) => toView(i, known, today)),
    colleagues,
    updatedAt: newest(items),
  };
}

export async function getPlacesView(userId: string): Promise<PlacesView> {
  const [items, known] = await Promise.all([listLifeItems(userId, 'places'), people(userId)]);
  const today = new Date().toISOString().slice(0, 10);
  return { items: items.map((i) => toView(i, known, today)), updatedAt: newest(items) };
}

export function getLifeAreaView(userId: string, area: LifeArea): Promise<WorkView | PlacesView> {
  return area === 'work' ? getWorkView(userId) : getPlacesView(userId);
}
