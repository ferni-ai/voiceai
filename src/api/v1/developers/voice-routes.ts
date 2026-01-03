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
import {
  handleCorsPreflightIfNeeded,
  parseBody,
  sendJSON,
  sendError,
} from '../../helpers.js';

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

interface FirebaseDecodedToken {
  uid: string;
  email?: string;
}

// ============================================================================
// CURATED VOICE LIBRARY
// ============================================================================

/**
 * Curated voices from Cartesia's library suitable for AI personas.
 * These are pre-vetted for quality and appropriate use cases.
 *
 * Voice IDs from: https://play.cartesia.ai/library
 */
const CURATED_VOICES: VoiceInfo[] = [
  // === Female Voices ===
  {
    id: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    name: 'Sarah',
    description: 'Warm and approachable female voice. Great for coaching and support.',
    gender: 'female',
    age: 'middle',
    accent: 'American',
    style: ['warm', 'supportive', 'conversational'],
    recommended_for: ['life coach', 'wellness', 'support'],
  },
  {
    id: '11175483-5332-496c-8c01-ca527ce04e4a',
    name: 'Maya',
    description: 'Energetic and encouraging. Perfect for motivation and habits.',
    gender: 'female',
    age: 'young',
    accent: 'American',
    style: ['energetic', 'encouraging', 'upbeat'],
    recommended_for: ['fitness', 'habits', 'productivity'],
  },
  {
    id: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',
    name: 'Jordan',
    description: 'Professional yet friendly. Ideal for planning and organization.',
    gender: 'female',
    age: 'middle',
    accent: 'American',
    style: ['professional', 'organized', 'friendly'],
    recommended_for: ['planning', 'business', 'events'],
  },
  {
    id: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    name: 'Emma',
    description: 'Soft and calming. Perfect for meditation and relaxation.',
    gender: 'female',
    age: 'young',
    accent: 'British',
    style: ['calm', 'soothing', 'gentle'],
    recommended_for: ['meditation', 'sleep', 'relaxation'],
  },
  {
    id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d',
    name: 'Lily',
    description: 'Bright and enthusiastic. Great for education and learning.',
    gender: 'female',
    age: 'young',
    accent: 'American',
    style: ['bright', 'enthusiastic', 'clear'],
    recommended_for: ['education', 'tutoring', 'language'],
  },

  // === Male Voices ===
  {
    id: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    name: 'Ferni',
    description: 'Warm, wise, and thoughtful. The original Ferni voice.',
    gender: 'male',
    age: 'middle',
    accent: 'American',
    style: ['warm', 'wise', 'thoughtful'],
    recommended_for: ['life coach', 'mentor', 'advisor'],
  },
  {
    id: '3f04e815-3260-4f50-8fd9-af9c657be4c2',
    name: 'Peter',
    description: 'Analytical and articulate. Perfect for research and insights.',
    gender: 'male',
    age: 'mature',
    accent: 'American',
    style: ['analytical', 'articulate', 'knowledgeable'],
    recommended_for: ['research', 'finance', 'analytics'],
  },
  {
    id: '81c164d9-7baa-419d-9f9a-6b18100a01ee',
    name: 'Alex',
    description: 'Clear and professional. Excellent for communication coaching.',
    gender: 'male',
    age: 'middle',
    accent: 'American',
    style: ['clear', 'professional', 'confident'],
    recommended_for: ['communication', 'career', 'leadership'],
  },
  {
    id: '52f0a563-2a2a-4c4a-ab4f-000eaaed32b3',
    name: 'Nayan',
    description: 'Deep and contemplative. Ideal for wisdom and philosophy.',
    gender: 'male',
    age: 'mature',
    accent: 'South Asian',
    style: ['contemplative', 'wise', 'serene'],
    recommended_for: ['wisdom', 'philosophy', 'spirituality'],
  },
  {
    id: '3ebcd114-d280-4eed-a238-b9323a6b8e52',
    name: 'Joel',
    description: 'Authoritative yet approachable. Great for mentorship.',
    gender: 'male',
    age: 'mature',
    accent: 'American',
    style: ['authoritative', 'mentoring', 'trustworthy'],
    recommended_for: ['mentor', 'advisor', 'consulting'],
  },
  {
    id: '41534e16-2966-4c6b-9670-111411def906',
    name: 'Marcus',
    description: 'Strong and motivational. Perfect for fitness and performance.',
    gender: 'male',
    age: 'young',
    accent: 'American',
    style: ['motivational', 'energetic', 'strong'],
    recommended_for: ['fitness', 'sports', 'performance'],
  },
  {
    id: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
    name: 'Oliver',
    description: 'Friendly and patient. Excellent for education.',
    gender: 'male',
    age: 'middle',
    accent: 'British',
    style: ['friendly', 'patient', 'educational'],
    recommended_for: ['education', 'tutoring', 'storytelling'],
  },

  // === Neutral/Other Voices ===
  {
    id: 'f9836c6e-a0bd-460e-9d3c-f7a57f11f83b',
    name: 'Riley',
    description: 'Gender-neutral and modern. Versatile for any use case.',
    gender: 'neutral',
    age: 'young',
    accent: 'American',
    style: ['modern', 'versatile', 'friendly'],
    recommended_for: ['general', 'tech', 'creative'],
  },
];

