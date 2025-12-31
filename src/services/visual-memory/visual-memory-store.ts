/**
 * Visual Memory Store
 *
 * > "Better than human means remembering every photo you shared."
 *
 * Storage and retrieval of visual memories.
 *
 * @module services/visual-memory/visual-memory-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import { analyzeImage, generateImageDescription, categorizeImage } from './vision-analysis.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onVisualMemoryChange } from '../data-layer/hooks/index.js';
import type {
  VisualMemory,
  VisualUploadRequest,
  VisualUploadResponse,
  VisualSearchRequest,
  VisualSearchResult,
  VisualMemoryContext,
  VisualMemoryPreferences,
} from './types.js';

const log = createLogger({ module: 'visual-memory-store' });

// ============================================================================
// FIRESTORE & STORAGE HELPERS
// ============================================================================

interface FirestoreDb {
  collection: (path: string) => {
    doc: (id: string) => {
      set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
      get: () => Promise<{ exists: boolean; data: () => unknown }>;
      delete: () => Promise<void>;
      collection: (path: string) => {
        doc: (id: string) => {
          set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
          get: () => Promise<{ exists: boolean; data: () => unknown }>;
        };
        where: (
          field: string,
          op: string,
          value: unknown
        ) => {
          orderBy: (
            field: string,
            direction?: string
          ) => {
            limit: (n: number) => {
              get: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>;
            };
          };
          get: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>;
        };
        orderBy: (
          field: string,
          direction?: string
        ) => {
          limit: (n: number) => {
            get: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>;
          };
        };
      };
    };
  };
}

interface StorageBucket {
  file: (path: string) => {
    save: (data: Buffer, options?: { metadata?: { contentType?: string } }) => Promise<void>;
    makePublic: () => Promise<void>;
    publicUrl: () => string;
    delete: () => Promise<void>;
  };
}

function getFirestoreDb(): FirestoreDb | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');
    return admin.firestore();
  } catch {
    log.debug('Firestore not available');
    return null;
  }
}

function getStorageBucket(): StorageBucket | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');
    return admin.storage().bucket();
  } catch {
    log.debug('Storage not available');
    return null;
  }
}

function generateId(): string {
  return `vm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// UPLOAD & STORAGE
// ============================================================================

/**
 * Upload and process a visual memory
 */
export async function uploadVisualMemory(
  request: VisualUploadRequest
): Promise<VisualUploadResponse> {
  const { userId, imageData, mimeType, source, description, tags, sessionId } = request;

  log.info({ userId, source, mimeType }, 'Uploading visual memory');

  const db = getFirestoreDb();
  const bucket = getStorageBucket();

  if (!db || !bucket) {
    return {
      success: false,
      error: 'Storage not available',
    };
  }

  try {
    // Check preferences
    const prefs = await getVisualPreferences(userId);
    if (prefs && !prefs.enabled) {
      return {
        success: false,
        error: 'Visual memory is disabled',
      };
    }

    // Generate ID
    const memoryId = generateId();

    // Decode base64 and upload to Cloud Storage
    const imageBuffer = Buffer.from(imageData, 'base64');
    const storagePath = `visual-memories/${userId}/${memoryId}`;
    const file = bucket.file(storagePath);

    await file.save(imageBuffer, {
      metadata: {
        contentType: mimeType,
      },
    });

    // Make publicly accessible (or use signed URLs in production)
    await file.makePublic();
    const storageUrl = file.publicUrl();

    // Analyze image
    let visionAnalysis = null;
    let aiDescription = description || '';
    let category: VisualMemory['category'] = 'misc';
    let detectedLabels: string[] = [];
    let detectedText: string | undefined;
    let facesDetected = 0;

    if (!prefs || prefs.autoAnalyze) {
      visionAnalysis = await analyzeImage(imageData, {
        detectLabels: true,
        detectText: true,
        detectFaces: prefs?.enableFaceDetection ?? true,
        detectLandmarks: prefs?.enableLocationExtraction ?? true,
        safeSearch: true,
      });

      if (visionAnalysis) {
        aiDescription = generateImageDescription(visionAnalysis);
        category = categorizeImage(visionAnalysis);
        detectedLabels = visionAnalysis.labels.slice(0, 10).map((l) => l.name);
        detectedText = visionAnalysis.text?.fullText;
        facesDetected = visionAnalysis.faces?.length || 0;
      }
    }

    // Create visual memory record
    const visualMemory: VisualMemory = {
      id: memoryId,
      userId,
      createdAt: new Date().toISOString(),
      storageUrl,
      mimeType,
      sizeBytes: imageBuffer.length,
      source,
      sessionId,
      userDescription: description,
      userTags: tags,
      visionAnalysis: visionAnalysis || undefined,
      aiDescription,
      category,
      detectedLabels,
      detectedText,
      facesDetected,
      isPrivate: request.isPrivate ?? prefs?.defaultPrivate ?? false,
    };

    // Store in Firestore
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .doc(memoryId)
      .set(cleanForFirestore(visualMemory));

    log.info(
      { userId, memoryId, category, labelsCount: detectedLabels.length },
      'Visual memory stored'
    );

    // Index to semantic memory
    void onVisualMemoryChange(userId, memoryId, {
      description: aiDescription || description || 'Visual memory',
      imageType: category === 'documents' ? 'document' : 'photo',
      context: source,
      emotions: undefined,
      people: facesDetected > 0 ? [`${facesDetected} people`] : undefined,
      timestamp: new Date().toISOString(),
    }, 'create');

    return {
      success: true,
      memoryId,
      quickAnalysis: {
        description: aiDescription,
        labels: detectedLabels,
        detectedText,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to upload visual memory');
    return {
      success: false,
      error: 'Upload failed',
    };
  }
}

/**
 * Get a specific visual memory
 */
export async function getVisualMemory(
  userId: string,
  memoryId: string
): Promise<VisualMemory | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .doc(memoryId)
      .get();

    if (!doc.exists) return null;

    return doc.data() as VisualMemory;
  } catch (error) {
    log.error({ error: String(error), userId, memoryId }, 'Failed to get visual memory');
    return null;
  }
}

