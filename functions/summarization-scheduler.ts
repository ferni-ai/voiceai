/**
 * Summarization Scheduler Cloud Function (v2 API)
 *
 * Background job that processes unsummarized conversations.
 * Runs on a schedule (every 5 minutes) to catch any conversations
 * that didn't get summarized at session end.
 *
 * This provides a safety net for the real-time memory system:
 * - Turns are persisted immediately as they happen
 * - Summarization is attempted at session end (async, non-blocking)
 * - This scheduler catches any that slip through
 *
 * @module functions/summarization-scheduler
 */

import { onSchedule, ScheduledEvent } from 'firebase-functions/v2/scheduler';
import { onRequest, Request } from 'firebase-functions/v2/https';
import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';

const db = new Firestore();

// ============================================================================
// TYPES
// ============================================================================

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
}

interface Response {
  status: (code: number) => Response;
  json: (data: unknown) => void;
}

// ============================================================================
// SUMMARIZATION LOGIC
// ============================================================================

/**
 * Build a quick summary from turns (no LLM needed)
 * Used as fallback when LLM is unavailable or for cost savings
 */
function buildQuickSummary(turns: ConversationTurn[]): string {
  const userTurns = turns.filter((t) => t.role === 'user');
  if (userTurns.length === 0) return 'Brief conversation';

  // Get the last 3 user messages, truncated
  const topics = userTurns.slice(-3).map((t) =>
    t.content.slice(0, 60).replace(/[.!?]+$/, '').trim()
  );

  return `Discussed: ${topics.join('; ')}`;
}

/**
 * Process a single conversation - generate summary and update records
 */
async function processConversation(
  userId: string,
  conversationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const conversationRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId);

    // Get conversation turns
    const turnsSnapshot = await conversationRef
      .collection('turns')
      .orderBy('timestamp', 'asc')
      .limit(100) // Reasonable limit
      .get();

    const turns: ConversationTurn[] = turnsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        role: data.role as 'user' | 'assistant',
        content: data.content as string,
        timestamp: data.timestamp,
      };
    });

    if (turns.length < 2) {
      // Too short to summarize - just mark as done
      await conversationRef.update({
        summarized: true,
        summary: 'Brief conversation',
        summarizedAt: FieldValue.serverTimestamp(),
      });
      return { success: true };
    }

    // Generate summary (extraction-based for reliability)
    // TODO: Could add LLM-based summarization here for richer summaries
    const summary = buildQuickSummary(turns);

    // Update conversation
    await conversationRef.update({
      summarized: true,
      summary,
      summarizedAt: FieldValue.serverTimestamp(),
    });

    // Update user's lastConversationSummary
    await db.collection('bogle_users').doc(userId).update({
      lastConversationSummary: summary,
      lastContact: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Summarized conversation ${conversationId} for user ${userId.slice(0, 10)}...`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to summarize ${conversationId}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// CLOUD FUNCTIONS (v2 API)
// ============================================================================

/**
 * Scheduled function that runs every 5 minutes to process unsummarized conversations
 */
export const summarizeConversations = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
  },
  async (_event: ScheduledEvent) => {
    console.log('🔄 Starting summarization batch...');

    try {
      // Find unsummarized conversations that ended more than 1 minute ago
      // (give async summarization a chance to complete first)
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

      const snapshot = await db
        .collectionGroup('conversations')
        .where('summarized', '==', false)
        .where('endedAt', '<', oneMinuteAgo)
        .limit(50) // Process up to 50 per run
        .get();

      if (snapshot.empty) {
        console.log('✨ No unsummarized conversations found');
        return;
      }

      console.log(`📝 Found ${snapshot.size} conversations to summarize`);

      let successCount = 0;
      let errorCount = 0;

      for (const doc of snapshot.docs) {
        // Extract userId from path: bogle_users/{userId}/conversations/{conversationId}
        const pathParts = doc.ref.path.split('/');
        const userId = pathParts[1];
        const conversationId = doc.id;

        const result = await processConversation(userId, conversationId);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }

        // Small delay to avoid overwhelming Firestore
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(
        `✅ Summarization batch complete: ${successCount} succeeded, ${errorCount} failed`
      );
    } catch (error) {
      console.error('❌ Summarization batch failed:', error);
      throw error;
    }
  }
);

/**
 * HTTP endpoint for manual/testing triggering of summarization
 */
export const triggerSummarization = onRequest(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
  },
  async (req: Request, res: Response) => {
    // Simple API key check (should use proper auth in production)
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey !== process.env.SUMMARIZATION_API_KEY && process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('🔄 Manual summarization triggered');

    try {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

      const snapshot = await db
        .collectionGroup('conversations')
        .where('summarized', '==', false)
        .where('endedAt', '<', oneMinuteAgo)
        .limit(50)
        .get();

      if (snapshot.empty) {
        res.json({
          success: true,
          message: 'No unsummarized conversations found',
          processed: 0,
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const doc of snapshot.docs) {
        const pathParts = doc.ref.path.split('/');
        const userId = pathParts[1];
        const conversationId = doc.id;

        const result = await processConversation(userId, conversationId);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      res.json({
        success: true,
        processed: successCount + errorCount,
        succeeded: successCount,
        failed: errorCount,
      });
    } catch (error) {
      console.error('❌ Manual summarization failed:', error);
      res.status(500).json({
        success: false,
        error: String(error),
      });
    }
  }
);

/**
 * Summarize a specific user's conversations (for debugging/support)
 */
export const summarizeUserConversations = onRequest(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'us-central1',
  },
  async (req: Request, res: Response) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (apiKey !== process.env.SUMMARIZATION_API_KEY && process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    console.log(`🔄 Summarizing conversations for user ${userId.slice(0, 10)}...`);

    try {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('conversations')
        .where('summarized', '==', false)
        .limit(20)
        .get();

      if (snapshot.empty) {
        res.json({
          success: true,
          message: 'No unsummarized conversations for user',
          processed: 0,
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const doc of snapshot.docs) {
        const result = await processConversation(userId, doc.id);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      res.json({
        success: true,
        userId: userId.slice(0, 10) + '...',
        processed: successCount + errorCount,
        succeeded: successCount,
        failed: errorCount,
      });
    } catch (error) {
      console.error('❌ User summarization failed:', error);
      res.status(500).json({
        success: false,
        error: String(error),
      });
    }
  }
);
