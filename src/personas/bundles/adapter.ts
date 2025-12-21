/**
 * Bundle to PersonaConfig Adapter
 *
 * Converts loaded persona bundles (new format) to PersonaConfig (legacy format)
 * for seamless integration with the existing voice-agent system.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '../../utils/safe-logger.js';

import { registerBundleHumanization } from '../../conversation/humanizing-config.js';
import {
  registerBundleBackchannels,
  registerBundleCelebrations,
  registerBundleEntrances,
  registerBundleGoodbyes,
  registerBundleStorytelling,
} from '../theatrical.js';
import type {
  BackchannelConfig,
  CommunicationConfig,
  EmotionalExpressionConfig,
  GreetingStyle,
  HumorStyle,
  IdentityConfig,
  KnowledgeConfig,
  PersonaConfig,
  PersonalityConfig,
  PetPeeveConfig,
  SilenceFillerConfig,
  SpeechCharacteristics,
  StoryConfig,
  VoiceConfig,
} from '../types.js';
import type { BundleBehaviors, LoadedPersonaBundle, PersonaBundleManifest } from './types.js';

// ============================================================================
// HELPER FUNCTIONS FOR TYPE CONVERSION
// ============================================================================

/**
 * Extract catchphrases from either array format or structured format
 */
function extractCatchphrases(catchphrases: BundleBehaviors['catchphrases']): string[] {
  if (!catchphrases) return [];

  // Legacy array format
  if (Array.isArray(catchphrases)) {
    return catchphrases;
  }

  // New structured format - extract from catchphrases array
  const result: string[] = [];
  if (catchphrases.catchphrases) {
    for (const cp of catchphrases.catchphrases) {
      result.push(cp.phrase);
    }
  }

  // Also include natural_responses if available
  if (catchphrases.natural_responses) {
    for (const phrases of Object.values(catchphrases.natural_responses)) {
      result.push(...phrases.slice(0, 2)); // Add first 2 from each category
    }
  }

  return result;
}

/**
 * Extract thinking sounds from either array format or structured format
 */
function extractThinkingSounds(thinkingSounds: BundleBehaviors['thinking_sounds']): string[] {
  // NOTE: Avoid "good question" - sounds like self-compliment
  const defaults = ['Let me think about that...', 'Hmm, let me see.', "Here's how I see it..."];

  if (!thinkingSounds) return defaults;

  // Legacy array format
  if (Array.isArray(thinkingSounds)) {
    return thinkingSounds.length > 0 ? thinkingSounds : defaults;
  }

  // New structured format - combine thinking and processing
  const result: string[] = [];
  if (thinkingSounds.thinking) {
    result.push(...thinkingSounds.thinking);
  }
  if (thinkingSounds.processing) {
    result.push(...thinkingSounds.processing);
  }
  if (thinkingSounds.transition) {
    result.push(...thinkingSounds.transition);
  }

  return result.length > 0 ? result : defaults;
}

// ============================================================================
// MAIN CONVERSION
// ============================================================================

/**
 * Convert a loaded bundle to PersonaConfig
 * Includes defensive null checks for incomplete manifests (e.g., marketplace agents)
 */
