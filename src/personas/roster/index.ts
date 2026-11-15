/**
 * The roster (docs/plans/2026-11-12-one-roster.md): import from here, not from
 * the files inside. So far it holds the legends' consented-clone voice records
 * and their admission check; the listings themselves come with step R1.
 *
 * @module personas/roster
 */

export type { LegendAdmission, LegendRefusal } from './domain/legend-admission.js';
export { configuredLegendVoiceIds, legendAdmissionFor } from './use-cases/legend-admission-for.js';
