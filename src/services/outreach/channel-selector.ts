/**
 * Channel Selector Service
 *
 * Intelligently selects the best outreach channel (call, text, email) based on:
 * 1. Content Type - What kind of message is this?
 * 2. User Preferences - How do they prefer to be contacted?
 * 3. Historical Success - What's worked before?
 * 4. Time Context - What's appropriate right now?
 * 5. Relationship Stage - How close are we?
 * 6. Urgency - How quickly do we need a response?
 *
 * Philosophy: Right channel for the right message at the right time.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { OutreachPriority, OutreachTriggerType } from './decision-engine.js';
import { loadOutreachProfile, saveOutreachProfile } from './firestore-persistence.js';
import type { OutreachChannel } from './persona-voice-generator.js';
import { getTimingProfile } from './timing-intelligence.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ChannelProfile {
  userId: string;

  // Explicit preferences
  preferences: {
    preferredChannel?: OutreachChannel;
    disabledChannels: OutreachChannel[];
    channelByContent: Partial<Record<ContentType, OutreachChannel>>;
  };

  // Learned patterns
  learning: {
    responseRates: Record<OutreachChannel, number>;
    avgResponseTimes: Record<OutreachChannel, number>;
    satisfactionScores: Record<OutreachChannel, number>;
    totalByChannel: Record<OutreachChannel, number>;
    successfulByChannel: Record<OutreachChannel, number>;
  };

  // Relationship permissions
  relationshipStage: 'new' | 'building' | 'established' | 'deep';
  allowedChannels: OutreachChannel[];

  // Contact availability
  hasPhone: boolean;
  hasEmail: boolean;
}

export type ContentType =
  | 'emotional' // Support, check-ins
  | 'celebration' // Wins, milestones
  | 'reminder' // Commitments, appointments
  | 'information' // Detailed content, resources
  | 'accountability' // Check-ins on commitments
  | 'casual' // Thinking of you, random
  | 'urgent'; // Time-sensitive

export interface ChannelContext {
  triggerType: OutreachTriggerType;
  priority: OutreachPriority;
  contentType: ContentType;
  messageLength?: 'short' | 'medium' | 'long';
  hasAttachment?: boolean;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isWorkHours: boolean;
}

export interface ChannelDecision {
  channel: OutreachChannel;
  confidence: number; // 0-1
  reasoning: string;
  alternatives: Array<{
    channel: OutreachChannel;
    score: number;
    reason: string;
  }>;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_CHANNEL_PROFILE: Omit<ChannelProfile, 'userId'> = {
  preferences: {
    disabledChannels: [],
    channelByContent: {},
  },

  learning: {
    responseRates: {
      sms: 0.5,
      email: 0.3,
      call: 0.2,
      voice_message: 0.2,
      push: 0.4,
    },
    avgResponseTimes: {
      sms: 30 * 60 * 1000, // 30 min
      email: 4 * 60 * 60 * 1000, // 4 hours
      call: 0, // Immediate
      voice_message: 60 * 60 * 1000, // 1 hour
      push: 15 * 60 * 1000, // 15 min
    },
    satisfactionScores: {
      sms: 0.7,
      email: 0.7,
      call: 0.7,
      voice_message: 0.7,
      push: 0.7,
    },
    totalByChannel: {
      sms: 0,
      email: 0,
      call: 0,
      voice_message: 0,
      push: 0,
    },
    successfulByChannel: {
      sms: 0,
      email: 0,
      call: 0,
      voice_message: 0,
      push: 0,
    },
  },

  relationshipStage: 'new',
  allowedChannels: ['email'],

  hasPhone: false,
  hasEmail: false,
};

// Relationship-based channel permissions
const RELATIONSHIP_PERMISSIONS: Record<ChannelProfile['relationshipStage'], OutreachChannel[]> = {
  new: ['email'],
  building: ['email', 'sms'],
  established: ['email', 'sms', 'call'],
  deep: ['email', 'sms', 'call', 'voice_message'],
};

// Content type to ideal channel mapping
const CONTENT_CHANNEL_MAP: Record<ContentType, OutreachChannel[]> = {
  emotional: ['call', 'voice_message', 'sms'],
  celebration: ['call', 'sms', 'email'],
  reminder: ['sms', 'push', 'email'],
  information: ['email', 'sms'],
  accountability: ['sms', 'call'],
  casual: ['sms', 'voice_message'],
  urgent: ['call', 'sms'],
};

// ============================================================================
// STORAGE
// ============================================================================

const channelProfileStore = new Map<string, ChannelProfile>();

// ============================================================================
// CHANNEL SELECTOR SERVICE
// ============================================================================

const log = getLogger().child({ service: 'channel-selector' });

/**
 * Get or create channel profile for a user
 */