export async function bundleToPersonaConfig(bundle: LoadedPersonaBundle): Promise<PersonaConfig> {
  const { manifest } = bundle;
  const behaviors = await bundle.getBehaviors();
  const stories = await bundle.getAllStories();

  // Defensive defaults for optional manifest sections
  // Supports both core persona schema (role.domains) and marketplace schema (knowledge.domains)
  const speechChars = manifest.speech_characteristics ?? {
    base_speed_multiplier: 1.0,
    pause_multiplier: 1.0,
    thinking_sound_frequency: 0.3,
    emphasis_style: 'subtle' as const,
  };

  // Marketplace agents may have knowledge.domains instead of role.domains
  const knowledgeDomains =
    (manifest as { knowledge?: { domains?: string[] } }).knowledge?.domains ?? [];
  const role = manifest.role ?? {
    id: manifest.identity?.id ?? 'assistant',
    domains: knowledgeDomains,
    responsibilities: [] as string[],
  };
  // If role exists but domains is empty, try knowledge.domains as fallback
  if (role.domains?.length === 0 && knowledgeDomains.length > 0) {
    role.domains = knowledgeDomains;
  }

  const personality = manifest.personality ?? {
    warmth: 0.7,
    humor_level: 0.4,
    directness: 0.6,
    energy: 0.6,
    traits: [] as string[],
  };

  // Register bundle backchannels with the theatrical system
  // This makes them available to the BackchannelingSystem for natural responses
  if (behaviors.backchannels) {
    getLogger().debug(`Registering bundle backchannels for ${manifest.identity.id}`);
    // Convert BundleBackchannels to Record<string, string[]>
    const backchannelRecord: Record<string, string[]> = {};
    if (behaviors.backchannels.neutral) backchannelRecord.neutral = behaviors.backchannels.neutral;
    if (behaviors.backchannels.empathetic)
      backchannelRecord.empathetic = behaviors.backchannels.empathetic;
    if (behaviors.backchannels.engaged) backchannelRecord.engaged = behaviors.backchannels.engaged;
    registerBundleBackchannels(manifest.identity.id, backchannelRecord);
  }

  // Register bundle entrances with the theatrical system
  // This makes them available for handoff transitions
  if (behaviors.entrances && Array.isArray(behaviors.entrances)) {
    getLogger().debug(`Registering bundle entrances for ${manifest.identity.id}`);
    registerBundleEntrances(manifest.identity.id, behaviors.entrances);
  }

  // Register bundle celebrations with the theatrical system
  if (behaviors.celebrations) {
    getLogger().debug(`Registering bundle celebrations for ${manifest.identity.id}`);
    registerBundleCelebrations(
      manifest.identity.id,
      behaviors.celebrations as Record<string, string[]>
    );
  }

  // Register bundle goodbyes with the theatrical system
  if (behaviors.goodbyes && Array.isArray(behaviors.goodbyes)) {
    getLogger().debug(`Registering bundle goodbyes for ${manifest.identity.id}`);
    registerBundleGoodbyes(manifest.identity.id, behaviors.goodbyes);
  }

  // Register bundle storytelling config with the theatrical system
  if (behaviors.storytelling) {
    getLogger().debug(`Registering bundle storytelling for ${manifest.identity.id}`);
    registerBundleStorytelling(manifest.identity.id, behaviors.storytelling);
  }

  // Register humanization config from manifest
  if (manifest.humanization) {
    getLogger().debug(`Registering bundle humanization for ${manifest.identity.id}`);
    registerBundleHumanization(manifest.identity.id, manifest.humanization);
  }

  // HUMANIZATION FIX: Register cognitive profile from manifest.cognitive (preferred)
  // or fall back to behaviors.cognitive for backwards compatibility
  const cognitiveSource = manifest.cognitive || behaviors.cognitive;
  if (cognitiveSource) {
    getLogger().debug(
      `Registering bundle cognitive profile for ${manifest.identity.id} (source: ${manifest.cognitive ? 'manifest' : 'behaviors'})`
    );
    try {
      const { registerBundleCognitiveProfile, convertBundleCognitive } =
        await import('../cognitive-profiles.js');
      const cognitiveProfile = convertBundleCognitive(
        cognitiveSource as unknown as Record<string, unknown>
      );
      registerBundleCognitiveProfile(manifest.identity.id, cognitiveProfile);
    } catch (error) {
      getLogger().warn(
        { error, personaId: manifest.identity.id },
        'Failed to register cognitive profile from bundle'
      );
    }
  }

  // Load system prompt from identity folder if exists
  let systemPrompt = '';
  try {
    const systemPromptPath = join(bundle.bundlePath, 'identity', 'system-prompt.md');
    systemPrompt = await readFile(systemPromptPath, 'utf-8');
  } catch {
    // If no system prompt file, generate a basic one from manifest
    systemPrompt = generateSystemPrompt(manifest, behaviors);
  }

  // Convert voice config
  const voice: VoiceConfig = {
    voiceId: manifest.voice.voice_id,
    provider: manifest.voice.provider as 'cartesia',
    defaultRate: convertRate(manifest.voice.default_rate),
    description: manifest.identity.description,
  };

  // Convert speech characteristics (with defensive defaults for incomplete manifests)
  const speechCharacteristics: SpeechCharacteristics = {
    baseSpeedMultiplier: speechChars.base_speed_multiplier ?? 1.0,
    pauseMultiplier: speechChars.pause_multiplier ?? 1.0,
    speedVariation: 0.15, // Default
    thinkingSoundFrequency: speechChars.thinking_sound_frequency ?? 0.3,
    emphasisStyle: speechChars.emphasis_style ?? 'subtle',
    sentenceEndingStyle: 'natural',
    minimumEnergy: 0.7,
    maximumEnergy: 1.2,
  };

  // Convert identity config (with defensive defaults for incomplete manifests)
  const identity: IdentityConfig = {
    selfReference: manifest.identity?.self_reference ?? manifest.identity?.name ?? 'I',
    coreValues: (personality.traits ?? []).slice(0, 5),
    role: role.id ?? 'assistant',
    background: manifest.identity?.description ?? '',
    priorities: role.domains ?? [],
    desiredUserExperience: 'feeling heard, supported, and empowered',
  };

  // Convert communication config
  const communication = await buildCommunicationConfig(behaviors, manifest);

  // Convert personality config (with defensive defaults for incomplete manifests)
  const personalityConfig: PersonalityConfig = {
    warmth: personality.warmth ?? 0.7,
    humorLevel: personality.humor_level ?? 0.4,
    humorStyle: ['dry-wit', 'self-deprecating', 'observational'] as HumorStyle[],
    directness: personality.directness ?? 0.6,
    energy: personality.energy ?? 0.6,
    tangentFrequency: 0.25,
    traits: personality.traits ?? [],
    boundaries: [
      'Never sound like a customer service agent',
      'Never give specific stock picks without context',
      'Never rush the conversation',
      'Never dismiss emotions',
    ],
  };

  // Convert knowledge config (with defensive defaults for incomplete manifests)
  const knowledge: KnowledgeConfig = {
    domains: role.domains ?? [],
    qualifiedTopics: role.domains ?? [],
    outOfScopeTopics: [],
    outOfScopeResponse:
      "That's a bit outside my expertise. Let me connect you with someone better suited to help.",
  };

  // Convert stories
  const convertedStories: StoryConfig[] = stories.map((story) => ({
    id: story.id,
    triggers: story.triggers,
    content: story.content,
    type: convertStoryType(story.category),
  }));

  // Convert pet peeves
  // Handle both formats:
  // 1. Direct array: behaviors.pet_peeves = [{peeve, response}, ...]
  // 2. Object wrapper: behaviors.pet_peeves = { pet_peeves: [{peeve, response}, ...], ... }
  let petPeevesArray: Array<{ peeve?: string; triggers?: string[]; response: string }> = [];

  if (behaviors.pet_peeves) {
    if (Array.isArray(behaviors.pet_peeves)) {
      // Direct array format
      petPeevesArray = behaviors.pet_peeves;
    } else if (typeof behaviors.pet_peeves === 'object' && 'pet_peeves' in behaviors.pet_peeves) {
      // Object wrapper format (e.g., from pet-peeves.json with schema_version)
      const wrapper = behaviors.pet_peeves as { pet_peeves?: unknown[] };
      if (Array.isArray(wrapper.pet_peeves)) {
        petPeevesArray = wrapper.pet_peeves as typeof petPeevesArray;
      }
    }
  }

  const petPeeves: PetPeeveConfig[] = petPeevesArray.map((pp) => ({
    // Handle both 'peeve' (new format) and 'triggers' (old format) field names
    triggers: pp.triggers || (pp.peeve ? [pp.peeve] : []),
    response: pp.response,
    intensity: 0.8,
  }));

  return {
    id: manifest.identity.id,
    name: manifest.identity.name,
    description: manifest.identity?.description ?? '',
    voice,
    speechCharacteristics,
    identity,
    communication,
    personality: personalityConfig,
    knowledge,
    stories: convertedStories,
    catchphrases: extractCatchphrases(behaviors.catchphrases),
    petPeeves,
    systemPrompt,
  };
}

