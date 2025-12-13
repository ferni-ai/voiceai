/**
 * Resource Server - Google/Anthropic-style Resource Sharing
 *
 * Pattern: Main process owns expensive resources, child processes request access via IPC.
 *
 * Why this approach?
 * - VAD models, TTS connections, LLM clients can't be serialized across processes
 * - But we CAN share access to them via message passing
 * - Main process runs inference/requests, returns results to children
 *
 * This is the "sidecar" pattern used at Google (Borg) and Anthropic (inference serving).
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ResourceServer' });

// ============================================================================
// TYPES
// ============================================================================

export type ResourceType = 'vad' | 'tts' | 'llm' | 'persona';

export interface ResourceRequest {
  id: string;
  type: ResourceType;
  action: string;
  payload: unknown;
}

export interface ResourceResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================================================
// RESOURCE REGISTRY (Main Process)
// ============================================================================

interface VADResource {
  isLoaded: boolean;
  loadPromise: Promise<void> | null;
  model: unknown | null; // Silero VAD model
}

interface TTSResource {
  isConnected: boolean;
  personaClients: Map<string, unknown>; // Cartesia TTS clients per persona
}

interface PersonaResource {
  configs: Map<string, unknown>; // Cached persona configs
}

class ResourceRegistry {
  private vad: VADResource = {
    isLoaded: false,
    loadPromise: null,
    model: null,
  };

  private tts: TTSResource = {
    isConnected: false,
    personaClients: new Map(),
  };

  private personas: PersonaResource = {
    configs: new Map(),
  };

  private warmupComplete = false;
  private warmupPromise: Promise<void> | null = null;

  /**
   * Pre-warm all expensive resources (called once at startup)
   */
  async warmup(): Promise<void> {
    if (this.warmupComplete) return;
    if (this.warmupPromise) return this.warmupPromise;

    this.warmupPromise = this._doWarmup();
    await this.warmupPromise;
    this.warmupComplete = true;
  }

  private async _doWarmup(): Promise<void> {
    const startTime = Date.now();
    log.info('Starting resource warmup...');

    try {
      // Warm up in parallel
      await Promise.all([this.warmupVAD(), this.warmupTTS(), this.warmupPersonas()]);

      log.info({ durationMs: Date.now() - startTime }, 'Resource warmup complete');
    } catch (error) {
      log.error({ error: String(error) }, 'Resource warmup failed');
      throw error;
    }
  }

  private async warmupVAD(): Promise<void> {
    if (this.vad.isLoaded) return;

    const start = Date.now();
    log.info('Loading VAD model...');

    try {
      const silero = await import('@livekit/agents-plugin-silero');
      this.vad.model = await silero.VAD.load();
      this.vad.isLoaded = true;
      log.info({ durationMs: Date.now() - start }, 'VAD model loaded');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load VAD model');
      throw error;
    }
  }

  private async warmupTTS(): Promise<void> {
    if (this.tts.isConnected) return;

    const start = Date.now();
    log.info('Pre-connecting TTS clients...');

    try {
      // Import TTS creation function
      const { createPersonaAwareTTS } = await import('../../speech/voice-manager.js');

      // Pre-create TTS clients for common personas
      const commonPersonas = ['ferni', 'alex-chen', 'peter-john', 'maya-santos', 'jordan-taylor', 'nayan-patel'];

      for (const personaId of commonPersonas) {
        try {
          // Get persona voice config
          const { getPersonaAsync } = await import('../../personas/index.js');
          const persona = await getPersonaAsync(personaId);
          if (persona?.voice) {
            const tts = createPersonaAwareTTS(persona.name, {
              ...persona.voice,
              accent: 'american',
            });
            this.tts.personaClients.set(personaId, tts);
          }
        } catch {
          // Non-fatal - persona might not exist
        }
      }

      this.tts.isConnected = true;
      log.info(
        { durationMs: Date.now() - start, clientCount: this.tts.personaClients.size },
        'TTS clients pre-connected'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to pre-connect TTS clients');
      // Non-fatal - TTS will be created on-demand
    }
  }

  private async warmupPersonas(): Promise<void> {
    const start = Date.now();
    log.info('Caching persona configs...');

    try {
      const { initializeFromBundles, getPersonaAsync } = await import('../../personas/index.js');
      await initializeFromBundles();

      // Cache all persona configs
      const personaIds = ['ferni', 'alex-chen', 'peter-john', 'maya-santos', 'jordan-taylor', 'nayan-patel'];
      for (const id of personaIds) {
        try {
          const config = await getPersonaAsync(id);
          if (config) {
            this.personas.configs.set(id, config);
          }
        } catch {
          // Non-fatal
        }
      }

      log.info(
        { durationMs: Date.now() - start, configCount: this.personas.configs.size },
        'Persona configs cached'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to cache persona configs');
    }
  }

  // ============================================================================
  // RESOURCE ACCESS
  // ============================================================================

  getVAD(): unknown {
    if (!this.vad.isLoaded || !this.vad.model) {
      throw new Error('VAD not loaded - call warmup() first');
    }
    return this.vad.model;
  }

  getTTS(personaId: string): unknown | null {
    return this.tts.personaClients.get(personaId) || null;
  }

  getPersonaConfig(personaId: string): unknown | null {
    return this.personas.configs.get(personaId) || null;
  }

  isWarmedUp(): boolean {
    return this.warmupComplete;
  }

  getStatus(): {
    warmedUp: boolean;
    vadLoaded: boolean;
    ttsClients: number;
    personasCached: number;
  } {
    return {
      warmedUp: this.warmupComplete,
      vadLoaded: this.vad.isLoaded,
      ttsClients: this.tts.personaClients.size,
      personasCached: this.personas.configs.size,
    };
  }
}

// Singleton instance
let registry: ResourceRegistry | null = null;

export function getResourceRegistry(): ResourceRegistry {
  if (!registry) {
    registry = new ResourceRegistry();
  }
  return registry;
}

// ============================================================================
// IPC MESSAGE HANDLER (Main Process)
// ============================================================================

/**
 * Handle resource requests from child processes
 */
export async function handleResourceRequest(request: ResourceRequest): Promise<ResourceResponse> {
  const reg = getResourceRegistry();

  try {
    switch (request.type) {
      case 'vad':
        return handleVADRequest(reg, request);

      case 'tts':
        return handleTTSRequest(reg, request);

      case 'persona':
        return handlePersonaRequest(reg, request);

      default:
        return {
          id: request.id,
          success: false,
          error: `Unknown resource type: ${request.type}`,
        };
    }
  } catch (error) {
    return {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleVADRequest(reg: ResourceRegistry, request: ResourceRequest): ResourceResponse {
  switch (request.action) {
    case 'get':
      // Return VAD availability (model can't be serialized)
      return {
        id: request.id,
        success: true,
        data: { available: reg.isWarmedUp() },
      };

    case 'status':
      return {
        id: request.id,
        success: true,
        data: reg.getStatus(),
      };

    default:
      return {
        id: request.id,
        success: false,
        error: `Unknown VAD action: ${request.action}`,
      };
  }
}

function handleTTSRequest(reg: ResourceRegistry, request: ResourceRequest): ResourceResponse {
  const payload = request.payload as { personaId?: string };

  switch (request.action) {
    case 'get':
      // Check if TTS is available for persona
      const tts = payload.personaId ? reg.getTTS(payload.personaId) : null;
      return {
        id: request.id,
        success: true,
        data: { available: !!tts, personaId: payload.personaId },
      };

    default:
      return {
        id: request.id,
        success: false,
        error: `Unknown TTS action: ${request.action}`,
      };
  }
}

function handlePersonaRequest(reg: ResourceRegistry, request: ResourceRequest): ResourceResponse {
  const payload = request.payload as { personaId?: string };

  switch (request.action) {
    case 'get':
      const config = payload.personaId ? reg.getPersonaConfig(payload.personaId) : null;
      return {
        id: request.id,
        success: true,
        data: config,
      };

    case 'list':
      return {
        id: request.id,
        success: true,
        data: { status: reg.getStatus() },
      };

    default:
      return {
        id: request.id,
        success: false,
        error: `Unknown persona action: ${request.action}`,
      };
  }
}

// ============================================================================
// IPC CLIENT (Child Process)
// ============================================================================

let requestId = 0;
const pendingRequests = new Map<string, { resolve: (r: ResourceResponse) => void; reject: (e: Error) => void }>();

/**
 * Initialize IPC client in child process
 */
export function initIPCClient(): void {
  if (!process.send) {
    log.debug('Not a child process - IPC client not initialized');
    return;
  }

  process.on('message', (message: ResourceResponse) => {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      pendingRequests.delete(message.id);
      pending.resolve(message);
    }
  });

  log.debug('IPC client initialized');
}

/**
 * Request a resource from the main process
 */
export async function requestResource(
  type: ResourceType,
  action: string,
  payload: unknown = {}
): Promise<ResourceResponse> {
  if (!process.send) {
    throw new Error('Not a child process - cannot request resources');
  }

  const id = `req-${++requestId}-${Date.now()}`;
  const request: ResourceRequest = { id, type, action, payload };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Resource request timed out: ${type}/${action}`));
    }, 30000);

    try {
      process.send!(request);
    } catch (sendError) {
      clearTimeout(timeout);
      pendingRequests.delete(id);
      reject(sendError instanceof Error ? sendError : new Error(String(sendError)));
    }
  });
}

// ============================================================================
// MAIN PROCESS SETUP
// ============================================================================

/**
 * Setup IPC handler in main process to respond to child requests
 */
export function setupIPCHandler(): void {
  // This is called by the main process to handle child IPC requests
  // The actual message handling happens when we spawn child processes
  log.info('IPC handler ready for child process requests');
}

/**
 * Warmup resources in main process (call during startup)
 */
export async function warmupResources(): Promise<void> {
  const reg = getResourceRegistry();
  await reg.warmup();
}

