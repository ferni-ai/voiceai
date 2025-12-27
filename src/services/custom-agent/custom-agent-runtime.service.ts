/**
 * Custom Agent Runtime Service
 *
 * Loads custom agents from Firestore and converts them to PersonaConfig
 * format for use with the voice agent runtime.
 *
 * @module services/custom-agent/custom-agent-runtime
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getCustomAgent, getActiveCustomAgents } from './custom-agent-persistence.service.js';
import type { CustomAgent as ApiCustomAgent } from '../../types/custom-agent-api.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  PersonaConfig,
  VoiceConfig,
  IdentityConfig,
  CommunicationConfig,
  PersonalityConfig,
  KnowledgeConfig,
  SpeechCharacteristics,
} from '../../personas/types.js';

const log = getLogger().child({ module: 'CustomAgentRuntime' });

// ============================================================================
// CONSTANTS
// ============================================================================

// Custom agent ID prefixes for detection
const CUSTOM_AGENT_PREFIXES = ['agent_', 'custom_', 'ca_'];

// Default voice settings for cloned voices
const DEFAULT_VOICE_SETTINGS = {
  provider: 'cartesia' as const,
  defaultRate: 0,
};

// Default communication config for custom agents
const DEFAULT_COMMUNICATION: CommunicationConfig = {
  greetingStyle: 'warm-friend',
  returningUserStyle: 'warm-friend',
  formalityLevel: 0.4,
  thinkingPhrases: ['Let me think about that...', 'Hmm...', 'Well...'],
  listeningCues: ['I hear you', 'Go on...', 'Tell me more'],
  backchannels: {
    neutral: ['mm-hmm', 'I see'],
    engaged: ['right', 'exactly', 'yes'],
    empathetic: ['I understand', "that's understandable", 'of course'],
  },
  silenceFillers: {
    early: ['Take your time'],
    mid: ["I'm here"],
    late: ["Whenever you're ready"],
  },
  selfCorrections: ['Actually, let me rephrase that...', 'What I mean is...'],
  trailingOffs: ['You know...', 'And...'],
  interruptionRecoveries: ['Sorry, go ahead', 'Please continue'],
  humilityPhrases: ['I could be wrong, but...', 'From my perspective...'],
  emotionalExpressions: {
    laughter: ['haha', '[laughter]'],
    surprise: ['Oh!', 'Wow!'],
    concern: ['Oh no...', 'I see...'],
    joy: ["That's wonderful!", 'How lovely!'],
    empathy: ['I understand...', 'That sounds hard...'],
  },
};

// Default knowledge config
const DEFAULT_KNOWLEDGE: KnowledgeConfig = {
  domains: ['life coaching', 'emotional support', 'personal development'],
  qualifiedTopics: ['memories', 'stories', 'life experiences', 'wisdom', 'personal growth'],
  outOfScopeTopics: ['medical advice', 'legal advice', 'financial advice'],
  outOfScopeResponse:
    "I'm not qualified to give advice on that topic. You might want to consult a professional.",
};

// ============================================================================
// DETECTION
// ============================================================================

/**
 * Check if a persona ID is a custom agent
 */
export function isCustomAgentId(personaId: string): boolean {
  return CUSTOM_AGENT_PREFIXES.some((prefix) => personaId.startsWith(prefix));
}

/**
 * Extract user ID from room metadata for custom agent lookup
 */
export function extractUserIdFromMetadata(metadata: Record<string, unknown>): string | null {
  return (metadata.user_id as string) || (metadata.userId as string) || null;
}

// ============================================================================
// CONVERSION
// ============================================================================

/**
 * Convert custom agent to PersonaConfig format
 */
export function customAgentToPersonaConfig(agent: ApiCustomAgent): PersonaConfig {
  const voiceConfig = buildVoiceConfig(agent);
  const identityConfig = buildIdentityConfig(agent);
  const personalityConfig = buildPersonalityConfig(agent);
  const speechCharacteristics = buildSpeechCharacteristics(agent);
  const communicationConfig = buildCommunicationConfig(agent);

  // Generate the system prompt using our simplified generator
  const systemPrompt = generateApiAgentSystemPrompt(agent);

  return {
    id: agent.id,
    name: agent.displayName || agent.name,
    displayName: agent.displayName,
    description: agent.description,
    voice: voiceConfig,
    speechCharacteristics,
    identity: identityConfig,
    communication: communicationConfig,
    personality: personalityConfig,
    knowledge: buildKnowledgeConfig(agent),
    stories: buildStoriesConfig(agent),
    catchphrases: agent.behaviors.catchphrases || [],
    systemPrompt,
  };
}

/**
 * Generate system prompt from API custom agent type
 * This is a simplified version that works with the API/persistence types
 */
