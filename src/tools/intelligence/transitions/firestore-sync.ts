/**
 * Transition Firestore Sync
 *
 * Persists transition matrix data to Firestore for durability and
 * cross-instance sharing.
 *
 * @module tools/intelligence/transitions/firestore-sync
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { getTransitionMatrix, type TransitionMatrix } from './transition-matrix.js';
import type {
  ToolTransition,
  ToolSequence,
  FirestoreTransition,
  FirestoreSequence,
} from './types.js';

const log = createLogger({ module: 'transition-sync' });

// ============================================================================
// CONSTANTS
// ============================================================================

const TRANSITIONS_COLLECTION = 'tool_transitions';
const SEQUENCES_COLLECTION = 'user_tool_sequences';
const SYNC_STATE_DOC = 'sync_state';
const BATCH_SIZE = 500;

// ============================================================================
// FIRESTORE SYNC
// ============================================================================

export class TransitionFirestoreSync {
  private db: FirebaseFirestore.Firestore | null = null;
  private matrix: TransitionMatrix;
  private lastSyncTime: Date | null = null;
  private syncInProgress = false;

  constructor(matrix?: TransitionMatrix) {
    this.matrix = matrix || getTransitionMatrix();
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with Firestore instance
   */
  async initialize(db: FirebaseFirestore.Firestore): Promise<void> {
    this.db = db;

    // Load existing data
    await this.loadFromFirestore();

    log.info('Transition Firestore sync initialized');
  }

  // ==========================================================================
  // LOADING
  // ==========================================================================

  /**
   * Load transitions from Firestore
   */
  async loadFromFirestore(): Promise<number> {
    if (!this.db) {
      log.warn('Cannot load: Firestore not initialized');
      return 0;
    }

    try {
      const snapshot = await this.db.collection(TRANSITIONS_COLLECTION).get();

      const transitions: ToolTransition[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data() as FirestoreTransition;
        transitions.push({
          fromTool: data.fromTool,
          toTool: data.toTool,
          personaId: data.personaId,
          timeOfDay: data.timeOfDay,
          emotion: data.emotion,
          count: data.count,
          probability: data.probability,
          successRate: data.successRate,
          avgGapMs: data.avgGapMs,
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      }

      this.matrix.loadTransitions(transitions);
      this.lastSyncTime = new Date();

      log.info({ transitionCount: transitions.length }, 'Loaded transitions from Firestore');
      return transitions.length;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load transitions from Firestore');
      return 0;
    }
  }

  // ==========================================================================
  // SAVING
  // ==========================================================================

  /**
   * Save all transitions to Firestore
   */
  async saveToFirestore(): Promise<number> {
    if (!this.db) {
      log.warn('Cannot save: Firestore not initialized');
      return 0;
    }

    if (this.syncInProgress) {
      log.warn('Sync already in progress');
      return 0;
    }

    this.syncInProgress = true;

    try {
      const transitions = this.matrix.exportTransitions();
      let saved = 0;

      // Process in batches
      for (let i = 0; i < transitions.length; i += BATCH_SIZE) {
        const batch = this.db.batch();
        const batchTransitions = transitions.slice(i, i + BATCH_SIZE);

        for (const t of batchTransitions) {
          const docId = this.getTransitionDocId(t);
          const docRef = this.db.collection(TRANSITIONS_COLLECTION).doc(docId);

          const data = cleanForFirestore({
            fromTool: t.fromTool,
            toTool: t.toTool,
            personaId: t.personaId,
            timeOfDay: t.timeOfDay,
            emotion: t.emotion,
            count: t.count,
            probability: t.probability,
            successRate: t.successRate,
            avgGapMs: t.avgGapMs,
            updatedAt: t.updatedAt,
          });

          batch.set(docRef, data, { merge: true });
        }

        await batch.commit();
        saved += batchTransitions.length;
      }

      this.lastSyncTime = new Date();
      log.info({ saved }, 'Saved transitions to Firestore');
      return saved;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to save transitions to Firestore');
      return 0;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Save a single sequence to Firestore
   */
  async saveSequence(sequence: ToolSequence): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    try {
      const data = cleanForFirestore({
        userId: sequence.userId,
        sessionId: sequence.sessionId,
        sequence: sequence.sequence,
        timestamps: sequence.timestamps,
        success: sequence.success,
        context: sequence.context,
        createdAt: sequence.createdAt,
      });

      await this.db.collection(SEQUENCES_COLLECTION).doc(sequence.id).set(data);
      return true;
    } catch (error) {
      log.error({ error: String(error), sequenceId: sequence.id }, 'Failed to save sequence');
      return false;
    }
  }

  // ==========================================================================
  // SYNC OPERATIONS
  // ==========================================================================

  /**
   * Perform incremental sync (only changes since last sync)
   */
  async syncIncremental(): Promise<{
    uploaded: number;
    downloaded: number;
  }> {
    if (!this.db) {
      return { uploaded: 0, downloaded: 0 };
    }

    const startTime = Date.now();
    let uploaded = 0;
    let downloaded = 0;

    try {
      // Get transitions updated since last sync
      const localTransitions = this.matrix.exportTransitions();
      const toUpload = this.lastSyncTime
        ? localTransitions.filter((t) => t.updatedAt > this.lastSyncTime!)
        : localTransitions;

      // Upload new/updated transitions
      if (toUpload.length > 0) {
        for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
          const batch = this.db.batch();
          const batchTransitions = toUpload.slice(i, i + BATCH_SIZE);

          for (const t of batchTransitions) {
            const docId = this.getTransitionDocId(t);
            const docRef = this.db.collection(TRANSITIONS_COLLECTION).doc(docId);

            const data = cleanForFirestore({
              fromTool: t.fromTool,
              toTool: t.toTool,
              personaId: t.personaId,
              timeOfDay: t.timeOfDay,
              emotion: t.emotion,
              count: t.count,
              probability: t.probability,
              successRate: t.successRate,
              avgGapMs: t.avgGapMs,
              updatedAt: t.updatedAt,
            });

            batch.set(docRef, data, { merge: true });
          }

          await batch.commit();
          uploaded += batchTransitions.length;
        }
      }

      // Download transitions updated since last sync
      if (this.lastSyncTime) {
        const query = this.db
          .collection(TRANSITIONS_COLLECTION)
          .where('updatedAt', '>', this.lastSyncTime);

        const snapshot = await query.get();

        for (const doc of snapshot.docs) {
          const data = doc.data() as FirestoreTransition;
          const transition: ToolTransition = {
            fromTool: data.fromTool,
            toTool: data.toTool,
            personaId: data.personaId,
            timeOfDay: data.timeOfDay,
            emotion: data.emotion,
            count: data.count,
            probability: data.probability,
            successRate: data.successRate,
            avgGapMs: data.avgGapMs,
            updatedAt: data.updatedAt?.toDate() || new Date(),
          };

          // Merge with local (take higher count)
          const localKey = this.getTransitionDocId(transition);
          const local = this.matrix
            .exportTransitions()
            .find((t) => this.getTransitionDocId(t) === localKey);

          if (!local || transition.count > local.count) {
            this.matrix.loadTransitions([transition]);
            downloaded++;
          }
        }
      }

      this.lastSyncTime = new Date();

      log.info(
        { uploaded, downloaded, durationMs: Date.now() - startTime },
        'Incremental sync complete'
      );

      return { uploaded, downloaded };
    } catch (error) {
      log.error({ error: String(error) }, 'Incremental sync failed');
      return { uploaded, downloaded };
    }
  }

  /**
   * Clean up old sequences (retention policy)
   */
  async cleanupOldSequences(maxAgeDays = 90): Promise<number> {
    if (!this.db) {
      return 0;
    }

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);

      const query = this.db
        .collection(SEQUENCES_COLLECTION)
        .where('createdAt', '<', cutoff)
        .limit(500);

      let deleted = 0;
      let batch = await query.get();

      while (!batch.empty) {
        const writeBatch = this.db.batch();
        for (const doc of batch.docs) {
          writeBatch.delete(doc.ref);
          deleted++;
        }
        await writeBatch.commit();
        batch = await query.get();
      }

      log.info({ deleted, maxAgeDays }, 'Cleaned up old sequences');
      return deleted;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to cleanup old sequences');
      return 0;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Generate document ID for a transition
   */
  private getTransitionDocId(t: ToolTransition): string {
    return `${t.fromTool}_${t.toTool}_${t.personaId}_${t.timeOfDay}_${t.emotion || 'neutral'}`.replace(
      /[\/\.\[\]#]/g,
      '_'
    );
  }

  /**
   * Get sync statistics
   */
  getStats(): {
    lastSyncTime: Date | null;
    syncInProgress: boolean;
    firestoreInitialized: boolean;
  } {
    return {
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      firestoreInitialized: !!this.db,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let syncInstance: TransitionFirestoreSync | null = null;

export function getTransitionSync(): TransitionFirestoreSync {
  if (!syncInstance) {
    syncInstance = new TransitionFirestoreSync();
  }
  return syncInstance;
}

export async function initializeTransitionSync(
  db: FirebaseFirestore.Firestore
): Promise<TransitionFirestoreSync> {
  const sync = getTransitionSync();
  await sync.initialize(db);
  return sync;
}

export function resetTransitionSync(): void {
  syncInstance = null;
}
