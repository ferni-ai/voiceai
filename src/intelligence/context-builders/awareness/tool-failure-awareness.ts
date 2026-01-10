/**
 * Tool Failure Awareness Context Builder
 *
 * When tools fail (music playback, weather lookup, phone calls, etc.),
 * this builder surfaces the failure to the LLM so Ferni can acknowledge
 * it naturally instead of pretending nothing happened.
 *
 * Example failures and suggested acknowledgments:
 * - Music failed: "Having some trouble with Spotify - let me try again"
 * - Weather failed: "Hmm, couldn't get the weather right now"
 * - Call failed: "I wasn't able to reach them - want to try again?"
 *
 * Philosophy: Honesty builds trust. When something doesn't work,
 * acknowledge it warmly rather than ignoring it.
 *
 * @module intelligence/context-builders/awareness/tool-failure-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHighInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { getRedisCache } from '../../../memory/redis-cache.js';

const log = createLogger({ module: 'context:tool-failure-awareness' });

// ============================================================================
// TOOL FAILURE ACKNOWLEDGMENT TEMPLATES
// ============================================================================

interface FailureTemplate {
  acknowledgment: string;
  offerRetry: boolean;
}

const FAILURE_TEMPLATES: Record<string, FailureTemplate> = {
  // Music/Spotify
  playMusic: {
    acknowledgment: "Having some trouble with Spotify right now. Let me try that again.",
    offerRetry: true,
  },
  pauseMusic: {
    acknowledgment: "Couldn't pause the music - might be a connection hiccup.",
    offerRetry: true,
  },
  resumeMusic: {
    acknowledgment: "Music isn't cooperating. Give me a second.",
    offerRetry: true,
  },

  // Weather
  getWeather: {
    acknowledgment: "Hmm, couldn't get the weather right now.",
    offerRetry: false,
  },

  // Calls
  makeCall: {
    acknowledgment: "I wasn't able to complete that call.",
    offerRetry: true,
  },
  sendMessage: {
    acknowledgment: "That message didn't go through.",
    offerRetry: true,
  },

  // Calendar
  createEvent: {
    acknowledgment: "Couldn't add that to your calendar.",
    offerRetry: true,
  },
  getCalendar: {
    acknowledgment: "Having trouble pulling up your calendar.",
    offerRetry: true,
  },

  // Reminders/Tasks
  setReminder: {
    acknowledgment: "That reminder didn't save.",
    offerRetry: true,
  },
  createTask: {
    acknowledgment: "Couldn't create that task.",
    offerRetry: true,
  },

  // Research
  webSearch: {
    acknowledgment: "Search isn't working right now.",
    offerRetry: false,
  },

  // Default
  default: {
    acknowledgment: "That didn't work as expected.",
    offerRetry: true,
  },
};

// ============================================================================
// FAILURE FORMATTER
// ============================================================================

function formatFailureForLLM(
  failures: Array<{
    toolName: string;
    error: string;
    timestamp: string;
    attemptedAction?: string;
  }>
): string {
  if (failures.length === 0) return '';

  const parts: string[] = ['[TOOL FAILURE - ACKNOWLEDGE HONESTLY]'];

  for (const failure of failures) {
    const template = FAILURE_TEMPLATES[failure.toolName] || FAILURE_TEMPLATES.default;

    parts.push(`\n${failure.toolName} failed${failure.attemptedAction ? ` (tried to: ${failure.attemptedAction})` : ''}`);
    parts.push(`→ Say something like: "${template.acknowledgment}"`);

    if (template.offerRetry) {
      parts.push(`→ You can offer to try again if they want`);
    }
  }

  parts.push(`
DON'T:
- Pretend it worked
- Over-apologize ("I'm so sorry, I failed you")
- Get technical ("There was an API timeout")

DO:
- Acknowledge briefly and naturally
- Offer to try again if appropriate
- Move on without dwelling`);

  return parts.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildToolFailureAwareness(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { services } = input;
  const sessionId = services?.sessionId;

  if (!sessionId) {
    return [];
  }

  try {
    const redis = getRedisCache();
    const failures = await redis.getRecentToolFailures(sessionId);

    if (failures.length === 0) {
      return [];
    }

    const formatted = formatFailureForLLM(failures);

    // Clear failures after reading (so we don't keep injecting the same failures)
    await redis.clearToolFailures(sessionId);

    log.debug(
      {
        sessionId,
        failureCount: failures.length,
        tools: failures.map((f) => f.toolName),
      },
      '⚠️ Tool failure awareness injected'
    );

    return [
      createHighInjection('tool_failure_awareness', formatted, {
        priority: 85, // High priority - should be addressed
      }),
    ];
  } catch (error) {
    log.debug({ error: String(error) }, 'Tool failure awareness failed (non-fatal)');
    return [];
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

export const toolFailureAwarenessBuilder: ContextBuilder = {
  name: 'tool-failure-awareness',
  description: 'Surfaces recent tool failures so Ferni can acknowledge them honestly',
  priority: 15, // Early - failures should be addressed promptly
  category: BuilderCategory.CONTEXT,
  build: buildToolFailureAwareness,
};

registerContextBuilder(toolFailureAwarenessBuilder);

export default toolFailureAwarenessBuilder;
