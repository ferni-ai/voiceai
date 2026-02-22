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

import { getDisplayName } from '../../personas/persona-ids.js';
import { getLogger } from '../../utils/safe-logger.js';

// Import sub-modules
import {
  getOutreachDecisionEngine,
  startOutreachDecisionEngine,
  stopOutreachDecisionEngine,
  type OutreachDecision,
  type OutreachDecisionEngine,
  type OutreachPriority,
  type OutreachTrigger,
  type OutreachTriggerType,
  type UserOutreachState,
} from './decision-engine.js';

import {
  generateCallOpening,
  generateEmailMessage,
  generateOutreach,
  generateTextMessage,
  generateVoicemailMessage,
  getPersonaOutreachVoice,
  personaOutreachVoices,
  selectPersonaForOutreach,
  type GeneratedOutreach,
  type OutreachChannel,
  type OutreachContext,
  type OutreachTone,
  type PersonaOutreachVoice,
  type RelationshipStage,
} from './persona-voice-generator.js';

import {
  getThinkingOfYouEngine,
  ThinkingOfYouEngine,
  type ThinkingOfYouOutreach,
  type ThinkingOfYouTrigger,
} from './thinking-of-you.js';

import {
  getConversationalCallService,
  isConversationalCallsConfigured,
  makeConversationalCall,
  type CallStatus,
  type ConversationalCallService,
  type OutboundCall,
  type OutboundCallContext,
} from './conversational-calls.js';

import {
  addBusyPeriod,
  addNeverDuringRule,
  addRecurringEvent,
  calculateOptimalTime,
  calculateOptimalTimeWithCalendar,
  checkCalendarBeforeOutreach,
  clearUserTimingData,
  getTimingProfile,
  isGoodTimeForOutreach,
  recordInteraction as recordTimingInteraction,
  setSleepPattern,
  setWorkSchedule,
  updateTimingPreferences,
  type BusyPeriod,
  type NeverDuringRule,
  type RecurringEvent,
  type SleepPattern,
  type TimingContext,
  type TimingDecision,
  type TimingProfile,
  type WorkSchedule,
} from './timing-intelligence.js';

import {
  addCommitment,
  addInsideJoke,
  addLifeEvent,
  addOngoingEvent,
  addOpenLoop,
  addSignificantMoment,
  addStruggle,
  addWin,
  clearUserContext,
  getContextForOutreach,
  getFollowUpItems,
  getUserContext,
  needsSupport,
  pruneOldData,
  recordConversation,
  resolveOpenLoop,
  resolveStruggle,
  updateCommitmentStatus,
  updateEmotionalState,
  updatePersonalInfo,
  type Commitment,
  type ConversationSummary,
  type EmotionalState,
  type LifeEvent,
  type Struggle,
  type UserLifeContext,
  type Win,
} from './context-aggregator.js';

import {
  CHANNEL_SEQUENCES,
  clearUserChannelData,
  getChannelProfile,
  getContentTypeFromTrigger,
  getRecommendedSequence,
  getTimeOfDay,
  isWorkHours,
  recordOutreachOutcome,
  selectChannel,
  updateChannelPreferences,
  updateRelationshipStage as updateChannelRelationshipStage,
  updateContactAvailability,
  type ChannelContext,
  type ChannelDecision,
  type ChannelProfile,
  type ChannelSequence,
  type ContentType,
} from './channel-selector.js';

import {
  adaptMessage,
  addNickname,
  addInsideJoke as addRelationshipInsideJoke,
  addSharedReference,
  calculateStage,
  canDoAction,
  clearRelationshipData,
  getMessageAdjustment,
  getRandomReference,
  getReferenceableMoment,
  getRelationshipProfile,
  getToneAdjustment,
  recordConversation as recordRelationshipConversation,
  recordSignificantMoment,
  updateCommunicationStyle,
  updateStage,
  type MessageAdjustment,
  type SignificantMoment as RelationshipMoment,
  type RelationshipProfile,
  type ToneAdjustment,
} from './relationship-adapter.js';

// Session Integration
import {
  analyzeMessageForContext,
  analyzeSessionForOutreach,
  detectEmotionalState,
  extractCommitments,
  extractWinsAndStruggles,
  type ExtractedCommitment,
  type EmotionalState as ExtractedEmotionalState,
  type SessionEndData,
} from './session-integration.js';

