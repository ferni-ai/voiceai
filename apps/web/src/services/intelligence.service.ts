/**
 * Intelligence Service
 *
 * Frontend service for interacting with the Unified Intelligence Layer API.
 * Provides access to:
 * - User intelligence profiles (tool patterns, preferences)
 * - Proactive suggestions
 * - Emotion-aware tool boosts
 * - Outreach triggers
 *
 * @module services/intelligence
 */

import { createLogger } from '../utils/logger';
import { getFirebaseUid } from './firebase-auth.service';

const log = createLogger('IntelligenceService');

// ============================================================================
// TYPES
// ============================================================================

export interface IntelligenceProfile {
  userId: string;
  isReturningUser: boolean;
  preferredDomains: string[];
  anticipatedTools: string[];
  proactiveSuggestions: ProactiveSuggestion[];
  timeContext: string;
  emotionAwareBoosts: EmotionBoost[] | null;
  proactiveOutreach: ProactiveOutreach | null;
}

export interface ProactiveSuggestion {
  toolId: string;
  reason: string;
  confidence?: number;
  triggerPhrase?: string;
}

export interface EmotionBoost {
  tools: string[];
  reason: string;
  boostAmount: number;
}

export interface ProactiveOutreach {
  shouldTrigger: boolean;
  type: 'habit_reminder' | 'engagement_nudge' | 'pattern_insight';
  suggestedMessage?: string;
  confidence?: number;
}

export interface IntelligenceMetrics {
  profileCount: number;
  totalCorrections: number;
  avgToolAffinities: number;
}

export interface VoiceEmotionInput {
  primary: string;
  valence: number;
  arousal: number;
  stressLevel: number;
  anxietyMarkers: boolean;
}

export interface OutreachTriggerResult {
  triggered: boolean;
  messageId?: string;
  type?: string;
  suggestedMessage?: string;
  reason?: string;
}

// ============================================================================
// API HELPERS
// ============================================================================

const API_BASE = '/api/intelligence';

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T | null> {
  const userId = getFirebaseUid();

  if (!userId) {
    log.warn('No user ID available for intelligence API');
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      log.error({ status: response.status, endpoint }, 'Intelligence API error');
      return null;
    }

    return response.json();
  } catch (error) {
    log.error({ error: String(error), endpoint }, 'Intelligence API request failed');
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the user's intelligence profile
 *
 * Returns patterns learned about the user including:
 * - Preferred domains
 * - Anticipated tools
 * - Proactive suggestions
 */
export async function getIntelligenceProfile(): Promise<IntelligenceProfile | null> {
  log.debug('Fetching intelligence profile');
  return apiRequest<IntelligenceProfile>('/profile');
}

/**
 * Get proactive tool suggestions
 *
 * Returns tools the system thinks would be helpful based on:
 * - Time of day
 * - User patterns
 * - Recent activity
 */
export async function getProactiveSuggestions(): Promise<{
  suggestions: ProactiveSuggestion[];
  anticipatedTools: string[];
  proactiveOutreach: ProactiveOutreach | null;
} | null> {
  log.debug('Fetching proactive suggestions');
  return apiRequest('/suggestions');
}

/**
 * Check emotion-aware tool boosts
 *
 * Given current voice emotion state, returns which tools should be boosted.
 * Used when stress/anxiety is detected to prioritize wellness tools.
 */
export async function checkEmotionBoosts(
  voiceEmotion: VoiceEmotionInput
): Promise<{
  emotionAwareBoosts: EmotionBoost[] | null;
  stressDetected: boolean;
  anxietyDetected: boolean;
} | null> {
  log.debug({ voiceEmotion }, 'Checking emotion boosts');
  return apiRequest('/emotion-boost', {
    method: 'POST',
    body: JSON.stringify({ voiceEmotion }),
  });
}

/**
 * Record response to proactive outreach
 *
 * Tells the intelligence layer whether the user engaged with
 * a proactive message, helping it learn optimal timing.
 */
export async function recordOutreachResponse(responded: boolean): Promise<boolean> {
  log.debug({ responded }, 'Recording outreach response');
  const result = await apiRequest<{ success: boolean }>('/record-outreach-response', {
    method: 'POST',
    body: JSON.stringify({ responded }),
  });
  return result?.success ?? false;
}

/**
 * Trigger proactive outreach check
 *
 * Called when app opens or on schedule to check if
 * the intelligence layer wants to send a proactive message.
 */
export async function triggerOutreachCheck(): Promise<OutreachTriggerResult | null> {
  log.debug('Triggering outreach check');
  return apiRequest<OutreachTriggerResult>('/trigger-outreach', {
    method: 'POST',
  });
}

/**
 * Get intelligence layer metrics (for debugging/admin)
 */
export async function getIntelligenceMetrics(): Promise<IntelligenceMetrics | null> {
  log.debug('Fetching intelligence metrics');
  return apiRequest<IntelligenceMetrics>('/metrics');
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check if a specific tool is anticipated for this session
 */
export async function isToolAnticipated(toolId: string): Promise<boolean> {
  const profile = await getIntelligenceProfile();
  if (!profile) return false;
  return profile.anticipatedTools.includes(toolId);
}

/**
 * Get the top proactive suggestion if any
 */
export async function getTopSuggestion(): Promise<ProactiveSuggestion | null> {
  const result = await getProactiveSuggestions();
  if (!result || result.suggestions.length === 0) return null;
  return result.suggestions[0];
}

/**
 * Check if proactive outreach should be shown
 */
export async function shouldShowOutreach(): Promise<{
  show: boolean;
  message?: string;
  type?: string;
}> {
  const result = await triggerOutreachCheck();
  if (!result || !result.triggered) {
    return { show: false };
  }
  return {
    show: true,
    message: result.suggestedMessage,
    type: result.type,
  };
}

// ============================================================================
// SINGLETON PATTERN FOR CACHING
// ============================================================================

let cachedProfile: IntelligenceProfile | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Get cached intelligence profile (with auto-refresh)
 */
export async function getCachedProfile(): Promise<IntelligenceProfile | null> {
  const now = Date.now();
  if (cachedProfile && now - cacheTime < CACHE_TTL_MS) {
    return cachedProfile;
  }

  cachedProfile = await getIntelligenceProfile();
  cacheTime = now;
  return cachedProfile;
}

/**
 * Invalidate the profile cache (call after significant user actions)
 */
export function invalidateProfileCache(): void {
  cachedProfile = null;
  cacheTime = 0;
}

// Export for testing
export const _internals = {
  apiRequest,
  getCachedProfile,
  invalidateProfileCache,
};

