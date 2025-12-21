/**
 * Voice Agent Phase: Load Persona
 *
 * Loads persona configuration from cache or bundles.
 * Handles metadata parsing and system prompt loading.
 * Supports custom user-created agents loaded from Firestore.
 *
 * @module voice-agent/phases/load-persona
 */

import type { JobContext } from '@livekit/agents';
import type { PersonaConfig } from '../../../personas/types.js';
import type { PersonaPhaseResult } from './types.js';

/**
 * Parse job and room metadata to extract persona ID and user ID.
 */
function parseMetadata(ctx: JobContext): { personaId: string; userId: string | null } {
  let metadata: Record<string, unknown> = {};

  // Try job metadata first
  if (ctx.job.metadata) {
    try {
      metadata = JSON.parse(ctx.job.metadata);
    } catch (e) {
      process.stderr.write(`[load-persona] Failed to parse job.metadata: ${e}\n`);
    }
  }

  // Fall back to room metadata
  if (!metadata.persona_id && ctx.job.room?.metadata) {
    try {
      const roomMeta = JSON.parse(ctx.job.room.metadata);
      if (roomMeta.persona_id) {
        metadata = { ...metadata, ...roomMeta };
      }
    } catch (e) {
      process.stderr.write(`[load-persona] Failed to parse room.metadata: ${e}\n`);
    }
  }

  const personaId = (metadata.persona_id as string) || process.env.PERSONA_ID || 'ferni';

  // Priority: firebase_uid (cryptographically secure) > user_id > userId
  // This ensures Firebase-authenticated users get their Firebase UID as the profile key
  const userId =
    (metadata.firebase_uid as string) ||
    (metadata.firebaseUid as string) ||
    (metadata.user_id as string) ||
    (metadata.userId as string) ||
    null;

  return { personaId, userId };
}

/**
 * Parse job and room metadata to extract persona ID.
 * @deprecated Use parseMetadata instead
 */
function parsePersonaId(ctx: JobContext): string {
  return parseMetadata(ctx).personaId;
}

/**
 * Check for pre-warmed resources from main process cache.
 */
export async function getPrewarmedResources(
  personaId: string
): Promise<{ usePrewarmed: boolean; persona: PersonaConfig | null; systemPrompt: string | null }> {
  try {
    const cacheReader = await import('../../shared/cache-reader.js');
    const { isMainProcessWarmedUp, getPersonaConfig, getSystemPrompt } = cacheReader;

    if (isMainProcessWarmedUp()) {
      process.stderr.write(`[load-persona] Using main process cache ✅\n`);
      const config = getPersonaConfig(personaId);
      const prompt = getSystemPrompt(personaId);
      if (config) {
        return { usePrewarmed: true, persona: config as PersonaConfig, systemPrompt: prompt };
      }
    }
  } catch {
    process.stderr.write(`[load-persona] Cache unavailable, loading locally\n`);
  }
  return { usePrewarmed: false, persona: null, systemPrompt: null };
}

/**
 * Load persona from bundles (fallback path when cache miss).
 */
export async function loadPersonaLocally(personaId: string): Promise<PersonaConfig | null> {
  const personas = await import('../../../personas/index.js');
  await personas.initializeFromBundles();
  const result = await personas.getPersonaAsync(personaId);
  return result ?? null;
}

/**
 * Load the rich system prompt from the persona bundle.
 *
 * Uses the prompt assembler to combine:
 * - Core identity (system-prompt.md)
 * - Director's notes
 * - Biography summary
 *
 * Falls back to direct file load if assembler unavailable.
 */
async function loadRichSystemPrompt(personaId: string): Promise<string> {
  // Try the new prompt assembler first (includes director's notes + biography)
  try {
    const { getStaticPrompt, hasAssemblyConfig } =
      await import('../../../personas/bundles/prompt-assembler.js');

    if (await hasAssemblyConfig(personaId)) {
      const assembledPrompt = await getStaticPrompt(personaId);
      process.stderr.write(
        `[load-persona] Assembled rich prompt (${assembledPrompt.length} chars, ~${Math.round(assembledPrompt.length / 4)} tokens) ✨\n`
      );
      return assembledPrompt;
    }
  } catch (assemblerError) {
    process.stderr.write(`[load-persona] Prompt assembler unavailable: ${assemblerError}\n`);
  }

  // Fallback to direct file load
  const fs = await import('fs/promises');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Go up from phases/ to bundles/
  const richPromptPath = join(
    __dirname,
    '../../..',
    'personas/bundles',
    personaId,
    'identity/system-prompt.md'
  );

  try {
    const prompt = await fs.readFile(richPromptPath, 'utf-8');
    process.stderr.write(
      `[load-persona] Loaded rich prompt (${prompt.length} chars, ~${Math.round(prompt.length / 4)} tokens)\n`
    );
    return prompt;
  } catch {
    // Fallback to default prompt
    process.stderr.write(`[load-persona] Rich prompt not found, using default\n`);
    return `You are ${personaId}, a warm and supportive life coach.`;
  }
}

/**
 * Load a custom user-created agent from Firestore.
 */
