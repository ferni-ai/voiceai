/**
 * Proactive Outreach System
 *
 * A thoughtful friend who checks in, not a bot that sends notifications.
 *
 * This module provides:
 * - Persona-aware message generation (each agent has their unique voice)
 * - Smart outreach decisions (when, why, who, how)
 * - Timing intelligence (learned patterns + preferences)
 * - Random kindness ("thinking of you" moments)
 * - Multi-channel delivery (call, text, email, voice message)
 *
 * Architecture:
 * 1. Triggers are detected (commitment, emotion, milestone, etc.)
 * 2. Decision Engine evaluates: should we reach out?
 * 3. If yes: select persona, channel, timing
 * 4. Generate message in persona's voice
 * 5. Deliver via appropriate channel
 *
 * @example
 * ```typescript
 * import { initializeOutreachSystem, triggerOutreach } from './services/outreach';
 *
 * // Start the system
 * initializeOutreachSystem();
 *
 * // Trigger an outreach (usually done automatically)
 * triggerOutreach({
 *   type: 'commitment_check',
 *   userId: 'user-123',
 *   priority: 'medium',
 *   reason: 'User committed to working out this morning',
 *   commitment: 'morning workout',
 * });
 * ```
 */

import { getLogger } from '../../utils/safe-logger.js';

// Import sub-modules
import {
  getOutreachDecisionEngine,
  startOutreachDecisionEngine,
  stopOutreachDecisionEngine,
  type OutreachDecisionEngine,
  type OutreachTrigger,
  type OutreachTriggerType,
  type OutreachPriority,
  type OutreachDecision,
  type UserOutreachState,
} from './decision-engine.js';

import {
  generateOutreach,
  generateTextMessage,
  generateEmailMessage,
  generateVoicemailMessage,
  generateCallOpening,
  selectPersonaForOutreach,
  getPersonaOutreachVoice,
  personaOutreachVoices,
  type OutreachChannel,
  type OutreachContext,
  type RelationshipStage,
  type OutreachTone,
  type GeneratedOutreach,
  type PersonaOutreachVoice,
} from './persona-voice-generator.js';

import {
  getThinkingOfYouEngine,
  startThinkingOfYouEngine,
  stopThinkingOfYouEngine,
  getCurrentSeason,
  isSeasonTransition,
  type ThinkingOfYouEngine,
  type ThinkingOfYouTrigger,
} from './thinking-of-you.js';

import {
  getConversationalCallService,
  makeConversationalCall,
  isConversationalCallsConfigured,
  type ConversationalCallService,
  type OutboundCallContext,
  type OutboundCall,
  type CallStatus,
} from './conversational-calls.js';

import {
  getTimingProfile,
  updateTimingPreferences,
  addNeverDuringRule,
  addBusyPeriod,
  addRecurringEvent,
  setWorkSchedule,
  setSleepPattern,
  recordInteraction as recordTimingInteraction,
  calculateOptimalTime,
  isGoodTimeForOutreach,
  clearUserTimingData,
  type TimingProfile,
  type TimingDecision,
  type TimingContext,
  type NeverDuringRule,
  type BusyPeriod,
  type RecurringEvent,
  type WorkSchedule,
  type SleepPattern,
} from './timing-intelligence.js';

import {
  getUserContext,
  recordConversation,
  addCommitment,
  updateCommitmentStatus,
  addOpenLoop,
  resolveOpenLoop,
  updateEmotionalState,
  addLifeEvent,
  addOngoingEvent,
  addWin,
  addStruggle,
  resolveStruggle,
  addSignificantMoment,
  addInsideJoke,
  updatePersonalInfo,
  getContextForOutreach,
  needsSupport,
  getFollowUpItems,
  clearUserContext,
  pruneOldData,
  type UserLifeContext,
  type ConversationSummary,
  type Commitment,
  type EmotionalState,
  type LifeEvent,
  type Win,
  type Struggle,
} from './context-aggregator.js';