function generateApiAgentSystemPrompt(agent: ApiCustomAgent): string {
  const sections: string[] = [];

  // Identity section
  sections.push(`# ${agent.name}

## Who You Are

You are **${agent.name}**${agent.displayName ? ` (called "${agent.displayName}" affectionately)` : ''}.

${agent.description}

${getAgentTypeDescription(agent.type)}

**Your Role:** You bring all of your wisdom, warmth, and personality to these conversations.`);

  // Personality section
  const p = agent.personality;
  const traits: string[] = [];

  if (p.warmth >= 0.7) {
    traits.push('You are deeply warm and caring. Love radiates from how you speak.');
  } else if (p.warmth >= 0.4) {
    traits.push('You are warm and caring, though not overly effusive.');
  }

  if (p.directness >= 0.7) {
    traits.push('You speak directly and honestly, even when the truth is hard.');
  } else if (p.directness <= 0.3) {
    traits.push('You express yourself gently, wrapping truth in kindness.');
  }

  if (p.humorLevel >= 0.6) {
    traits.push('You have a wonderful sense of humor and naturally bring lightness.');
  }

  if (p.traits?.length) {
    traits.push(`Key traits: ${p.traits.join(', ')}`);
  }

  if (traits.length) {
    sections.push(`## Your Personality

${traits.join('\n\n')}`);
  }

  // Values section
  if (p.values?.length) {
    sections.push(`## Your Values

${p.values.map((v) => `- ${v}`).join('\n')}`);
  }

  // Behaviors section
  const behaviors: string[] = [];
  if (agent.behaviors.greetings?.length) {
    behaviors.push(
      `Greetings you might use: "${agent.behaviors.greetings.slice(0, 3).join('", "')}"`
    );
  }
  if (agent.behaviors.catchphrases?.length) {
    behaviors.push(
      `Phrases you often say: "${agent.behaviors.catchphrases.slice(0, 3).join('", "')}"`
    );
  }
  if (agent.behaviors.farewells?.length) {
    behaviors.push(`How you say goodbye: "${agent.behaviors.farewells.slice(0, 2).join('", "')}"`);
  }

  if (behaviors.length) {
    sections.push(`## How You Speak

${behaviors.join('\n\n')}`);
  }

  // Stories/Memories section
  const memoryParts: string[] = [];

  if (agent.memories.stories?.length) {
    memoryParts.push(
      `**Stories you might share:**\n${agent.memories.stories
        .slice(0, 3)
        .map((s) => `- ${s.content.slice(0, 200)}...`)
        .join('\n')}`
    );
  }

  if (agent.memories.wisdom?.length) {
    memoryParts.push(
      `**Wisdom you carry:**\n${agent.memories.wisdom
        .slice(0, 3)
        .map((w) => `- "${w.phrase || w.content.slice(0, 100)}"`)
        .join('\n')}`
    );
  }

  if (agent.memories.sharedMoments?.length) {
    memoryParts.push(
      `**Precious moments you remember:**\n${agent.memories.sharedMoments
        .slice(0, 2)
        .map((m) => `- ${m.content.slice(0, 150)}`)
        .join('\n')}`
    );
  }

  if (memoryParts.length) {
    sections.push(`## Your Memories and Wisdom

${memoryParts.join('\n\n')}`);
  }

  // Rules section
  sections.push(`## Guidelines

1. Stay true to your personality - you ARE this person, not a simulation
2. Share stories and wisdom naturally when relevant
3. Be warm and present in conversations
4. Remember: you're here to support, not to lecture
5. If you don't know something, be honest about it
6. Keep the conversation feeling genuine and human`);

  return sections.join('\n\n---\n\n');
}

/**
 * Get type description for prompt generation
 */
function getAgentTypeDescription(type: string): string {
  switch (type) {
    case 'legacy':
      return 'You are the spirit of someone deeply loved, here to continue sharing wisdom and warmth.';
    case 'mentor':
      return 'You are a wise mentor, here to guide and inspire through your experience and insight.';
    case 'twin':
      return 'You are a reflection of yourself, a voice for self-dialogue and journaling.';
    case 'fictional':
      return 'You are a unique character, brought to life through personality and purpose.';
    case 'professional':
      return 'You bring professional expertise with a warm, human touch.';
    default:
      return 'You are a supportive companion, here to listen and engage.';
  }
}

/**
 * Build voice configuration from custom agent
 */
function buildVoiceConfig(agent: ApiCustomAgent): VoiceConfig {
  const settings = agent.voice.settings || {};

  return {
    voiceId: agent.voice.voiceId || '',
    provider: 'cartesia',
    defaultRate: settings.speed || 0,
    description: `Custom voice for ${agent.name}`,
    language: 'en',
  };
}

/**
 * Build identity configuration from custom agent
 */
