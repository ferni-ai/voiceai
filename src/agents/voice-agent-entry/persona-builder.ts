/**
 * Session persona construction with defaults and prompt loading.
 *
 * Builds the full PersonaConfig for a session, applying defaults for any missing fields.
 * Loads the model base instructions; the persona prompt waits for the caller's
 * flags (loadCallerPrompt).
 *
 * @module agents/voice-agent-entry/persona-builder
 */

import { timeContext } from '../shared/time-context.js';
import type { PersonaConfig } from '../../personas/types.js';
import { DEFAULT_COMMUNICATION, buildDefaultIdentity, buildPersonaName } from './constants.js';
import type { E2EDiagnostics } from './types.js';
import { getPrewarmedResources, loadPersonaLocally } from '../voice-agent/phases/index.js';
import { liveCustomAgentPrompt, resolveLiveCustomAgent } from '../shared/custom-agent-live.js';

/** The default persona: what a custom-agent call gets when the agent can't load for this caller. */
const DEFAULT_PERSONA_ID = 'ferni';

/** Result of building a session persona */
export interface PersonaBuildResult {
  sessionPersona: PersonaConfig;
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

  // The persona prompt is not loaded here: see loadCallerPrompt.
  const { loadModelBaseInstructions } = await import('../personas/prompt-loader.js');
  const baseInstructions = await loadModelBaseInstructions();

  // DATE/TIME AWARENESS - Critical for grounding agent in reality
  const dateTimeContext = timeContext(new Date());

  const modelBaseInstructions = baseInstructions + dateTimeContext;

  process.stderr.write(
    `[voice-agent-entry] Loaded prompts - Model base: ${modelBaseInstructions.length} chars (includes date/time)\n`
  );
  process.stderr.write(`[voice-agent-entry] Using persona: ${sessionPersona.name}\n`);

  return { sessionPersona, modelBaseInstructions };
}

/**
 * The persona's system prompt for this caller. Load it only after
 * applyCallerFlags (identifyUser, STEP 4): the prompt reads cohort flags
 * (FERNI_PERSONA_SLIP_GUARD adds Ferni's own-life sheet), and before STEP 4
 * process.env still holds the previous caller's flags. buildSessionPersona
 * runs at STEP 2, so it used to hand the single-agent session a prompt built
 * with the last caller's flags.
 */
export async function loadCallerPrompt(persona: { id: string }): Promise<string> {
  // CUSTOM_AGENT_LIVE: a custom agent's own prompt, its owner's text kept as data
  const live = liveCustomAgentPrompt(persona);
  if (live !== undefined) return live;
  const { loadSystemPrompt } = await import('../personas/prompt-loader.js');
  return loadSystemPrompt(persona.id);
}

/**
 * The persona this call speaks as, once the caller is known (STEP 4, after
 * identifyUser). CUSTOM_AGENT_LIVE=on: a custom agent the caller owns loads as
 * itself; someone else's, or one that fails to load, gives the default persona
 * (agents/shared/custom-agent-live.ts). Off, or for a built-in persona, `persona` itself.
 */
export async function callerSessionPersona(
  persona: PersonaConfig,
  userId: string | null,
  e2e: E2EDiagnostics
): Promise<PersonaConfig> {
  const live = await resolveLiveCustomAgent(persona, userId);
  if (live.kind === 'unchanged') return persona;
  if (live.kind === 'loaded') return live.persona;
  return (await buildSessionPersona(DEFAULT_PERSONA_ID, e2e)).sessionPersona;
}