// Voice categories for filtering
const VOICE_CATEGORIES = [
  { id: 'coaching', name: 'Coaching & Support', tags: ['life coach', 'wellness', 'support', 'mentor'] },
  { id: 'productivity', name: 'Productivity & Business', tags: ['planning', 'business', 'career', 'productivity'] },
  { id: 'education', name: 'Education & Learning', tags: ['education', 'tutoring', 'language'] },
  { id: 'wellness', name: 'Wellness & Meditation', tags: ['meditation', 'sleep', 'relaxation', 'fitness'] },
  { id: 'professional', name: 'Professional Services', tags: ['finance', 'consulting', 'analytics', 'research'] },
];

// ============================================================================
// FIREBASE AUTH HELPER
// ============================================================================

let firebaseAdmin: typeof import('firebase-admin') | null = null;

async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });
  }
  firebaseAdmin = admin;
  return firebaseAdmin;
}

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  where: (field: string, op: string, value: unknown) => Query;
}

interface Query {
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface QuerySnapshot {
  empty: boolean;
  docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }>;
}

let db: Firestore | null = null;

async function getFirestore(): Promise<Firestore> {
  if (db) return db;

  const { Firestore } = await import('@google-cloud/firestore');
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  }) as unknown as Firestore;

  return db;
}

/**
 * Get publisher ID from Firebase token
 */
async function getPublisherFromToken(req: IncomingMessage): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.substring(7);

  try {
    const admin = await getFirebaseAdmin();
    const decodedToken = (await admin.auth().verifyIdToken(idToken)) as FirebaseDecodedToken;

    const db = await getFirestore();
    const query = db.collection('publishers').where('firebaseUid', '==', decodedToken.uid).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: err.message }, 'Failed to get publisher from token');
    return null;
  }
}

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
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-3-latest',
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
  "I really appreciate you sharing that with me. How are you feeling about it?",
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
  const publisherId = await getPublisherFromToken(req);
  if (!publisherId) {
    sendError(res, 'Authentication required', 401);
    return true;
  }

  try {
    // GET /api/v1/developers/voices - List all voices
    if (pathname === '/api/v1/developers/voices' && method === 'GET') {
      // Parse query params for filtering
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const gender = url.searchParams.get('gender');
      const category = url.searchParams.get('category');

      let voices = [...CURATED_VOICES];

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
      const voice = CURATED_VOICES.find((v) => v.id.toLowerCase() === voiceId.toLowerCase());

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
