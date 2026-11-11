/**
 * What the in-call call sheet reads, as functions: the production ones are composed in
 * wiring.ts, tests hand in fakes. Any async one may be slow or throw; index.ts bounds the
 * whole load and treats a throw as no sheet.
 *
 * @module agents/multi-agent/call-sheet/ports
 */
import type { ForgottenState } from '../../../memory/ports/forgotten-store.js';
import type { StoredPersonModel } from '../../../services/stores/person-model-store.js';

export interface CallSheetPorts {
  /** person_model/current, or null when there is none or it isn't this build's shape. */
  sheet: (userId: string) => Promise<StoredPersonModel | null>;
  /** Forgotten topics (stored plus this process's) and the stored forget generation. */
  forgotten: (userId: string) => Promise<ForgottenState>;
  /** The account's MINOR_CARE hold, strict: unreadable or late means held. */
  minorCare: (userId: string) => Promise<boolean>;
  /** A crisis-level signal in the last CRISIS_QUIET_DAYS; unreadable counts as one. */
  recentCrisis: (userId: string) => Promise<boolean>;
  /** Now, synchronously: crisis risk on this call (reads in flight count) or its MINOR_CARE hold. */
  heldNow: (sessionId: string) => boolean;
  /** The highest forget generation this process has read or written for the caller. */
  generationSeen: (userId: string) => number;
}