export function getChannelProfile(userId: string): ChannelProfile {
  let profile = channelProfileStore.get(userId);
  if (!profile) {
    profile = {
      ...DEFAULT_CHANNEL_PROFILE,
      userId,
    };
    channelProfileStore.set(userId, profile);

    // Async load from Firestore (fire and forget)
    loadChannelProfileFromFirestore(userId).catch(() => {});
  }
  return profile;
}

/**
 * Load channel profile from Firestore
 */
async function loadChannelProfileFromFirestore(userId: string): Promise<void> {
  try {
    const outreachProfile = await loadOutreachProfile(userId);
    if (outreachProfile?.channel) {
      const existing = channelProfileStore.get(userId);
      if (existing) {
        const merged = { ...existing, ...outreachProfile.channel };
        channelProfileStore.set(userId, merged);
        log.debug({ userId }, 'Loaded channel profile from Firestore');
      }
    }
  } catch (err) {
    log.debug({ err, userId }, 'Failed to load channel profile from Firestore');
  }
}

/**
 * Persist channel profile to Firestore
 */
function persistChannelProfile(userId: string, profile: ChannelProfile): void {
  saveOutreachProfile(userId, { channel: profile }).catch((err) => {
    log.debug({ err, userId }, 'Failed to persist channel profile (non-fatal)');
  });
}

/**
 * Update channel preferences
 */
export function updateChannelPreferences(
  userId: string,
  preferences: Partial<ChannelProfile['preferences']>
): void {
  const profile = getChannelProfile(userId);
  profile.preferences = { ...profile.preferences, ...preferences };
  channelProfileStore.set(userId, profile);
  persistChannelProfile(userId, profile);
  log.debug({ userId, preferences }, 'Channel preferences updated');
}

/**
 * Update contact availability
 */
export function updateContactAvailability(
  userId: string,
  availability: { hasPhone?: boolean; hasEmail?: boolean }
): void {
  const profile = getChannelProfile(userId);
  if (availability.hasPhone !== undefined) {
    profile.hasPhone = availability.hasPhone;
  }
  if (availability.hasEmail !== undefined) {
    profile.hasEmail = availability.hasEmail;
  }
  channelProfileStore.set(userId, profile);
  persistChannelProfile(userId, profile);
}

/**
 * Update relationship stage (affects allowed channels)
 */
export function updateRelationshipStage(
  userId: string,
  stage: ChannelProfile['relationshipStage']
): void {
  const profile = getChannelProfile(userId);
  profile.relationshipStage = stage;
  profile.allowedChannels = RELATIONSHIP_PERMISSIONS[stage];
  channelProfileStore.set(userId, profile);
  persistChannelProfile(userId, profile);
  log.debug(
    { userId, stage, allowedChannels: profile.allowedChannels },
    'Relationship stage updated'
  );
}

// ============================================================================
// LEARNING FROM OUTCOMES
// ============================================================================

/**
 * Record the outcome of an outreach for learning
 */
