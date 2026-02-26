/**
 * Persona Voice Generator for Outreach
 *
 * @deprecated Moved to engagement/personalization-engine.ts and engagement/voice-adapter.ts.
 * Import from those modules directly. This file re-exports for backward compatibility.
 *
 * @module PersonaVoiceGenerator
 */

// Re-export everything from the new locations
export {
  type OutreachChannel,
  type OutreachTone,
  type RelationshipStage,
  type PersonaOutreachVoice,
  type OutreachContext,
  type GeneratedOutreach,
  personaOutreachVoices,
  getPersonaOutreachVoice,
  selectPhrase,
  generateTextMessage,
  generateEmailMessage,
  generateOutreach,
} from './engagement/personalization-engine.js';

export {
  generateVoicemailMessage,
  generateWarmIntroductionVoicemail,
  generateCallOpening,
  selectPersonaForOutreach,
} from './engagement/voice-adapter.js';

// Default export for backward compatibility
export default {
  getPersonaOutreachVoice: (await import('./engagement/personalization-engine.js')).getPersonaOutreachVoice,
  generateOutreach: (await import('./engagement/personalization-engine.js')).generateOutreach,
  generateTextMessage: (await import('./engagement/personalization-engine.js')).generateTextMessage,
  generateEmailMessage: (await import('./engagement/personalization-engine.js')).generateEmailMessage,
  generateVoicemailMessage: (await import('./engagement/voice-adapter.js')).generateVoicemailMessage,
  generateCallOpening: (await import('./engagement/voice-adapter.js')).generateCallOpening,
  selectPersonaForOutreach: (await import('./engagement/voice-adapter.js')).selectPersonaForOutreach,
  personaOutreachVoices: (await import('./engagement/personalization-engine.js')).personaOutreachVoices,
};
