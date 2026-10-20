/**
 * Developer Console Voice Routes
 *
 * Provides voice listing and preview for persona creation:
 * - GET  /api/v1/developers/voices           - List available voices
 * - GET  /api/v1/developers/voices/:id       - Get voice details
 * - POST /api/v1/developers/voices/preview   - Generate audio preview
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from '../../helpers.js';
import { requirePublisherFromToken } from './shared/developer-auth.js';
import { CARTESIA_API_VERSION, CARTESIA_MODEL } from '../../../config/voice-ids.js';
import { isForbiddenCustomAgentVoiceId } from '../../../services/custom-agent/custom-agent-voice-policy.js';

const log = getLogger().child({ module: 'developers-voices' });

// ============================================================================
// TYPES
// ============================================================================

interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  age: 'young' | 'middle' | 'mature';
  accent: string;
  style: string[];
  previewUrl?: string;
  recommended_for?: string[];
}

interface PreviewRequest {
  voice_id: string;
  text?: string;
}

// ============================================================================
// CURATED VOICE LIBRARY
// ============================================================================

/**
 * Stock voices from Cartesia's public library, named as Cartesia names them.
 * Developers get only these: never a voice a Ferni persona speaks in, and never
 * a clone of a real person, consented (Nayan) or retired (the legends). The list
 * used to offer Ferni's old voice, Nayan's clone and five persona voices, with
 * names and genders that didn't match the voices.
 */
const CURATED_VOICES: VoiceInfo[] = [
  {
    id: '694f9389-aac1-45b6-b726-9d9369183238',
    name: 'Sarah',
    description: 'Cartesia library voice "Sarah".',
    gender: 'female',
    age: 'middle',
    accent: 'American',
    style: ['warm', 'conversational'],
    recommended_for: ['life coach', 'support', 'wellness'],
  },
  {
    id: '00a77add-48d5-4ef6-8157-71e5437b282d',
    name: 'Calm Lady',
    description: 'Cartesia library voice "Calm Lady".',
    gender: 'female',
    age: 'middle',
    accent: 'American',
    style: ['calm', 'soothing'],
    recommended_for: ['meditation', 'sleep', 'relaxation'],
  },
  {
    id: '156fb8d2-335b-4950-9cb3-a2d33befec77',
    name: 'Helpful Woman',
    description: 'Cartesia library voice "Helpful Woman".',
    gender: 'female',
    age: 'middle',
    accent: 'American',
    style: ['friendly', 'clear'],
    recommended_for: ['planning', 'productivity', 'education'],
  },
  {
    id: '829ccd10-f8b3-43cd-b8a0-4aeaa81f3b30',
    name: 'Customer Support Lady',
    description: 'Cartesia library voice "Customer Support Lady".',
    gender: 'female',
    age: 'middle',
    accent: 'American',
    style: ['professional', 'patient'],
    recommended_for: ['business', 'consulting', 'support'],
  },
  {
    id: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
    name: 'Customer Support Man',
    description: 'Cartesia library voice "Customer Support Man".',
    gender: 'male',
    age: 'middle',
    accent: 'American',
    style: ['professional', 'patient'],
    recommended_for: ['business', 'career', 'support'],
  },
  {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    name: 'Barbershop Man',
    description: 'Cartesia library voice "Barbershop Man".',
    gender: 'male',
    age: 'middle',
    accent: 'American',
    style: ['warm', 'conversational'],
    recommended_for: ['mentor', 'life coach'],
  },
  {
    id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d',
    name: 'Movieman',
    description: 'Cartesia library voice "Movieman".',
    gender: 'male',
    age: 'mature',
    accent: 'American',
    style: ['deep', 'dramatic'],
    recommended_for: ['research', 'analytics'],
  },
  {
    id: '41534e16-2966-4c6b-9670-111411def906',
    name: "1920's Radioman",
    description: 'Cartesia library voice "1920\'s Radioman".',
    gender: 'male',
    age: 'mature',
    accent: 'American',
    style: ['vintage', 'announcer'],
    recommended_for: ['education', 'tutoring'],
  },
];

/** The catalog, minus any id a persona speaks in right now (env overrides can change that). */
function catalogVoices(): VoiceInfo[] {
  return CURATED_VOICES.filter((v) => !isForbiddenCustomAgentVoiceId(v.id));
}

/** Whether a developer may use this voice (preview, persona manifests): catalog voices only. */
export function isDeveloperCatalogVoice(voiceId: unknown): boolean {
  if (typeof voiceId !== 'string') return false;
  const id = voiceId.toLowerCase();
  return catalogVoices().some((v) => v.id === id);
}

/** Problems with a developer persona manifest's voice (empty when it is fine). */
export function developerVoiceErrors(voice: { provider?: string; voice_id?: unknown }): string[] {
  const errors: string[] = [];
  if (voice.provider !== 'cartesia') errors.push('Voice provider must be "cartesia"');
  if (!voice.voice_id) errors.push('Voice ID is required');
  else if (!isDeveloperCatalogVoice(voice.voice_id)) {
    errors.push(
      'Voice must be a stock voice from the developer catalog (GET /api/v1/developers/voices)'
    );
  }
  return errors;
}