// Maintenance
import {
  cleanupDeadTriggers,
  getMaintenanceStats,
  pruneOutreachHistory,
  resetUserData,
  resetWeeklyCounters,
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  updateMaintenanceConfig,
  type MaintenanceConfig,
  type MaintenanceStats,
} from './maintenance.js';

// Analytics & Learning
import { getBetterThanHumanTelemetry } from '../analytics/better-than-human-telemetry.js';
import {
  analytics,
  calculateGlobalAnalytics,
  calculatePeriodAnalytics,
  calculateUserAnalytics,
  clearUserAnalyticsData,
  exportAnalyticsData,
  getRecommendations,
  predictResponseLikelihood,
  pruneOldAnalyticsData,
  recordOutreachEvent,
  recordResponseEvent,
  type GlobalAnalytics,
  type OutreachEvent,
  type PeriodAnalytics,
  type ResponseEvent,
  type UserAnalytics,
} from './analytics.js';

// Voice Synthesis
import {
  cleanupOldVoiceMessages,
  generateCallGreeting,
  generateVoicemail,
  generateVoiceMessage,
  initializeVoiceSynthesis,
  isVoiceSynthesisAvailable,
  voiceSynthesis,
  type PersonaVoiceProfile,
  type VoiceMessage,
  type VoiceSynthesisConfig,
} from './voice-synthesis.js';

// SIP Bridge (Twilio → LiveKit)
import {
  createOutboundCallRoom,
  endCall,
  generateCallConnectTwiML,
  generateVoicemailTwiML,
  getActiveSessions,
  getCallSession,
  handleCallStatus,
  handleMachineDetection,
  initializeSIPBridge,
  initiateConversationalCall,
  isSIPBridgeAvailable,
  markSessionInConversation,
  sipBridge,
  type CallSession,
  type OutboundCallOptions,
  type SIPBridgeConfig,
} from './sip-bridge.js';

// Firestore Persistence
import {
  cleanupOldTriggers,
  deleteAllUserOutreachData,
  deleteOutreachProfile,
  deleteTrigger,
  deleteUserContext,
  deleteUserHistory,
  getOutreachStats,
  initializeFirestore,
  isFirestoreAvailable,
  loadAllPendingTriggers,
  loadContext,
  loadHistory,
  loadOutreachProfile,
  loadPendingTriggers,
  saveContext,
  saveOutreachProfile,
  saveToHistory,
  saveTrigger,
  updateTriggerStatus,
  type OutreachHistoryDocument,
  type OutreachProfileDocument,
  type OutreachTriggerDocument,
} from './firestore-persistence.js';

// Delivery Services
import {
  calculateDeliveryStats,
  deliveryTracker,
  emailDelivery,
  initializeDeliveryServices,
  pushNotifications,
  queueDelivery,
  sendEmail,
  sendEmailWithRetry,
  sendPushNotification,
  sendSMS,
  sendSMSWithRetry,
  shutdownDeliveryServices,
  smsDelivery,
  type DeliveryChannel,
  type DeliveryConfig,
  type DeliveryStatus,
  type EmailDeliveryConfig,
  type EmailMessage,
  type PushNotification,
  type PushNotificationConfig,
  type SMSDeliveryConfig,
  type SMSMessage,
  type UnifiedDeliveryRecord,
} from './delivery/index.js';

// Webhook Handlers
import {
  emailWebhooks,
  initializeWebhooks,
  onInboundMessage,
  twilioWebhooks,
  type EmailTrackingEvent,
  type InboundMessage,
  type WebhooksConfig,
} from './webhooks/index.js';

