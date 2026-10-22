/**
 * What push notifications say: each persona's ritual reminders and the streak
 * milestone lines. Moved out of push-notifications.ts unchanged.
 *
 * @module services/push-notification-messages
 */

// ============================================================================
// PERSONA-SPECIFIC MESSAGES
// ============================================================================

export const RITUAL_REMINDER_MESSAGES: Record<string, string[]> = {
  ferni: [
    "How's the sky looking today? Let's do a quick weather check.",
    'Morning! Ready for your sky check?',
    "The Wyoming sky awaits. What's the weather in your world?",
  ],
  maya: [
    'Two minutes is all it takes. Ready for your tiny habit?',
    "Small steps, big results. Time for today's practice!",
    'The compound effect starts now. Your moment awaits.',
  ],
  alex: [
    'Strategic clarity starts with your daily check-in.',
    'Time to align your priorities. Quick strategy moment?',
    "Your morning brief is ready. Let's get focused.",
  ],
  jordan: [
    "Your mind-body connection awaits. Ready for today's practice?",
    'Breathe. Ground. Center. Your moment is here.',
    "Wellness check: How's your body feeling today?",
  ],
  peter: [
    'Wisdom begins with reflection. Time for your daily moment.',
    "The examined life calls. Ready for today's reflection?",
    'A moment of clarity awaits. Your practice time is here.',
  ],
  nayan: [
    'Stress relief starts now. Quick check-in time!',
    'Finding calm in the chaos. Your practice awaits.',
    "Your stress break is here. Let's breathe together.",
  ],
};

export const STREAK_MILESTONE_MESSAGES: Record<number, string> = {
  3: "3 days strong! You're building momentum.",
  7: "One week! You're creating a real habit.",
  14: "Two weeks of consistency. That's powerful.",
  21: '21 days! Science says this is a habit now.',
  30: "A full month! You're unstoppable.",
  50: "50 days! You've transformed your routine.",
  100: "100 days! You're in the top 1% of consistency.",
};
