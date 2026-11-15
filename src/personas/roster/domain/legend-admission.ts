/**
 * Whether a legend may speak as the real person it is: the admission check for
 * a consented-clone listing (docs/plans/2026-11-12-one-roster.md, 3.4 item 4).
 *
 * Pure: the caller passes the flag, the record, the configured voice id and the
 * withheld clone ids. Every check that fails names its reason, so a refused
 * legend says why in a log line instead of silently falling back.
 *
 * @module personas/roster/domain/legend-admission
 */

import { isValidVoiceId } from '../../../config/voice-ids.js';
import { FULL_LEGEND_CONSENT, type ConsentedCloneRecord } from './voice-record.js';

export type LegendRefusal =
  | 'flag-off'
  | 'no-record'
  | 'consent-does-not-cover'
  | 'voice-setting-unset'
  | 'voice-not-a-uuid'
  | 'voice-is-withheld';

export type LegendAdmission =
  | { readonly admitted: true; readonly voiceId: string }
  | { readonly admitted: false; readonly reason: LegendRefusal };

export interface LegendAdmissionInput {
  /** LEGENDS_AS_THEMSELVES. */
  readonly flagOn: boolean;
  readonly record: ConsentedCloneRecord | undefined;
  /** The value of the record's voice setting. */
  readonly voiceId: string | undefined;
  /** Clones no listing may speak in unless its own record reserves them. */
  readonly withheldVoiceIds: ReadonlySet<string>;
}

const norm = (id: string): string => id.trim().toLowerCase();

/** Admitted with its voice, or the first reason it is not. */
export function admitLegend(input: LegendAdmissionInput): LegendAdmission {
  const { flagOn, record } = input;
  if (!flagOn) return { admitted: false, reason: 'flag-off' };
  if (!record) return { admitted: false, reason: 'no-record' };
  if (!FULL_LEGEND_CONSENT.every((scope) => record.consent.covers.includes(scope))) {
    return { admitted: false, reason: 'consent-does-not-cover' };
  }
  const voiceId = input.voiceId?.trim();
  if (!voiceId) return { admitted: false, reason: 'voice-setting-unset' };
  if (!isValidVoiceId(voiceId)) return { admitted: false, reason: 'voice-not-a-uuid' };
  const reserved = new Set(record.reservedCloneIds.map(norm));
  const withheld = [...input.withheldVoiceIds].some((w) => norm(w) === norm(voiceId));
  if (withheld && !reserved.has(norm(voiceId))) {
    return { admitted: false, reason: 'voice-is-withheld' };
  }
  return { admitted: true, voiceId };
}
