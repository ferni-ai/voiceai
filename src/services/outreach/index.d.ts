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
import { getOutreachDecisionEngine, startOutreachDecisionEngine, stopOutreachDecisionEngine, type OutreachDecision, type OutreachDecisionEngine, type OutreachPriority, type OutreachTrigger, type OutreachTriggerType, type UserOutreachState } from './decision-engine.js';
import { generateCallOpening, generateEmailMessage, generateOutreach, generateTextMessage, generateVoicemailMessage, getPersonaOutreachVoice, personaOutreachVoices, selectPersonaForOutreach, type GeneratedOutreach, type OutreachChannel, type OutreachContext, type OutreachTone, type PersonaOutreachVoice, type RelationshipStage } from './persona-voice-generator.js';
import { getThinkingOfYouEngine, ThinkingOfYouEngine, type ThinkingOfYouOutreach, type ThinkingOfYouTrigger } from './thinking-of-you.js';
import { getConversationalCallService, isConversationalCallsConfigured, makeConversationalCall, type CallStatus, type ConversationalCallService, type OutboundCall, type OutboundCallContext } from './conversational-calls.js';
import { addBusyPeriod, addNeverDuringRule, addRecurringEvent, calculateOptimalTime, calculateOptimalTimeWithCalendar, checkCalendarBeforeOutreach, clearUserTimingData, getTimingProfile, isGoodTimeForOutreach, recordInteraction as recordTimingInteraction, setSleepPattern, setWorkSchedule, updateTimingPreferences, type BusyPeriod, type NeverDuringRule, type RecurringEvent, type SleepPattern, type TimingContext, type TimingDecision, type TimingProfile, type WorkSchedule } from './timing-intelligence.js';
import { addCommitment, addInsideJoke, addLifeEvent, addOngoingEvent, addOpenLoop, addSignificantMoment, addStruggle, addWin, clearUserContext, getContextForOutreach, getFollowUpItems, getUserContext, needsSupport, pruneOldData, recordConversation, resolveOpenLoop, resolveStruggle, updateCommitmentStatus, updateEmotionalState, updatePersonalInfo, type Commitment, type ConversationSummary, type EmotionalState, type LifeEvent, type Struggle, type UserLifeContext, type Win } from './context-aggregator.js';
import { CHANNEL_SEQUENCES, clearUserChannelData, getChannelProfile, getContentTypeFromTrigger, getRecommendedSequence, getTimeOfDay, isWorkHours, recordOutreachOutcome, selectChannel, updateChannelPreferences, updateRelationshipStage as updateChannelRelationshipStage, updateContactAvailability, type ChannelContext, type ChannelDecision, type ChannelProfile, type ChannelSequence, type ContentType } from './channel-selector.js';
import { adaptMessage, addNickname, addInsideJoke as addRelationshipInsideJoke, addSharedReference, calculateStage, canDoAction, clearRelationshipData, getMessageAdjustment, getRandomReference, getReferenceableMoment, getRelationshipProfile, getToneAdjustment, recordConversation as recordRelationshipConversation, recordSignificantMoment, updateCommunicationStyle, updateStage, type MessageAdjustment, type SignificantMoment as RelationshipMoment, type RelationshipProfile, type ToneAdjustment } from './relationship-adapter.js';
import { analyzeMessageForContext, analyzeSessionForOutreach, detectEmotionalState, extractCommitments, extractWinsAndStruggles, type ExtractedCommitment, type EmotionalState as ExtractedEmotionalState, type SessionEndData } from './session-integration.js';
import { cleanupDeadTriggers, getMaintenanceStats, pruneOutreachHistory, resetUserData, resetWeeklyCounters, startMaintenanceScheduler, stopMaintenanceScheduler, updateMaintenanceConfig, type MaintenanceConfig, type MaintenanceStats } from './maintenance.js';
import { analytics, calculateGlobalAnalytics, calculatePeriodAnalytics, calculateUserAnalytics, clearUserAnalyticsData, exportAnalyticsData, getRecommendations, predictResponseLikelihood, pruneOldAnalyticsData, recordOutreachEvent, recordResponseEvent, type GlobalAnalytics, type OutreachEvent, type PeriodAnalytics, type ResponseEvent, type UserAnalytics } from './analytics.js';
import { cleanupOldVoiceMessages, generateCallGreeting, generateVoicemail, generateVoiceMessage, initializeVoiceSynthesis, isVoiceSynthesisAvailable, voiceSynthesis, type PersonaVoiceProfile, type VoiceMessage, type VoiceSynthesisConfig } from './voice-synthesis.js';
import { createOutboundCallRoom, endCall, generateCallConnectTwiML, generateVoicemailTwiML, getActiveSessions, getCallSession, handleCallStatus, handleMachineDetection, initializeSIPBridge, initiateConversationalCall, isSIPBridgeAvailable, markSessionInConversation, sipBridge, type CallSession, type OutboundCallOptions, type SIPBridgeConfig } from './sip-bridge.js';
import { cleanupOldTriggers, deleteAllUserOutreachData, deleteOutreachProfile, deleteTrigger, deleteUserContext, deleteUserHistory, getOutreachStats, initializeFirestore, isFirestoreAvailable, loadAllPendingTriggers, loadContext, loadHistory, loadOutreachProfile, loadPendingTriggers, saveContext, saveOutreachProfile, saveToHistory, saveTrigger, updateTriggerStatus, type OutreachHistoryDocument, type OutreachProfileDocument, type OutreachTriggerDocument } from './firestore-persistence.js';
import { calculateDeliveryStats, deliveryTracker, emailDelivery, initializeDeliveryServices, pushNotifications, queueDelivery, sendEmail, sendEmailWithRetry, sendPushNotification, sendSMS, sendSMSWithRetry, shutdownDeliveryServices, smsDelivery, type DeliveryChannel, type DeliveryConfig, type DeliveryStatus, type EmailDeliveryConfig, type EmailMessage, type PushNotification, type PushNotificationConfig, type SMSDeliveryConfig, type SMSMessage, type UnifiedDeliveryRecord } from './delivery/index.js';
import { emailWebhooks, initializeWebhooks, onInboundMessage, twilioWebhooks, type EmailTrackingEvent, type InboundMessage, type WebhooksConfig } from './webhooks/index.js';
import { abTesting, calculateTestResults, completeTest, createChannelTest, createMessageTest, createPersonaTest, createTest, createTimingTest, getAllTests, getTest, getVariantForUser, pauseTest, recordConversion, startTest, type ABTest, type ABTestResults, type ABTestVariant, type TestStatus, type TestType } from './ab-testing/index.js';
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
export declare function initializeOutreachSystem(): Promise<void>;
/**
 * Shutdown the outreach system
 */