/**
 * Build communication config from behaviors
 */
async function buildCommunicationConfig(
  behaviors: BundleBehaviors,
  manifest: PersonaBundleManifest
): Promise<CommunicationConfig> {
  // Defensive defaults for personality
  const personalityData = manifest.personality ?? { warmth: 0.7, energy: 0.6 };

  // Determine greeting style from personality
  // Priority: High warmth personas should feel warm, not enthusiastic/performative
  // Warmth takes precedence because enthusiastic greetings sound choppy/fake
  let greetingStyle: GreetingStyle = 'warm-friend';
  const warmth = personalityData.warmth ?? 0.7;
  const energy = personalityData.energy ?? 0.6;

  if (warmth > 0.75) {
    // High warmth = warm-friend (Ferni, Maya)
    greetingStyle = 'warm-friend';
  } else if (energy > 0.85) {
    // Only use enthusiastic for very high energy + low warmth (Jordan, Peter)
    greetingStyle = 'enthusiastic';
  }

  // "Better Than Human" Philosophy: Presence sounds, not questions or commands
  const backchannels: BackchannelConfig = {
    neutral: behaviors.backchannels?.neutral || ['Mmhmm.', 'Mm.', 'Yeah.', 'Okay.'],
    engaged: behaviors.backchannels?.engaged || ['Oh.', 'Mm!', 'Yeah!'],
    empathetic: behaviors.backchannels?.empathetic || [
      'Mm...',
      'I hear you.',
      'Yeah...',
      "That's a lot.",
    ],
  };

  const silenceFillers: SilenceFillerConfig = {
    early: behaviors.silence_fillers?.early || [
      'Still there?',
      'Take your time.',
      "I'm listening.",
    ],
    mid: behaviors.silence_fillers?.mid || [
      'Something on your mind?',
      "It's okay to pause.",
      'No rush.',
    ],
    late: behaviors.silence_fillers?.late || [
      'Is there something else?',
      "I'm here if you need me.",
    ],
  };

  // "Better Than Human" Philosophy: No questions without context
  const emotionalExpressions: EmotionalExpressionConfig = {
    laughter: ['Ha!', 'Ha ha!', "[laughter] That's a good point."],
    surprise: ['Oh!', 'Wow.', 'Oh wow.', 'Hm.'],
    concern: ['Oh...', 'I see...', 'Hmm...', "That's hard."],
    joy: ["That's great!", "Oh, that's wonderful!", 'Fantastic!', 'I love hearing that.'],
    empathy: [
      'I hear you. That sounds really hard.',
      "That's a lot to carry.",
      "I've been there. I understand.",
      "You're not alone in this.",
    ],
  };

  return {
    greetingStyle,
    returningUserStyle: greetingStyle,
    formalityLevel: 0.3,
    thinkingPhrases: extractThinkingSounds(behaviors.thinking_sounds),
    // "Better Than Human" Philosophy: Presence, not commands
    listeningCues: ['Mmhmm...', 'Mm...', 'Yeah...', "I'm here..."],
    backchannels,
    silenceFillers,
    selfCorrections: [
      'Well, actually, let me put it another way...',
      "No, wait—that's not quite right. What I mean is...",
    ],
    trailingOffs: ['but anyway...', 'you know how it is...', "but that's another story..."],
    interruptionRecoveries: [
      'Oh! Go ahead, what were you saying?',
      "Sorry, I was rambling. What's on your mind?",
    ],
    humilityPhrases: [
      'I could be wrong. It happens.',
      "That's outside my expertise, but here's what I think...",
    ],
    emotionalExpressions,
    wittyRemarks: behaviors.witty_remarks || [],
  };
}

