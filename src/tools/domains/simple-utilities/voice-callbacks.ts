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
  /** The AgentSession of the call that asked for it, when known. */
  session?: object;
}

type VoiceCallbackHandler = (callback: VoiceCallback) => Promise<void>;

/**
 * Handlers by call. This was one module-level handler plus a queue: in live
 * calls nothing registered it (the registration paths had no callers), so a
 * finished timer sat in the queue and the caller was never told; and with
 * several calls in one process, a registered handler would have spoken every
 * caller's timer into whichever call registered last. Now a callback reaches
 * the call that set it (by session, else by user) or nobody.
 */
const handlersBySession = new WeakMap<object, VoiceCallbackHandler>();
const handlersByUser = new Map<string, VoiceCallbackHandler>();

// ============================================================================
// CALLBACK REGISTRATION
// ============================================================================

/**
 * Register a call's handler. `session` is the call's AgentSession (tools pass
 * it along from their RunContext). Returns the unregister function; call it
 * when the call ends.
 */
export function registerVoiceCallbackHandler(
  userId: string,
  handler: VoiceCallbackHandler,
  session?: object
): () => void {
  handlersByUser.set(userId, handler);
  if (session) handlersBySession.set(session, handler);
  getLogger().info({ userId }, 'Voice callback handler registered');
  return () => unregisterVoiceCallbackHandler(userId, handler, session);
}

/** Remove a call's handler (only if it is still the registered one). */
export function unregisterVoiceCallbackHandler(
  userId: string,
  handler?: VoiceCallbackHandler,
  session?: object
): void {
  if (!handler || handlersByUser.get(userId) === handler) handlersByUser.delete(userId);
  if (session && (!handler || handlersBySession.get(session) === handler)) {
    handlersBySession.delete(session);
  }
}

// ============================================================================
// CALLBACK TRIGGERS
// ============================================================================

/**
 * Speak a callback in the call it belongs to. With no live call for it (the
 * caller hung up), it is logged and dropped: never queued for another call.
 */
export async function triggerVoiceCallback(callback: VoiceCallback): Promise<boolean> {
  const handler =
    (callback.session ? handlersBySession.get(callback.session) : undefined) ??
    handlersByUser.get(callback.userId);
  if (!handler) {
    getLogger().warn(
      { type: callback.type, userId: callback.userId },
      'Voice callback dropped: the caller is not on a call'
    );
    return false;
  }
  getLogger().info({ type: callback.type, userId: callback.userId }, 'Voice callback triggered');
  await handler(callback);
  return true;
}

/**
 * Timer completion callback
 */
export async function onTimerComplete(
  userId: string,
  label: string,
  durationMinutes: number,
  /** The call that set the timer: it rings there, not in the caller's other sessions. */
  session?: object
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
  } else if (
    labelLower.includes('cook') ||
    labelLower.includes('bake') ||
    labelLower.includes('oven') ||
    labelLower.includes('food')
  ) {
    message = `Timer's up for ${label}!`;
    followUpQuestion = 'How did it turn out?';
    sound = 'timer-ding';
  } else if (
    labelLower.includes('focus') ||
    labelLower.includes('work') ||
    labelLower.includes('pomodoro')
  ) {
    message = `Focus session complete!`;
    followUpQuestion = 'Nice work! Ready for a break, or keep the momentum going?';
    sound = 'celebration';
  } else if (
    labelLower.includes('exercise') ||
    labelLower.includes('workout') ||
    labelLower.includes('plank') ||
    labelLower.includes('stretch')
  ) {
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
    session,
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
export function toVoiceResponse(
  text: string,
  options?: {
    emphasis?: 'strong' | 'moderate' | 'reduced';
    rate?: 'slow' | 'medium' | 'fast';
    pitch?: 'low' | 'medium' | 'high';
    breakBefore?: boolean;
    breakAfter?: boolean;
  }
): string {
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
export function speakNumber(
  num: number,
  type: 'currency' | 'ordinal' | 'cardinal' = 'cardinal'
): string {
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
export function speakDuration(minutes: number, seconds = 0): string {
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