function buildIdentityConfig(agent: ApiCustomAgent): IdentityConfig {
  const personality = agent.personality;

  return {
    id: agent.id,
    selfReference: agent.displayName || agent.name,
    coreValues: personality.values || ['authenticity', 'connection', 'growth'],
    role: getAgentRole(agent.type),
    background: agent.description,
    priorities: buildPriorities(agent),
    desiredUserExperience: getDesiredExperience(agent.type),
  };
}

/**
 * Build personality configuration from custom agent
 */
function buildPersonalityConfig(agent: ApiCustomAgent): PersonalityConfig {
  const p = agent.personality;

  return {
    warmth: p.warmth || 0.7,
    humorLevel: p.humorLevel || 0.3,
    humorStyle: ['gentle-teasing', 'observational'],
    directness: p.directness || 0.5,
    energy: p.energy || 0.5,
    tangentFrequency: 0.2,
    traits: p.traits || [],
    boundaries: [],
    moodsByTime: [],
  };
}

/**
 * Build speech characteristics from custom agent personality
 */
function buildSpeechCharacteristics(agent: ApiCustomAgent): SpeechCharacteristics {
  const energy = agent.personality.energy || 0.5;
  const formality = agent.personality.formality || 0.5;

  // Calculate speech parameters based on personality
  const baseSpeed = 0.85 + energy * 0.2; // 0.85-1.05
  const pauseMultiplier = 1.0 + (1 - energy) * 0.3; // 1.0-1.3

  return {
    baseSpeedMultiplier: Math.max(0.7, Math.min(1.1, baseSpeed)),
    pauseMultiplier: Math.max(0.8, Math.min(1.4, pauseMultiplier)),
    speedVariation: 0.1 + energy * 0.1,
    thinkingSoundFrequency: 0.25 + (1 - energy) * 0.2,
    emphasisStyle: energy > 0.6 ? 'pronounced' : energy > 0.4 ? 'moderate' : 'subtle',
    sentenceEndingStyle: formality > 0.6 ? 'falling' : 'natural',
    minimumEnergy: 0.7,
    maximumEnergy: 1.2,
  };
}

/**
 * Build communication config from custom agent
 */
function buildCommunicationConfig(agent: ApiCustomAgent): CommunicationConfig {
  const greetings = agent.behaviors.greetings || [];
  const farewells = agent.behaviors.farewells || [];

  // Create custom communication config based on agent
  const config: CommunicationConfig = {
    ...DEFAULT_COMMUNICATION,
    formalityLevel: agent.personality.formality || 0.4,
  };

  // Override with custom phrases if available
  if (greetings.length > 0) {
    config.thinkingPhrases = [...DEFAULT_COMMUNICATION.thinkingPhrases];
  }

  return config;
}

/**
 * Build knowledge configuration from custom agent
 */
function buildKnowledgeConfig(agent: ApiCustomAgent): KnowledgeConfig {
  return {
    ...DEFAULT_KNOWLEDGE,
    domains: buildDomains(agent),
    qualifiedTopics: buildQualifiedTopics(agent),
  };
}

/**
 * Build stories configuration from memories
 */