async function loadCustomAgent(personaId: string, userId: string): Promise<PersonaConfig | null> {
  try {
    const { isCustomAgentId, loadCustomAgentAsPersona, createFallbackCustomAgentPersona } =
      await import('../../../services/custom-agent/custom-agent-runtime.service.js');

    if (!isCustomAgentId(personaId)) {
      return null;
    }

    process.stderr.write(`[load-persona] Detected custom agent ID: ${personaId}\n`);

    if (!userId) {
      process.stderr.write(`[load-persona] No userId for custom agent, using fallback\n`);
      return createFallbackCustomAgentPersona(personaId, personaId);
    }

    const customPersona = await loadCustomAgentAsPersona(personaId, userId);

    if (customPersona) {
      process.stderr.write(`[load-persona] Loaded custom agent: ${customPersona.name} ✨\n`);
      return customPersona;
    }

    process.stderr.write(`[load-persona] Custom agent not found, using fallback\n`);
    return createFallbackCustomAgentPersona(personaId, personaId);
  } catch (error) {
    process.stderr.write(`[load-persona] Custom agent loading failed: ${error}\n`);
    return null;
  }
}

/**
 * Load persona phase - gets persona config and system prompt.
 * Supports both built-in personas and custom user-created agents.
 */
export async function loadPersonaPhase(ctx: JobContext): Promise<PersonaPhaseResult> {
  const { personaId, userId } = parseMetadata(ctx);
  process.stderr.write(`[load-persona] Resolved personaId: ${personaId}, userId: ${userId}\n`);

  // =========================================================================
  // CHECK FOR CUSTOM AGENT
  // =========================================================================
  // Custom agents are stored in Firestore and have IDs prefixed with 'agent_', 'custom_', or 'ca_'
  const customPersona = await loadCustomAgent(personaId, userId || '');

  if (customPersona) {
    process.stderr.write(`[load-persona] Using custom agent: ${customPersona.name}\n`);

    // Custom agents already have their system prompt generated
    return {
      personaId,
      persona: customPersona,
      systemPrompt: customPersona.systemPrompt,
      usePrewarmed: false,
    };
  }

  // =========================================================================
  // STANDARD PERSONA LOADING
  // =========================================================================
  const {
    usePrewarmed,
    persona: cachedPersona,
    systemPrompt: cachedPrompt,
  } = await getPrewarmedResources(personaId);

  let persona = cachedPersona;

  if (!usePrewarmed) {
    const startup = await import('../../../startup.js');
    await startup.startup();
    persona = await loadPersonaLocally(personaId);
  }

  // Get default voice config for fallback
  const { getDefaultVoiceConfig } = await import('../../../config/cartesia-config.js');
  const defaultVoice = getDefaultVoiceConfig();

  // Default communication config for greeting generation
  const defaultCommunication = {
    greetingStyle: 'warm-friend' as const,
    returningUserStyle: 'warm-friend' as const,
    formalityLevel: 0.3,
    thinkingPhrases: ['Let me think about that...', 'Hmm...'],
    listeningCues: ['I hear you', 'Go on...'],
    backchannels: { neutral: ['mm-hmm'], engaged: ['right'], empathetic: ['I understand'] },
    silenceFillers: {
      early: ['Take your time'],
      mid: ["I'm here"],
      late: ["Whenever you're ready"],
    },
    selfCorrections: ['Actually, let me rephrase that...'],
    trailingOffs: ['You know...'],
    interruptionRecoveries: ['Sorry, go ahead'],
    humilityPhrases: ['I could be wrong, but...'],
    emotionalExpressions: {
      laughter: ['haha'],
      surprise: ['Oh!'],
      concern: ['Oh no...'],
      joy: ["That's wonderful!"],
      empathy: ['I understand...'],
    },
  };

  // Create full persona config with defaults
  const fullPersona = (persona || {
    id: personaId,
    name: personaId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    voice: { voiceId: defaultVoice.voiceId, provider: defaultVoice.provider },
    systemPrompt: cachedPrompt || `You are ${personaId}, a warm and supportive life coach.`,
    personality: { warmth: 0.7, humor: 0.4, directness: 0.6, energy: 0.6 },
    speechCharacteristics: { baseSpeedMultiplier: 1.0, pauseMultiplier: 1.0 },
  }) as unknown as PersonaConfig;

  // Ensure communication config exists (may be missing from cache)
  if (!fullPersona.communication) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fullPersona as any).communication = defaultCommunication;
  }

  // Ensure identity config exists (greetings.ts accesses identity.selfReference)
  if (!fullPersona.identity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fullPersona as any).identity = {
      selfReference: fullPersona.name || personaId,
      coreValues: ['empathy', 'growth', 'authenticity'],
      role: 'life coach',
      priorities: ['user wellbeing', 'genuine connection'],
      desiredUserExperience: 'feeling heard and supported',
    };
  }

  // Load rich system prompt
  const systemPrompt = await loadRichSystemPrompt(personaId);

  process.stderr.write(`[load-persona] Using persona: ${fullPersona.name}\n`);

  return {
    personaId,
    persona: fullPersona,
    systemPrompt,
    usePrewarmed,
  };
}
