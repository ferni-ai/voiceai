/**
 * The person model's public face: the contact-data rule the remembered-fact
 * writer is handed (agents/remembered-fact-store-register.ts), and the pure
 * build and render the nightly call-sheet job runs (api/scheduled-jobs/person-model-job.ts), and
 * the line guard the caller card shares (agents/multi-agent/caller-card).
 *
 * @module intelligence/person-model
 */
export { buildPersonModel, type PersonModelInputs } from './build.js';
export { lineIsSafe, oneLine } from './line-guard.js';
export { renderPersonModel } from './render.js';
export { PERSON_MODEL_VERSION, type PersonModel } from './types.js';
export { hasContactData } from './util.js';
