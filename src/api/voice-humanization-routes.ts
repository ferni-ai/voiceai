/**
 * Voice Humanization API Routes
 *
 * Endpoints for:
 * - GET /api/voice-humanization/metrics - Dashboard metrics
 * - GET /api/voice-humanization/dashboard - Full dashboard data
 * - GET /api/voice-humanization/flags - Current feature flags
 * - POST /api/voice-humanization/flags - Update feature flags
 * - POST /api/voice-humanization/flags/reset - Reset flags to defaults
 * - POST /api/voice-humanization/metrics/reset - Reset metrics
 *
 * PostTTS Presets & Config (NEW):
 * - GET /api/voice-humanization/presets - List all available presets
 * - GET /api/voice-humanization/presets/:name - Get a specific preset
 * - GET /api/voice-humanization/config/default - Get default PostTTS config
 * - GET /api/voice-humanization/config/schema - Get config schema with descriptions
 *
 * @module VoiceHumanizationRoutes
 */

import type { Request, Response, Router } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  getFlags,
  resetFlags,
  updateFlags,
  type VoiceHumanizationFlags,
} from '../config/voice-humanization-flags.js';
import {
  getDashboardData,
  getMetricsJson,
  resetMetrics,
} from '../services/voice/voice-humanization-metrics.js';
import {
  PostTTSPresets,
  DEFAULT_CONFIG,
  type PostTTSConfig,
} from '../agents/shared/performance/post-tts-transform.js';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

const log = getLogger().child({ module: 'VoiceHumanizationRoutes' });

// ============================================================================
// HTTP HANDLER (for ui-server.js)
// ============================================================================

/**
 * Handle voice humanization routes (vanilla http server)
 */