/**
 * Get recent visual memories
 */
export async function getRecentVisualMemories(userId: string, limit = 10): Promise<VisualMemory[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as VisualMemory);
  } catch (error) {
    // Fallback without where clause (for when index doesn't exist)
    try {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('visual_memories')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => doc.data() as VisualMemory).filter((m) => !m.deletedAt);
    } catch (err) {
      log.debug({ error: String(err), userId }, 'Failed to get recent visual memories');
      return [];
    }
  }
}

/**
 * Delete a visual memory (soft delete)
 */
export async function deleteVisualMemory(
  userId: string,
  memoryId: string,
  reason?: string
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .doc(memoryId)
      .set(
        cleanForFirestore({
          deletedAt: new Date().toISOString(),
          deletedReason: reason || 'user_deleted',
        }),
        { merge: true }
      );

    log.info({ userId, memoryId }, 'Visual memory deleted');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, memoryId }, 'Failed to delete visual memory');
    return false;
  }
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Search visual memories
 */
export async function searchVisualMemories(
  request: VisualSearchRequest
): Promise<VisualSearchResult> {
  const { userId, query, category, limit = 20 } = request;

  log.debug({ userId, query, category }, 'Searching visual memories');

  const startTime = Date.now();
  const memories = await getRecentVisualMemories(userId, 100);

  let filtered = memories.filter((m) => !m.deletedAt);

  // Filter by category
  if (category) {
    filtered = filtered.filter((m) => m.category === category);
  }

  // Filter by query (simple text matching)
  if (query) {
    const queryLower = query.toLowerCase();
    filtered = filtered.filter((m) => {
      const searchText = [
        m.aiDescription || '',
        m.userDescription || '',
        m.detectedText || '',
        ...(m.detectedLabels || []),
        ...(m.userTags || []),
      ]
        .join(' ')
        .toLowerCase();

      return searchText.includes(queryLower);
    });
  }

  // Score and sort
  const scored = filtered.map((memory) => ({
    memory,
    relevanceScore: calculateRelevance(memory, query || ''),
    matchReason: getMatchReason(memory, query || ''),
  }));

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const results = scored.slice(0, limit);

  return {
    results,
    totalCount: scored.length,
    searchTimeMs: Date.now() - startTime,
  };
}

