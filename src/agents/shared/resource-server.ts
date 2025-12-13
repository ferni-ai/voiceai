/**
 * Resource Server - Google/Anthropic-style Resource Sharing
 *
 * PHASE 3: Shared cache file approach
 *
 * Why this approach?
 * - LiveKit SDK manages child process spawning with its own IPC protocol
 * - We can't easily inject custom IPC into their architecture
 * - Solution: Write pre-warmed configs to a shared cache file
 * - Child processes read from this file (fast, no complex IPC)
 *
 * What's shared via cache file:
 * - Persona configs (name, voice, system prompt)
 * - TTS settings (voiceId, provider, model)
 * - Pre-computed context/prompts
 *
 * What's NOT shared (must be loaded per-process):
 * - VAD model (but OS file cache makes re-load fast)
 * - TTS WebSocket connections (must be per-process)
 */

import { createLogger } from '../../utils/safe-logger.js';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger({ module: 'ResourceServer' });

// Shared cache file location (Cloud Run has /tmp, local dev uses OS temp)
const CACHE_DIR = process.env.CACHE_DIR || '/tmp/ferni-cache';
const PERSONA_CACHE_FILE = path.join(CACHE_DIR, 'persona-configs.json');
const WARMUP_STATUS_FILE = path.join(CACHE_DIR, 'warmup-status.json');

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

      // PHASE 3: Write configs to shared cache file for child processes
      await this.writeCacheFile();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to cache persona configs');
    }
  }

  /**
   * PHASE 3: Write pre-warmed configs to cache file for child processes
   */
  private async writeCacheFile(): Promise<void> {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }

      // Build serializable cache data
      const cacheData: Record<string, {
        name: string;
        systemPrompt: string;
        voice: { voiceId: string; provider: string };
      }> = {};

      for (const [id, config] of this.personas.configs.entries()) {
        const persona = config as {
          name?: string;
          systemPrompt?: string;
          voice?: { voiceId: string; provider: string };
        };
        cacheData[id] = {
          name: persona.name || id,
          systemPrompt: persona.systemPrompt || '',
          voice: persona.voice || { voiceId: '', provider: 'cartesia' },
        };
      }

      // Write persona cache
      fs.writeFileSync(PERSONA_CACHE_FILE, JSON.stringify(cacheData, null, 2));

      // Write warmup status
      fs.writeFileSync(
        WARMUP_STATUS_FILE,
        JSON.stringify({
          warmedUp: true,
          timestamp: Date.now(),
          personaCount: Object.keys(cacheData).length,
        })
      );

      log.info(
        { cacheFile: PERSONA_CACHE_FILE, personaCount: Object.keys(cacheData).length },
        'PHASE 3: Wrote persona configs to shared cache file'
      );
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to write cache file (non-fatal)');
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

    case 'config':
      // Return TTS configuration for persona (Phase 3: share config, not connection)
      const personaConfig = payload.personaId ? reg.getPersonaConfig(payload.personaId) : null;
      if (personaConfig) {
        const persona = personaConfig as { voice?: { voiceId: string; provider: string } };
        return {
          id: request.id,
          success: true,
          data: {
            voiceId: persona.voice?.voiceId || 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
            provider: persona.voice?.provider || 'cartesia',
            model: 'sonic-3',
            accent: 'american',
          },
        };
      }
      return {
        id: request.id,
        success: false,
        error: 'Persona not found',
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

    case 'prompt':
      // Return pre-computed system prompt (Phase 3 optimization)
      const personaConfig = payload.personaId ? reg.getPersonaConfig(payload.personaId) : null;
      if (personaConfig) {
        const persona = personaConfig as { systemPrompt?: string };
        return {
          id: request.id,
          success: true,
          data: persona.systemPrompt || null,
        };
      }
      return {
        id: request.id,
        success: false,
        error: 'Persona not found',
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
let ipcInitialized = false;

/**
 * Initialize IPC client in child process
 */
export function initIPCClient(): void {
  if (ipcInitialized) return;
  if (!process.send) {
    log.debug({ module: 'ResourceServer' }, 'Not a child process - IPC client not initialized');
    return;
  }

  process.on('message', (message: ResourceResponse) => {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      pendingRequests.delete(message.id);
      pending.resolve(message);
    }
  });

  ipcInitialized = true;
  log.debug({ module: 'ResourceServer' }, 'IPC client initialized');
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
// HIGH-LEVEL RESOURCE GETTERS (Child Process API)
// ============================================================================
// PHASE 3: These functions read from the shared cache file written by main process

/**
 * Read persona configs from shared cache file
 * Returns null if cache doesn't exist (main process hasn't warmed up yet)
 */
function readPersonaCache(): Record<string, {
  name: string;
  systemPrompt: string;
  voice: { voiceId: string; provider: string };
}> | null {
  try {
    if (fs.existsSync(PERSONA_CACHE_FILE)) {
      const data = fs.readFileSync(PERSONA_CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Cache file not readable
  }
  return null;
}

/**
 * Check if main process has finished warming up (via cache file)
 */
export async function isMainProcessWarmedUp(): Promise<boolean> {
  try {
    if (fs.existsSync(WARMUP_STATUS_FILE)) {
      const data = fs.readFileSync(WARMUP_STATUS_FILE, 'utf-8');
      const status = JSON.parse(data) as { warmedUp: boolean; timestamp: number };

      // Check if cache is recent (less than 10 minutes old)
      const cacheAge = Date.now() - status.timestamp;
      if (cacheAge < 10 * 60 * 1000) {
        process.stderr.write(
          `[cache] Main process warmed up ${Math.round(cacheAge / 1000)}s ago\n`
        );
        return status.warmedUp;
      }
    }
  } catch {
    // Cache file not readable
  }
  return false;
}

/**
 * Get persona config from shared cache file
 * This is the main Phase 3 optimization - configs are pre-loaded by main process
 */
export async function getPrewarmedPersonaConfig(personaId: string): Promise<{
  name: string;
  systemPrompt: string;
  voice: { voiceId: string; provider: string };
} | null> {
  const cache = readPersonaCache();
  if (cache && cache[personaId]) {
    process.stderr.write(`[cache] Got pre-warmed persona config for ${personaId}\n`);
    return cache[personaId];
  }
  return null;
}

/**
 * Get TTS configuration from cache
 */
export async function getPrewarmedTTSConfig(personaId: string): Promise<{
  voiceId: string;
  provider: string;
  model: string;
  accent: string;
} | null> {
  const cache = readPersonaCache();
  if (cache && cache[personaId]) {
    const persona = cache[personaId];
    return {
      voiceId: persona.voice.voiceId,
      provider: persona.voice.provider,
      model: 'sonic-3',
      accent: 'american',
    };
  }
  return null;
}

/**
 * Get system prompt from cache
 */
export async function getPrewarmedSystemPrompt(personaId: string): Promise<string | null> {
  const cache = readPersonaCache();
  if (cache && cache[personaId]) {
    return cache[personaId].systemPrompt || null;
  }
  return null;
}

// ============================================================================
// LEGACY IPC FUNCTIONS (kept for compatibility, but cache file is preferred)
// ============================================================================

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

