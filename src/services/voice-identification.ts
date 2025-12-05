/**
 * Voice Identification Service
 *
 * Combines device-based identification with voice memory for a natural
 * "your voice sounds familiar" experience. This is the main entry point
 * for identifying users in a voice-first way.
 *
 * Flow:
 * 1. Check device_id (instant, same device)
 * 2. If device match, optionally verify voice matches
 * 3. If no device match, search by voice
 * 4. Present natural confirmation UX
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile, VoiceSketch } from '../types/user-profile.js';
import { identifyFromMetadata, type IdentificationResult } from './user-identification.js';
import {
  getVoiceMemory,
  compareVoiceSketches,
  type VoiceSearchResult,
  type VoiceSimilarityResult,
} from './voice-memory.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of voice-enhanced identification
 */
export interface VoiceIdentificationResult {
  // Core identification
  userId: string;
  profile: UserProfile | null;
  isNew: boolean;
  isReturning: boolean;

  // How they were identified
  identificationMethod: 'device' | 'voice' | 'both' | 'anonymous';

  // Voice analysis results
  voice?: {
    hasSketch: boolean; // Does user have stored voice sketch?
    matchConfidence: number; // How well current voice matches stored
    needsEnrollment: boolean; // Should we build a voice sketch?
    possibleMatches?: VoiceSearchResult[]; // Other profiles this voice matches
  };

  // What action the agent should take
  suggestedAction:
    | 'greet_by_name' // Known user, confident
    | 'verify_identity' // Voice mismatch, ask to confirm
    | 'suggest_identity' // Voice match found, ask to confirm
    | 'ask_name' // New user, get their name
    | 'enroll_voice'; // Known user, no voice sketch yet

  // Natural language prompt for the agent
  contextForAgent: string;
}

/**
 * Voice verification result (for existing users)
 */
export interface VoiceVerificationResult {
  isMatch: boolean;
  confidence: number;
  matchingFeatures: string[];
  divergentFeatures: string[];
  suggestedAction: 'proceed' | 'ask_verification' | 'likely_different_person';
}

// ============================================================================
// THRESHOLDS
// ============================================================================

const VOICE_MATCH_THRESHOLD = 0.75; // Consider it the same person
const VOICE_SUGGEST_THRESHOLD = 0.6; // "Your voice sounds familiar..."
const VOICE_MISMATCH_THRESHOLD = 0.4; // Definitely not the same person

// ============================================================================
// MAIN IDENTIFICATION
// ============================================================================

/**
 * Identify a user using device ID and voice characteristics
 *
 * @param metadata - Job metadata containing device_id, user_name, etc.
 * @param store - Memory store for profile lookup
 * @param currentVoiceSketch - Optional voice sketch from current session
 */
export async function identifyWithVoice(
  metadata: Record<string, unknown>,
  store: {
    getProfile: (userId: string) => Promise<UserProfile | null>;
    listProfiles: (options?: { limit?: number }) => Promise<UserProfile[]>;
  },
  currentVoiceSketch?: VoiceSketch | null
): Promise<VoiceIdentificationResult> {
  // Step 1: Try device-based identification
  const deviceResult = await identifyFromMetadata(metadata);

  getLogger().info(
    {
      userId: deviceResult.userId,
      source: deviceResult.source.type,
      isNew: deviceResult.isNew,
      hasVoiceSketch: !!currentVoiceSketch,
    },
    'Device identification result'
  );

  // Step 2: If we have a profile, check if voice matches
  if (deviceResult.profile && currentVoiceSketch) {
    return await handleKnownDevice(deviceResult, currentVoiceSketch, store);
  }

  // Step 3: If no profile but we have voice, search by voice
  if (deviceResult.isNew && currentVoiceSketch) {
    return await handleNewDeviceWithVoice(deviceResult, currentVoiceSketch, store);
  }

  // Step 4: No profile, no voice yet - pure new user or returning without voice
  if (deviceResult.profile) {
    // Known device, no voice sketch yet
    return {
      userId: deviceResult.userId,
      profile: deviceResult.profile,
      isNew: false,
      isReturning: deviceResult.isReturning,
      identificationMethod: 'device',
      voice: {
        hasSketch: !!deviceResult.profile.voiceSketch,
        matchConfidence: 0,
        needsEnrollment: !deviceResult.profile.voiceSketch,
      },
      suggestedAction: deviceResult.profile.name ? 'greet_by_name' : 'ask_name',
      contextForAgent: buildContextForAgent(deviceResult.profile, 'device_match'),
    };
  }

  // Completely new user
  return {
    userId: deviceResult.userId,
    profile: null,
    isNew: true,
    isReturning: false,
    identificationMethod: 'anonymous',
    voice: {
      hasSketch: false,
      matchConfidence: 0,
      needsEnrollment: true,
    },
    suggestedAction: 'ask_name',
    contextForAgent: 'New user - no prior conversations. Ask for their name naturally.',
  };
}

