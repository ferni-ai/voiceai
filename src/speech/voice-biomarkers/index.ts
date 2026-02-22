/**
 * Voice Biomarker Pipeline Module
 *
 * Detect emotional and physical states from voice characteristics.
 *
 * @module @ferni/speech/voice-biomarkers
 */

export { mapProsodyToVoiceFeatures } from './prosody-mapper.js';

export type {
  BiomarkerType,
  DetectedBiomarker,
  VoiceFeatures,
  VoiceState,
  VoiceIntervention,
  IVoiceBiomarkerPipeline,
} from './types.js';

export { VoiceBiomarkerPipelineToken } from './types.js';

export {
  VoiceBiomarkerPipeline,
  getVoiceBiomarkerPipeline,
  createVoiceBiomarkerPipeline,
  resetVoiceBiomarkerPipeline,
} from './engine.js';