/**
 * Generate a basic system prompt from manifest data
 */
function generateSystemPrompt(manifest: PersonaBundleManifest, behaviors: BundleBehaviors): string {
  // Defensive defaults
  const personalityData = manifest.personality ?? { traits: [], warmth: 0.7, energy: 0.6 };
  const roleData = manifest.role ?? { domains: [] };

  const traits = (personalityData.traits ?? []).join(', ') || 'helpful, friendly';
  const domains = (roleData.domains ?? []).join(', ') || 'general assistance';

  return `# ${manifest.identity?.name ?? 'Assistant'}

## WHO YOU ARE
You are ${manifest.identity?.name ?? 'a helpful life coach'} (${manifest.identity?.self_reference ?? 'I'}). ${manifest.identity?.description ?? ''}

## YOUR EXPERTISE
Your domains: ${domains}

## YOUR PERSONALITY
Traits: ${traits}
Warmth: ${(personalityData.warmth ?? 0.7) * 100}%
Energy: ${(personalityData.energy ?? 0.6) * 100}%

## HOW YOU COMMUNICATE
- Be warm and authentic
- Use your catchphrases naturally: ${extractCatchphrases(behaviors.catchphrases).slice(0, 3).join(', ')}
- Share stories when relevant
- Ask questions to understand before giving advice
- Celebrate wins, no matter how small

## BOUNDARIES
- Never sound robotic or like a customer service agent
- Never give specific investment advice without proper context
- Never rush the conversation
- Never dismiss emotions
`;
}

/**
 * Convert rate string to number
 */
function convertRate(rate?: string): number | string {
  if (!rate) return 'normal';
  const rateMap: Record<string, number> = {
    slow: -0.3,
    medium: 0,
    fast: 0.3,
  };
  return rateMap[rate] ?? 0;
}

/**
 * Convert story category to StoryConfig type
 */
function convertStoryType(
  category?: string
): 'personal' | 'professional' | 'educational' | 'inspirational' | 'cautionary' {
  const typeMap: Record<string, StoryConfig['type']> = {
    personal: 'personal',
    professional: 'professional',
    educational: 'educational',
    emotional: 'inspirational',
  };
  return typeMap[category || 'personal'] || 'personal';
}

export default {
  bundleToPersonaConfig,
};
