/**
 * Pending Background Results Context Builder
 *
 * "BETTER THAN HUMAN" - When you reconnect, Ferni remembers what happened
 * while you were away and tells you like a friend would: "Oh! I called your
 * mom while you were gone - she said she loved hearing from you!"
 *
 * This builder:
 * 1. Checks for recent background results (calls, research, reservations, etc.)
 * 2. Injects them into the agent's first turn context
 * 3. Marks them as delivered so they're not repeated
 *
 * WHY THIS MATTERS:
 * - Push notifications are easy to miss
 * - Email feels impersonal
 * - Ferni TELLING you feels like a real relationship
 * - "Better than human" - friends forget to follow up, Ferni doesn't
 *
 * EVOLUTION:
 * - Originally just for calls (pending-call-results.ts)
 * - Now unified to handle ALL background agent tasks
 * - Uses unified-result-capture.ts for storage/retrieval
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PendingBackgroundResults' });

// ============================================================================
// TYPES
// ============================================================================

interface PendingCallResult {
  callId: string;
  contactName: string;
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
  outcome: string;
  objectiveAchieved: boolean;
  callbackRequired: boolean;
  actionItems?: string[];
  capturedAt: string;
  delivered?: boolean;
}

// ============================================================================
// FETCH PENDING RESULTS
// ============================================================================

/**
 * Get recent call results that haven't been delivered to the user yet.
 * Only returns results from the last 24 hours to avoid overwhelming.
 */
export async function getPendingCallResults(userId: string): Promise<PendingCallResult[]> {
  try {
    const { getFirestoreDb } =
      await import('../../../services/superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (!db) {
      log.debug({ userId }, 'Firestore not available for pending call results');
      return [];
    }

    // Get results from last 24 hours that haven't been delivered
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    // Note: Firestore compound queries with != can be tricky
    // Instead, we query recent results and filter in-memory
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('on_behalf_calls')
      .where('capturedAt', '>=', cutoff.toISOString())
      .orderBy('capturedAt', 'desc')
      .limit(10) // Get more, then filter
      .get();

    const results: PendingCallResult[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Skip already delivered results
      if (data.delivered === true) return;

      results.push({
        callId: doc.id,
        contactName: data.request?.contactName || data.request?.contactQuery || 'someone',
        status: data.outcome?.status || 'completed',
        outcome: data.outcome?.outcome || 'Call completed',
        objectiveAchieved: data.outcome?.objectiveAchieved ?? true,
        callbackRequired: data.outcome?.callbackRequired ?? false,
        actionItems: data.outcome?.actionItems,
        capturedAt: data.capturedAt,
        delivered: data.delivered,
      });
    });

    // Limit to 5 after filtering
    const limitedResults = results.slice(0, 5);

    log.info({ userId, count: limitedResults.length }, 'Fetched pending call results');
    return limitedResults;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to fetch pending call results');
    return [];
  }
}

/**
 * Mark call results as delivered so they won't be repeated.
 */
export async function markCallResultsDelivered(userId: string, callIds: string[]): Promise<void> {
  try {
    const { getFirestoreDb } =
      await import('../../../services/superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

    const db = getFirestoreDb ? getFirestoreDb() : null;

    if (!db || callIds.length === 0) return;

    // Use batch write for efficiency
    const batch = db.batch();

    for (const callId of callIds) {
      const ref = db
        .collection('bogle_users')
        .doc(userId)
        .collection('on_behalf_calls')
        .doc(callId);

      batch.update(ref, {
        delivered: true,
        deliveredAt: new Date().toISOString(),
      });
    }

    await batch.commit();
    log.debug({ userId, count: callIds.length }, 'Marked call results as delivered');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to mark call results as delivered');
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build context injection for pending call results.
 *
 * Returns a string to inject into the agent's system prompt that tells them
 * what calls completed while the user was away. The agent will naturally
 * mention these in their greeting.
 */
export async function buildPendingCallResultsContext(userId: string): Promise<string | null> {
  const results = await getPendingCallResults(userId);

  if (results.length === 0) {
    return null;
  }

  // Build context for the agent
  const lines: string[] = [
    '',
    '## 📞 PENDING CALL UPDATES (Tell the user!)',
    '',
    "While they were away, you made calls on their behalf. Tell them what happened! This is a 'Better Than Human' moment - friends forget to follow up, but you don't.",
    '',
  ];

  for (const result of results) {
    lines.push(`### Call to ${result.contactName}`);

    if (result.objectiveAchieved) {
      lines.push(`✅ **SUCCESS**: ${result.outcome}`);
    } else if (result.status === 'voicemail') {
      lines.push(`📞 **Left voicemail**: ${result.outcome}`);
    } else if (result.status === 'no_answer') {
      lines.push(`📞 **No answer**: ${result.outcome}`);
    } else if (result.status === 'busy') {
      lines.push(`📞 **Line busy**: ${result.outcome}`);
    } else {
      lines.push(`❌ **Couldn't connect**: ${result.outcome}`);
    }

    if (result.callbackRequired) {
      lines.push(`⚠️ They want a callback from the user.`);
    }

    if (result.actionItems && result.actionItems.length > 0) {
      lines.push(`📝 Action items: ${result.actionItems.join(', ')}`);
    }

    lines.push('');
  }

  lines.push('**How to tell them:**');
  lines.push('- Weave it naturally into your greeting');
  lines.push("- If successful: 'Oh! While you were away, I called [name] - [outcome]!'");
  lines.push("- If voicemail: 'I tried calling [name] for you - left a voicemail.'");
  lines.push(
    "- If failed: 'I tried reaching [name] but couldn't get through. Want me to try again?'"
  );
  lines.push('');

  // Mark as delivered (fire and forget - don't block on this)
  const callIds = results.map((r) => r.callId);
  void markCallResultsDelivered(userId, callIds);

  return lines.join('\n');
}

// ============================================================================
// UNIFIED RESULTS (NEW - handles ALL background tasks)
// ============================================================================

/**
 * Build context for ALL pending background results (not just calls).
 * This is the "WHILE YOU WERE AWAY" moment that makes Ferni superhuman.
 */
export async function buildPendingBackgroundResultsContext(userId: string): Promise<string | null> {
  try {
    const { buildPendingResultsContext } =
      await import('../../../services/background-agents/index.js');
    return await buildPendingResultsContext(userId);
  } catch (error) {
    log.debug(
      { error: String(error) },
      'Unified background results not available, falling back to calls only'
    );
    // Fall back to just call results
    return buildPendingCallResultsContext(userId);
  }
}

/**
 * Combined context builder that gets BOTH legacy call results AND new unified results.
 * Use this during the transition period to ensure nothing is missed.
 */
export async function buildAllPendingResultsContext(userId: string): Promise<string | null> {
  const [callResults, unifiedResults] = await Promise.all([
    buildPendingCallResultsContext(userId).catch(() => null),
    buildPendingBackgroundResultsContext(userId).catch(() => null),
  ]);

  // If we have unified results, prefer those (they're more comprehensive)
  if (unifiedResults) {
    return unifiedResults;
  }

  // Otherwise fall back to call-only results
  return callResults;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { PendingCallResult };