/**
 * Handle case where device is recognized (returning on same device)
 */
async function handleKnownDevice(
  deviceResult: IdentificationResult,
  currentVoiceSketch: VoiceSketch,
  store: {
    getProfile: (userId: string) => Promise<UserProfile | null>;
    listProfiles: (options?: { limit?: number }) => Promise<UserProfile[]>;
  }
): Promise<VoiceIdentificationResult> {
  const profile = deviceResult.profile!;

  // If user has no stored voice sketch, this is enrollment opportunity
  if (!profile.voiceSketch) {
    return {
      userId: deviceResult.userId,
      profile,
      isNew: false,
      isReturning: deviceResult.isReturning,
      identificationMethod: 'device',
      voice: {
        hasSketch: false,
        matchConfidence: 0,
        needsEnrollment: true,
      },
      suggestedAction: profile.name ? 'greet_by_name' : 'ask_name',
      contextForAgent: buildContextForAgent(profile, 'device_match_no_voice'),
    };
  }

  // Compare current voice to stored voice
  const voiceComparison = compareVoiceSketches(currentVoiceSketch, profile.voiceSketch);

  getLogger().info(
    {
      userId: deviceResult.userId,
      similarity: voiceComparison.similarity.toFixed(2),
      confidence: voiceComparison.confidence.toFixed(2),
    },
    'Voice verification for known device'
  );

  if (voiceComparison.similarity >= VOICE_MATCH_THRESHOLD) {
    // Voice matches - proceed with confidence
    return {
      userId: deviceResult.userId,
      profile,
      isNew: false,
      isReturning: true,
      identificationMethod: 'both',
      voice: {
        hasSketch: true,
        matchConfidence: voiceComparison.similarity,
        needsEnrollment: false,
      },
      suggestedAction: 'greet_by_name',
      contextForAgent: buildContextForAgent(profile, 'voice_verified'),
    };
  }

  if (voiceComparison.similarity < VOICE_MISMATCH_THRESHOLD) {
    // Voice significantly different - might be someone else on this device
    // Search for who this might actually be
    const voiceMatches = await searchByVoice(currentVoiceSketch, store, deviceResult.userId);

    return {
      userId: deviceResult.userId,
      profile,
      isNew: false,
      isReturning: true,
      identificationMethod: 'device',
      voice: {
        hasSketch: true,
        matchConfidence: voiceComparison.similarity,
        needsEnrollment: false,
        possibleMatches: voiceMatches,
      },
      suggestedAction: 'verify_identity',
      contextForAgent: buildContextForAgent(profile, 'voice_mismatch', voiceMatches),
    };
  }

  // Inconclusive voice match - proceed but note uncertainty
  return {
    userId: deviceResult.userId,
    profile,
    isNew: false,
    isReturning: true,
    identificationMethod: 'device',
    voice: {
      hasSketch: true,
      matchConfidence: voiceComparison.similarity,
      needsEnrollment: false,
    },
    suggestedAction: 'greet_by_name',
    contextForAgent: buildContextForAgent(profile, 'device_match'),
  };
}

/**
 * Handle case where device is new but we have voice to search with
 */
