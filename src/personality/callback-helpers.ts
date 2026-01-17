/**
 * Callback Helpers
 *
 * Helper functions for the callback system ("the smile factor").
 * Creates and manages KeyMoments that represent things users shared
 * that we should follow up on.
 *
 * @module personality/callback-helpers
 */

import type { KeyMoment, UserProfile } from '../types/user-profile.js';

// ============================================================================
// CALLBACK CREATION
// ============================================================================

/**
 * Create a KeyMoment for callback from user's message
 * This integrates with the existing KeyMoment retrieval system
 */
export function createCallbackKeyMoment(
  what: string,
  options: {
    type?: KeyMoment['type'];
    emotionalWeight?: KeyMoment['emotionalWeight'];
    topics?: string[];
    followUpDate?: Date;
  } = {}
): KeyMoment {
  return {
    id: `km_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    type: options.type ?? 'concern',
    summary: what,
    emotionalWeight: options.emotionalWeight ?? 'medium',
    topics: options.topics ?? [],
    followUpNeeded: true,
    followUpDate: options.followUpDate,
  };
}

/**
 * Extract callback-worthy moments from user message
 * Returns KeyMoments that can be added to the user's profile
 */
export function extractCallbackKeyMoments(userMessage: string): KeyMoment[] {
  const keyMoments: KeyMoment[] = [];

  // Upcoming events
  const eventPatterns = [
    /(?:have|got)\s+(?:a|an)\s+(\w+(?:\s+\w+)?)\s+(?:on|this|next)\s+(\w+day)/i,
    /(?:interview|meeting|presentation|recital|exam)\s+(?:on|this|next|tomorrow)/i,
  ];

  for (const pattern of eventPatterns) {
    if (pattern.test(userMessage)) {
      keyMoments.push(
        createCallbackKeyMoment(userMessage.slice(0, 100), {
          type: 'milestone',
          emotionalWeight: 'medium',
          followUpDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
        })
      );
      break;
    }
  }

  // Difficult conversations / decisions
  const decisionPatterns = [
    /(?:need to|have to|going to)\s+(?:talk|speak|tell|confront)/i,
    /(?:thinking about|considering|might)\s+(?:quitting|leaving|changing|starting)/i,
  ];

  for (const pattern of decisionPatterns) {
    if (pattern.test(userMessage)) {
      keyMoments.push(
        createCallbackKeyMoment(userMessage.slice(0, 100), {
          type: 'decision',
          emotionalWeight: 'heavy',
        })
      );
      break;
    }
  }

  // Shared vulnerability
  if (/(?:never told|hard to say|between us|this is personal|vulnerable)/i.test(userMessage)) {
    keyMoments.push(
      createCallbackKeyMoment(userMessage.slice(0, 100), {
        type: 'shared_vulnerability',
        emotionalWeight: 'heavy',
      })
    );
  }

  // Celebrations
  if (/(?:finally|just)\s+(?:finished|completed|did|passed|got)/i.test(userMessage)) {
    keyMoments.push(
      createCallbackKeyMoment(userMessage.slice(0, 100), {
        type: 'celebration',
        emotionalWeight: 'light',
        followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
      })
    );
  }

  return keyMoments;
}

// ============================================================================
// CALLBACK RETRIEVAL
// ============================================================================

/**
 * Get pending callbacks from user's key moments
 */
export function getPendingCallbacksFromProfile(
  profile: UserProfile
): Array<{ moment: KeyMoment; question: string }> {
  const keyMoments = profile.keyMoments || [];
  const pending: Array<{ moment: KeyMoment; question: string }> = [];

  for (const moment of keyMoments) {
    if (!moment.followUpNeeded) continue;

    // Check if follow-up date has passed
    if (moment.followUpDate && new Date(moment.followUpDate) > new Date()) {
      continue;
    }

    // Generate follow-up question based on type
    let question: string;
    switch (moment.type) {
      case 'milestone':
        question = `How did that go? The ${moment.topics[0] || 'thing you mentioned'}?`;
        break;
      case 'decision':
        question = 'Any movement on that decision you were thinking about?';
        break;
      case 'shared_vulnerability':
        question = 'How are you doing with that? The thing you shared with me?';
        break;
      case 'celebration':
        question = 'Still riding that win? You should be proud!';
        break;
      case 'concern':
        question = 'How are things going? You mentioned something was weighing on you.';
        break;
      case 'breakthrough':
        question = 'Has that insight stuck with you? The breakthrough you had?';
        break;
      default:
        question = `How's that thing going that you mentioned?`;
    }

    pending.push({ moment, question });
  }

  // Sort by emotional weight (heavy first) then by date (older first)
  pending.sort((a, b) => {
    const weightOrder = { heavy: 0, medium: 1, light: 2 };
    const weightDiff =
      weightOrder[a.moment.emotionalWeight] - weightOrder[b.moment.emotionalWeight];
    if (weightDiff !== 0) return weightDiff;

    return new Date(a.moment.timestamp).getTime() - new Date(b.moment.timestamp).getTime();
  });

  return pending;
}

// ============================================================================
// CALLBACK FORMATTING
// ============================================================================

/**
 * Format a callback for prompt injection
 */
export function formatCallbackForPrompt(callback: { moment: KeyMoment; question: string }): string {
  const transitions = [
    'Hey, before we get into anything—',
    'I was thinking about you—',
    'Quick thing—',
    '',
  ];

  const transition = transitions[Math.floor(Math.random() * transitions.length)];

  return [
    '[💝 CALLBACK OPPORTUNITY - THE SMILE FACTOR]',
    '',
    'You have something to follow up on with this person:',
    '',
    `Original context: "${callback.moment.summary}"`,
    `Type: ${callback.moment.type}`,
    `Follow-up question: "${callback.question}"`,
    `Suggested transition: "${transition}"`,
    '',
    'This is what makes people feel LOVED - that you remembered.',
    "Only bring this up if it feels natural. Don't force it.",
    'But this is GOLD. Use it.',
  ].join('\n');
}