import {
  getChannelProfile,
  updateChannelPreferences,
  updateContactAvailability,
  updateRelationshipStage as updateChannelRelationshipStage,
  recordOutreachOutcome,
  selectChannel,
  getContentTypeFromTrigger,
  getTimeOfDay,
  isWorkHours,
  getRecommendedSequence,
  CHANNEL_SEQUENCES,
  clearUserChannelData,
  type ChannelProfile,
  type ChannelContext,
  type ChannelDecision,
  type ContentType,
  type ChannelSequence,
} from './channel-selector.js';

import {
  getRelationshipProfile,
  calculateStage,
  updateStage,
  recordConversation as recordRelationshipConversation,
  addInsideJoke as addRelationshipInsideJoke,
  addNickname,
  addSharedReference,
  recordSignificantMoment,
  updateCommunicationStyle,
  getToneAdjustment,
  getMessageAdjustment,
  adaptMessage,
  getRandomReference,
  getReferenceableMoment,
  canDoAction,
  clearRelationshipData,
  type RelationshipProfile,
  type ToneAdjustment,
  type MessageAdjustment,
  type SignificantMoment as RelationshipMoment,
} from './relationship-adapter.js';

// Session Integration
import {
  analyzeSessionForOutreach,
  analyzeMessageForContext,
  extractCommitments,
  detectEmotionalState,
  extractWinsAndStruggles,
  type SessionEndData,
  type ExtractedCommitment,
  type EmotionalState as ExtractedEmotionalState,
} from './session-integration.js';

// Maintenance
import {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  resetWeeklyCounters,
  cleanupDeadTriggers,
  pruneOutreachHistory,
  resetUserData,
  updateMaintenanceConfig,
  getMaintenanceStats,
  type MaintenanceConfig,
  type MaintenanceStats,
} from './maintenance.js';

// Analytics & Learning
import {
  analytics,
  recordOutreachEvent,
  recordResponseEvent,
  calculateUserAnalytics,
  calculateGlobalAnalytics,
  getRecommendations,
  predictResponseLikelihood,
  exportAnalyticsData,
  pruneOldAnalyticsData,
  clearUserAnalyticsData,
  type OutreachEvent,
  type ResponseEvent,
  type UserAnalytics,
  type GlobalAnalytics,
} from './analytics.js';

// Voice Synthesis
import {
  voiceSynthesis,
  initializeVoiceSynthesis,
  isVoiceSynthesisAvailable,
  generateVoiceMessage,
  generateVoicemail,
  generateCallGreeting,
  cleanupOldVoiceMessages,
  type VoiceSynthesisConfig,
  type VoiceMessage,
  type PersonaVoiceProfile,
} from './voice-synthesis.js';

// SIP Bridge (Twilio → LiveKit)
import {
  sipBridge,
  initializeSIPBridge,
  isSIPBridgeAvailable,
  initiateConversationalCall,
  generateCallConnectTwiML,
  generateVoicemailTwiML,
  handleCallStatus,
  handleMachineDetection,
  getCallSession,
  getActiveSessions,
  markSessionInConversation,
  endCall,
  createOutboundCallRoom,
  type SIPBridgeConfig,
  type OutboundCallOptions,
  type CallSession,
} from './sip-bridge.js';

// Firestore Persistence
import {
  initializeFirestore,
  isFirestoreAvailable,
  saveOutreachProfile,
  loadOutreachProfile,
  deleteOutreachProfile,
  saveTrigger,
  updateTriggerStatus,
  loadPendingTriggers,
  loadAllPendingTriggers,
  deleteTrigger,
  cleanupOldTriggers,
  saveToHistory,
  loadHistory,
  deleteUserHistory,
  saveContext,
  loadContext,
  deleteUserContext,
  deleteAllUserOutreachData,
  getOutreachStats,
  type OutreachProfileDocument,
  type OutreachTriggerDocument,
  type OutreachHistoryDocument,
} from './firestore-persistence.js';

