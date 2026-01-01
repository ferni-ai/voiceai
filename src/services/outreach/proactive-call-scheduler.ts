/**
 * Proactive Call Scheduler
 *
 * > "We show up. Not because you asked. Because we noticed."
 *
 * Schedules intelligent outbound calls using the existing ConversationalCallService.
 * This wraps the low-level call infrastructure with:
 * - LLM-generated personalized SSML content
 * - Quiet hours respect
 * - Optimal timing intelligence
 *
 * @module ProactiveCallScheduler
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  isConversationalCallsConfigured,
  makeConversationalCall,
  type OutboundCallContext,
} from './conversational-calls.js';
import { generatePersonalizedContent, type UserContext } from './llm-content-generator.js';

const log = createLogger({ module: 'ProactiveCallScheduler' });

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveCallRequest {
  userId: string;
  phoneNumber: string;
  userContext: UserContext;
  outreachType: string;
  personaId?: string;
  reason?: string;
  scheduledFor?: Date;
  maxDuration?: number;
}

export interface ProactiveCallResult {
  success: boolean;
  callId?: string;
  status?: 'scheduled' | 'initiated' | 'failed';
  error?: string;
  scheduledFor?: Date;
}

// ============================================================================
// SSML ENHANCEMENT
// ============================================================================

/**
 * Enhance SSML for natural voice delivery
 */
export function enhanceSSMLForCall(ssml: string, personaId: string): string {
  let enhanced = ssml;

  // If not already wrapped in <speak>, wrap it
  if (!enhanced.startsWith('<speak>')) {
    enhanced = `<speak>${enhanced}</speak>`;
  }

  // Add Cartesia-specific voice settings based on persona
  const voiceSettings = getPersonaVoiceSettings(personaId);

  // Inject voice control at the start (after <speak>)
  const voiceControl = `<prosody rate="${voiceSettings.rate}" pitch="${voiceSettings.pitch}">`;
  const voiceControlEnd = '</prosody>';

  enhanced = enhanced.replace('<speak>', `<speak>${voiceControl}`);
  enhanced = enhanced.replace('</speak>', `${voiceControlEnd}</speak>`);

  // Add a greeting pause at the start
  enhanced = enhanced.replace(voiceControl, `${voiceControl}<break time="400ms"/>`);

  // Add a closing pause
  enhanced = enhanced.replace(voiceControlEnd, `<break time="500ms"/>${voiceControlEnd}`);

  return enhanced;
}

interface VoiceSettings {
  rate: string;
  pitch: string;
}

function getPersonaVoiceSettings(personaId: string): VoiceSettings {
  const settings: Record<string, VoiceSettings> = {
    ferni: { rate: '0.95', pitch: '+0%' },
    peter: { rate: '1.0', pitch: '-2%' },
    maya: { rate: '0.98', pitch: '+3%' },
    alex: { rate: '1.02', pitch: '0%' },
    jordan: { rate: '0.97', pitch: '+2%' },
    nayan: { rate: '0.9', pitch: '-3%' },
  };

  return settings[personaId] || settings['ferni'];
}

// ============================================================================
// MAIN SCHEDULER
// ============================================================================

/**
 * Schedule a proactive outreach call with LLM-generated content
 */
