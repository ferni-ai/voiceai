/**
 * Voice Services - Outbound Calling System
 *
 * This module provides comprehensive outbound calling capabilities:
 *
 * ## One-Way Calls (Pre-recorded Messages)
 * Use `natural-call.service` for:
 * - Thinking-of-you messages
 * - Check-ins
 * - Reminders
 * - Appointment confirmations
 * - Birthday/celebration calls
 *
 * ## Two-Way Calls (Interactive Conversations)
 * Use `conversational-call.service` for:
 * - Appointment scheduling
 * - Business inquiries
 * - Personal follow-ups
 *
 * ## Call Detection
 * Use `call-detection.service` for:
 * - Human vs Machine detection
 * - Voicemail detection
 * - Smart message routing
 *
 * @module voice
 */

// ============================================================================
// ONE-WAY CALLS - Pre-recorded messages with persona voices
// ============================================================================

export {
  // Main function
  makeNaturalCall,
  // Convenience functions
  callThinkingOfYou,
  callCheckIn,
  callBirthday,
  callCelebration,
  callReminder,
  callEncouragement,
  callAppointmentConfirmation,
  callAppointmentReminder,
  // Preview/testing
  previewCallMessage,
  previewAllCallTypes,
  // Types
  type NaturalCallRequest,
  type NaturalCallResult,
} from './natural-call-service.js';

// ============================================================================
// TWO-WAY CALLS - Interactive conversations
// ============================================================================

export {
  // Main function
  makeConversationalCall,
  // Call management
  recordCallOutcome,
  getCallSession,
  getActiveCalls,
  onCallEvent,
  // Configuration
  isConversationalCallingConfigured,
  // Types
  type ConversationalCallRequest,
  type ConversationalCallResult,
  type CallSession,
} from './conversational-call-service.js';

// ============================================================================
// CALL DETECTION - Human vs Machine
// ============================================================================

export {
  // Main function
  routeBasedOnDetection,
  // Voicemail generation
  generateVoicemailAudio,
  generateSmartVoicemail,
  // Webhook handling
  parseAMDWebhook,
  // Types
  type AnsweredBy,
  type DetectionResult,
  type CallRouting,
  type VoicemailContext,
  type VoicemailTemplate,
  type AMDWebhookPayload,
} from './call-detection-service.js';

// ============================================================================
// LOW-LEVEL UTILITIES
// ============================================================================

export {
  // TTS generation
  generatePersonaVoice,
  // Direct calling
  callWithPersonaVoice,
  // Incoming calls
  generateIncomingCallTwiml,
  configureIncomingCallWebhook,
  // SSML utilities
  enhanceOutboundMessage,
  createWarmOpening,
  createWarmClosing,
  thoughtfulPause,
  warmWrap,
  type PersonaCallOptions,
  type OutboundSsmlOptions,
} from './voice-call.js';

// ============================================================================
// TEMPLATES
// ============================================================================

export {
  // Template generator
  generateCallMessage,
  // Quick generators
  generateThinkingOfYouCall,
  generateCheckInCall,
  generateAppointmentConfirmationCall,
  // SSML helpers
  SSML,
  // Types
  type CallContext,
  type CallTemplateType,
  type GeneratedCall,
} from './outbound-call-templates.js';

// ============================================================================
// TWILIO STREAM BRIDGE (Two-way audio)
// ============================================================================

export {
  TwilioStreamBridge,
  getTwilioStreamBridge,
  generateStreamTwiml,
  type TwilioStreamMessage,
  type BridgeSession,
  type BridgeConfig,
} from './twilio-stream-bridge.js';
