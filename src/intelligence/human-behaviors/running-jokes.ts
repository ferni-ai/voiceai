/**
 * Running Jokes System
 *
 * Manages running jokes and callbacks that build relationship over time.
 * Loads rich content from persona bundles (running-jokes.json).
 *
 * @module intelligence/human-behaviors/running-jokes
 */

import type { UserProfile } from '../../types/user-profile.js';
import { loadPersonaContent } from '../../services/persona-content-loader.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'running-jokes' });

// ============================================================================
// TYPES
// ============================================================================

export interface RunningJoke {
  id: string;
  setup: string;
  callback: string;
  context: string;
  usageCount: number;
  lastUsed?: Date;
}

/** Schema for running-jokes.json */
interface RunningJokesContent {
  recurring_topic_callbacks?: {
    affectionate_teasing?: string[];
    patterns_noticed?: string[];
    shared_history?: string[];
  };
  developing_references?: {
    catchphrase_adoption?: string[];
    inside_jokes?: string[];
    milestone_callbacks?: string[];
  };
  personality_quirk_recognition?: {
    affectionate?: string[];
    gentle_ribbing?: string[];
  };
  relationship_markers?: {
    early_relationship?: { threshold_sessions: number; phrases: string[] };
    established_relationship?: { threshold_sessions: number; phrases: string[] };
    deep_relationship?: { threshold_sessions: number; phrases: string[] };
  };
  usage_rules?: {
    callback_probability?: number;
    min_occurrences_to_reference?: number;
    affectionate_teasing_requires?: string;
    avoid_when?: string[];
  };
}

// Cache for loaded content
let contentCache: Record<string, RunningJokesContent | null> = {};

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadRunningJokesContent(personaId: string): Promise<RunningJokesContent | null> {
  if (contentCache[personaId] !== undefined) {
    return contentCache[personaId];
  }

  try {
    const content = await loadPersonaContent<RunningJokesContent>(personaId, 'running_jokes');
    contentCache[personaId] = content;
    if (content) {
      log.debug({ personaId }, 'Loaded running jokes content from bundle');
    }
    return content;
  } catch (err) {
    log.debug({ personaId, error: String(err) }, 'Could not load running jokes content');
    contentCache[personaId] = null;
    return null;
  }
}

// ============================================================================
// JOKE RETRIEVAL
// ============================================================================

/**
 * Get a running joke callback if appropriate.
 * Now loads rich content from persona bundles with relationship-aware callbacks.
 */
export async function getRunningJokeCallbackAsync(
  profile: UserProfile | null,
  currentTopic: string,
  personaId = 'ferni'
): Promise<{ phrase: string; type: 'callback' | 'teasing' | 'pattern' | 'marker' } | null> {
  if (!profile || profile.totalConversations < 2) return null;

  const content = await loadRunningJokesContent(personaId);
  if (!content) return null;

  const sessionCount = profile.totalConversations || 0;
  const rules = content.usage_rules || {};
  const probability = rules.callback_probability || 0.3;

  // Check usage rules
  if (rules.avoid_when?.some((condition) => currentTopic.toLowerCase().includes(condition))) {
    return null;
  }

  // Random chance check
  if (Math.random() > probability) return null;

  // Try relationship markers first (most powerful)
  const markers = content.relationship_markers;
  if (markers) {
    if (markers.deep_relationship && sessionCount >= markers.deep_relationship.threshold_sessions) {
      const phrase = pickRandom(markers.deep_relationship.phrases);
      if (phrase) return { phrase, type: 'marker' };
    } else if (
      markers.established_relationship &&
      sessionCount >= markers.established_relationship.threshold_sessions
    ) {
      const phrase = pickRandom(markers.established_relationship.phrases);
      if (phrase) return { phrase, type: 'marker' };
    } else if (
      markers.early_relationship &&
      sessionCount >= markers.early_relationship.threshold_sessions
    ) {
      const phrase = pickRandom(markers.early_relationship.phrases);
      if (phrase) return { phrase, type: 'marker' };
    }
  }

  // Try affectionate teasing (requires established relationship)
  if (
    sessionCount >= 10 &&
    content.recurring_topic_callbacks?.affectionate_teasing &&
    Math.random() < 0.2
  ) {
    const template = pickRandom(content.recurring_topic_callbacks.affectionate_teasing);
    if (template) {
      // Template variables like {trait}, {topic} would need to be filled by caller
      return { phrase: template, type: 'teasing' };
    }
  }

  // Try pattern noticed callbacks
  if (content.recurring_topic_callbacks?.patterns_noticed && Math.random() < 0.15) {
    const phrase = pickRandom(content.recurring_topic_callbacks.patterns_noticed);
    if (phrase) return { phrase, type: 'pattern' };
  }

  // Try shared history callbacks
  if (sessionCount >= 5 && content.recurring_topic_callbacks?.shared_history && Math.random() < 0.2) {
    const phrase = pickRandom(content.recurring_topic_callbacks.shared_history);
    if (phrase) return { phrase, type: 'callback' };
  }

  return null;
}

/**
 * Synchronous version for backward compatibility (uses fallback only)
 * @deprecated Use getRunningJokeCallbackAsync instead
 */
export function getRunningJokeCallback(
  profile: UserProfile | null,
  currentTopic: string,
  _personaId?: string
): { joke: string; isCallback: boolean } | null {
  if (!profile || profile.totalConversations < 2) return null;

  // Simple fallback - prefer async version for rich content
  if (profile.totalConversations >= 10 && Math.random() < 0.1) {
    return {
      joke: "There's that thing you do again... I'm starting to recognize it.",
      isCallback: true,
    };
  }

  return null;
}

function pickRandom<T>(arr: T[] | undefined): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export default getRunningJokeCallback;