// Voice categories for filtering
const VOICE_CATEGORIES = [
  {
    id: 'coaching',
    name: 'Coaching & Support',
    tags: ['life coach', 'wellness', 'support', 'mentor'],
  },
  {
    id: 'productivity',
    name: 'Productivity & Business',
    tags: ['planning', 'business', 'career', 'productivity'],
  },
  { id: 'education', name: 'Education & Learning', tags: ['education', 'tutoring', 'language'] },
  {
    id: 'wellness',
    name: 'Wellness & Meditation',
    tags: ['meditation', 'sleep', 'relaxation', 'fitness'],
  },
  {
    id: 'professional',
    name: 'Professional Services',
    tags: ['finance', 'consulting', 'analytics', 'research'],
  },
];

// ============================================================================
// TTS PREVIEW GENERATION
// ============================================================================

/**
 * Generate audio preview using Cartesia TTS
 */
async function generateVoicePreview(
  voiceId: string,
  text: string
): Promise<{ audioUrl: string; duration: number } | null> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    log.error('CARTESIA_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'Cartesia TTS failed');
      return null;
    }

    // Get audio as base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

    // Estimate duration (rough calculation: MP3 at 128kbps)
    const durationSeconds = (audioBuffer.byteLength * 8) / 128000;

    return {
      audioUrl,
      duration: Math.round(durationSeconds * 10) / 10,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, voiceId }, 'Voice preview generation failed');
    return null;
  }
}

// Default preview text samples
const PREVIEW_TEXTS = [
  "Hi there! I'm excited to help you on your journey. Let's get started!",
  "That's a great question. Let me think about the best way to approach this.",
  'I really appreciate you sharing that with me. How are you feeling about it?',
  "Remember, progress isn't always linear. Every small step counts.",
];

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleDeveloperVoicesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/v1/developers/voices')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method?.toUpperCase();

  // Authenticate
  const publisherId = await requirePublisherFromToken(req, res);
  if (!publisherId) return true;

  try {
    // GET /api/v1/developers/voices - List all voices
    if (pathname === '/api/v1/developers/voices' && method === 'GET') {
      // Parse query params for filtering
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const gender = url.searchParams.get('gender');
      const category = url.searchParams.get('category');

      let voices = catalogVoices();

      // Filter by gender
      if (gender && ['male', 'female', 'neutral'].includes(gender)) {
        voices = voices.filter((v) => v.gender === gender);
      }

      // Filter by category
      if (category) {
        const categoryDef = VOICE_CATEGORIES.find((c) => c.id === category);
        if (categoryDef) {
          voices = voices.filter((v) =>
            v.recommended_for?.some((r) => categoryDef.tags.includes(r))
          );
        }
      }

      sendJSON(res, {
        success: true,
        voices: voices.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description,
          gender: v.gender,
          age: v.age,
          accent: v.accent,
          style: v.style,
          recommended_for: v.recommended_for,
        })),
        categories: VOICE_CATEGORIES,
        total: voices.length,
      });
      return true;
    }

    // GET /api/v1/developers/voices/:id - Get voice details
    const getMatch = pathname.match(
      /^\/api\/v1\/developers\/voices\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    );
    if (getMatch && method === 'GET') {
      const voiceId = getMatch[1];
      const voice = catalogVoices().find((v) => v.id === voiceId.toLowerCase());

      if (!voice) {
        sendError(res, 'Voice not found in curated library', 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        voice: {
          id: voice.id,
          name: voice.name,
          description: voice.description,
          gender: voice.gender,
          age: voice.age,
          accent: voice.accent,
          style: voice.style,
          recommended_for: voice.recommended_for,
        },
      });
      return true;
    }

    // POST /api/v1/developers/voices/preview - Generate audio preview
    if (pathname === '/api/v1/developers/voices/preview' && method === 'POST') {
      const body = await parseBody<PreviewRequest>(req);

      if (!body.voice_id) {
        sendError(res, 'voice_id is required', 400);
        return true;
      }

      // Validate voice ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.voice_id)) {
        sendError(res, 'Invalid voice_id format', 400);
        return true;
      }
      // Only catalog voices: never a persona's voice or a clone of a real person.
      if (!isDeveloperCatalogVoice(body.voice_id)) {
        log.warn(
          { publisherId, voiceId: body.voice_id },
          'Voice preview refused: not a catalog voice'
        );
        sendError(res, 'voice_id is not in the developer voice catalog', 400);
        return true;
      }

      // Use provided text or random sample
      const previewText =
        body.text && body.text.length > 0 && body.text.length <= 500
          ? body.text
          : PREVIEW_TEXTS[Math.floor(Math.random() * PREVIEW_TEXTS.length)];

      log.info({ publisherId, voiceId: body.voice_id }, 'Generating voice preview');

      const preview = await generateVoicePreview(body.voice_id, previewText);

      if (!preview) {
        sendError(res, 'Failed to generate voice preview', 500);
        return true;
      }

      sendJSON(res, {
        success: true,
        preview: {
          audioUrl: preview.audioUrl,
          duration: preview.duration,
          text: previewText,
          voiceId: body.voice_id,
        },
      });
      return true;
    }

    // Unknown voices route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname, publisherId }, 'Developer voices error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
