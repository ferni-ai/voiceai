/**
 * Cleanup Orphaned GCS Uploads Job
 *
 * Removes voice uploads that were never associated with an agent
 * or where the agent was deleted.
 *
 * Runs as a scheduled job via Cloud Scheduler.
 */

import { Storage } from '@google-cloud/storage';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CleanupOrphanedUploads' });

const BUCKET_NAME = process.env.CUSTOM_AGENT_BUCKET || 'voiceai-custom-agents';
const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FILES_PER_RUN = 100;

interface CleanupResult {
  checked: number;
  deleted: number;
  errors: number;
  orphanedFiles: string[];
}

/**
 * Get GCS storage client
 */
function getStorage(): Storage {
  return new Storage();
}

/**
 * Get Firestore instance
 */
function getDb(): FirebaseFirestore.Firestore {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  return getFirestore();
}

/**
 * Check if a voice upload is associated with an active agent
 */
async function isUploadActive(db: FirebaseFirestore.Firestore, gcsUri: string): Promise<boolean> {
  try {
    // Parse userId and agentId from the GCS path
    // Expected format: gs://bucket/voice-samples/{userId}/{agentId}/{filename}
    const pathMatch = gcsUri.match(/voice-samples\/([^/]+)\/([^/]+)\//);
    if (!pathMatch) {
      return false;
    }

    const [, userId, agentId] = pathMatch;

    // Check if agent exists and has this voice URL
    const agentDoc = await db
      .collection('users')
      .doc(userId)
      .collection('custom_agents')
      .doc(agentId)
      .get();

    if (!agentDoc.exists) {
      return false;
    }

    const agentData = agentDoc.data();
    const voiceUrl = agentData?.voice?.audioUrl || agentData?.voice?.gcsUri;

    // Active if the agent references this file
    return voiceUrl?.includes(gcsUri.split('/').pop() || '');
  } catch (error) {
    log.warn({ error: String(error), gcsUri }, 'Error checking upload status');
    return true; // Err on the side of caution
  }
}

/**
 * Check if a file in temp/ is old enough to delete
 */
function isTempFileExpired(metadata: { timeCreated?: string }): boolean {
  if (!metadata.timeCreated) {
    return true;
  }

  const createdAt = new Date(metadata.timeCreated);
  const age = Date.now() - createdAt.getTime();

  return age > ORPHAN_THRESHOLD_MS;
}

/**
 * Run the cleanup job
 */
export async function cleanupOrphanedUploads(): Promise<CleanupResult> {
  const result: CleanupResult = {
    checked: 0,
    deleted: 0,
    errors: 0,
    orphanedFiles: [],
  };

  try {
    const storage = getStorage();
    const db = getDb();
    const bucket = storage.bucket(BUCKET_NAME);

    log.info({ bucket: BUCKET_NAME }, 'Starting orphaned uploads cleanup');

    // 1. Clean up temp/ directory (files older than threshold)
    const [tempFiles] = await bucket.getFiles({
      prefix: 'temp/',
      maxResults: MAX_FILES_PER_RUN,
    });

    for (const file of tempFiles) {
      result.checked++;

      try {
        const [metadata] = await file.getMetadata();

        if (isTempFileExpired(metadata)) {
          await file.delete();
          result.deleted++;
          result.orphanedFiles.push(file.name);
          log.debug({ file: file.name }, 'Deleted expired temp file');
        }
      } catch (error) {
        result.errors++;
        log.warn({ error: String(error), file: file.name }, 'Failed to process temp file');
      }
    }

    // 2. Check voice-samples/ for orphaned files
    const [voiceFiles] = await bucket.getFiles({
      prefix: 'voice-samples/',
      maxResults: MAX_FILES_PER_RUN,
    });

    for (const file of voiceFiles) {
      result.checked++;

      try {
        const [metadata] = await file.getMetadata();
        const createdAt = new Date(metadata.timeCreated || 0);
        const age = Date.now() - createdAt.getTime();

        // Only check files older than threshold
        if (age < ORPHAN_THRESHOLD_MS) {
          continue;
        }

        // Check if file is referenced by an active agent
        const gcsUri = `gs://${BUCKET_NAME}/${file.name}`;
        const isActive = await isUploadActive(db, gcsUri);

        if (!isActive) {
          await file.delete();
          result.deleted++;
          result.orphanedFiles.push(file.name);
          log.debug({ file: file.name }, 'Deleted orphaned voice sample');
        }
      } catch (error) {
        result.errors++;
        log.warn({ error: String(error), file: file.name }, 'Failed to process voice file');
      }
    }

    // 3. Clean up expired preview cache
    const [previewFiles] = await bucket.getFiles({
      prefix: 'voice-previews/',
      maxResults: MAX_FILES_PER_RUN,
    });

    const PREVIEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const file of previewFiles) {
      result.checked++;

      try {
        const [metadata] = await file.getMetadata();
        const createdAt = new Date(metadata.timeCreated || 0);
        const age = Date.now() - createdAt.getTime();

        if (age > PREVIEW_MAX_AGE_MS) {
          await file.delete();
          result.deleted++;
          result.orphanedFiles.push(file.name);
          log.debug({ file: file.name }, 'Deleted expired preview');
        }
      } catch (error) {
        result.errors++;
        log.warn({ error: String(error), file: file.name }, 'Failed to process preview file');
      }
    }

    log.info(
      {
        checked: result.checked,
        deleted: result.deleted,
        errors: result.errors,
      },
      'Orphaned uploads cleanup complete'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Cleanup job failed');
    throw error;
  }
}

/**
 * HTTP handler for scheduled job
 */
export async function handleCleanupOrphanedUploads(res: {
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (data?: string) => void;
}): Promise<void> {
  try {
    const result = await cleanupOrphanedUploads();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: true,
        ...result,
      })
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Cleanup job handler failed');

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: 'Cleanup job failed',
      })
    );
  }
}