function calculateRelevance(memory: VisualMemory, query: string): number {
  if (!query) return 1;

  const queryLower = query.toLowerCase();
  let score = 0;

  // User description match (highest weight)
  if (memory.userDescription?.toLowerCase().includes(queryLower)) {
    score += 3;
  }

  // AI description match
  if (memory.aiDescription?.toLowerCase().includes(queryLower)) {
    score += 2;
  }

  // Label match
  if (memory.detectedLabels?.some((l) => l.toLowerCase().includes(queryLower))) {
    score += 2;
  }

  // Tag match
  if (memory.userTags?.some((t) => t.toLowerCase().includes(queryLower))) {
    score += 2.5;
  }

  // Detected text match
  if (memory.detectedText?.toLowerCase().includes(queryLower)) {
    score += 1.5;
  }

  // Recency bonus
  const daysSinceCreated =
    (Date.now() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 1 - daysSinceCreated / 30); // Decays over 30 days

  return score;
}

function getMatchReason(memory: VisualMemory, query: string): string | undefined {
  if (!query) return undefined;

  const queryLower = query.toLowerCase();

  if (memory.userDescription?.toLowerCase().includes(queryLower)) {
    return 'Matches your description';
  }
  if (memory.userTags?.some((t) => t.toLowerCase().includes(queryLower))) {
    return 'Matches your tag';
  }
  if (memory.aiDescription?.toLowerCase().includes(queryLower)) {
    return 'Matches what I see';
  }
  if (memory.detectedLabels?.some((l) => l.toLowerCase().includes(queryLower))) {
    return `Detected: ${memory.detectedLabels.find((l) => l.toLowerCase().includes(queryLower))}`;
  }
  if (memory.detectedText?.toLowerCase().includes(queryLower)) {
    return 'Found in text';
  }

  return undefined;
}

// ============================================================================
// PREFERENCES
// ============================================================================

/**
 * Get visual memory preferences
 */
export async function getVisualPreferences(
  userId: string
): Promise<VisualMemoryPreferences | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('settings')
      .doc('visual_preferences')
      .get();

    if (!doc.exists) return null;

    return doc.data() as VisualMemoryPreferences;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get visual preferences');
    return null;
  }
}

/**
 * Update visual memory preferences
 */
export async function updateVisualPreferences(
  userId: string,
  prefs: Partial<VisualMemoryPreferences>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('settings')
      .doc('visual_preferences')
      .set(
        cleanForFirestore({
          ...prefs,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );

    log.info({ userId }, 'Visual preferences updated');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update visual preferences');
  }
}

// ============================================================================
// CONTEXT FOR LLM
// ============================================================================

/**
 * Build visual memory context for LLM injection
 */
export async function buildVisualContext(userId: string): Promise<VisualMemoryContext> {
  const prefs = await getVisualPreferences(userId);
  if (prefs && !prefs.enabled) {
    return {
      hasVisualMemories: false,
      totalCount: 0,
    };
  }

  const recent = await getRecentVisualMemories(userId, 5);

  if (recent.length === 0) {
    return {
      hasVisualMemories: false,
      totalCount: 0,
    };
  }

  return {
    hasVisualMemories: true,
    totalCount: recent.length,
    recentVisuals: recent.map((m) => ({
      id: m.id,
      description: m.aiDescription || m.userDescription || 'An image',
      category: m.category,
      sharedAt: m.createdAt,
    })),
  };
}

/**
 * Format visual context for LLM injection
 */
export async function getVisualContextInjection(userId: string): Promise<string> {
  const context = await buildVisualContext(userId);

  if (!context.hasVisualMemories) {
    return '';
  }

  const lines = ['[VISUAL MEMORY - Better Than Human]'];
  lines.push('');
  lines.push('You can remember images the user has shared with you:');

  if (context.recentVisuals) {
    lines.push('');
    lines.push('Recent images shared:');
    for (const visual of context.recentVisuals.slice(0, 3)) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(visual.sharedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const timeDesc =
        daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
      lines.push(`- ${visual.description} (${timeDesc})`);
    }
  }

  lines.push('');
  lines.push('GUIDANCE:');
  lines.push('- Reference past images naturally when relevant');
  lines.push("- Don't lecture about the images - use them as context");
  lines.push('- "I remember when you showed me that photo of..."');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const visualMemoryStore = {
  uploadVisualMemory,
  getVisualMemory,
  getRecentVisualMemories,
  deleteVisualMemory,
  searchVisualMemories,
  getVisualPreferences,
  updateVisualPreferences,
  buildVisualContext,
  getVisualContextInjection,
};
