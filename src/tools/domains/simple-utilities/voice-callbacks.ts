/**
 * Voice Callbacks for Simple Utilities
 * 
 * Makes utilities voice-first, not text-first.
 * When a timer completes, Ferni actually SPEAKS to you.
 * 
 * VOICE-FIRST PRINCIPLES:
 * 1. Audio feedback for actions (timer set, timer done)
 * 2. Natural speech patterns, not text dumps
 * 3. Interruptible and conversational
 * 4. Contextual follow-up questions
 */

import { getLogger } from '../../../utils/safe-logger.js';

// ============================================================================
// CALLBACK REGISTRY
// ============================================================================

export type VoiceCallbackType = 
  | 'timer_complete'
  | 'countdown_milestone'
  | 'proactive_suggestion'
  | 'pattern_insight';

export interface VoiceCallback {
  type: VoiceCallbackType;
  userId: string;
  message: string;
  followUpQuestion?: string;
  sound?: 'timer-ding' | 'gentle-chime' | 'celebration' | 'soft-ping';
  priority: 'high' | 'normal' | 'low';
  scheduledFor?: Date;
  context?: Record<string, unknown>;
}

// Registered callback handlers (set by voice agent on init)
let voiceCallbackHandler: ((callback: VoiceCallback) => Promise<void>) | null = null;

// Pending callbacks queue (for when handler not registered yet)
const pendingCallbacks: VoiceCallback[] = [];

// ============================================================================
// CALLBACK REGISTRATION
// ============================================================================

/**
 * Register the voice callback handler (called by voice agent on startup)
 */
export function registerVoiceCallbackHandler(
  handler: (callback: VoiceCallback) => Promise<void>
): void {
  voiceCallbackHandler = handler;
  getLogger().info('Voice callback handler registered');
  
  // Process any pending callbacks
  while (pendingCallbacks.length > 0) {
    const callback = pendingCallbacks.shift()!;
    handler(callback).catch(err => {
      getLogger().error({ err, callback }, 'Failed to process pending callback');
    });
  }
}

/**
 * Unregister the voice callback handler
 */
export function unregisterVoiceCallbackHandler(): void {
  voiceCallbackHandler = null;
}

// ============================================================================
// CALLBACK TRIGGERS
// ============================================================================

/**
 * Trigger a voice callback (speaks to user)
 */
export async function triggerVoiceCallback(callback: VoiceCallback): Promise<void> {
  getLogger().info({ type: callback.type, userId: callback.userId }, 'Voice callback triggered');
  
  if (voiceCallbackHandler) {
    await voiceCallbackHandler(callback);
  } else {
    // Queue for later if handler not registered
    pendingCallbacks.push(callback);
    getLogger().warn('Voice callback handler not registered, queueing callback');
  }
}

/**
 * Timer completion callback
 */
export async function onTimerComplete(
  userId: string,
  label: string,
  durationMinutes: number
): Promise<void> {
  // Build contextual follow-up based on timer type
  let message: string;
  let followUpQuestion: string | undefined;
  let sound: VoiceCallback['sound'] = 'timer-ding';
  
  const labelLower = label.toLowerCase();
  
  if (labelLower.includes('tea') || labelLower.includes('coffee') || labelLower.includes('steep')) {
    message = `Your ${label} is ready!`;
    followUpQuestion = 'Hope it turned out perfect.';
    sound = 'gentle-chime';
  } else if (labelLower.includes('break') || labelLower.includes('rest')) {
    message = `Break time's over!`;
    followUpQuestion = 'Feel refreshed? Ready to dive back in?';
    sound = 'soft-ping';
  } else if (labelLower.includes('cook') || labelLower.includes('bake') || 
             labelLower.includes('oven') || labelLower.includes('food')) {
    message = `Timer's up for ${label}!`;
    followUpQuestion = 'How did it turn out?';
    sound = 'timer-ding';
  } else if (labelLower.includes('focus') || labelLower.includes('work') || 
             labelLower.includes('pomodoro')) {
    message = `Focus session complete!`;
    followUpQuestion = 'Nice work! Ready for a break, or keep the momentum going?';
    sound = 'celebration';
  } else if (labelLower.includes('exercise') || labelLower.includes('workout') ||
             labelLower.includes('plank') || labelLower.includes('stretch')) {
    message = `${label} time is done!`;
    followUpQuestion = 'Great effort! How do you feel?';
    sound = 'celebration';
  } else if (labelLower.includes('meditat') || labelLower.includes('breath')) {
    message = `Your ${label} time has gently ended.`;
    // No follow-up for meditation - let them stay present
    sound = 'gentle-chime';
  } else {
    // Generic timer
    message = `Your ${durationMinutes < 1 ? 'timer' : `${Math.round(durationMinutes)}-minute timer`} is done!`;
    if (label !== 'Timer') {
      message = `${label} timer is done!`;
    }
    followUpQuestion = durationMinutes >= 5 ? 'Everything go okay?' : undefined;
    sound = 'timer-ding';
  }
  
  await triggerVoiceCallback({
    type: 'timer_complete',
    userId,
    message,
    followUpQuestion,
    sound,
    priority: 'high',
    context: { label, durationMinutes },
  });
}