// Delivery Services
import {
  initializeDeliveryServices,
  shutdownDeliveryServices,
  smsDelivery,
  emailDelivery,
  pushNotifications,
  deliveryTracker,
  sendSMS,
  sendSMSWithRetry,
  sendEmail,
  sendEmailWithRetry,
  sendPushNotification,
  queueDelivery,
  calculateDeliveryStats,
  type SMSDeliveryConfig,
  type EmailDeliveryConfig,
  type PushNotificationConfig,
  type DeliveryConfig,
  type SMSMessage,
  type EmailMessage,
  type PushNotification,
  type DeliveryChannel,
  type DeliveryStatus,
  type UnifiedDeliveryRecord,
} from './delivery/index.js';

// Webhook Handlers
import {
  initializeWebhooks,
  twilioWebhooks,
  emailWebhooks,
  onInboundMessage,
  type WebhooksConfig,
  type InboundMessage,
  type EmailTrackingEvent,
} from './webhooks/index.js';

// A/B Testing
import {
  abTesting,
  createTest,
  startTest,
  pauseTest,
  completeTest,
  getTest,
  getAllTests,
  getVariantForUser,
  recordConversion,
  calculateTestResults,
  createMessageTest,
  createTimingTest,
  createChannelTest,
  createPersonaTest,
  type ABTest,
  type ABTestVariant,
  type ABTestResults,
  type TestType,
  type TestStatus,
} from './ab-testing/index.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

const log = getLogger().child({ module: 'outreach' });

let initialized = false;

/**
 * Initialize the complete outreach system
 *
 * This starts:
 * - Outreach Decision Engine (processes triggers)
 * - Thinking of You Engine (random kindness)
 * - Maintenance Scheduler (weekly resets, data pruning)
 * - Firestore persistence (if configured)
 * - Voice synthesis (if Cartesia configured)
 * - SIP bridge (if Twilio SIP configured)
 */
