/**
 * Director Mode Session Setup
 *
 * Creates DirectorEngine, PersonaActors, AudioRouter, and Qwen3OmniRealtimeModel
 * for Director Mode sessions. Registers the engine for WebSocket access.
 *
 * Triggered when USE_QWEN3_OMNI_DIRECTOR=true or room metadata requests director mode.
 *
 * @module voice-agent/director-mode-setup
 */

import { registerDirectorEngine } from '../../api/director-routes.js';
import { Qwen3OmniRealtimeModel } from '../../integrations/qwen3-omni/adapters/livekit-realtime-model.js';
import {
  createMockQwen3OmniClient,
  isQwen3OmniMockEnabled,
} from '../../integrations/qwen3-omni/client-mock.js';
import type { Qwen3OmniClient } from '../../integrations/qwen3-omni/client.js';
import { createQwen3OmniClient } from '../../integrations/qwen3-omni/client.js';
import { AudioRouter } from '../../integrations/qwen3-omni/director/audio-router.js';
import { AutoDirector } from '../../integrations/qwen3-omni/director/auto-director.js';
import { DirectorEngine } from '../../integrations/qwen3-omni/director/director-engine.js';
import {
  PersonaActor,
  type PersonaBundleRef,
} from '../../integrations/qwen3-omni/director/persona-actor.js';
import type { PersonaId } from '../../integrations/qwen3-omni/director/types.js';
import { getPersona, listPersonas } from '../../personas/index.js';
import type { PersonaConfig } from '../../personas/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DirectorModeSetup' });

// =============================================================================
// TYPES
// =============================================================================

export interface DirectorModeSetupConfig {
  /** Session ID */
  sessionId: string;
  /** User ID (person being coached) */
  userId: string;
  /** Director user ID (defaults to userId when single user) */
  directorUserId?: string;
  /** Initial lead persona */
  initialLead: PersonaId;
  /** Initial cast (persona IDs on stage) */
  initialCast: readonly PersonaId[];
  /** Initial scene mood */
  initialMood?: 'warm' | 'serious' | 'playful' | 'supportive';
  /** Auto-director mode */
  autoDirectorMode?: 'off' | 'suggest' | 'autopilot';
  /** Max ensemble size */
  maxEnsembleSize?: number;
  /** Enable Qwen3-TTS for per-segment voice (optional) */
  useTtsClient?: boolean;
  /** Send data messages to frontend (for session manager emotion/quality events). Used when USE_QWEN3_OMNI_FULL_STACK=true. */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => void | Promise<void>;
  /** Session services (DI container). Used when USE_QWEN3_OMNI_FULL_STACK=true. */
  services?: unknown;
}

export interface DirectorModeSetupResult {
  /** RealtimeModel (Qwen3OmniRealtimeModel or SessionManagerRealtimeModel when FULL_STACK) */
  realtimeModel:
    | Qwen3OmniRealtimeModel
    | import('../../integrations/qwen3-omni/adapters/livekit-session-manager-adapter.js').SessionManagerRealtimeModel;
  directorEngine: DirectorEngine;
  audioRouter: AudioRouter;
  /** AutoDirector for intelligent cast/scene suggestions (used when autoDirectorMode !== 'off') */
  autoDirector: AutoDirector;
}

// =============================================================================
// PERSONA CONFIG → BUNDLE REF
// =============================================================================

function personaConfigToBundleRef(config: PersonaConfig): PersonaBundleRef {
  const excerpt = config.systemPrompt?.slice(0, 600) ?? config.description;
  const cognitiveStyle =
    (config as PersonaConfig & { communication?: { style?: string } }).communication?.style ??
    (config as PersonaConfig & { personality?: { style?: string } }).personality?.energy ??
    'warm and thoughtful';
  const domains =
    (config as PersonaConfig & { knowledge?: { domains?: string[] } }).knowledge?.domains ?? [];

  return {
    id: config.id,
    name: config.name,
    displayName: config.displayName,
    description: config.description,
    role: (config as PersonaConfig & { identity?: { role?: string } }).identity?.role,
    systemPromptExcerpt: excerpt,
    cognitiveStyle: String(cognitiveStyle),
    domains: Array.isArray(domains) ? domains : [],
  };
}

// =============================================================================
// SETUP
// =============================================================================

/**
 * Create a Director Mode session: DirectorEngine, PersonaActors, AudioRouter,
 * and Qwen3OmniRealtimeModel. Registers the engine for WebSocket access.
 *
 * Call this when USE_QWEN3_OMNI_DIRECTOR=true (or room metadata) and pass the
 * returned realtimeModel to AgentSession as llm. Pass audioRouter to
 * setupDataChannelHandler context so director commands are routed.
 */