function buildStoriesConfig(agent: ApiCustomAgent): Array<{
  id: string;
  triggers: string[];
  content: string;
  type: 'personal' | 'professional' | 'educational' | 'inspirational' | 'cautionary';
}> {
  const stories: Array<{
    id: string;
    triggers: string[];
    content: string;
    type: 'personal' | 'professional' | 'educational' | 'inspirational' | 'cautionary';
  }> = [];

  // Convert stories to story configs
  for (const story of agent.memories.stories || []) {
    stories.push({
      id: story.id,
      triggers: story.keywords || story.themes || [],
      content: story.content,
      type: 'personal',
    });
  }

  // Convert wisdom to inspirational stories
  for (const wisdom of agent.memories.wisdom || []) {
    stories.push({
      id: wisdom.id,
      triggers: wisdom.keywords || wisdom.themes || [],
      content: wisdom.content,
      type: 'inspirational',
    });
  }

  return stories;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAgentRole(type: string): string {
  switch (type) {
    case 'legacy':
      return 'keeper of precious memories';
    case 'mentor':
      return 'wise mentor and guide';
    case 'twin':
      return 'digital companion and journal keeper';
    case 'custom':
    case 'fictional':
    case 'professional':
    default:
      return 'supportive companion';
  }
}

function getDesiredExperience(type: string): string {
  switch (type) {
    case 'legacy':
      return 'feeling connected to cherished memories and loved ones';
    case 'mentor':
      return 'feeling guided and inspired by wisdom';
    case 'twin':
      return 'feeling understood through self-reflection';
    default:
      return 'feeling supported and heard';
  }
}

function buildPriorities(agent: ApiCustomAgent): string[] {
  const priorities = ['authentic connection', 'emotional support'];

  switch (agent.type) {
    case 'legacy':
      priorities.push('preserving memories', 'honoring relationships');
      break;
    case 'mentor':
      priorities.push('sharing wisdom', 'providing guidance');
      break;
    case 'twin':
      priorities.push('self-reflection', 'personal growth');
      break;
  }

  return priorities;
}

function buildDomains(agent: ApiCustomAgent): string[] {
  const domains = ['personal memories', 'emotional support'];

  // Add domains based on agent type and content
  if (agent.memories.wisdom?.length) {
    domains.push('wisdom', 'life lessons');
  }

  if (agent.memories.stories?.length) {
    domains.push('storytelling', 'shared experiences');
  }

  return domains;
}

function buildQualifiedTopics(agent: ApiCustomAgent): string[] {
  const topics = ['memories', 'stories', 'feelings'];

  // Extract topics from memories
  const allThemes = new Set<string>();

  for (const story of agent.memories.stories || []) {
    (story.themes || []).forEach((t) => allThemes.add(cleanForFirestore(t)));
  }

  for (const wisdom of agent.memories.wisdom || []) {
    (wisdom.themes || []).forEach((t) => allThemes.add(cleanForFirestore(t)));
  }

  return [...topics, ...Array.from(allThemes)];
}

// ============================================================================
// MAIN LOADER
// ============================================================================

/**
 * Load a custom agent and convert to PersonaConfig
 *
 * @param agentId - The custom agent ID (e.g., 'agent_123_abc')
 * @param userId - The user ID who owns the agent
 * @returns PersonaConfig for the voice agent runtime
 */
export async function loadCustomAgentAsPersona(
  agentId: string,
  userId: string
): Promise<PersonaConfig | null> {
  log.info({ agentId, userId }, 'Loading custom agent as persona');

  try {
    const agent = await getCustomAgent(userId, agentId);

    if (!agent) {
      log.warn({ agentId, userId }, 'Custom agent not found');
      return null;
    }

    if (agent.status !== 'active' && agent.status !== 'draft') {
      log.warn({ agentId, userId, status: agent.status }, 'Custom agent is not active');
      return null;
    }

    const personaConfig = customAgentToPersonaConfig(agent);
    log.info({ agentId, userId, personaId: personaConfig.id }, 'Custom agent loaded as persona');

    return personaConfig;
  } catch (error) {
    log.error({ error: String(error), agentId, userId }, 'Failed to load custom agent');
    return null;
  }
}

/**
 * Load all active custom agents for a user
 *
 * @param userId - The user ID
 * @returns Array of PersonaConfig for all active custom agents
 */
export async function loadAllCustomAgentsAsPersonas(userId: string): Promise<PersonaConfig[]> {
  log.debug({ userId }, 'Loading all custom agents as personas');

  try {
    const agents = await getActiveCustomAgents(userId);
    const personas: PersonaConfig[] = [];

    for (const agent of agents) {
      const personaConfig = customAgentToPersonaConfig(agent);
      personas.push(personaConfig);
    }

    log.info({ userId, count: personas.length }, 'Loaded custom agents as personas');
    return personas;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load custom agents');
    return [];
  }
}

/**
 * Create a quick fallback persona for custom agents when full loading fails
 */
export function createFallbackCustomAgentPersona(
  agentId: string,
  agentName: string
): PersonaConfig {
  return {
    id: agentId,
    name: agentName,
    description: `Custom agent: ${agentName}`,
    voice: {
      voiceId: 'b7d50908-b17c-442d-ad8d-810c63997ed9', // Ferni's voice as fallback
      provider: 'cartesia',
    },
    speechCharacteristics: {
      baseSpeedMultiplier: 0.85,
      pauseMultiplier: 1.0,
      speedVariation: 0.15,
      thinkingSoundFrequency: 0.3,
      emphasisStyle: 'moderate',
      sentenceEndingStyle: 'natural',
      minimumEnergy: 0.7,
      maximumEnergy: 1.2,
    },
    identity: {
      selfReference: agentName,
      coreValues: ['authenticity', 'connection'],
      role: 'supportive companion',
      priorities: ['being present', 'listening well'],
      desiredUserExperience: 'feeling heard and supported',
    },
    communication: DEFAULT_COMMUNICATION,
    personality: {
      warmth: 0.7,
      humorLevel: 0.3,
      humorStyle: ['observational'],
      directness: 0.5,
      energy: 0.5,
      tangentFrequency: 0.2,
      traits: ['warm', 'attentive'],
      boundaries: [],
    },
    knowledge: DEFAULT_KNOWLEDGE,
    systemPrompt: `You are ${agentName}, a supportive and caring companion. Be warm, attentive, and present in your conversations.`,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { CUSTOM_AGENT_PREFIXES, DEFAULT_COMMUNICATION, DEFAULT_KNOWLEDGE };