export function recordOutreachOutcome(
  userId: string,
  data: {
    channel: OutreachChannel;
    gotResponse: boolean;
    responseTimeMs?: number;
    userSatisfaction?: 'positive' | 'neutral' | 'negative';
  }
): void {
  const profile = getChannelProfile(userId);

  // Update totals
  profile.learning.totalByChannel[data.channel]++;
  if (data.gotResponse) {
    profile.learning.successfulByChannel[data.channel]++;
  }

  // Update response rate (exponential smoothing)
  const currentRate = profile.learning.responseRates[data.channel];
  const newRate = data.gotResponse ? currentRate * 0.8 + 0.2 : currentRate * 0.9;
  profile.learning.responseRates[data.channel] = newRate;

  // Update response time
  if (data.responseTimeMs !== undefined) {
    const currentTime = profile.learning.avgResponseTimes[data.channel];
    profile.learning.avgResponseTimes[data.channel] = currentTime * 0.8 + data.responseTimeMs * 0.2;
  }

  // Update satisfaction
  if (data.userSatisfaction) {
    const satisfactionDelta =
      data.userSatisfaction === 'positive' ? 0.1 : data.userSatisfaction === 'negative' ? -0.1 : 0;
    const currentSatisfaction = profile.learning.satisfactionScores[data.channel];
    profile.learning.satisfactionScores[data.channel] = Math.max(
      0,
      Math.min(1, currentSatisfaction + satisfactionDelta)
    );
  }

  channelProfileStore.set(userId, profile);

  log.debug(
    {
      userId,
      channel: data.channel,
      gotResponse: data.gotResponse,
      newResponseRate: profile.learning.responseRates[data.channel],
    },
    'Recorded outreach outcome'
  );
}

// ============================================================================
// CHANNEL SELECTION
// ============================================================================

/**
 * Select the optimal channel for an outreach
 */
export function selectChannel(userId: string, context: ChannelContext): ChannelDecision {
  const profile = getChannelProfile(userId);
  const timingProfile = getTimingProfile(userId);

  // Step 1: Get available channels
  const available = getAvailableChannels(profile);
  if (available.length === 0) {
    return {
      channel: 'email', // Fallback
      confidence: 0.1,
      reasoning: 'No channels available',
      alternatives: [],
    };
  }

  // Step 2: Score each channel
  const scored = available.map((channel) => ({
    channel,
    score: scoreChannel(channel, profile, context, timingProfile),
    reason: generateChannelReason(channel, context),
  }));

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const alternatives = scored.slice(1, 4);

  log.debug(
    {
      userId,
      contentType: context.contentType,
      priority: context.priority,
      selectedChannel: best.channel,
      score: best.score,
    },
    'Selected channel'
  );

  return {
    channel: best.channel,
    confidence: best.score,
    reasoning: best.reason,
    alternatives,
  };
}

function getAvailableChannels(profile: ChannelProfile): OutreachChannel[] {
  // Start with relationship-allowed channels
  let channels = [...profile.allowedChannels];

  // Filter out disabled channels
  channels = channels.filter((c) => !profile.preferences.disabledChannels.includes(c));

  // Filter by contact availability
  channels = channels.filter((c) => {
    if (c === 'sms' || c === 'call' || c === 'voice_message') {
      return profile.hasPhone;
    }
    if (c === 'email') {
      return profile.hasEmail;
    }
    return true;
  });

  return channels;
}

