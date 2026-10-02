/**
 * Enrich the memory page's people (dynamic_entities, deletable by id) with
 * what personal insights learned about them: pet or person, a short profile,
 * and whether they have passed away. Matched by name; profiles never replace
 * the entity ids the delete endpoint needs.
 *
 * @module services/memory-control/people-profiles
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Person } from './types.js';

const log = createLogger({ module: 'memory-control-people' });

const key = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

export async function enrichPeople(userId: string, people: Person[]): Promise<Person[]> {
  if (people.length === 0) return people;
  try {
    const { getPeopleForApi } = await import('../personal-insights/index.js');
    const profiles = new Map((await getPeopleForApi(userId)).map((p) => [key(p.name), p]));
    return people.map((person) => {
      const profile = profiles.get(key(person.name));
      if (!profile) return person;
      return {
        ...person,
        kind: profile.kind,
        ...(profile.memorial ? { memorial: true } : {}),
        relationship: person.relationship ?? profile.relationship,
        notes: profile.notes ?? person.notes,
      };
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not load people profiles');
    return people;
  }
}