async function handleNewDeviceWithVoice(
  deviceResult: IdentificationResult,
  currentVoiceSketch: VoiceSketch,
  store: {
    getProfile: (userId: string) => Promise<UserProfile | null>;
    listProfiles: (options?: { limit?: number }) => Promise<UserProfile[]>;
  }
): Promise<VoiceIdentificationResult> {
  // Search for matching voices
  const voiceMatches = await searchByVoice(currentVoiceSketch, store);

  if (voiceMatches.length > 0 && voiceMatches[0].similarity >= VOICE_MATCH_THRESHOLD) {
    // Strong voice match found!
    const bestMatch = voiceMatches[0];
    const matchedProfile = await store.getProfile(bestMatch.userId);

    return {
      userId: bestMatch.userId, // Use the matched user's ID
      profile: matchedProfile,
      isNew: false,
      isReturning: true,
      identificationMethod: 'voice',
      voice: {
        hasSketch: true,
        matchConfidence: bestMatch.similarity,
        needsEnrollment: false,
        possibleMatches: voiceMatches,
      },
      suggestedAction: 'suggest_identity',
      contextForAgent: buildContextForAgent(matchedProfile, 'voice_match', voiceMatches),
    };
  }

  if (voiceMatches.length > 0 && voiceMatches[0].similarity >= VOICE_SUGGEST_THRESHOLD) {
    // Possible match - ask to confirm
    const bestMatch = voiceMatches[0];
    const matchedProfile = await store.getProfile(bestMatch.userId);

    return {
      userId: deviceResult.userId, // Keep device ID until confirmed
      profile: null,
      isNew: true, // Treat as new until confirmed
      isReturning: false,
      identificationMethod: 'anonymous',
      voice: {
        hasSketch: false,
        matchConfidence: bestMatch.similarity,
        needsEnrollment: true,
        possibleMatches: voiceMatches,
      },
      suggestedAction: 'suggest_identity',
      contextForAgent: buildContextForAgent(matchedProfile, 'voice_possible_match', voiceMatches),
    };
  }

  // No voice match - truly new user
  return {
    userId: deviceResult.userId,
    profile: null,
    isNew: true,
    isReturning: false,
    identificationMethod: 'anonymous',
    voice: {
      hasSketch: false,
      matchConfidence: 0,
      needsEnrollment: true,
    },
    suggestedAction: 'ask_name',
    contextForAgent:
      "New user - no prior conversations and voice doesn't match any existing users.",
  };
}

/**
 * Search for voice matches among stored profiles
 */
