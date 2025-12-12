/**
 * Voice Agent Celebration Events Handler
 *
 * Sends celebration events to frontend based on context injections.
 * Uses fireworks for major achievements (professional, not gamified)
 * Uses sparkles for lighter moments (aha moments, good news)
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/celebration-events-handler
 */

import { log } from '@livekit/agents';

// ============================================================================
// TYPES
// ============================================================================

/** Minimal room interface for publishing data */
interface RoomLike {
  localParticipant?: {
    publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
  };
}

export interface CelebrationContext {
  /** Context injections with category and content */
  injections: Array<{ category: string; content: string }>;
  /** LiveKit room (optional for legacy fallback) */
  room?: RoomLike;
}

export interface CelebrationConfig {
  celebrationType: string;
  effect: 'fireworks' | 'sparkles';
  message?: string;
}

// ============================================================================
// CELEBRATION CONFIG MAP
// ============================================================================

const CELEBRATION_CONFIGS: Record<string, CelebrationConfig> = {
  milestone: {
    celebrationType: 'milestone',
    effect: 'fireworks',
    message: 'Milestone achieved!',
  },
  achievement: {
    celebrationType: 'achievement',
    effect: 'fireworks',
    message: 'Great achievement!',
  },
  aha_moment: { celebrationType: 'aha_moment', effect: 'sparkles' },
  good_news: { celebrationType: 'good_news', effect: 'sparkles' },
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Send celebration events to frontend based on context injections.
 * First tries FrontendPublisher, falls back to legacy room publishing.
 */
export async function sendCelebrationEvents(ctx: CelebrationContext): Promise<void> {
  const { injections, room } = ctx;
  const logger = log();

  // Try FrontendPublisher first
  try {
    const { getFrontendPublisher } = await import('../realtime/index.js');
    const publisher = getFrontendPublisher();

    if (publisher.isConnected()) {
      await publisher.sendCelebrationEvents(injections);
      return;
    }
  } catch (e) {
    // Fall through to legacy approach - publisher not ready
    logger.debug({ error: String(e) }, 'FrontendPublisher not available for celebrations');
  }

  // Legacy fallback
  if (!room?.localParticipant) return;

  for (const injection of injections) {
    const config = CELEBRATION_CONFIGS[injection.category];
    if (config) {
      try {
        const celebrationMessage = JSON.stringify({
          type: 'celebration',
          celebrationType: config.celebrationType,
          effect: config.effect,
          message: config.message,
          timestamp: Date.now(),
        });

        await room.localParticipant.publishData(new TextEncoder().encode(celebrationMessage), {
          reliable: true,
        });

        logger.info(
          { celebrationType: config.celebrationType, effect: config.effect },
          'Sent celebration event to frontend'
        );
      } catch (err) {
        logger.warn({ error: String(err) }, 'Failed to send celebration event');
      }
    }
  }
}

export default sendCelebrationEvents;
