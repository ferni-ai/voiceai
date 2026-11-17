/**
 * Where the dev flag switchboard keeps its state: the flag values the dev agent last booted
 * with, and an audit trail of apply requests. adapters/flag-store.ts implements it on
 * Firestore (dev's database only).
 *
 * @module config/agent-flags/ports/flag-store
 */
import type { FlagSnapshot } from '../domain/snapshot.js';

/** One apply request: who asked, what for, and what came of it. */
export interface FlagChange {
  at: string;
  actor: string;
  set: Record<string, string>;
  reset: string[];
  result: 'applied' | 'refused' | 'failed';
  detail?: string;
}

export interface FlagStore {
  writeSnapshot: (s: FlagSnapshot) => Promise<void>;
  readSnapshot: () => Promise<FlagSnapshot | null>;
  appendChange: (c: FlagChange) => Promise<void>;
  recentChanges: (limit: number) => Promise<FlagChange[]>;
}