export declare function shutdownOutreachSystem(): void;
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
export declare function triggerOutreach(trigger: Omit<OutreachTrigger, 'id' | 'createdAt'>): string;
/**
 * Update user outreach preferences
 */
export declare function updateOutreachPreferences(userId: string, preferences: Partial<UserOutreachState['preferences']>): void;
/**
 * Update user context (call after conversations)
 */
export declare function updateUserContext(userId: string, context: {
    emotionalState?: string;
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: Array<{
        date: Date;
        description: string;
    }>;
    interests?: string[];
}): void;
/**
 * Register a user for proactive outreach
 */
export declare function registerUserForOutreach(userId: string, _relationshipStartDate?: Date): void;
/**
 * Get pending outreach for a user
 */
export declare function getPendingOutreach(userId: string): OutreachTrigger[];
/**
 * Cancel a pending outreach
 */
export declare function cancelOutreach(triggerId: string): boolean;
/**
 * Get outreach history for a user
 */
export declare function getOutreachHistory(userId: string, limit?: number): OutreachDecision[];
/**
 * Manually trigger a "thinking of you" outreach
 * Use the OutreachOrchestrator for full-featured outreach triggering
 */
export declare function triggerThinkingOfYou(userId: string, _trigger?: ThinkingOfYouTrigger, reason?: string): Promise<void>;
export { getOutreachDecisionEngine, type OutreachDecisionEngine, startOutreachDecisionEngine, stopOutreachDecisionEngine, };
export type { OutreachDecision, OutreachPriority, OutreachTrigger, OutreachTriggerType, UserOutreachState, };
export { generateCallOpening, generateEmailMessage, generateOutreach, generateTextMessage, generateVoicemailMessage, getPersonaOutreachVoice, personaOutreachVoices, selectPersonaForOutreach, };
export type { GeneratedOutreach, OutreachChannel, OutreachContext, OutreachTone, PersonaOutreachVoice, RelationshipStage, };
export { getThinkingOfYouEngine, ThinkingOfYouEngine };
export type { ThinkingOfYouOutreach, ThinkingOfYouTrigger };
export { type ConversationalCallService, getConversationalCallService, isConversationalCallsConfigured, makeConversationalCall, };
export type { CallStatus, OutboundCall, OutboundCallContext };
export { addBusyPeriod, addNeverDuringRule, addRecurringEvent, calculateOptimalTime, calculateOptimalTimeWithCalendar, checkCalendarBeforeOutreach, clearUserTimingData, getTimingProfile, isGoodTimeForOutreach, recordTimingInteraction, setSleepPattern, setWorkSchedule, updateTimingPreferences, };
export type { BusyPeriod, NeverDuringRule, RecurringEvent, SleepPattern, TimingContext, TimingDecision, TimingProfile, WorkSchedule, };
export { addCommitment, addInsideJoke, addLifeEvent, addOngoingEvent, addOpenLoop, addSignificantMoment, addStruggle, addWin, clearUserContext, getContextForOutreach, getFollowUpItems, getUserContext, needsSupport, pruneOldData, recordConversation, resolveOpenLoop, resolveStruggle, updateCommitmentStatus, updateEmotionalState, updatePersonalInfo, };
export type { Commitment, ConversationSummary, EmotionalState, LifeEvent, Struggle, UserLifeContext, Win, };
export { CHANNEL_SEQUENCES, clearUserChannelData, getChannelProfile, getContentTypeFromTrigger, getRecommendedSequence, getTimeOfDay, isWorkHours, recordOutreachOutcome, selectChannel, updateChannelPreferences, updateChannelRelationshipStage, updateContactAvailability, };
export type { ChannelContext, ChannelDecision, ChannelProfile, ChannelSequence, ContentType };
export { adaptMessage, addNickname, addRelationshipInsideJoke, addSharedReference, calculateStage, canDoAction, clearRelationshipData, getMessageAdjustment, getRandomReference, getReferenceableMoment, getRelationshipProfile, getToneAdjustment, recordRelationshipConversation, recordSignificantMoment, updateCommunicationStyle, updateStage, };
export type { MessageAdjustment, RelationshipMoment, RelationshipProfile, ToneAdjustment };
export { analyzeMessageForContext, analyzeSessionForOutreach, detectEmotionalState, extractCommitments, extractWinsAndStruggles, };
export type { ExtractedCommitment, ExtractedEmotionalState, SessionEndData };
export { cleanupDeadTriggers, getMaintenanceStats, pruneOutreachHistory, resetUserData, resetWeeklyCounters, startMaintenanceScheduler, stopMaintenanceScheduler, updateMaintenanceConfig, };
export type { MaintenanceConfig, MaintenanceStats };
export { analytics, calculateGlobalAnalytics, calculatePeriodAnalytics, calculateUserAnalytics, clearUserAnalyticsData, exportAnalyticsData, getRecommendations, predictResponseLikelihood, pruneOldAnalyticsData, recordOutreachEvent, recordResponseEvent, };
export type { GlobalAnalytics, OutreachEvent, PeriodAnalytics, ResponseEvent, UserAnalytics };
export { cleanupOldVoiceMessages, generateCallGreeting, generateVoicemail, generateVoiceMessage, initializeVoiceSynthesis, isVoiceSynthesisAvailable, voiceSynthesis, };
export type { PersonaVoiceProfile, VoiceMessage, VoiceSynthesisConfig };
export { createOutboundCallRoom, endCall, generateCallConnectTwiML, generateVoicemailTwiML, getActiveSessions, getCallSession, handleCallStatus, handleMachineDetection, initializeSIPBridge, initiateConversationalCall, isSIPBridgeAvailable, markSessionInConversation, sipBridge, };
export type { CallSession, OutboundCallOptions, SIPBridgeConfig };
export { cleanupOldTriggers, deleteAllUserOutreachData, deleteOutreachProfile, deleteTrigger, deleteUserContext, deleteUserHistory, getOutreachStats, initializeFirestore, isFirestoreAvailable, loadAllPendingTriggers, loadContext, loadHistory, loadOutreachProfile, loadPendingTriggers, saveContext, saveOutreachProfile, saveToHistory, saveTrigger, updateTriggerStatus, };
export type { OutreachHistoryDocument, OutreachProfileDocument, OutreachTriggerDocument };
export { calculateDeliveryStats, deliveryTracker, emailDelivery, initializeDeliveryServices, pushNotifications, queueDelivery, sendEmail, sendEmailWithRetry, sendPushNotification, sendSMS, sendSMSWithRetry, shutdownDeliveryServices, smsDelivery, };
export type { DeliveryChannel, DeliveryConfig, DeliveryStatus, EmailDeliveryConfig, EmailMessage, PushNotification, PushNotificationConfig, SMSDeliveryConfig, SMSMessage, UnifiedDeliveryRecord, };
export { emailWebhooks, initializeWebhooks, onInboundMessage, twilioWebhooks };
export type { EmailTrackingEvent, InboundMessage, WebhooksConfig };
export { abTesting, calculateTestResults, completeTest, createChannelTest, createMessageTest, createPersonaTest, createTest, createTimingTest, getAllTests, getTest, getVariantForUser, pauseTest, recordConversion, startTest, };
export type { ABTest, ABTestResults, ABTestVariant, TestStatus, TestType };
export { checkForMemoryBasedOutreach, convertToOutreachTrigger, processConcernForOutreach, scheduleSuperhunmanOutreach, superhumanOutreach, syncMemoriesToOutreachContext, } from './superhuman-outreach-integration.js';
export type { SuperhumanOutreachTrigger } from './superhuman-outreach-integration.js';
export { checkStreaksAtRisk, checkMilestonesToCelebrate, checkSetbackRecoveryNeeded, generateWeeklyReviewData, publishStreakProtectionAlert, publishMilestoneCelebration, publishWeeklyReviewTrigger, publishSetbackRecoveryTrigger, MAYA_STREAK_PROTECTION_MESSAGES, MAYA_MILESTONE_MESSAGES, MAYA_WEEKLY_REVIEW_MESSAGES, MAYA_SETBACK_MESSAGES, MAYA_HABIT_OUTREACH_CONFIG, type HabitOutreachContext, type StreakAtRiskResult, } from './maya-habit-outreach.js';
export { evaluateTrustBasedOutreach, handleConcernDetection, shouldAvoidOutreachTopic, runTrustBasedOutreachBatch, type TrustOutreachEvaluationResult, type ConcernOutreachContext, } from './trust-outreach-bridge.js';
export { evaluateLifeRhythmOutreach, triggerLifeRhythmOutreach, generateLifeRhythmMessage, runDailyLifeRhythmOutreach, type LifeRhythmOutreachConfig, type LifeRhythmOutreachResult, } from './life-rhythm-outreach.js';
export { schedulePatternOutreach, schedulePatternOutreachAsync, scheduleSundayAnxietyFollowUp, scheduleWorkStressFollowUp, scheduleRelationshipCheckIn, PATTERN_OUTREACH_MAP, type PatternTrigger, type PatternOutreachContext, } from './pattern-outreach-integration.js';
declare const _default: {
    initializeOutreachSystem: typeof initializeOutreachSystem;
    shutdownOutreachSystem: typeof shutdownOutreachSystem;
    triggerOutreach: typeof triggerOutreach;
    triggerThinkingOfYou: typeof triggerThinkingOfYou;
    registerUserForOutreach: typeof registerUserForOutreach;
    updateOutreachPreferences: typeof updateOutreachPreferences;
    updateUserContext: typeof updateUserContext;
    getPendingOutreach: typeof getPendingOutreach;
    getOutreachHistory: typeof getOutreachHistory;
    cancelOutreach: typeof cancelOutreach;
    generateOutreach: typeof generateOutreach;
    generateTextMessage: typeof generateTextMessage;
    generateEmailMessage: typeof generateEmailMessage;
    getPersonaOutreachVoice: typeof getPersonaOutreachVoice;
    selectPersonaForOutreach: typeof selectPersonaForOutreach;
    makeConversationalCall: typeof makeConversationalCall;
    isConversationalCallsConfigured: typeof isConversationalCallsConfigured;
    getConversationalCallService: typeof getConversationalCallService;
    getTimingProfile: typeof getTimingProfile;
    updateTimingPreferences: typeof updateTimingPreferences;
    calculateOptimalTime: typeof calculateOptimalTime;
    calculateOptimalTimeWithCalendar: typeof calculateOptimalTimeWithCalendar;
    checkCalendarBeforeOutreach: typeof checkCalendarBeforeOutreach;
    isGoodTimeForOutreach: typeof isGoodTimeForOutreach;
    addNeverDuringRule: typeof addNeverDuringRule;
    addBusyPeriod: typeof addBusyPeriod;
    getUserContext: typeof getUserContext;
    getContextForOutreach: typeof getContextForOutreach;
    recordConversation: typeof recordConversation;
    addCommitment: typeof addCommitment;
    addWin: typeof addWin;
    addStruggle: typeof addStruggle;
    updateEmotionalState: typeof updateEmotionalState;
    needsSupport: typeof needsSupport;
    getFollowUpItems: typeof getFollowUpItems;
    selectChannel: typeof selectChannel;
    getChannelProfile: typeof getChannelProfile;
    recordOutreachOutcome: typeof recordOutreachOutcome;
    getRecommendedSequence: typeof getRecommendedSequence;
    getRelationshipProfile: typeof getRelationshipProfile;
    getToneAdjustment: typeof getToneAdjustment;
    adaptMessage: typeof adaptMessage;
    canDoAction: typeof canDoAction;
    recordSignificantMoment: typeof recordSignificantMoment;
    analyzeSessionForOutreach: typeof analyzeSessionForOutreach;
    analyzeMessageForContext: typeof analyzeMessageForContext;
    extractCommitments: typeof extractCommitments;
    detectEmotionalState: typeof detectEmotionalState;
    extractWinsAndStruggles: typeof extractWinsAndStruggles;
    analytics: {
        recordOutreach: typeof recordOutreachEvent;
        recordResponse: typeof recordResponseEvent;
        getUserAnalytics: typeof calculateUserAnalytics;
        getGlobalAnalytics: typeof calculateGlobalAnalytics;
        getRecommendations: typeof getRecommendations;
        predictResponse: typeof predictResponseLikelihood;
        exportData: typeof exportAnalyticsData;
        pruneOldData: typeof pruneOldAnalyticsData;
        clearUserData: typeof clearUserAnalyticsData;
    };
    calculateUserAnalytics: typeof calculateUserAnalytics;
    calculateGlobalAnalytics: typeof calculateGlobalAnalytics;
    calculatePeriodAnalytics: typeof calculatePeriodAnalytics;
    getRecommendations: typeof getRecommendations;
    predictResponseLikelihood: typeof predictResponseLikelihood;
    recordOutreachEvent: typeof recordOutreachEvent;
    recordResponseEvent: typeof recordResponseEvent;
    voiceSynthesis: {
        initialize: typeof initializeVoiceSynthesis;
        isAvailable: typeof isVoiceSynthesisAvailable;
        generateMessage: typeof generateVoiceMessage;
        generateVoicemail: typeof generateVoicemail;
        generateGreeting: typeof generateCallGreeting;
        cleanup: typeof cleanupOldVoiceMessages;
    };
    initializeVoiceSynthesis: typeof initializeVoiceSynthesis;
    isVoiceSynthesisAvailable: typeof isVoiceSynthesisAvailable;
    generateVoiceMessage: typeof generateVoiceMessage;
    generateVoicemail: typeof generateVoicemail;
    generateCallGreeting: typeof generateCallGreeting;
    sipBridge: {
        initialize: typeof initializeSIPBridge;
        isAvailable: typeof isSIPBridgeAvailable;
        initiateCall: typeof initiateConversationalCall;
        generateConnectTwiML: typeof generateCallConnectTwiML;
        generateVoicemailTwiML: typeof generateVoicemailTwiML;
        handleStatus: typeof handleCallStatus;
        handleMachineDetection: typeof handleMachineDetection;
        getSession: typeof getCallSession;
        getActiveSessions: typeof getActiveSessions;
        markInConversation: typeof markSessionInConversation;
        endCall: typeof endCall;
        createRoom: typeof createOutboundCallRoom;
    };
    initializeSIPBridge: typeof initializeSIPBridge;
    isSIPBridgeAvailable: typeof isSIPBridgeAvailable;
    initiateConversationalCall: typeof initiateConversationalCall;
    handleCallStatus: typeof handleCallStatus;
    handleMachineDetection: typeof handleMachineDetection;
    getCallSession: typeof getCallSession;
    getActiveSessions: typeof getActiveSessions;
    initializeFirestore: typeof initializeFirestore;
    isFirestoreAvailable: typeof isFirestoreAvailable;
    getOutreachStats: typeof getOutreachStats;
    deleteAllUserOutreachData: typeof deleteAllUserOutreachData;
};
export default _default;
//# sourceMappingURL=index.d.ts.map