// A/B Testing
import {
  abTesting,
  calculateTestResults,
  completeTest,
  createChannelTest,
  createMessageTest,
  createPersonaTest,
  createTest,
  createTimingTest,
  getAllTests,
  getTest,
  getVariantForUser,
  pauseTest,
  recordConversion,
  startTest,
  type ABTest,
  type ABTestResults,
  type ABTestVariant,
  type TestStatus,
  type TestType,
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
  if (process.env.TWILIO_ACCOUNT_SID && process.env.LIVEKIT_API_KEY && process.env.SIP_DOMAIN) {
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

  // ThinkingOfYou engine is on-demand, no startup needed

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
  // ThinkingOfYou engine is on-demand, no shutdown needed
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

  // 📅 Live calendar check - don't reach out during meetings
  // (A good friend doesn't call when you're in a meeting)
  const calendarCheck = await checkCalendarBeforeOutreach(userId, decision.trigger.priority);
  if (!calendarCheck.canSend) {
    log.info(
      {
        userId,
        reason: calendarCheck.reason,
        suggestedRetry: calendarCheck.suggestedRetry,
        triggerType: decision.trigger.type,
      },
      '📅 Outreach delayed - user is busy (calendar)'
    );

    // Reschedule trigger for when user is free
    if (calendarCheck.suggestedRetry) {
      const engine = getOutreachDecisionEngine();
      // Create new trigger without id/createdAt (engine generates these)
      const { id: _id, createdAt: _createdAt, ...triggerData } = decision.trigger;
      engine.addTrigger({
        ...triggerData,
        suggestedTime: calendarCheck.suggestedRetry,
        reason: `${decision.trigger.reason} (rescheduled from calendar conflict)`,
      });
    }
    return;
  }

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
            title: subject || `Message from ${getDisplayName(personaId)}`,
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
      const proactiveOutreach = await import('../../tools/domains/proactive/outreach/index.js');

      switch (finalChannel) {
        case 'sms':
        case 'voice_message':
          await proactiveOutreach.textUser(userId, finalMessage, personaId);
          delivered = true;
          break;
        case 'email':
          await proactiveOutreach.emailUser(
            userId,
            subject || 'A message from Ferni',
            finalMessage,
            personaId
          );
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
    const analyticsChannel =
      finalChannel === 'push' || finalChannel === 'voice_message'
        ? 'sms'
        : (finalChannel as 'sms' | 'email' | 'call');
    const eventId = recordOutreachEvent(decision, analyticsChannel);

    // Better-than-human telemetry: track outreach sent (responses tracked via webhooks)
    if (delivered) {
      const triggerType = decision.trigger.type;
      const telemetry = getBetterThanHumanTelemetry();

      const toOutreachType = (
        t: string
      ): 'thinking_of_you' | 'celebration' | 'growth' | 'commitment_check' | null => {
        if (t === 'thinking_of_you') return 'thinking_of_you';
        if (t === 'commitment_check') return 'commitment_check';
        if (t === 'celebration' || t === 'streak_celebration') return 'celebration';
        if (t === 'insight_discovery' || t === 'growth_milestone' || t === 'goal_milestone')
          return 'growth';
        return null;
      };

      const mapped = toOutreachType(triggerType);
      if (mapped) {
        telemetry.trackOutreach(mapped, userId, personaId, {
          outreachId,
          triggerType,
          channel: finalChannel,
          analyticsEventId: eventId,
        });
      }
    }

    // Persist to Firestore
    if (isFirestoreAvailable()) {
      await saveToHistory(userId, decision);
    }

    log.info({ userId, channel, triggerId: decision.trigger.id, eventId }, '✅ Outreach delivered');
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
export function triggerOutreach(trigger: Omit<OutreachTrigger, 'id' | 'createdAt'>): string {
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

  // ThinkingOfYou engine uses profile-based context, updated via orchestrator
}

/**
 * Register a user for proactive outreach
 */
export function registerUserForOutreach(userId: string, _relationshipStartDate?: Date): void {
  // User registration is handled automatically by the outreach orchestrator
  // when evaluating users for ThinkingOfYou outreach
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
 * Use the OutreachOrchestrator for full-featured outreach triggering
 */
export async function triggerThinkingOfYou(
  userId: string,
  _trigger?: ThinkingOfYouTrigger,
  reason?: string
): Promise<void> {
  // Trigger via decision engine
  const engine = getOutreachDecisionEngine();
  engine.addTrigger({
    type: 'thinking_of_you',
    userId,
    priority: 'low',
    reason: reason || 'Manual thinking of you trigger',
  });
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Decision Engine
export {
  getOutreachDecisionEngine,
  type OutreachDecisionEngine,
  startOutreachDecisionEngine,
  stopOutreachDecisionEngine,
};

export type {
  OutreachDecision,
  OutreachPriority,
  OutreachTrigger,
  OutreachTriggerType,
  UserOutreachState,
};

// Persona Voice Generator
export {
  generateCallOpening,
  generateEmailMessage,
  generateOutreach,
  generateTextMessage,
  generateVoicemailMessage,
  getPersonaOutreachVoice,
  personaOutreachVoices,
  selectPersonaForOutreach,
};

export type {
  GeneratedOutreach,
  OutreachChannel,
  OutreachContext,
  OutreachTone,
  PersonaOutreachVoice,
  RelationshipStage,
};

// Thinking of You
export { getThinkingOfYouEngine, ThinkingOfYouEngine };

export type { ThinkingOfYouOutreach, ThinkingOfYouTrigger };

// Conversational Calls
export {
  type ConversationalCallService,
  getConversationalCallService,
  isConversationalCallsConfigured,
  makeConversationalCall,
};

export type { CallStatus, OutboundCall, OutboundCallContext };

// Timing Intelligence
export {
  addBusyPeriod,
  addNeverDuringRule,
  addRecurringEvent,
  calculateOptimalTime,
  calculateOptimalTimeWithCalendar,
  checkCalendarBeforeOutreach,
  clearUserTimingData,
  getTimingProfile,
  isGoodTimeForOutreach,
  recordTimingInteraction,
  setSleepPattern,
  setWorkSchedule,
  updateTimingPreferences,
};

export type {
  BusyPeriod,
  NeverDuringRule,
  RecurringEvent,
  SleepPattern,
  TimingContext,
  TimingDecision,
  TimingProfile,
  WorkSchedule,
};

// Context Aggregator
export {
  addCommitment,
  addInsideJoke,
  addLifeEvent,
  addOngoingEvent,
  addOpenLoop,
  addSignificantMoment,
  addStruggle,
  addWin,
  clearUserContext,
  getContextForOutreach,
  getFollowUpItems,
  getUserContext,
  needsSupport,
  pruneOldData,
  recordConversation,
  resolveOpenLoop,
  resolveStruggle,
  updateCommitmentStatus,
  updateEmotionalState,
  updatePersonalInfo,
};

export type {
  Commitment,
  ConversationSummary,
  EmotionalState,
  LifeEvent,
  Struggle,
  UserLifeContext,
  Win,
};

// Channel Selector
export {
  CHANNEL_SEQUENCES,
  clearUserChannelData,
  getChannelProfile,
  getContentTypeFromTrigger,
  getRecommendedSequence,
  getTimeOfDay,
  isWorkHours,
  recordOutreachOutcome,
  selectChannel,
  updateChannelPreferences,
  updateChannelRelationshipStage,
  updateContactAvailability,
};

export type { ChannelContext, ChannelDecision, ChannelProfile, ChannelSequence, ContentType };

// Relationship Adapter
export {
  adaptMessage,
  addNickname,
  addRelationshipInsideJoke,
  addSharedReference,
  calculateStage,
  canDoAction,
  clearRelationshipData,
  getMessageAdjustment,
  getRandomReference,
  getReferenceableMoment,
  getRelationshipProfile,
  getToneAdjustment,
  recordRelationshipConversation,
  recordSignificantMoment,
  updateCommunicationStyle,
  updateStage,
};

export type { MessageAdjustment, RelationshipMoment, RelationshipProfile, ToneAdjustment };

// Session Integration
export {
  analyzeMessageForContext,
  analyzeSessionForOutreach,
  detectEmotionalState,
  extractCommitments,
  extractWinsAndStruggles,
};

export type { ExtractedCommitment, ExtractedEmotionalState, SessionEndData };

// Maintenance
export {
  cleanupDeadTriggers,
  getMaintenanceStats,
  pruneOutreachHistory,
  resetUserData,
  resetWeeklyCounters,
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
  updateMaintenanceConfig,
};

export type { MaintenanceConfig, MaintenanceStats };

// Analytics & Learning
export {
  analytics,
  calculateGlobalAnalytics,
  calculatePeriodAnalytics,
  calculateUserAnalytics,
  clearUserAnalyticsData,
  exportAnalyticsData,
  getRecommendations,
  predictResponseLikelihood,
  pruneOldAnalyticsData,
  recordOutreachEvent,
  recordResponseEvent,
};

export type { GlobalAnalytics, OutreachEvent, PeriodAnalytics, ResponseEvent, UserAnalytics };

// Voice Synthesis
export {
  cleanupOldVoiceMessages,
  generateCallGreeting,
  generateVoicemail,
  generateVoiceMessage,
  initializeVoiceSynthesis,
  isVoiceSynthesisAvailable,
  voiceSynthesis,
};

export type { PersonaVoiceProfile, VoiceMessage, VoiceSynthesisConfig };

// SIP Bridge
export {
  createOutboundCallRoom,
  endCall,
  generateCallConnectTwiML,
  generateVoicemailTwiML,
  getActiveSessions,
  getCallSession,
  handleCallStatus,
  handleMachineDetection,
  initializeSIPBridge,
  initiateConversationalCall,
  isSIPBridgeAvailable,
  markSessionInConversation,
  sipBridge,
};

export type { CallSession, OutboundCallOptions, SIPBridgeConfig };

// Firestore Persistence
export {
  cleanupOldTriggers,
  deleteAllUserOutreachData,
  deleteOutreachProfile,
  deleteTrigger,
  deleteUserContext,
  deleteUserHistory,
  getOutreachStats,
  initializeFirestore,
  isFirestoreAvailable,
  loadAllPendingTriggers,
  loadContext,
  loadHistory,
  loadOutreachProfile,
  loadPendingTriggers,
  saveContext,
  saveOutreachProfile,
  saveToHistory,
  saveTrigger,
  updateTriggerStatus,
};

export type { OutreachHistoryDocument, OutreachProfileDocument, OutreachTriggerDocument };

// Delivery Services
export {
  calculateDeliveryStats,
  deliveryTracker,
  emailDelivery,
  initializeDeliveryServices,
  pushNotifications,
  queueDelivery,
  sendEmail,
  sendEmailWithRetry,
  sendPushNotification,
  sendSMS,
  sendSMSWithRetry,
  shutdownDeliveryServices,
  smsDelivery,
};

export type {
  DeliveryChannel,
  DeliveryConfig,
  DeliveryStatus,
  EmailDeliveryConfig,
  EmailMessage,
  PushNotification,
  PushNotificationConfig,
  SMSDeliveryConfig,
  SMSMessage,
  UnifiedDeliveryRecord,
};

// Webhook Handlers
export { emailWebhooks, initializeWebhooks, onInboundMessage, twilioWebhooks };

export type { EmailTrackingEvent, InboundMessage, WebhooksConfig };

// A/B Testing
export {
  abTesting,
  calculateTestResults,
  completeTest,
  createChannelTest,
  createMessageTest,
  createPersonaTest,
  createTest,
  createTimingTest,
  getAllTests,
  getTest,
  getVariantForUser,
  pauseTest,
  recordConversion,
  startTest,
};

export type { ABTest, ABTestResults, ABTestVariant, TestStatus, TestType };

// 🧠 Superhuman Intelligence Integration
export {
  checkForMemoryBasedOutreach,
  convertToOutreachTrigger,
  processConcernForOutreach,
  scheduleSuperhunmanOutreach,
  superhumanOutreach,
  syncMemoriesToOutreachContext,
} from './superhuman-outreach-integration.js';

export type { SuperhumanOutreachTrigger } from './superhuman-outreach-integration.js';

// 🌱 Maya Habit Outreach
export {
  checkStreaksAtRisk,
  checkMilestonesToCelebrate,
  checkSetbackRecoveryNeeded,
  generateWeeklyReviewData,
  publishStreakProtectionAlert,
  publishMilestoneCelebration,
  publishWeeklyReviewTrigger,
  publishSetbackRecoveryTrigger,
  MAYA_STREAK_PROTECTION_MESSAGES,
  MAYA_MILESTONE_MESSAGES,
  MAYA_WEEKLY_REVIEW_MESSAGES,
  MAYA_SETBACK_MESSAGES,
  MAYA_HABIT_OUTREACH_CONFIG,
  type HabitOutreachContext,
  type StreakAtRiskResult,
} from './maya-habit-outreach.js';

// 🧠 Trust-Based Outreach Bridge ("Better than Human")
export {
  evaluateTrustBasedOutreach,
  handleConcernDetection,
  shouldAvoidOutreachTopic,
  runTrustBasedOutreachBatch,
  type TrustOutreachEvaluationResult,
  type ConcernOutreachContext,
} from './trust-outreach-bridge.js';

// 🌊 Life Rhythm Prediction Outreach
export {
  evaluateLifeRhythmOutreach,
  triggerLifeRhythmOutreach,
  generateLifeRhythmMessage,
  runDailyLifeRhythmOutreach,
  type LifeRhythmOutreachConfig,
  type LifeRhythmOutreachResult,
} from './life-rhythm-outreach.js';

// 🔔 Pattern-Based Proactive Outreach (Better Than Human)
export {
  schedulePatternOutreach,
  schedulePatternOutreachAsync,
  scheduleSundayAnxietyFollowUp,
  scheduleWorkStressFollowUp,
  scheduleRelationshipCheckIn,
  PATTERN_OUTREACH_MAP,
  type PatternTrigger,
  type PatternOutreachContext,
} from './pattern-outreach-integration.js';

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
  calculateOptimalTimeWithCalendar,
  checkCalendarBeforeOutreach,
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
  calculatePeriodAnalytics,
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