export async function initializeOutreachSystem(): Promise<void> {
  if (initialized) {
    log.warn('Outreach system already initialized');
    return;
  }

  log.info('🚀 Initializing Proactive Outreach System');

  // Initialize Firestore for persistence (optional)
  try {
    const firestoreReady = await initializeFirestore();
    if (firestoreReady) {
      // Load pending triggers from Firestore
      const pendingTriggers = await loadAllPendingTriggers();
      if (pendingTriggers.length > 0) {
        log.info({ count: pendingTriggers.length }, 'Loaded pending triggers from Firestore');
        // Re-add them to the engine
        const engine = getOutreachDecisionEngine();
        for (const trigger of pendingTriggers) {
          engine.addTrigger(trigger.trigger);
        }
      }
    }
  } catch (error) {
    log.warn({ error }, 'Firestore initialization failed - using in-memory storage');
  }

  // Initialize voice synthesis (optional)
  if (process.env.CARTESIA_API_KEY && process.env.GCS_BUCKET_NAME) {
    try {
      initializeVoiceSynthesis({
        cartesiaApiKey: process.env.CARTESIA_API_KEY,
        gcsProjectId: process.env.GCP_PROJECT_ID || '',
        gcsBucketName: process.env.GCS_BUCKET_NAME,
      });
    } catch (error) {
      log.warn({ error }, 'Voice synthesis initialization failed');
    }
  }

  // Initialize SIP bridge (optional)
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.LIVEKIT_API_KEY &&
    process.env.SIP_DOMAIN
  ) {
    try {
      initializeSIPBridge({
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
        twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
        livekitHost: process.env.LIVEKIT_HOST || '',
        livekitApiKey: process.env.LIVEKIT_API_KEY,
        livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
        sipTrunkNumber: process.env.SIP_TRUNK_NUMBER || '',
        sipDomain: process.env.SIP_DOMAIN,
      });
    } catch (error) {
      log.warn({ error }, 'SIP bridge initialization failed');
    }
  }

  // Initialize delivery services (SMS, Email, Push)
  try {
    const deliveryConfig: DeliveryConfig = {};

    // SMS via Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      deliveryConfig.sms = {
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
        statusCallbackUrl: process.env.WEBHOOK_BASE_URL
          ? `${process.env.WEBHOOK_BASE_URL}/api/outreach/webhooks/twilio/sms-status`
          : undefined,
      };
    }

    // Email via SendGrid or Resend
    if (process.env.SENDGRID_API_KEY) {
      deliveryConfig.email = {
        provider: 'sendgrid',
        apiKey: process.env.SENDGRID_API_KEY,
        fromEmail: process.env.EMAIL_FROM || 'hello@ferni.ai',
        fromName: process.env.EMAIL_FROM_NAME || 'Ferni',
        replyToEmail: process.env.EMAIL_REPLY_TO,
        trackOpens: true,
        trackClicks: true,
      };
    } else if (process.env.RESEND_API_KEY) {
      deliveryConfig.email = {
        provider: 'resend',
        apiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.EMAIL_FROM || 'hello@ferni.ai',
        fromName: process.env.EMAIL_FROM_NAME || 'Ferni',
        replyToEmail: process.env.EMAIL_REPLY_TO,
        trackOpens: true,
        trackClicks: true,
      };
    }

    // Push via Firebase
    if (process.env.FCM_PROJECT_ID && process.env.FCM_PRIVATE_KEY) {
      deliveryConfig.push = {
        firebaseProjectId: process.env.FCM_PROJECT_ID,
        firebasePrivateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
        firebaseClientEmail: process.env.FCM_CLIENT_EMAIL || '',
      };
    }

    if (Object.keys(deliveryConfig).length > 0) {
      initializeDeliveryServices(deliveryConfig);
    }
  } catch (error) {
    log.warn({ error }, 'Delivery services initialization failed');
  }

  // Initialize webhook handlers
  try {
    initializeWebhooks({
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      sendgridWebhookKey: process.env.SENDGRID_WEBHOOK_KEY,
      resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch (error) {
    log.warn({ error }, 'Webhook handlers initialization failed');
  }

  // Start the decision engine
  startOutreachDecisionEngine();

  // Start the thinking-of-you engine
  startThinkingOfYouEngine();

  // Start the maintenance scheduler (hourly checks)
  startMaintenanceScheduler();

  // Wire up delivery (events from decision engine)
  const engine = getOutreachDecisionEngine();
  engine.on('outreach-ready', (decision: OutreachDecision) => {
    void handleOutreachDelivery(decision);
  });

  initialized = true;
  log.info('✅ Proactive Outreach System initialized');
}

/**
 * Shutdown the outreach system
 */
export function shutdownOutreachSystem(): void {
  stopOutreachDecisionEngine();
  stopThinkingOfYouEngine();
  stopMaintenanceScheduler();
  shutdownDeliveryServices();
  initialized = false;
  log.info('🛑 Proactive Outreach System shut down');
}

// ============================================================================
// DELIVERY
// ============================================================================

/**
 * Handle delivery of an outreach decision
 * This is where we actually send the message via the appropriate channel
 */
async function handleOutreachDelivery(decision: OutreachDecision): Promise<void> {
  if (!decision.generatedMessage) {
    log.warn({ triggerId: decision.trigger.id }, 'No message to deliver');
    return;
  }

  const { channel, message, subject, voicemailMessage } = decision.generatedMessage;
  const { userId } = decision.trigger;
  const personaId = decision.persona || 'ferni';
  const outreachId = decision.trigger.id;

  log.info(
    {
      userId,
      channel,
      persona: personaId,
      triggerType: decision.trigger.type,
    },
    '📤 Delivering outreach'
  );

  try {
    // Try to get user contact info from context
    const userContext = getUserContext(userId);
    const userPhone = userContext.personal?.phone;
    const userEmail = userContext.personal?.email;

    // Check for A/B tests and potentially override channel/message
    const activeTests = abTesting.getActiveTestsForTrigger(decision.trigger.type);
    let finalChannel = channel;
    let finalMessage = message;

    for (const test of activeTests) {
      const variant = abTesting.getVariantForUser(test.id, userId);
      if (variant) {
        if (test.type === 'channel' && variant.channel) {
          finalChannel = variant.channel;
        } else if (test.type === 'message' && variant.messageTemplate) {
          finalMessage = variant.messageTemplate;
        }
      }
    }

    let delivered = false;

    switch (finalChannel) {
      case 'sms':
        if (smsDelivery.isAvailable() && userPhone) {
          const result = await sendSMSWithRetry({
            to: userPhone,
            body: finalMessage,
            personaId,
            userId,
            outreachId,
          });
          delivered = result.success;
        }
        break;

      case 'email':
        if (emailDelivery.isAvailable() && userEmail) {
          const result = await sendEmailWithRetry({
            to: userEmail,
            toName: userContext.personal?.preferredName || userContext.personal?.firstName,
            subject: subject || 'A message from Ferni',
            body: finalMessage,
            personaId,
            userId,
            outreachId,
          });
          delivered = result.success;
        }
        break;

      case 'push':
        if (pushNotifications.isAvailable() && pushNotifications.hasPushEnabled(userId)) {
          const results = await sendPushNotification({
            userId,
            outreachId,
            personaId,
            title: subject || `Message from ${personaId === 'ferni' ? 'Ferni' : personaId}`,
            body: finalMessage,
            clickAction: 'https://app.ferni.ai',
            priority: decision.trigger.priority === 'urgent' ? 'high' : 'normal',
          });
          delivered = results.some((r) => r.success);
        }
        break;

      case 'call':
        // Calls still use the conversational call system
        break;

      case 'voice_message':
        // Voice messages fall through to SMS with emoji
        if (smsDelivery.isAvailable() && userPhone) {
          const result = await sendSMSWithRetry({
            to: userPhone,
            body: `🎤 ${finalMessage}`,
            personaId,
            userId,
            outreachId,
          });
          delivered = result.success;
        }
        break;
    }

    // Fallback to legacy delivery if new services didn't work
    if (!delivered) {
      log.debug({ channel: finalChannel, userId }, 'Falling back to legacy delivery');
      const proactiveOutreach = await import('../../tools/proactive-outreach.js');

      switch (finalChannel) {
        case 'sms':
        case 'voice_message':
          await proactiveOutreach.textUser(userId, finalMessage, personaId);
          delivered = true;
          break;
        case 'email':
          await proactiveOutreach.emailUser(userId, subject || 'A message from Ferni', finalMessage, personaId);
          delivered = true;
          break;
        case 'call':
          await proactiveOutreach.callUser(userId, voicemailMessage || finalMessage, personaId);
          delivered = true;
          break;
        case 'push':
          // No legacy fallback for push, try SMS instead
          await proactiveOutreach.textUser(userId, finalMessage, personaId);
          delivered = true;
          break;
      }
    }

    // Record for analytics - cast channel to the supported analytics types
    const analyticsChannel = (finalChannel === 'push' || finalChannel === 'voice_message')
      ? 'sms'
      : finalChannel as 'sms' | 'email' | 'call';
    const eventId = recordOutreachEvent(decision, analyticsChannel);
    
    // Persist to Firestore
    if (isFirestoreAvailable()) {
      await saveToHistory(userId, decision);
    }

    log.info(
      { userId, channel, triggerId: decision.trigger.id, eventId },
      '✅ Outreach delivered'
    );
  } catch (error) {
    log.error({ error, userId, channel }, '❌ Failed to deliver outreach');
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Trigger an outreach (convenience function)
 *
 * @example
 * ```typescript
 * triggerOutreach({
 *   type: 'commitment_check',
 *   userId: 'user-123',
 *   priority: 'medium',
 *   reason: 'User committed to working out this morning',
 *   commitment: 'morning workout',
 * });
 * ```
 */
export function triggerOutreach(
  trigger: Omit<OutreachTrigger, 'id' | 'createdAt'>
): string {
  const engine = getOutreachDecisionEngine();
  return engine.addTrigger(trigger);
}

/**
 * Update user outreach preferences
 */
export function updateOutreachPreferences(
  userId: string,
  preferences: Partial<UserOutreachState['preferences']>
): void {
  const engine = getOutreachDecisionEngine();
  engine.updateUserPreferences(userId, preferences);
}

/**
 * Update user context (call after conversations)
 */
export function updateUserContext(
  userId: string,
  context: {
    emotionalState?: string;
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: Array<{ date: Date; description: string }>;
    interests?: string[];
  }
): void {
  const engine = getOutreachDecisionEngine();
  engine.updateUserContext(userId, context);

  // Also update thinking-of-you context
  const toyEngine = getThinkingOfYouEngine();
  toyEngine.updateUserContext(userId, context);
}

/**
 * Register a user for proactive outreach
 */
export function registerUserForOutreach(
  userId: string,
  relationshipStartDate?: Date
): void {
  // Register with thinking-of-you engine
  const toyEngine = getThinkingOfYouEngine();
  toyEngine.registerUser(userId, relationshipStartDate);
}

/**
 * Get pending outreach for a user
 */
export function getPendingOutreach(userId: string): OutreachTrigger[] {
  const engine = getOutreachDecisionEngine();
  return engine.getPendingTriggers(userId);
}

/**
 * Cancel a pending outreach
 */
export function cancelOutreach(triggerId: string): boolean {
  const engine = getOutreachDecisionEngine();
  return engine.cancelTrigger(triggerId);
}

/**
 * Get outreach history for a user
 */
export function getOutreachHistory(userId: string, limit = 20): OutreachDecision[] {
  const engine = getOutreachDecisionEngine();
  return engine.getOutreachHistory(userId, limit);
}

/**
 * Manually trigger a "thinking of you" outreach
 */
export async function triggerThinkingOfYou(
  userId: string,
  trigger?: ThinkingOfYouTrigger,
  reason?: string
): Promise<void> {
  const engine = getThinkingOfYouEngine();
  await engine.triggerKindness(userId, trigger, reason);
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Decision Engine
export {
  getOutreachDecisionEngine,
  startOutreachDecisionEngine,
  stopOutreachDecisionEngine,
  OutreachDecisionEngine,
};

export type {
  OutreachTrigger,
  OutreachTriggerType,
  OutreachPriority,
  OutreachDecision,
  UserOutreachState,
};

// Persona Voice Generator
export {
  generateOutreach,
  generateTextMessage,
  generateEmailMessage,
  generateVoicemailMessage,
  generateCallOpening,
  selectPersonaForOutreach,
  getPersonaOutreachVoice,
  personaOutreachVoices,
};

export type {
  OutreachChannel,
  OutreachContext,
  RelationshipStage,
  OutreachTone,
  GeneratedOutreach,
  PersonaOutreachVoice,
};

// Thinking of You
export {
  getThinkingOfYouEngine,
  startThinkingOfYouEngine,
  stopThinkingOfYouEngine,
  ThinkingOfYouEngine,
  getCurrentSeason,
  isSeasonTransition,
};

export type { ThinkingOfYouTrigger };

// Conversational Calls
export {
  getConversationalCallService,
  makeConversationalCall,
  isConversationalCallsConfigured,
  ConversationalCallService,
};

export type {
  OutboundCallContext,
  OutboundCall,
  CallStatus,
};

// Timing Intelligence
export {
  getTimingProfile,
  updateTimingPreferences,
  addNeverDuringRule,
  addBusyPeriod,
  addRecurringEvent,
  setWorkSchedule,
  setSleepPattern,
  recordTimingInteraction,
  calculateOptimalTime,
  isGoodTimeForOutreach,
  clearUserTimingData,
};

export type {
  TimingProfile,
  TimingDecision,
  TimingContext,
  NeverDuringRule,
  BusyPeriod,
  RecurringEvent,
  WorkSchedule,
  SleepPattern,
};

// Context Aggregator
export {
  getUserContext,
  recordConversation,
  addCommitment,
  updateCommitmentStatus,
  addOpenLoop,
  resolveOpenLoop,
  updateEmotionalState,
  addLifeEvent,
  addOngoingEvent,
  addWin,
  addStruggle,
  resolveStruggle,
  addSignificantMoment,
  addInsideJoke,
  updatePersonalInfo,
  getContextForOutreach,
  needsSupport,
  getFollowUpItems,
  clearUserContext,
  pruneOldData,
};

export type {
  UserLifeContext,
  ConversationSummary,
  Commitment,
  EmotionalState,
  LifeEvent,
  Win,
  Struggle,
};

// Channel Selector
export {
  getChannelProfile,
  updateChannelPreferences,
  updateContactAvailability,
  updateChannelRelationshipStage,
  recordOutreachOutcome,
  selectChannel,
  getContentTypeFromTrigger,
  getTimeOfDay,
  isWorkHours,
  getRecommendedSequence,
  CHANNEL_SEQUENCES,
  clearUserChannelData,
};

export type {
  ChannelProfile,
  ChannelContext,
  ChannelDecision,
  ContentType,
  ChannelSequence,
};

// Relationship Adapter
export {
  getRelationshipProfile,
  calculateStage,
  updateStage,
  recordRelationshipConversation,
  addRelationshipInsideJoke,
  addNickname,
  addSharedReference,
  recordSignificantMoment,
  updateCommunicationStyle,
  getToneAdjustment,
  getMessageAdjustment,
  adaptMessage,
  getRandomReference,
  getReferenceableMoment,
  canDoAction,
  clearRelationshipData,
};

export type {
  RelationshipProfile,
  ToneAdjustment,
  MessageAdjustment,
  RelationshipMoment,
};

// Session Integration
export {
  analyzeSessionForOutreach,
  analyzeMessageForContext,
  extractCommitments,
  detectEmotionalState,
  extractWinsAndStruggles,
};

export type {
  SessionEndData,
  ExtractedCommitment,
  ExtractedEmotionalState,
};

// Maintenance
export {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  resetWeeklyCounters,
  cleanupDeadTriggers,
  pruneOutreachHistory,
  resetUserData,
  updateMaintenanceConfig,
  getMaintenanceStats,
};

export type { MaintenanceConfig, MaintenanceStats };

// Analytics & Learning
export {
  analytics,
  recordOutreachEvent,
  recordResponseEvent,
  calculateUserAnalytics,
  calculateGlobalAnalytics,
  getRecommendations,
  predictResponseLikelihood,
  exportAnalyticsData,
  pruneOldAnalyticsData,
  clearUserAnalyticsData,
};

export type { OutreachEvent, ResponseEvent, UserAnalytics, GlobalAnalytics };

// Voice Synthesis
export {
  voiceSynthesis,
  initializeVoiceSynthesis,
  isVoiceSynthesisAvailable,
  generateVoiceMessage,
  generateVoicemail,
  generateCallGreeting,
  cleanupOldVoiceMessages,
};

export type { VoiceSynthesisConfig, VoiceMessage, PersonaVoiceProfile };

// SIP Bridge
export {
  sipBridge,
  initializeSIPBridge,
  isSIPBridgeAvailable,
  initiateConversationalCall,
  generateCallConnectTwiML,
  generateVoicemailTwiML,
  handleCallStatus,
  handleMachineDetection,
  getCallSession,
  getActiveSessions,
  markSessionInConversation,
  endCall,
  createOutboundCallRoom,
};

export type { SIPBridgeConfig, OutboundCallOptions, CallSession };

// Firestore Persistence
export {
  initializeFirestore,
  isFirestoreAvailable,
  saveOutreachProfile,
  loadOutreachProfile,
  deleteOutreachProfile,
  saveTrigger,
  updateTriggerStatus,
  loadPendingTriggers,
  loadAllPendingTriggers,
  deleteTrigger,
  cleanupOldTriggers,
  saveToHistory,
  loadHistory,
  deleteUserHistory,
  saveContext,
  loadContext,
  deleteUserContext,
  deleteAllUserOutreachData,
  getOutreachStats,
};

export type { OutreachProfileDocument, OutreachTriggerDocument, OutreachHistoryDocument };

// Delivery Services
export {
  initializeDeliveryServices,
  shutdownDeliveryServices,
  smsDelivery,
  emailDelivery,
  pushNotifications,
  deliveryTracker,
  sendSMS,
  sendSMSWithRetry,
  sendEmail,
  sendEmailWithRetry,
  sendPushNotification,
  queueDelivery,
  calculateDeliveryStats,
};

export type {
  SMSDeliveryConfig,
  EmailDeliveryConfig,
  PushNotificationConfig,
  DeliveryConfig,
  SMSMessage,
  EmailMessage,
  PushNotification,
  DeliveryChannel,
  DeliveryStatus,
  UnifiedDeliveryRecord,
};

// Webhook Handlers
export {
  initializeWebhooks,
  twilioWebhooks,
  emailWebhooks,
  onInboundMessage,
};

export type {
  WebhooksConfig,
  InboundMessage,
  EmailTrackingEvent,
};

// A/B Testing
export {
  abTesting,
  createTest,
  startTest,
  pauseTest,
  completeTest,
  getTest,
  getAllTests,
  getVariantForUser,
  recordConversion,
  calculateTestResults,
  createMessageTest,
  createTimingTest,
  createChannelTest,
  createPersonaTest,
};

export type {
  ABTest,
  ABTestVariant,
  ABTestResults,
  TestType,
  TestStatus,
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Initialization
  initializeOutreachSystem,
  shutdownOutreachSystem,

  // Triggers
  triggerOutreach,
  triggerThinkingOfYou,

  // User management
  registerUserForOutreach,
  updateOutreachPreferences,
  updateUserContext,

  // Queries
  getPendingOutreach,
  getOutreachHistory,
  cancelOutreach,

  // Message generation
  generateOutreach,
  generateTextMessage,
  generateEmailMessage,

  // Persona voices
  getPersonaOutreachVoice,
  selectPersonaForOutreach,

  // Conversational calls
  makeConversationalCall,
  isConversationalCallsConfigured,
  getConversationalCallService,

  // Timing Intelligence
  getTimingProfile,
  updateTimingPreferences,
  calculateOptimalTime,
  isGoodTimeForOutreach,
  addNeverDuringRule,
  addBusyPeriod,

  // Context Aggregator
  getUserContext,
  getContextForOutreach,
  recordConversation,
  addCommitment,
  addWin,
  addStruggle,
  updateEmotionalState,
  needsSupport,
  getFollowUpItems,

  // Channel Selector
  selectChannel,
  getChannelProfile,
  recordOutreachOutcome,
  getRecommendedSequence,

  // Relationship Adapter
  getRelationshipProfile,
  getToneAdjustment,
  adaptMessage,
  canDoAction,
  recordSignificantMoment,

  // Session Integration
  analyzeSessionForOutreach,
  analyzeMessageForContext,
  extractCommitments,
  detectEmotionalState,
  extractWinsAndStruggles,

  // Analytics & Learning
  analytics,
  calculateUserAnalytics,
  calculateGlobalAnalytics,
  getRecommendations,
  predictResponseLikelihood,
  recordOutreachEvent,
  recordResponseEvent,

  // Voice Synthesis
  voiceSynthesis,
  initializeVoiceSynthesis,
  isVoiceSynthesisAvailable,
  generateVoiceMessage,
  generateVoicemail,
  generateCallGreeting,

  // SIP Bridge
  sipBridge,
  initializeSIPBridge,
  isSIPBridgeAvailable,
  initiateConversationalCall,
  handleCallStatus,
  handleMachineDetection,
  getCallSession,
  getActiveSessions,

  // Firestore Persistence
  initializeFirestore,
  isFirestoreAvailable,
  getOutreachStats,
  deleteAllUserOutreachData,
};

