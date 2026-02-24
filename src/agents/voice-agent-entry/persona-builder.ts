/**
 * Session persona construction with defaults and prompt loading.
 *
 * Builds the full PersonaConfig for a session, applying defaults for any missing fields.
 * Loads the system prompt and model base instructions from persona bundles.
 *
 * @module agents/voice-agent-entry/persona-builder
 */

import type { PersonaConfig } from '../../personas/types.js';
import { DEFAULT_COMMUNICATION, buildDefaultIdentity, buildPersonaName } from './constants.js';
import type { E2EDiagnostics } from './types.js';
import {
  getPrewarmedResources,
  loadPersonaLocally,
} from '../voice-agent/phases/index.js';

/** Result of building a session persona */
export interface PersonaBuildResult {
  sessionPersona: PersonaConfig;
  systemPrompt: string;
  modelBaseInstructions: string;
}

/**
 * Build the full session persona with defaults and load prompts.
 */
export async function buildSessionPersona(
  personaId: string,
  e2e: E2EDiagnostics
): Promise<PersonaBuildResult> {
  e2e.resourceLoading(`persona:${personaId}`);
  const personaStart = Date.now();
  const {
    usePrewarmed,
    persona: cachedPersona,
    systemPrompt: cachedPrompt,
  } = await getPrewarmedResources(personaId);

  let persona = cachedPersona;
  if (!usePrewarmed) {
    const startup = await import('../../startup.js');
    await startup.startup();
    persona = await loadPersonaLocally(personaId);
  }
  e2e.resourceLoaded(`persona:${personaId}`, Date.now() - personaStart);

  // Import voice config for correct fallback voice ID
  const { getDefaultVoiceConfig } = await import('../../config/cartesia-config.js');
  const defaultVoice = getDefaultVoiceConfig();

  const personaName = buildPersonaName(personaId);
  const defaultIdentity = buildDefaultIdentity(personaName);

  // Build fallback persona with all required fields
  // NOTE: This is only used when the persona bundle fails to load
  const fallbackPersona: PersonaConfig = {
    id: personaId,
    name: personaName,
    description: `${personaName} is a warm and supportive life coach.`,
    voice: { voiceId: defaultVoice.voiceId, provider: 'cartesia' as const },
    systemPrompt: cachedPrompt || `You are ${personaId}, a warm and supportive life coach.`,
    personality: {
      warmth: 0.7,
      humorLevel: 0.4,
      humorStyle: ['observational', 'self-deprecating'],
      directness: 0.6,
      energy: 0.6,
      tangentFrequency: 0.3,
      traits: ['empathetic', 'supportive', 'curious'],
      boundaries: ['Never give medical/legal/financial advice'],
    },
    speechCharacteristics: {
      baseSpeedMultiplier: 1.0,
      pauseMultiplier: 1.0,
      speedVariation: 0.15,
      thinkingSoundFrequency: 0.4,
      emphasisStyle: 'moderate',
      sentenceEndingStyle: 'natural',
      minimumEnergy: 0.8,
      maximumEnergy: 1.1,
    },
    communication: DEFAULT_COMMUNICATION,
    identity: defaultIdentity,
    knowledge: {
      domains: ['life-coaching', 'personal-growth'],
      qualifiedTopics: [
        'goal-setting',
        'habits',
        'motivation',
        'relationships',
        'work-life-balance',
      ],
      outOfScopeTopics: ['medical-diagnosis', 'legal-advice', 'financial-advice'],
      outOfScopeResponse:
        "That's outside my expertise. I'd recommend speaking with a qualified professional for that.",
    },
  };

  // Use provided persona or fallback, ensuring required fields are present
  const sessionPersona: PersonaConfig = persona
    ? {
        ...fallbackPersona, // Defaults
        ...persona, // Override with actual persona
        communication: persona.communication ?? DEFAULT_COMMUNICATION,
        identity: persona.identity ?? defaultIdentity,
        knowledge: persona.knowledge ?? fallbackPersona.knowledge,
      }
    : fallbackPersona;

  // Load persona-specific system prompt and model base instructions
  const { loadSystemPrompt, loadModelBaseInstructions } =
    await import('../personas/prompt-loader.js');

  const [baseInstructions, systemPrompt] = await Promise.all([
    loadModelBaseInstructions(),
    loadSystemPrompt(sessionPersona.id),
  ]);

  // DATE/TIME AWARENESS - Critical for grounding agent in reality
  const sessionStartTime = new Date();
  const dateTimeContext = `
---

## Current Date & Time

Today is ${sessionStartTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
The current time is ${sessionStartTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.

Use this awareness naturally - don't announce it unless asked, just BE present in the moment.
If someone asks what day it is, what time it is, or what the date is, you know the answer.
`;

  const modelBaseInstructions = baseInstructions + dateTimeContext;

  process.stderr.write(
    `[voice-agent-entry] Loaded prompts - Model base: ${modelBaseInstructions.length} chars (includes date/time), Full persona: ${systemPrompt.length} chars\n`
  );
  process.stderr.write(`[voice-agent-entry] Using persona: ${sessionPersona.name}\n`);

  return { sessionPersona, systemPrompt, modelBaseInstructions };
}