export async function handleVoiceHumanizationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';

  // Helper to send JSON response
  const sendJson = (statusCode: number, data: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Helper to read request body
  const readBody = async (): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  };

  try {
    // GET /api/voice-humanization/metrics
    if (pathname === '/api/voice-humanization/metrics' && method === 'GET') {
      const metrics = getMetricsJson();
      sendJson(200, metrics);
      return true;
    }

    // GET /api/voice-humanization/dashboard
    if (pathname === '/api/voice-humanization/dashboard' && method === 'GET') {
      const dashboard = getDashboardData();
      sendJson(200, { success: true, data: dashboard });
      return true;
    }

    // GET /api/voice-humanization/flags
    if (pathname === '/api/voice-humanization/flags' && method === 'GET') {
      const flags = getFlags();
      sendJson(200, { success: true, data: flags });
      return true;
    }

    // POST /api/voice-humanization/flags
    if (pathname === '/api/voice-humanization/flags' && method === 'POST') {
      const body = await readBody();

      const validKeys = [
        'enableProsodyTurnPrediction',
        'enableMicroInterruptions',
        'enableEmotionalArcTts',
        'enableLaughterDetection',
        'enableAmbientAwareness',
        'enableRhythmMirroring',
        'enableEmotionalContagion',
        'enableEnhancedVoiceFingerprinting',
        'enableFftAnalysis',
        'enableEnhancedTurnPrediction',
        'enableMultiSignalLaughter',
        'enableWordTimingRhythm',
        'enableResponseAnticipation',
        'useCachedResponses',
        'cacheConfidenceThreshold',
        'rolloutPercentage',
        'enableVerboseLogging',
        'enableMetrics',
      ];

      const sanitizedUpdates: Partial<VoiceHumanizationFlags> = {};
      for (const key of Object.keys(body)) {
        if (validKeys.includes(key)) {
          (sanitizedUpdates as Record<string, unknown>)[key] = body[key];
        }
      }

      updateFlags(sanitizedUpdates);
      const newFlags = getFlags();

      log.info({ updates: sanitizedUpdates }, '🚩 Flags updated via API');
      sendJson(200, { success: true, data: newFlags });
      return true;
    }

    // POST /api/voice-humanization/flags/reset
    if (pathname === '/api/voice-humanization/flags/reset' && method === 'POST') {
      resetFlags();
      const flags = getFlags();
      log.info('🚩 Flags reset via API');
      sendJson(200, { success: true, data: flags });
      return true;
    }

    // POST /api/voice-humanization/metrics/reset
    if (pathname === '/api/voice-humanization/metrics/reset' && method === 'POST') {
      resetMetrics();
      log.info('📊 Metrics reset via API');
      sendJson(200, { success: true, message: 'Metrics reset' });
      return true;
    }

    // =========================================================================
    // POST-TTS PRESETS & CONFIG - Advanced humanization control
    // =========================================================================

    // GET /api/voice-humanization/presets - List all available presets
    if (pathname === '/api/voice-humanization/presets' && method === 'GET') {
      const presets = Object.keys(PostTTSPresets).map((name) => ({
        name,
        config: PostTTSPresets[name as keyof typeof PostTTSPresets],
        description: getPresetDescription(name),
      }));
      sendJson(200, { success: true, data: presets });
      return true;
    }

    // GET /api/voice-humanization/presets/:name - Get a specific preset
    if (pathname.match(/^\/api\/voice-humanization\/presets\/[a-zA-Z]+$/) && method === 'GET') {
      const presetName = pathname.split('/').pop() as keyof typeof PostTTSPresets;
      const preset = PostTTSPresets[presetName];
      if (!preset) {
        sendJson(404, { success: false, error: `Preset '${presetName}' not found` });
        return true;
      }
      sendJson(200, {
        success: true,
        data: {
          name: presetName,
          config: preset,
          description: getPresetDescription(presetName),
        },
      });
      return true;
    }

    // GET /api/voice-humanization/config/default - Get default config
    if (pathname === '/api/voice-humanization/config/default' && method === 'GET') {
      sendJson(200, {
        success: true,
        data: {
          config: DEFAULT_CONFIG,
          description: 'Default PostTTS configuration with all available options',
        },
      });
      return true;
    }

    // GET /api/voice-humanization/config/schema - Get config schema with descriptions
    if (pathname === '/api/voice-humanization/config/schema' && method === 'GET') {
      const schema = getConfigSchema();
      sendJson(200, { success: true, data: schema });
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error }, 'Voice humanization route error');
    sendJson(500, { success: false, error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// EXPRESS ROUTER (for express-based servers)
// ============================================================================

/**
 * Register voice humanization routes
 */
export function registerVoiceHumanizationRoutes(router: Router): void {
  // GET /api/voice-humanization/metrics
  router.get('/voice-humanization/metrics', (_req: Request, res: Response) => {
    try {
      const metrics = getMetricsJson();
      res.json(metrics);
    } catch (error) {
      log.error({ error }, 'Failed to get metrics');
      res.status(500).json({ success: false, error: 'Failed to get metrics' });
    }
  });

  // GET /api/voice-humanization/dashboard
  router.get('/voice-humanization/dashboard', (_req: Request, res: Response) => {
    try {
      const dashboard = getDashboardData();
      res.json({ success: true, data: dashboard });
    } catch (error) {
      log.error({ error }, 'Failed to get dashboard data');
      res.status(500).json({ success: false, error: 'Failed to get dashboard' });
    }
  });

  // GET /api/voice-humanization/flags
  router.get('/voice-humanization/flags', (_req: Request, res: Response) => {
    try {
      const flags = getFlags();
      res.json({ success: true, data: flags });
    } catch (error) {
      log.error({ error }, 'Failed to get flags');
      res.status(500).json({ success: false, error: 'Failed to get flags' });
    }
  });

  // POST /api/voice-humanization/flags
  router.post('/voice-humanization/flags', (req: Request, res: Response) => {
    try {
      const updates = req.body as Partial<VoiceHumanizationFlags>;

      // Validate updates
      const validKeys = [
        'enableProsodyTurnPrediction',
        'enableMicroInterruptions',
        'enableEmotionalArcTts',
        'enableLaughterDetection',
        'enableAmbientAwareness',
        'enableRhythmMirroring',
        'enableEmotionalContagion',
        'enableEnhancedVoiceFingerprinting',
        'enableFftAnalysis',
        'enableEnhancedTurnPrediction',
        'enableMultiSignalLaughter',
        'enableWordTimingRhythm',
        'enableResponseAnticipation',
        'useCachedResponses',
        'cacheConfidenceThreshold',
        'rolloutPercentage',
        'enableVerboseLogging',
        'enableMetrics',
      ];

      const sanitizedUpdates: Partial<VoiceHumanizationFlags> = {};
      for (const key of Object.keys(updates)) {
        if (validKeys.includes(key)) {
          (sanitizedUpdates as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[
            key
          ];
        }
      }

      updateFlags(sanitizedUpdates);
      const newFlags = getFlags();

      log.info({ updates: sanitizedUpdates }, '🚩 Flags updated via API');
      res.json({ success: true, data: newFlags });
    } catch (error) {
      log.error({ error }, 'Failed to update flags');
      res.status(500).json({ success: false, error: 'Failed to update flags' });
    }
  });

  // POST /api/voice-humanization/flags/reset
  router.post('/voice-humanization/flags/reset', (_req: Request, res: Response) => {
    try {
      resetFlags();
      const flags = getFlags();
      log.info('🚩 Flags reset via API');
      res.json({ success: true, data: flags });
    } catch (error) {
      log.error({ error }, 'Failed to reset flags');
      res.status(500).json({ success: false, error: 'Failed to reset flags' });
    }
  });

  // POST /api/voice-humanization/metrics/reset
  router.post('/voice-humanization/metrics/reset', (_req: Request, res: Response) => {
    try {
      resetMetrics();
      log.info('📊 Metrics reset via API');
      res.json({ success: true, message: 'Metrics reset' });
    } catch (error) {
      log.error({ error }, 'Failed to reset metrics');
      res.status(500).json({ success: false, error: 'Failed to reset metrics' });
    }
  });

  // =========================================================================
  // POST-TTS PRESETS & CONFIG - Advanced humanization control
  // =========================================================================

  // GET /api/voice-humanization/presets
  router.get('/voice-humanization/presets', (_req: Request, res: Response) => {
    try {
      const presets = Object.keys(PostTTSPresets).map((name) => ({
        name,
        config: PostTTSPresets[name as keyof typeof PostTTSPresets],
        description: getPresetDescription(name),
      }));
      res.json({ success: true, data: presets });
    } catch (error) {
      log.error({ error }, 'Failed to get presets');
      res.status(500).json({ success: false, error: 'Failed to get presets' });
    }
  });

  // GET /api/voice-humanization/presets/:name
  router.get('/voice-humanization/presets/:name', (req: Request, res: Response) => {
    try {
      const presetName = req.params.name as keyof typeof PostTTSPresets;
      const preset = PostTTSPresets[presetName];
      if (!preset) {
        res.status(404).json({ success: false, error: `Preset '${presetName}' not found` });
        return;
      }
      res.json({
        success: true,
        data: {
          name: presetName,
          config: preset,
          description: getPresetDescription(presetName),
        },
      });
    } catch (error) {
      log.error({ error }, 'Failed to get preset');
      res.status(500).json({ success: false, error: 'Failed to get preset' });
    }
  });

  // GET /api/voice-humanization/config/default
  router.get('/voice-humanization/config/default', (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: {
          config: DEFAULT_CONFIG,
          description: 'Default PostTTS configuration with all available options',
        },
      });
    } catch (error) {
      log.error({ error }, 'Failed to get default config');
      res.status(500).json({ success: false, error: 'Failed to get default config' });
    }
  });

  // GET /api/voice-humanization/config/schema
  router.get('/voice-humanization/config/schema', (_req: Request, res: Response) => {
    try {
      const schema = getConfigSchema();
      res.json({ success: true, data: schema });
    } catch (error) {
      log.error({ error }, 'Failed to get config schema');
      res.status(500).json({ success: false, error: 'Failed to get config schema' });
    }
  });

  log.info('🎤 Voice humanization routes registered (with PostTTS presets & config)');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get human-readable description for a preset
 */
function getPresetDescription(presetName: string): string {
  const descriptions: Record<string, string> = {
    betterThanHuman:
      'Default production preset. Enables basic humanization (breath, jitter, drift) and SOLA pitch. Advanced features (vocal fry, lip smacks, tempo variation) are off by default.',
    minimal:
      'Minimal processing. Only soft edges for smooth transitions. All humanization disabled.',
    warmIntimate:
      'For emotional/supportive content. Enhanced warmth, vocal fry enabled for intimate trailing off.',
    clearEnergetic:
      'For action-oriented content. More compression, presence boost, light humanization.',
    ultraRealistic:
      'Maximum naturalness. ALL advanced humanization enabled: vocal fry, lip smacks, tempo micro-variations, enhanced emotion prosody.',
    bypass: 'No processing. For debugging only.',
  };
  return descriptions[presetName] || 'No description available';
}

/**
 * Get config schema with descriptions for each option
 */
function getConfigSchema(): Record<
  string,
  { type: string; description: string; default: unknown }
> {
  return {
    // Core processing
    sampleRate: { type: 'number', description: 'Audio sample rate in Hz', default: 24000 },
    enableBreath: {
      type: 'boolean',
      description: 'Enable subtle breath sounds at utterance start',
      default: true,
    },
    breathProbability: {
      type: 'number',
      description: 'Probability of breath injection (0-1)',
      default: 0.15,
    },
    enableWarmth: { type: 'boolean', description: 'Enable low-shelf warmth boost', default: true },
    warmthAmount: { type: 'number', description: 'Warmth intensity (0-1)', default: 0.35 },
    enableSoftEdges: {
      type: 'boolean',
      description: 'Enable soft attack/release at phrase boundaries',
      default: true,
    },
    softEdgeMs: {
      type: 'number',
      description: 'Duration of soft edges in milliseconds',
      default: 15,
    },
    enableCompression: {
      type: 'boolean',
      description: 'Enable dynamic range compression',
      default: true,
    },
    compressionRatio: {
      type: 'number',
      description: 'Compression ratio (1=none, 4=heavy)',
      default: 2.0,
    },
    compressionThresholdDb: {
      type: 'number',
      description: 'Compression threshold in dB',
      default: -18,
    },
    enablePresence: {
      type: 'boolean',
      description: 'Enable presence/clarity boost',
      default: true,
    },
    presenceBoostDb: { type: 'number', description: 'Presence boost in dB', default: 2.0 },

    // Basic humanization
    enableAmplitudeJitter: {
      type: 'boolean',
      description: 'Enable subtle volume variation',
      default: true,
    },
    amplitudeJitterDepth: {
      type: 'number',
      description: 'Amplitude jitter depth (0-0.1)',
      default: 0.015,
    },
    enablePitchDrift: {
      type: 'boolean',
      description: 'Enable slow pitch wandering',
      default: true,
    },
    pitchDriftCents: {
      type: 'number',
      description: 'Pitch drift range in cents',
      default: 5,
    },
    enableNoiseFloor: {
      type: 'boolean',
      description: 'Enable subtle room tone',
      default: true,
    },
    noiseFloorDb: {
      type: 'number',
      description: 'Noise floor level in dB (negative)',
      default: -55,
    },

    // SOLA & Emotion prosody
    useSolaPitch: {
      type: 'boolean',
      description: 'Use SOLA algorithm for artifact-free pitch shifting',
      default: true,
    },
    enableEmotionProsody: {
      type: 'boolean',
      description: 'Enable emotion-responsive pitch/rate modulation',
      default: true,
    },
    emotion: {
      type: 'number',
      description: 'Current emotion level (-1=sad, 0=neutral, 1=happy)',
      default: 0,
    },
    enableAdaptivePacing: {
      type: 'boolean',
      description: 'Slow down for complex content',
      default: false,
    },
    contentComplexity: {
      type: 'number',
      description: 'Content complexity (0=simple, 1=complex)',
      default: 0.5,
    },

    // Advanced humanization
    enableVocalFry: {
      type: 'boolean',
      description: 'Enable creaky voice effect at phrase endings',
      default: false,
    },
    vocalFryDepth: {
      type: 'number',
      description: 'Vocal fry intensity (0-1)',
      default: 0.4,
    },
    vocalFryDurationMs: {
      type: 'number',
      description: 'Vocal fry duration in milliseconds',
      default: 200,
    },
    enableLipSmacks: {
      type: 'boolean',
      description: 'Enable natural mouth sounds between phrases',
      default: false,
    },
    lipSmackProbability: {
      type: 'number',
      description: 'Probability of lip smack at phrase boundary (0-1)',
      default: 0.3,
    },
    enableTempoVariation: {
      type: 'boolean',
      description: 'Enable subtle speed changes within phrases',
      default: false,
    },
    tempoVariationDepth: {
      type: 'number',
      description: 'Tempo variation depth (0.01-0.05 = ±1-5%)',
      default: 0.03,
    },
  };
}
