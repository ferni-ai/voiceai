/**
 * The voices a person can pick for their own agent. The server owns the list
 * (GET /api/custom-agents/voices, from custom-agent-voice-catalog.ts), so the id the
 * picker sends to select-premade is a real Cartesia voice id the server accepts.
 * The list this replaced sent ids like "cartesia-friendly-female", which it refused.
 */
import { createLogger } from '../utils/logger.js';
import { getApiHeadersAsync } from '../utils/api.js';

const log = createLogger('VoiceLibrary');

async function fetchCatalog(): Promise<CatalogVoice[]> {
  const response = await fetch('/api/custom-agents/voices', {
    headers: await getApiHeadersAsync(true),
  });
  if (!response.ok) throw new Error(`Voice library request failed: ${response.status}`);
  return ((await response.json()) as { voices: CatalogVoice[] }).voices;
}

/** A voice a person can pick for their agent; `id` is the Cartesia voice id select-premade takes. */
export interface PreMadeVoice {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  gender: 'male' | 'female';
  age: 'young' | 'adult' | 'older';
  accent: 'american' | 'british' | 'australian' | 'indian';
  tags: string[];
}

/** One entry of GET /api/custom-agents/voices (server custom-agent-voice-catalog.ts). */
interface CatalogVoice {
  voiceId: string;
  name: string;
  description: string;
  gender: PreMadeVoice['gender'];
  age: PreMadeVoice['age'];
  accent: PreMadeVoice['accent'];
  tags: string[];
}

export type VoiceLibraryState = 'idle' | 'loading' | 'ready' | 'failed';

// The server owns the list, so the ids the picker sends are the ids select-premade accepts.
let voiceLibrary: PreMadeVoice[] = [];
let voiceLibraryState: VoiceLibraryState = 'idle';
let voiceLibraryLoad: Promise<PreMadeVoice[]> | null = null;
let voiceLibraryFailedAt = 0;

/** Where a voice's preview clip is served (apps/web/public/sounds/voice-library). */
export function voicePreviewUrl(voiceId: string): string {
  return `/sounds/voice-library/${voiceId}.mp3`;
}

/**
 * Loads the voice library from the server once; later calls share the same request.
 * A failed load can be retried by calling again.
 */
export function loadVoiceLibrary(): Promise<PreMadeVoice[]> {
  if (voiceLibraryState === 'ready') return Promise.resolve(voiceLibrary);
  if (voiceLibraryLoad) return voiceLibraryLoad;
  voiceLibraryState = 'loading';
  voiceLibraryLoad = fetchCatalog()
    .then((voices) => {
      voiceLibrary = voices.map((v) => ({
        id: v.voiceId,
        name: v.name,
        description: v.description,
        previewUrl: voicePreviewUrl(v.voiceId),
        gender: v.gender,
        age: v.age,
        accent: v.accent,
        tags: v.tags,
      }));
      voiceLibraryState = 'ready';
      return voiceLibrary;
    })
    .catch((err: unknown) => {
      log.warn('Voice library failed to load:', err);
      voiceLibraryState = 'failed';
      voiceLibraryFailedAt = Date.now();
      return [];
    })
    .finally(() => {
      voiceLibraryLoad = null;
    });
  return voiceLibraryLoad;
}

/** The voices loaded so far (empty until loadVoiceLibrary resolves). */
export function getVoiceLibrary(): PreMadeVoice[] {
  return voiceLibrary;
}

export function getVoiceLibraryState(): VoiceLibraryState {
  return voiceLibraryState;
}

/** When the last load failed (ms since epoch), 0 if it never has. */
export function getVoiceLibraryFailedAt(): number {
  return voiceLibraryFailedAt;
}

/**
 * Gets a specific voice from the library
 */
export function getVoiceFromLibrary(voiceId: string): PreMadeVoice | undefined {
  return voiceLibrary.find((v) => v.id === voiceId);
}