function scoreChannel(
  channel: OutreachChannel,
  profile: ChannelProfile,
  context: ChannelContext,
  _timingProfile: ReturnType<typeof getTimingProfile>
): number {
  let score = 0.5; // Base score

  // Factor 1: User preference (+0.2)
  if (profile.preferences.preferredChannel === channel) {
    score += 0.2;
  }

  // Factor 2: Content-specific preference (+0.15)
  if (profile.preferences.channelByContent[context.contentType] === channel) {
    score += 0.15;
  }

  // Factor 3: Content type fit (+0.15)
  const idealChannels = CONTENT_CHANNEL_MAP[context.contentType] || [];
  const idealIndex = idealChannels.indexOf(channel);
  if (idealIndex === 0) {
    score += 0.15;
  } else if (idealIndex > 0) {
    score += 0.1 - idealIndex * 0.02;
  }

  // Factor 4: Historical response rate (+0.15)
  score += profile.learning.responseRates[channel] * 0.15;

  // Factor 5: Satisfaction score (+0.1)
  score += profile.learning.satisfactionScores[channel] * 0.1;

  // Factor 6: Priority alignment (+0.1)
  if (context.priority === 'urgent' && (channel === 'call' || channel === 'sms')) {
    score += 0.1;
  }
  if (context.priority === 'low' && channel === 'email') {
    score += 0.05;
  }

  // Factor 7: Time of day appropriateness (+0.05)
  score += getTimeAppropriateness(channel, context.timeOfDay, context.isWorkHours) * 0.05;

  // Factor 8: Message length fit (+0.05)
  if (context.messageLength) {
    if (context.messageLength === 'short' && channel === 'sms') {
      score += 0.05;
    } else if (context.messageLength === 'long' && channel === 'email') {
      score += 0.05;
    }
  }

  // Normalize
  return Math.min(1, Math.max(0, score));
}

function getTimeAppropriateness(
  channel: OutreachChannel,
  timeOfDay: ChannelContext['timeOfDay'],
  isWorkHours: boolean
): number {
  // Calls are best during reasonable hours
  if (channel === 'call') {
    if (timeOfDay === 'morning' || timeOfDay === 'afternoon') return 1;
    if (timeOfDay === 'evening') return 0.7;
    return 0.2; // Night
  }

  // Texts are fairly flexible
  if (channel === 'sms') {
    if (timeOfDay === 'night') return 0.5;
    return 0.9;
  }

  // Email is best during work hours
  if (channel === 'email') {
    if (isWorkHours) return 1;
    return 0.6;
  }

  return 0.7; // Default
}

function generateChannelReason(channel: OutreachChannel, context: ChannelContext): string {
  const reasons: string[] = [];

  // Content type reason
  const idealChannels = CONTENT_CHANNEL_MAP[context.contentType];
  if (idealChannels && idealChannels[0] === channel) {
    reasons.push(`best for ${context.contentType} content`);
  }

  // Priority reason
  if (context.priority === 'urgent' && (channel === 'call' || channel === 'sms')) {
    reasons.push('urgent priority needs immediate channel');
  }

  // Time reason
  if (
    channel === 'call' &&
    (context.timeOfDay === 'morning' || context.timeOfDay === 'afternoon')
  ) {
    reasons.push('good time for calls');
  }

  if (channel === 'email' && context.isWorkHours) {
    reasons.push('work hours - email likely to be seen');
  }

  if (reasons.length === 0) {
    reasons.push('best available option');
  }

  return reasons.join(', ');
}

// ============================================================================
// CONTENT TYPE DETECTION
// ============================================================================

/**
 * Determine content type from trigger type
 */
export function getContentTypeFromTrigger(triggerType: OutreachTriggerType): ContentType {
  const mapping: Record<OutreachTriggerType, ContentType> = {
    commitment_check: 'accountability',
    goal_milestone: 'celebration',
    streak_at_risk: 'accountability',
    streak_celebration: 'celebration',
    goal_progress: 'celebration',
    habit_check: 'accountability',
    appointment_reminder: 'reminder',
    event_countdown: 'reminder',
    milestone_approaching: 'reminder',
    emotional_support: 'emotional',
    celebration: 'celebration',
    concern_check: 'emotional',
    reengagement: 'casual',
    thinking_of_you: 'casual',
    follow_up: 'accountability',
    accountability: 'accountability',
    content_share: 'information',
    insight_discovery: 'information',
    pattern_acknowledgment: 'casual',
    scheduled: 'reminder',
    seasonal: 'casual',
    anniversary: 'celebration',
  };

  return mapping[triggerType] || 'casual';
}

