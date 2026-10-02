/**
 * Counters for identity resolution and merging, readable by observability
 * endpoints and tests.
 *
 * @module services/identity/identity-metrics
 */

export interface IdentityMetrics {
  /** Sessions with no stable identity (no durable memory written). */
  ephemeralSessions: number;
  /** Sessions whose identity resolved through a merge redirect. */
  redirectsFollowed: number;
  mergesStarted: number;
  mergesCompleted: number;
  /** Merges that stopped before finishing (they resume on the next trigger). */
  mergesIncomplete: number;
  mergesFailed: number;
  /** Link requests refused (missing proof, already claimed, ...). */
  linksRefused: number;
}

const counters: IdentityMetrics = {
  ephemeralSessions: 0,
  redirectsFollowed: 0,
  mergesStarted: 0,
  mergesCompleted: 0,
  mergesIncomplete: 0,
  mergesFailed: 0,
  linksRefused: 0,
};

export function recordIdentityEvent(name: keyof IdentityMetrics): void {
  counters[name]++;
}

export function getIdentityMetrics(): Readonly<IdentityMetrics> {
  return { ...counters };
}

export function resetIdentityMetrics(): void {
  for (const key of Object.keys(counters) as Array<keyof IdentityMetrics>) counters[key] = 0;
}
