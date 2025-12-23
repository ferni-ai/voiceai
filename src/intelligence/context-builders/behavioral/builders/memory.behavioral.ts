/**
 * Memory Behavioral Builder
 *
 * Handles memory-related behavioral signals without exposing raw facts.
 * This is the behavioral version of memory/memory.ts
 *
 * OLD: "[MEMORY CALLBACK: They mentioned their dog Max last time...]"
 * NEW: { callbacks: [{ type: 'memory', hint: 'Something meaningful from last conversation could be woven in' }] }
 *
 * The key insight: We don't need to tell the model WHAT the memory is.
 * We just need to tell it WHEN and HOW to reference memories.
 * The actual memory content comes from semantic search at response time.
 *
 * @module intelligence/context-builders/behavioral/builders/memory
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals, CallbackSignal } from '../signals.js';
import { createCallback } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

/**
 * Build memory-related behavioral signals
 */
async function buildMemoryBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userData, userProfile, services, analysis } = input;

  const signals: BehavioralSignals = {
    source: 'memory',
    confidence: 0.7,
    priority: 50,
  };

  const callbacks: CallbackSignal[] = [];
  const turnCount = userData?.turnCount || 0;
  const sessionId = services.sessionId || 'default';

  // =========================================
  // EARLY CONVERSATION: Cross-session memory hint
  // =========================================
  if (turnCount <= 3 && userProfile && userProfile.totalConversations > 1) {
    // Don't tell them WHAT to remember, just hint that there's history
    const hasRecentHistory =
      userProfile.lastContact &&
      Date.now() - new Date(userProfile.lastContact).getTime() < 14 * 24 * 60 * 60 * 1000; // 2 weeks

    if (hasRecentHistory && !userData?.hasReferencedLastConversation) {
      callbacks.push(
        createCallback(
          'memory',
          'You have shared history with this person. If natural, acknowledge you remember them.',
          'natural'
        )
      );
    }
  }

  // =========================================
  // TIME AWARENESS
  // =========================================
  if (turnCount <= 2 && userProfile?.lastContact) {
    const daysSince = Math.floor(
      (Date.now() - new Date(userProfile.lastContact).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince > 7) {
      // It's been a while - hint to acknowledge reconnection
      const timeFrame =
        daysSince > 30 ? 'quite a while' : daysSince > 14 ? 'a couple weeks' : 'over a week';

      callbacks.push(
        createCallback(
          'memory',
          `It's been ${timeFrame}. Consider warmly acknowledging the time gap.`,
          'subtle'
        )
      );
    }
  }

  // =========================================
  // MID-CONVERSATION: Thread callback
  // =========================================
  if (turnCount > 4 && turnCount % 5 === 0) {
    // Every ~5 turns, suggest circling back to earlier topic
    callbacks.push(
      createCallback(
        'thread',
        'Earlier in this conversation, they mentioned something. Could naturally circle back.',
        'subtle'
      )
    );
  }

  // =========================================
  // EMOTIONAL CONTINUITY
  // =========================================
  if (turnCount <= 3 && userProfile?.emotionalPatterns) {
    const hasRecentDistress =
      Array.isArray(userProfile.emotionalPatterns) &&
      userProfile.emotionalPatterns.some(
        (p) => p.emotion === 'distressed' || p.emotion === 'anxious' || p.emotion === 'sad'
      );

    if (hasRecentDistress) {
      callbacks.push(
        createCallback(
          'pattern',
          "They've been going through something. Consider gently checking in.",
          'natural'
        )
      );

      // Adjust tone for emotional continuity
      signals.tone = 'warm';
      signals.style = 'supportive';
    }
  }

  // =========================================
  // GOAL/PROGRESS AWARENESS
  // =========================================
  if (turnCount >= 5 && turnCount <= 10 && userProfile?.goals && userProfile.goals.length > 0) {
    // Mid-conversation opportunity to reference their goals
    if (Math.random() < 0.3) {
      callbacks.push(
        createCallback(
          'milestone',
          'They have goals you know about. If relevant, could check on progress.',
          'subtle'
        )
      );
    }
  }

  // =========================================
  // GROWTH REFLECTION
  // =========================================
  if (userProfile && userProfile.totalConversations > 10 && turnCount > 3 && Math.random() < 0.15) {
    // Occasionally hint at growth/change over time
    callbacks.push(
      createCallback(
        'growth',
        "You've known them a while. If genuine, could reflect on their journey.",
        'subtle'
      )
    );
  }

  // Only add callbacks if we have any
  if (callbacks.length > 0) {
    signals.callbacks = callbacks;
  }

  return signals;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'memory',
  description: 'Memory-related behavioral cues without exposing raw facts',
  priority: 50, // Standard priority
  category: 'memory',
  build: buildMemoryBehavior,
});

export { buildMemoryBehavior };