export async function scheduleProactiveCall(
  request: ProactiveCallRequest
): Promise<ProactiveCallResult> {
  const {
    userId,
    phoneNumber,
    userContext,
    outreachType,
    personaId = 'ferni',
    reason = 'proactive_outreach',
    scheduledFor = new Date(),
    maxDuration = 120,
  } = request;

  try {
    // Check if calls are configured
    if (!isConversationalCallsConfigured()) {
      log.warn({ userId }, 'Conversational calls not configured');
      return { success: false, error: 'Calls not configured' };
    }

    // Check quiet hours
    const inQuietHours = await isInQuietHours(userId);
    if (inQuietHours) {
      const nextWindow = await getNextAvailableWindow(userId);
      log.info({ userId, nextWindow }, 'Call delayed due to quiet hours');
      return scheduleProactiveCall({
        ...request,
        scheduledFor: nextWindow,
      });
    }

    // Generate personalized content using LLM
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = await generatePersonalizedContent(
      userContext,
      outreachType as any,
      'voice_call'
    );

    // Enhance SSML for natural delivery
    const enhancedSSML = enhanceSSMLForCall(content.ssml, personaId);

    // Build the outbound call context
    const callContext: OutboundCallContext = {
      trigger: {
        id: `proactive-${Date.now()}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: outreachType as any,
        reason: content.reason,
        urgency: 'low',
      },
      user: {
        id: userId,
        name: userContext.name || 'Friend',
        preferredName: userContext.preferredName,
        phone: phoneNumber,
        relationshipStage: getRelationshipStage(userContext),
        timezone: undefined, // Could be added from user profile
      },
      context: {
        lastConversationSummary: userContext.recentTopics?.join(', '),
        activeCommitments: userContext.primaryConcerns,
        recentWins: userContext.milestonesReached,
        avoidTopics: userContext.boundaries,
        emotionalState: userContext.lastMood,
      },
      approach: {
        tone: getToneForOutreachType(outreachType),
        primaryGoal: content.reason,
        maxDuration: Math.floor(maxDuration / 60), // Convert to minutes
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      persona: personaId as any,
    };

    // Schedule or initiate the call
    if (scheduledFor.getTime() > Date.now()) {
      // Save for later execution
      await saveScheduledCall({
        userId,
        phoneNumber,
        context: callContext,
        ssml: enhancedSSML,
        text: content.text,
        scheduledFor: scheduledFor.toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      log.info({ userId, scheduledFor: scheduledFor.toISOString() }, 'Proactive call scheduled');
      return { success: true, status: 'scheduled', scheduledFor };
    }

    // Initiate immediately using the conversational call service
    const result = await makeConversationalCall(callContext);

    log.info({ userId, callId: result.id }, 'Proactive call initiated');
    return {
      success: result.status !== 'failed',
      callId: result.id,
      status: 'initiated',
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to schedule proactive call');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getRelationshipStage(ctx: UserContext): 'new' | 'building' | 'established' | 'deep' {
  if (ctx.daysSinceSignup <= 7) return 'new';
  if (ctx.daysSinceSignup <= 30) return 'building';
  if (ctx.daysSinceSignup <= 90) return 'established';
  return 'deep';
}

function getToneForOutreachType(
  type: string
): 'celebratory' | 'supportive' | 'accountability' | 'casual' | 'urgent' {
  const toneMap: Record<
    string,
    'celebratory' | 'supportive' | 'accountability' | 'casual' | 'urgent'
  > = {
    win_celebration: 'celebratory',
    two_week_celebration: 'celebratory',
    setback_support: 'supportive',
    thinking_of_you: 'casual',
    habit_nudge: 'accountability',
    welcome_followup: 'casual',
    momentum_check: 'accountability',
  };
  return toneMap[type] || 'casual';
}

async function isInQuietHours(userId: string): Promise<boolean> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return false;

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) return false;

    const data = doc.data();
    const preferences = data?.outreachPreferences;
    if (!preferences?.quietHours?.enabled) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const startParts = preferences.quietHours.start.split(':').map(Number);
    const endParts = preferences.quietHours.end.split(':').map(Number);
    const startTime = startParts[0] * 60 + startParts[1];
    const endTime = endParts[0] * 60 + endParts[1];

    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }
    return currentTime >= startTime && currentTime < endTime;
  } catch {
    return false;
  }
}

async function getNextAvailableWindow(userId: string): Promise<Date> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;
    }

    const doc = await db.collection('bogle_users').doc(userId).get();
    const preferences = doc.exists ? doc.data()?.outreachPreferences : null;

    const endHour = preferences?.quietHours?.end
      ? parseInt(preferences.quietHours.end.split(':')[0], 10)
      : 8;

    const next = new Date();
    if (next.getHours() >= endHour) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(endHour, 0, 0, 0);
    return next;
  } catch {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}

async function saveScheduledCall(callData: {
  userId: string;
  phoneNumber: string;
  context: OutboundCallContext;
  ssml: string;
  text: string;
  scheduledFor: string;
  status: string;
  createdAt: string;
}): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    const callId = `scheduled-call-${Date.now()}`;
    await db
      .collection('bogle_users')
      .doc(callData.userId)
      .collection('scheduled_calls')
      .doc(callId)
      .set(cleanForFirestore(callData));
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save scheduled call');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const proactiveCallScheduler = {
  scheduleCall: scheduleProactiveCall,
  enhanceSSML: enhanceSSMLForCall,
  isInQuietHours,
};

export default proactiveCallScheduler;