/**
 * Determine time of day
 */
export function getTimeOfDay(date: Date = new Date()): ChannelContext['timeOfDay'] {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Check if work hours
 */
export function isWorkHours(date: Date = new Date()): boolean {
  const hour = date.getHours();
  const day = date.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isWorkTime = hour >= 9 && hour < 17;
  return isWeekday && isWorkTime;
}

// ============================================================================
// MULTI-CHANNEL SEQUENCES
// ============================================================================

export interface ChannelSequence {
  id: string;
  name: string;
  steps: ChannelSequenceStep[];
}

export interface ChannelSequenceStep {
  channel: OutreachChannel;
  delayMs: number; // Delay from previous step
  condition?: 'noResponse' | 'voicemail' | 'always';
  messageVariant?: string;
}

/**
 * Pre-defined sequences for different scenarios
 */
export const CHANNEL_SEQUENCES: Record<string, ChannelSequence> = {
  urgent_accountability: {
    id: 'urgent_accountability',
    name: 'Urgent Accountability',
    steps: [
      { channel: 'sms', delayMs: 0, condition: 'always' },
      { channel: 'call', delayMs: 30 * 60 * 1000, condition: 'noResponse' },
      { channel: 'voice_message', delayMs: 0, condition: 'voicemail' },
    ],
  },

  celebration: {
    id: 'celebration',
    name: 'Celebration',
    steps: [
      { channel: 'call', delayMs: 0, condition: 'always' },
      { channel: 'sms', delayMs: 0, condition: 'voicemail' },
      {
        channel: 'email',
        delayMs: 24 * 60 * 60 * 1000,
        condition: 'always',
        messageVariant: 'followup',
      },
    ],
  },

  gentle_reengagement: {
    id: 'gentle_reengagement',
    name: 'Gentle Re-engagement',
    steps: [
      { channel: 'sms', delayMs: 0, condition: 'always' },
      { channel: 'email', delayMs: 3 * 24 * 60 * 60 * 1000, condition: 'noResponse' },
      { channel: 'call', delayMs: 7 * 24 * 60 * 60 * 1000, condition: 'noResponse' },
    ],
  },

  emotional_support: {
    id: 'emotional_support',
    name: 'Emotional Support',
    steps: [
      { channel: 'call', delayMs: 0, condition: 'always' },
      { channel: 'voice_message', delayMs: 0, condition: 'voicemail' },
      { channel: 'sms', delayMs: 60 * 60 * 1000, condition: 'noResponse' },
    ],
  },
};

/**
 * Get recommended sequence for a trigger type
 */
export function getRecommendedSequence(
  triggerType: OutreachTriggerType,
  priority: OutreachPriority
): ChannelSequence | null {
  // Urgent accountability
  if (triggerType === 'accountability' && priority === 'urgent') {
    return CHANNEL_SEQUENCES.urgent_accountability;
  }

  // Celebrations deserve calls
  if (triggerType === 'celebration') {
    return CHANNEL_SEQUENCES.celebration;
  }

  // Emotional support
  if (triggerType === 'emotional_support') {
    return CHANNEL_SEQUENCES.emotional_support;
  }

  // Re-engagement
  if (triggerType === 'reengagement') {
    return CHANNEL_SEQUENCES.gentle_reengagement;
  }

  // Default: no sequence, single channel
  return null;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function clearUserChannelData(userId: string): void {
  channelProfileStore.delete(userId);
  log.debug({ userId }, 'Cleared channel data');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getChannelProfile,
  updateChannelPreferences,
  updateContactAvailability,
  updateRelationshipStage,
  recordOutreachOutcome,
  selectChannel,
  getContentTypeFromTrigger,
  getTimeOfDay,
  isWorkHours,
  getRecommendedSequence,
  CHANNEL_SEQUENCES,
  clearUserChannelData,
};
