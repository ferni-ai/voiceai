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
  /** Public URL if the file is made public */
  publicUrl: string;
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
 */
let storageClient: any = null;

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
 * @param makePublic - Whether to make the file publicly accessible (default: true)
 * @returns Upload result with URL or null if upload failed
 */
export async function uploadAudioToGcs(
  audioBuffer: ArrayBuffer | Buffer,
  userId: string,
  agentId: string,
  filename: string,
  pathType: AudioPathType = 'voiceClone',
  makePublic: boolean = true
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
    const buffer = audioBuffer instanceof Buffer 
      ? audioBuffer 
      : Buffer.from(new Uint8Array(audioBuffer));

    // Determine content type from filename
    const contentType = getContentTypeFromFilename(sanitizedFilename);

    await file.save(buffer, {
      metadata: {
        contentType,
        cacheControl: 'public, max-age=86400', // 1 day cache
        metadata: {
          userId,
          agentId,
          uploadedAt: new Date().toISOString(),
        },
      },
      public: makePublic,
    });

    const publicUrl = `${GCS_BASE_URL}/${filePath}`;
    log.info({ filePath, size: buffer.length, publicUrl }, 'Audio uploaded to GCS');

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
  return uploadAudioToGcs(audioBuffer, userId, agentId, filename, 'voicePreview', true);
}

/**
 * Upload voice journal entry audio to GCS
 */
export async function uploadVoiceJournalEntry(
  audioBuffer: ArrayBuffer | Buffer,
  userId: string,
  agentId: string,
  entryId: string
): Promise<UploadResult | null> {
  const filename = `entry-${entryId}.webm`;
  return uploadAudioToGcs(audioBuffer, userId, agentId, filename, 'voiceJournal', true);
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

