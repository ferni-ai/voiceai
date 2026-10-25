/**
 * ERRANDS: Ferni runs errands for its owner (book a cleaning, find a table) as
 * durable workflows (services/errands). Off by default; nothing reads the
 * errand store or runs a step while it is off. Seth first, then the cohort.
 *
 * @module config/errands-flag
 */
import { flagOn, type Env } from './env-flag.js';

export function errandsEnabled(env: Env = process.env): boolean {
  return flagOn('ERRANDS', env);
}
