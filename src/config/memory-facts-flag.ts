/**
 * MEMORY_FACTS: bi-temporal facts about people (bogle_users/{uid}/facts), written by
 * memory/writer/memory-writer.ts. Off by default: nothing writes or reads while off.
 *
 * @module config/memory-facts-flag
 */
import { flagOn, type Env } from './env-flag.js';

export function memoryFactsEnabled(env: Env = process.env): boolean {
  return flagOn('MEMORY_FACTS', env);
}
