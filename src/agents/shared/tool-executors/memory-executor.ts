/**
 * Memory Domain Tool Executor
 *
 * Handles all memory-related tools: rememberAboutUser, recallFromMemory,
 * updateMemory, forgetMemory, getRelationshipSummary, reinforceMemory
 *
 * @module agents/shared/tool-executors/memory-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'MemoryExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'rememberaboutuser',
  'recallfrommemory',
  'updatememory',
  'forgetmemory',
  'getrelationshipsummary',
  'reinforcememory',
] as const;

/**
 * Execute memory-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // ========================================
  // REMEMBER ABOUT USER
  // ========================================
  if (fnLower === 'rememberaboutuser') {
    const fact = args.fact as string;
    const category = (args.category as string) || 'personal';
    const importance = (args.importance as string) || 'medium';
    const emotionalContext = args.emotionalContext as string | undefined;

    if (!fact) {
      return 'Please specify what you want me to remember.';
    }

    log.info({ fact, category, importance, userId: ctx.userId }, '💾 Remembering fact');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        // Generate embedding for semantic recall
        let embedding: number[] | null = null;
        try {
          const { embed } = await import('../../../memory/embeddings.js');
          embedding = await embed(fact);
        } catch (embedErr) {
          log.warn({ error: String(embedErr) }, 'Embedding generation failed');
        }

        const memoryDoc = {
          fact,
          category,
          importance,
          confidence: importance === 'high' ? 0.9 : importance === 'medium' ? 0.7 : 0.5,
          extractedAt: new Date(),
          source: 'explicit_mention',
          ...(embedding && { embedding }),
          ...(emotionalContext && { emotionalContext }),
          sessionId: ctx.sessionId,
          personaId: ctx.personaId || 'ferni',
        };

        await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .add(cleanForFirestore(memoryDoc));

        // Index in vector store
        try {
          const { getFirestoreVectorStore } =
            await import('../../../memory/firestore-vector-store.js');
          const vectorStore = getFirestoreVectorStore();

          await vectorStore.addDocument({
            id: `fact_${ctx.userId}_${Date.now()}`,
            text: fact,
            embedding: embedding || undefined,
            metadata: {
              source: 'user_memory',
              category,
              userId: ctx.userId,
              importance,
              timestamp: new Date(),
              emotionalWeight: importance === 'high' ? 0.9 : importance === 'medium' ? 0.6 : 0.3,
            },
          });
        } catch (vectorErr) {
          log.debug({ error: String(vectorErr) }, 'Vector store indexing failed (non-critical)');
        }

        log.info({ userId: ctx.userId, hasEmbedding: !!embedding }, '✅ Memory stored');
        return '';
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory storage failed');
      }
    }
    return '';
  }

  // ========================================
  // RECALL FROM MEMORY (Semantic Search)
  // ========================================
  if (fnLower === 'recallfrommemory') {
    const topic = args.topic as string;

    if (!topic) {
      return 'What would you like me to recall?';
    }

    log.info({ topic, userId: ctx.userId }, '🧠 Recalling from memory');

    if (ctx.userId) {
      // Check cache first
      if (ctx.sessionId) {
        try {
          const { getCachedMemoryResult } = await import('../performance/session-optimizations.js');
          const cached = getCachedMemoryResult(ctx.sessionId, topic);
          if (cached) {
            log.debug({ topic }, '💾 Memory recall from cache');
            return cached.result as string;
          }
        } catch {
          // Continue without cache
        }
      }

      try {
        const { getRAGContext } = await import('../../../memory/semantic-rag.js');
        const ragResults = await getRAGContext(topic, {
          topK: 5,
          includePersona: false,
          includeConversations: true,
          includeUserMemory: true,
          userId: ctx.userId,
          minScore: 0.25,
        });

        interface MemoryItem {
          content: string;
          score: number;
          timestamp?: Date;
        }

        const memories: MemoryItem[] = ragResults.results.map((r) => ({
          content: r.content,
          score: r.score,
          timestamp: r.metadata?.timestamp
            ? new Date(r.metadata.timestamp as string | number)
            : undefined,
        }));

        // Also get facts from Firestore
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        const factsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .orderBy('extractedAt', 'desc')
          .limit(20)
          .get();

        if (!factsSnapshot.empty) {
          const { embed, cosineSimilarity } = await import('../../../memory/embeddings.js');
          let queryEmbedding: number[] | null = null;

          try {
            queryEmbedding = await embed(topic);
          } catch {
            // Fallback to keyword
          }

          for (const doc of factsSnapshot.docs) {
            const data = doc.data();
            const factText = (data.fact || data.content || '') as string;
            const factEmbedding = data.embedding as number[] | undefined;

            let score = 0;
            if (queryEmbedding && factEmbedding) {
              score = cosineSimilarity(queryEmbedding, factEmbedding);
            } else {
              const topicLower = topic.toLowerCase();
              if (factText.toLowerCase().includes(topicLower)) {
                score = 0.6;
              }
            }

            if (score > 0.2) {
              const daysSince = data.extractedAt
                ? (Date.now() - (data.extractedAt.toDate?.() || new Date()).getTime()) /
                  (1000 * 60 * 60 * 24)
                : 30;
              const recencyBoost = daysSince < 7 ? 0.15 : daysSince < 30 ? 0.05 : 0;

              memories.push({
                content: factText,
                score: score + recencyBoost,
                timestamp: data.extractedAt?.toDate?.() || new Date(),
              });
            }
          }
        }

        memories.sort((a, b) => b.score - a.score);

        // Deduplicate
        const unique: MemoryItem[] = [];
        for (const m of memories) {
          const isDup = unique.some(
            (e) =>
              e.content.toLowerCase().includes(m.content.toLowerCase().slice(0, 30)) ||
              m.content.toLowerCase().includes(e.content.toLowerCase().slice(0, 30))
          );
          if (!isDup) unique.push(m);
        }

        if (unique.length > 0) {
          const formatTimeAgo = (ts?: Date): string => {
            if (!ts) return '';
            const days = Math.floor((Date.now() - ts.getTime()) / (1000 * 60 * 60 * 24));
            if (days === 0) return ' (today)';
            if (days === 1) return ' (yesterday)';
            if (days < 7) return ` (${days} days ago)`;
            return '';
          };

          const top = unique.slice(0, 3);
          const formatted = top.map((m) => `${m.content}${formatTimeAgo(m.timestamp)}`);

          const result =
            top.length === 1
              ? `I recall: ${formatted[0]}`
              : `Here's what I remember: ${formatted.join('; ')}`;

          // Cache result
          if (ctx.sessionId) {
            try {
              const { cacheMemoryResult } = await import('../performance/session-optimizations.js');
              cacheMemoryResult(ctx.sessionId, topic, result);
            } catch {
              // Non-critical
            }
          }

          return result;
        }

        return `I don't have specific memories about "${topic}" yet.`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory recall failed');
      }
    }

    return `I don't have specific memories about that right now.`;
  }

  // ========================================
  // REINFORCE MEMORY
  // ========================================
  if (fnLower === 'reinforcememory') {
    const memory = args.memory as string;
    if (!memory || !ctx.userId) return '';

    log.info({ memory, userId: ctx.userId }, '💪 Reinforcing memory');

    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      const snapshot = await db
        .collection('bogle_users')
        .doc(ctx.userId)
        .collection('extracted_facts')
        .get();

      const memoryLower = memory.toLowerCase();
      const docToReinforce = snapshot.docs.find((doc) => {
        const data = doc.data();
        const text = (((data.fact || data.content) as string) || '').toLowerCase();
        return text.includes(memoryLower) || memoryLower.includes(text.slice(0, 30));
      });

      if (docToReinforce) {
        const data = docToReinforce.data();
        const currentConfidence = (data.confidence as number) || 0.5;
        const newConfidence = Math.min(0.99, currentConfidence + (1 - currentConfidence) * 0.15);

        await docToReinforce.ref.update(
          cleanForFirestore({
            confidence: newConfidence,
            reinforceCount: ((data.reinforceCount as number) || 0) + 1,
            lastReinforcedAt: new Date(),
          })
        );
      }
    } catch (err) {
      log.debug({ error: String(err) }, 'Memory reinforcement failed');
    }

    return '';
  }

  // ========================================
  // UPDATE MEMORY
  // ========================================
  if (fnLower === 'updatememory') {
    const oldFact = args.oldFact as string;
    const newFact = args.newFact as string;

    if (!oldFact || !newFact) {
      return 'Please specify both the old memory and the updated information.';
    }

    log.info({ oldFact, newFact, userId: ctx.userId }, '✏️ Updating memory');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        let newEmbedding: number[] | null = null;
        try {
          const { embed } = await import('../../../memory/embeddings.js');
          newEmbedding = await embed(newFact);
        } catch {
          // Continue without embedding
        }

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();

        const oldFactLower = oldFact.toLowerCase();
        const docToUpdate = snapshot.docs.find((doc) => {
          const data = doc.data();
          return ((data.fact || data.content || '') as string).toLowerCase().includes(oldFactLower);
        });

        if (docToUpdate) {
          await docToUpdate.ref.update(
            cleanForFirestore({
              fact: newFact,
              updatedAt: new Date(),
              previousVersion: oldFact,
              ...(newEmbedding && { embedding: newEmbedding }),
            })
          );
        } else {
          // Store as new
          await db
            .collection('bogle_users')
            .doc(ctx.userId)
            .collection('extracted_facts')
            .add(
              cleanForFirestore({
                fact: newFact,
                category: 'personal',
                importance: 'medium',
                confidence: 0.8,
                extractedAt: new Date(),
                source: 'explicit_update',
                previousVersion: oldFact,
                ...(newEmbedding && { embedding: newEmbedding }),
              })
            );
        }

        return '';
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory update failed');
      }
    }

    return '';
  }

  // ========================================
  // FORGET MEMORY
  // ========================================
  if (fnLower === 'forgetmemory') {
    const topic = args.topic as string;
    const whatToForget = args.whatToForget as string;
    const target = topic || whatToForget;

    if (!target) {
      return 'What would you like me to forget?';
    }

    log.info({ target, userId: ctx.userId }, '🗑️ Forgetting memory');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const snapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();

        const targetLower = target.toLowerCase();
        const docsToDelete = snapshot.docs.filter((doc) => {
          const data = doc.data();
          return ((data.fact || data.content || '') as string).toLowerCase().includes(targetLower);
        });

        if (docsToDelete.length > 0) {
          const batch = db.batch();
          docsToDelete.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();

          log.info({ userId: ctx.userId, deleted: docsToDelete.length }, '✅ Memories deleted');
          return `I've forgotten about that. Your privacy matters.`;
        }

        return `I didn't find specific memories about "${target}" to remove.`;
      } catch (err) {
        log.warn({ error: String(err) }, 'Memory deletion failed');
      }
    }

    return `I'll forget about that.`;
  }

  // ========================================
  // GET RELATIONSHIP SUMMARY
  // ========================================
  if (fnLower === 'getrelationshipsummary') {
    log.info({ userId: ctx.userId }, '📊 Getting relationship summary');

    if (ctx.userId) {
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();

        const userDoc = await db.collection('bogle_users').doc(ctx.userId).get();
        const userData = userDoc.data();

        const factsSnapshot = await db
          .collection('bogle_users')
          .doc(ctx.userId)
          .collection('extracted_facts')
          .get();

        const sessionCount = (userData?.sessionCount as number) || 0;
        const factCount = factsSnapshot.size;

        return {
          sessionsToDate: sessionCount,
          memoriesStored: factCount,
          relationshipStage:
            sessionCount < 3
              ? 'Getting to know you'
              : sessionCount < 10
                ? 'Building trust'
                : sessionCount < 25
                  ? 'Established partnership'
                  : 'Deep friendship',
        };
      } catch (err) {
        log.warn({ error: String(err) }, 'Relationship summary failed');
      }
    }

    return { sessionsToDate: 0, memoriesStored: 0, relationshipStage: 'Just getting started' };
  }

  return null;
}

export const memoryExecutor: DomainExecutor = {
  domain: 'memory',
  handles: HANDLED_TOOLS,
  execute,
};

export default memoryExecutor;
