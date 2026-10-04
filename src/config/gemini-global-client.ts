/**
 * Vertex client on the `global` location. Gemini 3.5 models are served only
 * there (us-central1 returns 404). Falls back to getGeminiClient when Vertex is
 * not configured: the API-key client has no location.
 *
 * @module GeminiGlobalClient
 */

import { createLogger } from '../utils/safe-logger.js';
import { GOOGLE_CLOUD_PROJECT, USE_VERTEX_AI, getGeminiClient } from './gemini-config.js';

const log = createLogger({ module: 'GeminiGlobalClient' });

let cachedGlobalClient: unknown | null = null;

export async function getGlobalGeminiClient(): Promise<unknown | null> {
  if (cachedGlobalClient) return cachedGlobalClient;
  if (!USE_VERTEX_AI || !GOOGLE_CLOUD_PROJECT) return getGeminiClient();
  try {
    const { GoogleGenAI } = await import('@google/genai');
    cachedGlobalClient = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: 'global',
    });
    return cachedGlobalClient;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize global Gemini client');
    return null;
  }
}