async function searchByVoice(
  currentVoiceSketch: VoiceSketch,
  store: { listProfiles: (options?: { limit?: number }) => Promise<UserProfile[]> },
  excludeUserId?: string
): Promise<VoiceSearchResult[]> {
  const profiles = await store.listProfiles({ limit: 500 });
  const results: VoiceSearchResult[] = [];

  for (const profile of profiles) {
    if (!profile.voiceSketch) continue;
    if (excludeUserId && profile.id === excludeUserId) continue;

    const comparison = compareVoiceSketches(currentVoiceSketch, profile.voiceSketch);

    if (comparison.similarity >= VOICE_SUGGEST_THRESHOLD) {
      results.push({
        userId: profile.id,
        similarity: comparison.similarity,
        confidence: comparison.confidence,
        profile: profile.name ? { name: profile.name } : undefined,
      });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, 5); // Return top 5 matches
}

// ============================================================================
// VOICE SKETCH MANAGEMENT
// ============================================================================

/**
 * Update a user's voice sketch (merge with existing or create new)
 */
export function mergeVoiceSketch(
  existing: VoiceSketch | undefined,
  newSketch: VoiceSketch
): VoiceSketch {
  if (!existing) {
    return newSketch;
  }

  // Weighted average - existing data gets more weight as confidence grows
  const existingWeight = existing.confidence;
  const newWeight = newSketch.confidence * 0.3; // New data contributes less
  const totalWeight = existingWeight + newWeight;

  const weightedAvg = (existingVal: number, newVal: number): number => {
    return (existingVal * existingWeight + newVal * newWeight) / totalWeight;
  };

  return {
    pitchMean: weightedAvg(existing.pitchMean, newSketch.pitchMean),
    pitchMin: Math.min(existing.pitchMin, newSketch.pitchMin),
    pitchMax: Math.max(existing.pitchMax, newSketch.pitchMax),
    pitchStdDev: weightedAvg(existing.pitchStdDev, newSketch.pitchStdDev),

    speakingRateMean: weightedAvg(existing.speakingRateMean, newSketch.speakingRateMean),
    pauseFrequency: weightedAvg(existing.pauseFrequency, newSketch.pauseFrequency),
    avgPauseDuration: weightedAvg(existing.avgPauseDuration, newSketch.avgPauseDuration),

    spectralCentroidMean: weightedAvg(
      existing.spectralCentroidMean,
      newSketch.spectralCentroidMean
    ),
    spectralCentroidStdDev: weightedAvg(
      existing.spectralCentroidStdDev,
      newSketch.spectralCentroidStdDev
    ),
    spectralRolloffMean: weightedAvg(existing.spectralRolloffMean, newSketch.spectralRolloffMean),

    energyMean: weightedAvg(existing.energyMean, newSketch.energyMean),
    energyStdDev: weightedAvg(existing.energyStdDev, newSketch.energyStdDev),

    samplesAnalyzed: existing.samplesAnalyzed + newSketch.samplesAnalyzed,
    totalDurationMs: existing.totalDurationMs + newSketch.totalDurationMs,
    confidence: Math.min(1.0, totalWeight),
    createdAt: existing.createdAt,
    updatedAt: new Date(),
  };
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

type ContextScenario =
  | 'device_match'
  | 'device_match_no_voice'
  | 'voice_verified'
  | 'voice_mismatch'
  | 'voice_match'
  | 'voice_possible_match';

/**
 * Build natural context for the agent based on identification scenario
 */
function buildContextForAgent(
  profile: UserProfile | null,
  scenario: ContextScenario,
  voiceMatches?: VoiceSearchResult[]
): string {
  const name = profile?.name;
  const conversations = profile?.totalConversations || 0;

  switch (scenario) {
    case 'device_match':
      if (name) {
        return `Returning user "${name}" on recognized device. ${conversations} previous conversations.`;
      }
      return 'Returning device but user never gave their name. Ask naturally.';

    case 'device_match_no_voice':
      if (name) {
        return `Returning user "${name}". No voice sketch yet - voice recognition will improve as you chat.`;
      }
      return 'Returning device but user never gave their name. No voice sketch yet.';

    case 'voice_verified':
      return `Confirmed: "${name}" - both device and voice match. ${conversations} previous conversations.`;

    case 'voice_mismatch': {
      const possiblePerson = voiceMatches?.[0]?.profile?.name;
      if (possiblePerson) {
        return (
          `Device belongs to "${name}" but voice sounds like "${possiblePerson}". ` +
          `Ask naturally: "I was expecting ${name} - is this ${possiblePerson}?"`
        );
      }
      return (
        `Device belongs to "${name}" but voice doesn't match. ` +
        `Someone else might be using their device. Ask gently who you're speaking with.`
      );
    }

    case 'voice_match': {
      const matchedName = voiceMatches?.[0]?.profile?.name;
      const similarity = voiceMatches?.[0]?.similarity ?? 0;
      if (matchedName) {
        return (
          `Voice strongly matches "${matchedName}" (${Math.round(similarity * 100)}% confidence). ` +
          `New device. Say something like: "${matchedName}? I recognize your voice! Are you on a new device?"`
        );
      }
      return 'Voice matches a returning user but they never gave their name.';
    }

    case 'voice_possible_match': {
      const possibleName = voiceMatches?.[0]?.profile?.name;
      const possibleSimilarity = voiceMatches?.[0]?.similarity ?? 0;
      if (possibleName) {
        return (
          `Voice might be "${possibleName}" (${Math.round(possibleSimilarity * 100)}% confidence). ` +
          `Ask naturally: "Your voice sounds familiar - have we talked before? Are you ${possibleName}?"`
        );
      }
      return "Voice seems familiar but no strong match. Ask if you've talked before.";
    }

    default:
      return '';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { VoiceSearchResult, VoiceSimilarityResult };

export default {
  identifyWithVoice,
  mergeVoiceSketch,
  VOICE_MATCH_THRESHOLD,
  VOICE_SUGGEST_THRESHOLD,
  VOICE_MISMATCH_THRESHOLD,
};
