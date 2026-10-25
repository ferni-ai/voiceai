/**
 * Google Cloud Storage Service for Custom Agent Audio Files
 *
 * Handles audio file storage for voice cloning and voice journal features.
 * Supports:
 * - Uploading audio files to GCS
 * - Generating signed URLs for temporary access
 * - Cleanup of expired audio files
 *
 * @module services/custom-agent/gcs-storage
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'GcsStorageService' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * GCS bucket name for custom agent audio files
 * Falls back to project-based bucket name or empty string (disables GCS)
 */
const GCS_BUCKET =
  process.env.GCS_CUSTOM_AGENT_BUCKET ||
  process.env.GCS_VOICE_BUCKET ||
  (process.env.GOOGLE_CLOUD_PROJECT ? `${process.env.GOOGLE_CLOUD_PROJECT}-custom-agents` : '');

/**
 * Base URL for GCS public access
 */
const GCS_BASE_URL = `https://storage.googleapis.com/${GCS_BUCKET}`;

/**
 * Default expiration time for signed URLs (1 hour)
 */
const DEFAULT_SIGNED_URL_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * Audio file paths by type
 */
const AUDIO_PATHS = {
  voiceClone: 'voice-clones',
  voiceJournal: 'voice-journals',
  voicePreview: 'voice-previews',
} as const;

type AudioPathType = keyof typeof AUDIO_PATHS;

// ============================================================================
// TYPES
// ============================================================================

export interface UploadResult {
  /** Public URL, only when the caller asked for a public file; null for a private one */
  publicUrl: string | null;
  /** GCS file path */
  filePath: string;
  /** File size in bytes */
  size: number;
}

export interface SignedUrlResult {
  /** Signed URL for temporary access */
  signedUrl: string;
  /** Expiration timestamp */
  expiresAt: Date;
}

// ============================================================================
// GCS CLIENT
// ============================================================================

/**
 * Lazy-loaded GCS Storage client
 *
 * Note: Using `any` here because @google-cloud/storage is dynamically imported
 * and the Storage class type varies by import method. The client is used
 * with .bucket() calls which require runtime type flexibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storageClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStorageClient(): Promise<any> {
  if (storageClient) {
    return storageClient;
  }

  if (!GCS_BUCKET) {
    log.debug({}, 'GCS bucket not configured for custom agents');
    return null;
  }

  try {
    const gcs = await import('@google-cloud/storage');
    interface GcsModule {
      Storage?: new () => any;
      default?: { Storage?: new () => any };
    }
    const Storage = (gcs as GcsModule).Storage || (gcs as GcsModule).default?.Storage;
    if (!Storage) {
      log.warn({}, 'GCS Storage class not found');
      return null;
    }
    storageClient = new Storage();
    log.info({ bucket: GCS_BUCKET }, 'GCS Storage client initialized');
    return storageClient;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize GCS Storage client');
    return null;
  }
}

// ============================================================================
// UPLOAD FUNCTIONS
// ============================================================================

/**
 * Upload audio buffer to GCS for voice cloning
 *
 * @param audioBuffer - Audio data as ArrayBuffer or Buffer
 * @param userId - User ID for namespacing
 * @param agentId - Agent ID for file organization
 * @param filename - Original filename
 * @param pathType - Type of audio (voiceClone, voiceJournal, voicePreview)
 * @param makePublic - Whether to make the file publicly readable (default: false).
 *   Voice-clone samples are always private: they are raw recordings of a person.
 * @returns Upload result with URL or null if upload failed
 */
export async function uploadAudioToGcs(
  audioBuffer: ArrayBuffer | Buffer,
  userId: string,
  agentId: string,
  filename: string,
  pathType: AudioPathType = 'voiceClone',
  makePublic = false
): Promise<UploadResult | null> {
  const storage = await getStorageClient();

  if (!storage) {
    log.debug({}, 'GCS not available, audio upload skipped');
    return null;
  }

  try {
    const bucket = storage.bucket(GCS_BUCKET);

    // Sanitize filename and create path
    const sanitizedFilename = sanitizeFilename(filename);
    const timestamp = Date.now();
    const filePath = `${AUDIO_PATHS[pathType]}/${userId}/${agentId}/${timestamp}-${sanitizedFilename}`;
    const file = bucket.file(filePath);

    // Convert ArrayBuffer to Buffer if needed
    const buffer =
      audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(new Uint8Array(audioBuffer));

    // Determine content type from filename
    const contentType = getContentTypeFromFilename(sanitizedFilename);

    await file.save(buffer, {
      metadata: {
        contentType,
        cacheControl: makePublic ? 'public, max-age=86400' : 'private, no-store',
        metadata: {
          userId,
          agentId,
          uploadedAt: new Date().toISOString(),
        },
      },
      public: makePublic,
    });

    const publicUrl = makePublic ? `${GCS_BASE_URL}/${filePath}` : null;
    log.info({ filePath, size: buffer.length, isPublic: makePublic }, 'Audio uploaded to GCS');

    return {
      publicUrl,
      filePath,
      size: buffer.length,
    };
  } catch (error) {
    log.error({ error: String(error), userId, agentId }, 'Failed to upload audio to GCS');
    return null;
  }
}

/**
 * Upload voice preview audio to GCS
 */
export async function uploadVoicePreview(
  audioBuffer: Buffer,
  userId: string,
  agentId: string,
  voiceId: string
): Promise<UploadResult | null> {
  const filename = `preview-${voiceId}.mp3`;
  return uploadAudioToGcs(audioBuffer, userId, agentId, filename, 'voicePreview');
}

/**
 * Upload voice journal entry audio to GCS. Always private: a journal recording
 * must never get a public URL. Read it back through generateSignedUrl.
 */
