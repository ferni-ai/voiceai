/**
 * Everyone the user has marked in memory, from both contact stores.
 *
 * Kept apart from in-memory.ts because it reads the people list, which itself
 * depends on the contact service that in-memory.ts sits under.
 *
 * @module services/contacts/in-memory-people
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContactRelationship } from './contact-relationship-service.js';
import { inMemoryOn, isInMemory } from './in-memory.js';
import { listPeople } from './people-list.js';

const log = createLogger({ module: 'contacts:in-memory-people' });

/** The people this user has marked in memory; empty when CONTACT_IN_MEMORY is off */
export async function listInMemoryPeople(userId: string): Promise<ContactRelationship[]> {
  if (!inMemoryOn()) return [];
  try {
    return (await listPeople(userId)).filter(isInMemory);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Could not read who the user has lost');
    return [];
  }
}