export async function createDirectorModeSession(
  config: DirectorModeSetupConfig
): Promise<DirectorModeSetupResult> {
  const directorUserId = config.directorUserId ?? config.userId;
  const personaIds = listPersonas();
  const initialCast =
    config.initialCast.length > 0 ? config.initialCast : ([config.initialLead] as PersonaId[]);

  const autoDirectorMode = config.autoDirectorMode ?? 'autopilot';
  const engine = new DirectorEngine({
    sessionId: config.sessionId,
    userId: config.userId,
    directorUserId,
    initialLead: config.initialLead,
    initialCast,
    initialMood: config.initialMood ?? 'warm',
    autoDirectorMode,
    maxEnsembleSize: config.maxEnsembleSize ?? 4,
    enableMusic: false,
  });

  const autoDirector = new AutoDirector(engine, {
    mode: autoDirectorMode,
    minSuggestionConfidence: 0.5,
    minAutopilotConfidence: 0.75,
    maxPendingSuggestions: 5,
    suggestionCooldownMs: 60_000,
  });

  for (const id of personaIds) {
    const personaConfig = getPersona(id);
    if (!personaConfig) continue;
    const bundle = personaConfigToBundleRef(personaConfig);
    const isLead = id === config.initialLead;
    const onStage = initialCast.includes(id as PersonaId);
    const actor = new PersonaActor({
      personaId: id as PersonaId,
      bundle,
      initialPosition: isLead ? 'lead' : onStage ? 'supporting' : 'off-stage',
      initialMood: (config.initialMood ?? 'warm') as 'warm' | 'serious' | 'playful' | 'supportive',
    });
    engine.registerActor(actor);
  }

  const audioRouter = new AudioRouter({
    directorEngine: engine,
    authorizedDirectorIds: [directorUserId],
  });

  const client: Qwen3OmniClient = isQwen3OmniMockEnabled()
    ? (createMockQwen3OmniClient() as unknown as Qwen3OmniClient)
    : createQwen3OmniClient();
  if (isQwen3OmniMockEnabled()) {
    log.info('Director Mode using mock Qwen3-Omni client (no Thinker/TTS servers)');
  }
  let ttsClient: import('../../integrations/qwen3-omni/tts-client.js').Qwen3TTSClient | undefined;
  if (config.useTtsClient && !isQwen3OmniMockEnabled()) {
    try {
      const { Qwen3TTSClient } = await import('../../integrations/qwen3-omni/tts-client.js');
      const { getQwen3OmniConfig } = await import('../../integrations/qwen3-omni/config.js');
      const omniConfig = getQwen3OmniConfig();
      ttsClient = new Qwen3TTSClient({
        serverUrl: omniConfig.ttsServerUrl ?? omniConfig.serverUrl.replace(':8000', ':8001'),
        language: 'English',
      });
    } catch (e) {
      log.warn({ error: String(e) }, 'Qwen3-TTS client not available, using Thinker audio only');
    }
  }

  // Default full stack when Qwen is on; set USE_QWEN3_OMNI_FULL_STACK=false to disable
  const useFullStack =
    process.env.USE_QWEN3_OMNI === 'true' && process.env.USE_QWEN3_OMNI_FULL_STACK !== 'false';

  let realtimeModel: DirectorModeSetupResult['realtimeModel'];

  if (useFullStack) {
    const { SessionManagerRealtimeModel } =
      await import('../../integrations/qwen3-omni/adapters/livekit-session-manager-adapter.js');
    const { getQwen3OmniConfig } = await import('../../integrations/qwen3-omni/config.js');
    const omniConfig = getQwen3OmniConfig();
    realtimeModel = new SessionManagerRealtimeModel({
      sessionId: config.sessionId,
      userId: config.userId,
      personaId: config.initialLead,
      serverUrl: omniConfig.serverUrl,
      ttsServerUrl: omniConfig.ttsServerUrl,
      services: config.services ?? {},
      sendDataMessage: config.sendDataMessage,
      client,
    });
    log.info(
      { sessionId: config.sessionId },
      'Director Mode using full stack (SessionManagerRealtimeModel)'
    );
  } else {
    realtimeModel = new Qwen3OmniRealtimeModel({
      client,
      ttsClient,
      directorEngine: engine,
      autoDirector,
      defaultPersonaId: config.initialLead,
      sessionId: config.sessionId,
      userName: config.userId,
    });
  }

  registerDirectorEngine(config.sessionId, engine);

  log.info(
    {
      sessionId: config.sessionId,
      initialLead: config.initialLead,
      directorUserId,
      autoDirectorMode,
    },
    'Director Mode session created'
  );

  return { realtimeModel, directorEngine: engine, audioRouter, autoDirector };
}

/**
 * Check if Director Mode should be used for this session (env or room metadata).
 */
export function isDirectorModeRequested(roomMetadata?: string): boolean {
  if (process.env.USE_QWEN3_OMNI_DIRECTOR === 'true') return true;
  if (!roomMetadata) return false;
  try {
    const meta = JSON.parse(roomMetadata) as Record<string, unknown>;
    return meta.directorMode === true;
  } catch {
    return false;
  }
}