export async function uploadVoiceJournalEntry(
  audioBuffer: ArrayBuffer | Buffer,
  userId: string,
  agentId: string,
  entryId: string
): Promise<UploadResult | null> {
  const filename = `entry-${entryId}.webm`;
  return uploadAudioToGcs(audioBuffer, userId, agentId, filename, 'voiceJournal', false);
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Download audio from GCS
 *
 * @param filePath - GCS file path
 * @returns Audio buffer or null if download failed
 */
export async function downloadAudioFromGcs(filePath: string): Promise<Buffer | null> {
  const storage = await getStorageClient();

  if (!storage) {
    log.debug({}, 'GCS not available, cannot download audio');
    return null;
  }

  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(filePath);
    const [buffer] = await file.download();
    log.debug({ filePath, size: buffer.length }, 'Downloaded audio from GCS');
    return buffer;
  } catch (error) {
    log.error({ error: String(error), filePath }, 'Failed to download audio from GCS');
    return null;
  }
}

// ============================================================================
// SIGNED URL FUNCTIONS
// ============================================================================

/**
 * Generate a signed URL for temporary file access
 *
 * @param filePath - GCS file path
 * @param expirationMs - Expiration time in milliseconds (default: 1 hour)
 * @returns Signed URL result or null if generation failed
 */
export async function generateSignedUrl(
  filePath: string,
  expirationMs: number = DEFAULT_SIGNED_URL_EXPIRATION_MS
): Promise<SignedUrlResult | null> {
  const storage = await getStorageClient();

  if (!storage) {
    log.debug({}, 'GCS not available, cannot generate signed URL');
    return null;
  }

  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(filePath);
    const expiresAt = new Date(Date.now() + expirationMs);

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    });

    log.debug({ filePath, expiresAt }, 'Generated signed URL');
    return { signedUrl, expiresAt };
  } catch (error) {
    log.error({ error: String(error), filePath }, 'Failed to generate signed URL');
    return null;
  }
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Delete audio file from GCS
 *
 * @param filePath - GCS file path
 * @returns true if deleted, false if failed
 */
export async function deleteAudioFromGcs(filePath: string): Promise<boolean> {
  const storage = await getStorageClient();

  if (!storage) {
    log.debug({}, 'GCS not available, cannot delete audio');
    return false;
  }

  try {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(filePath);
    await file.delete();
    log.info({ filePath }, 'Deleted audio from GCS');
    return true;
  } catch (error) {
    log.warn({ error: String(error), filePath }, 'Failed to delete audio from GCS');
    return false;
  }
}

interface StoredFile {
  name: string;
  delete: () => Promise<unknown>;
}
interface JournalBucket {
  getFiles: (query: { prefix: string }) => Promise<[StoredFile[]]>;
}

/**
 * Delete a voice journal entry's recording. uploadVoiceJournalEntry saves it as
 * voice-journals/{uid}/{agentId}/{timestamp}-entry-{entryId}.webm, and the entry
 * keeps no path (a private file has no URL), so this finds it in that folder.
 * Best effort: the entry is already gone, so a failure is logged, not thrown.
 *
 * @returns Number of files deleted
 */
export async function deleteVoiceJournalAudio(
  userId: string,
  agentId: string,
  entryId: string
): Promise<number> {
  const storage = (await getStorageClient()) as { bucket: (name: string) => JournalBucket } | null;
  if (storage === null) return 0;
  const prefix = `${AUDIO_PATHS.voiceJournal}/${userId}/${agentId}/`;
  const name = sanitizeFilename(`entry-${entryId}.webm`);
  const isThisEntry = (path: string): boolean =>
    path.endsWith(`-${name}`) && /^\d+$/.test(path.slice(prefix.length, -name.length - 1));
  try {
    const [files] = await storage.bucket(GCS_BUCKET).getFiles({ prefix });
    const mine = files.filter((f) => isThisEntry(f.name));
    await Promise.all(mine.map(async (f) => f.delete()));
    return mine.length;
  } catch (error) {
    log.warn({ error: String(error), userId, agentId }, 'Failed to delete journal audio');
    return 0;
  }
}

/**
 * Delete all audio files for a specific agent
 *
 * @param userId - User ID
 * @param agentId - Agent ID
 * @returns Number of files deleted
 */
export async function deleteAgentAudioFiles(userId: string, agentId: string): Promise<number> {
  const storage = await getStorageClient();

  if (!storage) {
    log.debug({}, 'GCS not available, cannot delete agent audio');
    return 0;
  }

  try {
    const bucket = storage.bucket(GCS_BUCKET);
    let totalDeleted = 0;

    // Delete from all audio paths
    for (const pathType of Object.keys(AUDIO_PATHS) as AudioPathType[]) {
      const prefix = `${AUDIO_PATHS[pathType]}/${userId}/${agentId}/`;
      const [files] = await bucket.getFiles({ prefix });

      for (const file of files) {
        await file.delete();
        totalDeleted++;
      }
    }

    log.info({ userId, agentId, totalDeleted }, 'Deleted agent audio files from GCS');
    return totalDeleted;
  } catch (error) {
    log.error({ error: String(error), userId, agentId }, 'Failed to delete agent audio files');
    return 0;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sanitize filename for safe storage
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and special characters
  return filename
    .replace(/[\/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Get content type from filename extension
 */
function getContentTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const contentTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
  };
  return contentTypes[ext || ''] || 'audio/mpeg';
}

/**
 * Check if GCS is configured and available
 */
export function isGcsConfigured(): boolean {
  return !!GCS_BUCKET;
}

/**
 * Get the GCS bucket name
 */
export function getGcsBucketName(): string {
  return GCS_BUCKET;
}
