/**
 * Communication Superhuman Facade
 *
 * Re-exports the 10 superhuman communication capabilities for use by
 * context builders and other layers.
 *
 * "Better than Human" - capabilities no human friend can match.
 */

// Re-export all superhuman communication tools
export {
  communicationArchaeology,
  relationshipTemperature,
  unsaidWordsDetector,
  receptionPredictor,
  apologyEffectiveness,
  conflictReplay,
  communicationDebt,
  thirdPartyPerspective,
  strategicSilence,
  unspokenNeeds,
  buildSuperhumanCommunicationContext,
  buildQuickCommunicationContext,
  getSuperhumanCapabilitiesSummary,
  superhumanCommunication,
} from '../domains/communication/superhuman-tools/index.js';

// Re-export types
export type * from '../domains/communication/superhuman-tools/types.js';