/**
 * Countdown milestone callback (100 days, 1 week, tomorrow, TODAY!)
 */
export async function onCountdownMilestone(
  userId: string,
  event: string,
  daysRemaining: number,
  targetDate: Date
): Promise<void> {
  let message: string;
  let sound: VoiceCallback['sound'] = 'soft-ping';
  let priority: VoiceCallback['priority'] = 'normal';
  
  if (daysRemaining === 0) {
    message = `Today's the day! It's ${event}!`;
    sound = 'celebration';
    priority = 'high';
  } else if (daysRemaining === 1) {
    message = `${event} is tomorrow!`;
    sound = 'gentle-chime';
    priority = 'high';
  } else if (daysRemaining === 7) {
    message = `One week until ${event}!`;
  } else if (daysRemaining === 30) {
    message = `One month until ${event}!`;
  } else if (daysRemaining === 100) {
    message = `100 days until ${event}!`;
    sound = 'celebration';
  } else if (daysRemaining % 50 === 0) {
    message = `${daysRemaining} days until ${event}!`;
  } else {
    // Not a milestone, don't trigger
    return;
  }
  
  await triggerVoiceCallback({
    type: 'countdown_milestone',
    userId,
    message,
    sound,
    priority,
    context: { event, daysRemaining, targetDate: targetDate.toISOString() },
  });
}

/**
 * Proactive suggestion callback
 */
export async function onProactiveSuggestion(
  userId: string,
  suggestion: string,
  context?: Record<string, unknown>
): Promise<void> {
  await triggerVoiceCallback({
    type: 'proactive_suggestion',
    userId,
    message: suggestion,
    sound: 'soft-ping',
    priority: 'low',
    context,
  });
}

/**
 * Pattern insight callback (when we notice something interesting)
 */
export async function onPatternInsight(
  userId: string,
  insight: string,
  context?: Record<string, unknown>
): Promise<void> {
  await triggerVoiceCallback({
    type: 'pattern_insight',
    userId,
    message: insight,
    priority: 'low',
    context,
  });
}

// ============================================================================
// SSML HELPERS (Voice-Optimized Responses)
// ============================================================================

/**
 * Convert a text response to SSML for more natural speech
 */
export function toVoiceResponse(text: string, options?: {
  emphasis?: 'strong' | 'moderate' | 'reduced';
  rate?: 'slow' | 'medium' | 'fast';
  pitch?: 'low' | 'medium' | 'high';
  breakBefore?: boolean;
  breakAfter?: boolean;
}): string {
  let ssml = text;
  
  // Add natural pauses
  if (options?.breakBefore) {
    ssml = `<break time="300ms"/>${ssml}`;
  }
  if (options?.breakAfter) {
    ssml = `${ssml}<break time="300ms"/>`;
  }
  
  // Apply prosody
  const prosodyAttrs: string[] = [];
  if (options?.rate) {
    const rateMap = { slow: '85%', medium: '100%', fast: '115%' };
    prosodyAttrs.push(`rate="${rateMap[options.rate]}"`);
  }
  if (options?.pitch) {
    const pitchMap = { low: '-5%', medium: '+0%', high: '+5%' };
    prosodyAttrs.push(`pitch="${pitchMap[options.pitch]}"`);
  }
  
  if (prosodyAttrs.length > 0) {
    ssml = `<prosody ${prosodyAttrs.join(' ')}>${ssml}</prosody>`;
  }
  
  // Apply emphasis
  if (options?.emphasis) {
    ssml = `<emphasis level="${options.emphasis}">${ssml}</emphasis>`;
  }
  
  return ssml;
}

/**
 * Format a number for natural speech
 */
export function speakNumber(num: number, type: 'currency' | 'ordinal' | 'cardinal' = 'cardinal'): string {
  switch (type) {
    case 'currency':
      return `<say-as interpret-as="currency">$${num.toFixed(2)}</say-as>`;
    case 'ordinal':
      return `<say-as interpret-as="ordinal">${num}</say-as>`;
    default:
      return `<say-as interpret-as="cardinal">${num}</say-as>`;
  }
}

/**
 * Format time for natural speech
 */
export function speakTime(hours: number, minutes: number): string {
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  
  if (minutes === 0) {
    return `${displayHours} ${period}`;
  } else if (minutes < 10) {
    return `${displayHours} oh ${minutes} ${period}`;
  } else {
    return `${displayHours} ${minutes} ${period}`;
  }
}

/**
 * Format duration for natural speech
 */
export function speakDuration(minutes: number, seconds: number = 0): string {
  const parts: string[] = [];
  
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  }
  if (seconds > 0) {
    parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  }
  
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return parts[0] || '0 seconds';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerVoiceCallbackHandler,
  unregisterVoiceCallbackHandler,
  triggerVoiceCallback,
  onTimerComplete,
  onCountdownMilestone,
  onProactiveSuggestion,
  onPatternInsight,
  toVoiceResponse,
  speakNumber,
  speakTime,
  speakDuration,
};

