/**
 * Voice records for the roster (docs/plans/2026-11-12-one-roster.md, 3.3).
 *
 * A consented clone is a voice cloned from a real person who has died, which
 * only the one listing its record names may speak in, and only because the
 * person's estate gave written consent. The record says who the consent is for,
 * what it covers and when it was attested. It never holds the consent document
 * or anything about who signed it: those stay with the owner, off the repo.
 *
 * Stock and designed voices still live in config/voice-ids.ts until the roster
 * absorbs that list.
 *
 * @module personas/roster/domain/voice-record
 */

/** What a consent may cover: the person's name, their voice, and new words spoken as them. */
export type ConsentScope = 'name' | 'voice' | 'new-words';

/** Everything a legend speaking as the real person needs. */
export const FULL_LEGEND_CONSENT: readonly ConsentScope[] = ['name', 'voice', 'new-words'];

/** Written consent from a person's estate, held by the owner. */
export interface EstateConsent {
  /** The person, as the public record names them. */
  readonly person: string;
  readonly basis: 'estate';
  /** Who holds the written consent. The document itself never enters the repo. */
  readonly heldBy: 'owner';
  /** The date (YYYY-MM-DD) the owner attested that the written consent is on file. */
  readonly attested: string;
  readonly covers: readonly ConsentScope[];
}

/** A clone of a real person's voice that only `listingId` may speak in. */
export interface ConsentedCloneRecord {
  readonly kind: 'consented-clone';
  /** The one roster listing (persona id) this voice may be attached to. */
  readonly listingId: string;
  /**
   * The setting that holds the clone's voice id. The id is never in code: unset
   * means the legend is not admitted.
   */
  readonly voiceSetting: string;
  /**
   * Withheld clones (RETIRED_CLONE_VOICE_IDS) of this same person, which this
   * listing alone may use once admitted. Every other listing stays blocked.
   */
  readonly reservedCloneIds: readonly string[];
  readonly consent: EstateConsent;
}
