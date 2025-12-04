/**
 * Cloud Function: Evolution Scheduler
 *
 * Runs the agent evolution cycle on a schedule (daily).
 * This makes all personas smarter based on community learnings.
 *
 * Deploy:
 *   gcloud functions deploy evolutionScheduler \
 *     --runtime nodejs20 \
 *     --trigger-topic evolution-trigger \
 *     --entry-point evolutionScheduler \
 *     --timeout 540s \
 *     --memory 1GB
 *
 * Set up Cloud Scheduler to trigger daily:
 *   gcloud scheduler jobs create pubsub daily-evolution \
 *     --schedule "0 3 * * *" \
 *     --topic evolution-trigger \
 *     --message-body "{}" \
 *     --time-zone "America/New_York"
 */

import { Firestore } from '@google-cloud/firestore';
import { PubSub } from '@google-cloud/pubsub';

// Types for community insights (simplified for cloud function)
interface CommunityPattern {
  id: string;
  context: Record<string, string | undefined>;
  strategies: Array<{
    type: string;
    avgEngagement: number;
    sampleSize: number;
  }>;
  bestStrategy: string;
  totalSamples: number;
  lastUpdated: string;
}

interface LearningSignal {
  sessionId: string;
  personaId: string;
  signals: Array<{
    type: string;
    context: Record<string, unknown>;
    outcome: Record<string, unknown>;
    timestamp: string;
  }>;
  processed: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function evolutionScheduler(
  _message: { data?: string },
  _context: { eventId: string; timestamp: string }
): Promise<void> {
  console.log('🧬 Starting evolution cycle...');

  const db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });

  try {
    // 1. Process unprocessed learning signals
    const signalsProcessed = await processLearningSignals(db);
    console.log(`📊 Processed ${signalsProcessed} learning signals`);

    // 2. Recompute community patterns
    const patternsUpdated = await recomputePatterns(db);
    console.log(`📈 Updated ${patternsUpdated} community patterns`);

    // 3. Run evolution for each persona
    const personaIds = [
      'ferni',
      'jack-bogle',
      'peter-lynch',
      'maya-santos',
      'jordan-taylor',
      'alex-chen',
    ];

    for (const personaId of personaIds) {
      await runPersonaEvolution(db, personaId);
    }

    // 4. Clean up old signals (keep last 30 days)
    const signalsDeleted = await cleanupOldSignals(db);
    console.log(`🧹 Cleaned up ${signalsDeleted} old signals`);

    // 5. Log summary
    await logEvolutionRun(db, {
      signalsProcessed,
      patternsUpdated,
      personasProcessed: personaIds.length,
      timestamp: new Date().toISOString(),
    });

    console.log('✅ Evolution cycle complete');
  } catch (error) {
    console.error('❌ Evolution cycle failed:', error);
    throw error;
  }
}

// ============================================================================
// SIGNAL PROCESSING
// ============================================================================

async function processLearningSignals(db: Firestore): Promise<number> {
  const signalsRef = db.collection('learning_signals');
  const unprocessedSnap = await signalsRef.where('processed', '==', false).limit(1000).get();

  if (unprocessedSnap.empty) return 0;

  let processed = 0;

  // Group signals by context
  const contextGroups = new Map<
    string,
    Array<{
      strategy: string;
      engagement: number;
      personaId: string;
    }>
  >();

  for (const doc of unprocessedSnap.docs) {
    const data = doc.data() as LearningSignal;

    for (const signal of data.signals) {
      const ctx = signal.context;
      const outcome = signal.outcome;

      // Create context key
      const key = `${ctx.userEmotion || 'neutral'}|${ctx.topic || 'general'}|${ctx.relationshipStage || 'acquaintance'}`;

      const group = contextGroups.get(key) || [];
      group.push({
        strategy: (ctx.strategyType as string) || 'unknown',
        engagement: (outcome.engagementScore as number) || 0.5,
        personaId: data.personaId,
      });
      contextGroups.set(key, group);
    }

    // Mark as processed
    await doc.ref.update({ processed: true, processedAt: new Date().toISOString() });
    processed++;
  }

  // Update pattern aggregates
  const patternsRef = db.collection('community_insights').doc('patterns');
  const patternsDoc = await patternsRef.get();
  const existingPatterns = (patternsDoc.exists ? patternsDoc.data()?.patterns : []) as CommunityPattern[];

  const patternsMap = new Map<string, CommunityPattern>();
  for (const p of existingPatterns) {
    patternsMap.set(p.id, p);
  }

  // Merge new signals into patterns
  for (const [contextKey, signals] of contextGroups.entries()) {
    const [emotion, topic, stage] = contextKey.split('|');
    const patternId = `pattern_${contextKey.replace(/\|/g, '_')}`;

    let pattern = patternsMap.get(patternId);

    if (!pattern) {
      pattern = {
        id: patternId,
        context: {
          userEmotion: emotion,
          topic: topic,
          relationshipStage: stage,
        },
        strategies: [],
        bestStrategy: 'unknown',
        totalSamples: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    // Update strategy effectiveness
    const strategyGroups = new Map<string, number[]>();
    for (const sig of signals) {
      const engagements = strategyGroups.get(sig.strategy) || [];
      engagements.push(sig.engagement);
      strategyGroups.set(sig.strategy, engagements);
    }

    for (const [strategy, engagements] of strategyGroups.entries()) {
      const avg = engagements.reduce((a, b) => a + b, 0) / engagements.length;
      const existing = pattern.strategies.find((s) => s.type === strategy);

      if (existing) {
        // Running average
        existing.avgEngagement =
          (existing.avgEngagement * existing.sampleSize + avg * engagements.length) /
          (existing.sampleSize + engagements.length);
        existing.sampleSize += engagements.length;
      } else {
        pattern.strategies.push({
          type: strategy,
          avgEngagement: avg,
          sampleSize: engagements.length,
        });
      }
    }

    // Update best strategy
    if (pattern.strategies.length > 0) {
      pattern.strategies.sort((a, b) => b.avgEngagement - a.avgEngagement);
      pattern.bestStrategy = pattern.strategies[0].type;
    }

    pattern.totalSamples += signals.length;
    pattern.lastUpdated = new Date().toISOString();

    patternsMap.set(patternId, pattern);
  }

  // Save updated patterns
  await patternsRef.set(
    {
      patterns: Array.from(patternsMap.values()),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return processed;
}

// ============================================================================
// PATTERN RECOMPUTATION
// ============================================================================

async function recomputePatterns(db: Firestore): Promise<number> {
  const patternsRef = db.collection('community_insights').doc('patterns');
  const patternsDoc = await patternsRef.get();

  if (!patternsDoc.exists) return 0;

  const patterns = (patternsDoc.data()?.patterns || []) as CommunityPattern[];

  // Filter out patterns with too few samples
  const MIN_SAMPLES = 10;
  const validPatterns = patterns.filter((p) => p.totalSamples >= MIN_SAMPLES);

  // Sort strategies within each pattern
  for (const pattern of validPatterns) {
    pattern.strategies.sort((a, b) => b.avgEngagement - a.avgEngagement);
    if (pattern.strategies.length > 0) {
      pattern.bestStrategy = pattern.strategies[0].type;
    }
  }

  await patternsRef.set(
    {
      patterns: validPatterns,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return validPatterns.length;
}

// ============================================================================
// PERSONA EVOLUTION
// ============================================================================

async function runPersonaEvolution(db: Firestore, personaId: string): Promise<void> {
  console.log(`🧬 Running evolution for ${personaId}...`);

  const evolutionRef = db.collection('agent_evolution').doc(personaId);
  const evolutionDoc = await evolutionRef.get();

  // Define the default state structure
  interface EvolutionState {
    personaId: string;
    adjustments: Array<{
      id: string;
      personaId: string;
      trigger: { condition: string; description: string };
      adjustment: { type: string; content: string; priority: number };
      source: string;
      confidence: number;
      effectivenessLift: number;
      createdAt: string;
      lastApplied: string;
      applicationCount: number;
      enabled: boolean;
    }>;
    storyRankings: unknown[];
    effectivePhrases: unknown[];
    experiments: unknown[];
    emergentPatterns: unknown[];
    evolutionMetrics: {
      avgEngagementBefore: number;
      avgEngagementAfter: number;
      improvementPercent: number;
      adjustmentsApplied: number;
      experimentsRun: number;
      lastEvolutionCycle: string;
    };
  }

  // Get existing state or create default
  const existingData = evolutionDoc.exists ? evolutionDoc.data() : null;
  const state: EvolutionState = {
    personaId,
    adjustments: (existingData?.adjustments as EvolutionState['adjustments']) || [],
    storyRankings: (existingData?.storyRankings as unknown[]) || [],
    effectivePhrases: (existingData?.effectivePhrases as unknown[]) || [],
    experiments: (existingData?.experiments as unknown[]) || [],
    emergentPatterns: (existingData?.emergentPatterns as unknown[]) || [],
    evolutionMetrics: (existingData?.evolutionMetrics as EvolutionState['evolutionMetrics']) || {
      avgEngagementBefore: 0.5,
      avgEngagementAfter: 0.5,
      improvementPercent: 0,
      adjustmentsApplied: 0,
      experimentsRun: 0,
      lastEvolutionCycle: new Date().toISOString(),
    },
  };

  // Get community patterns for this persona
  const patternsRef = db.collection('community_insights').doc('patterns');
  const patternsDoc = await patternsRef.get();
  const patterns = (patternsDoc.exists ? patternsDoc.data()?.patterns : []) as CommunityPattern[];

  const personaPatterns = patterns.filter(
    (p) => p.context.personaId === personaId || !p.context.personaId
  );

  // Create adjustments from high-confidence patterns
  const existingAdjustmentIds = new Set(state.adjustments.map((a) => a.id));

  for (const pattern of personaPatterns) {
    if (pattern.totalSamples < 20) continue; // Need enough data

    const best = pattern.strategies[0];
    if (!best || best.sampleSize < 10) continue;

    const adjustmentId = `adj_${personaId}_${pattern.id}`;
    if (existingAdjustmentIds.has(adjustmentId)) continue;

    // Calculate confidence based on sample size and consistency
    const confidence = Math.min(0.95, best.sampleSize / 50);
    if (confidence < 0.6) continue;

    const adjustment = {
      id: adjustmentId,
      personaId,
      trigger: {
        condition: buildCondition(pattern.context),
        description: describeContext(pattern.context),
      },
      adjustment: {
        type: 'strategy_preference',
        content: `Prefer ${best.type} response strategy (${(best.avgEngagement * 100).toFixed(0)}% engagement)`,
        priority: Math.round(confidence * 10),
      },
      source: 'community_pattern',
      confidence,
      effectivenessLift: best.avgEngagement - 0.5,
      createdAt: new Date().toISOString(),
      lastApplied: new Date().toISOString(),
      applicationCount: 0,
      enabled: confidence >= 0.7,
    };

    state.adjustments = [...state.adjustments, adjustment];
    console.log(`  📝 Created adjustment: ${adjustment.trigger.description}`);
  }

  // Update metrics
  state.evolutionMetrics = {
    ...state.evolutionMetrics,
    adjustmentsApplied: state.adjustments.filter((a) => a.enabled).length,
    lastEvolutionCycle: new Date().toISOString(),
  };

  // Save updated state
  await evolutionRef.set(state, { merge: true });
}

function buildCondition(context: Record<string, string | undefined>): string {
  const conditions: string[] = [];
  if (context.userEmotion) conditions.push(`userEmotion === '${context.userEmotion}'`);
  if (context.topic) conditions.push(`topic === '${context.topic}'`);
  if (context.relationshipStage) conditions.push(`relationshipStage === '${context.relationshipStage}'`);
  return conditions.length > 0 ? conditions.join(' && ') : 'true';
}

function describeContext(context: Record<string, string | undefined>): string {
  const parts: string[] = [];
  if (context.userEmotion) parts.push(`user feels ${context.userEmotion}`);
  if (context.topic) parts.push(`discussing ${context.topic}`);
  if (context.relationshipStage) parts.push(`at ${context.relationshipStage} stage`);
  return parts.length > 0 ? `When ${parts.join(', ')}` : 'Any context';
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanupOldSignals(db: Firestore): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const signalsRef = db.collection('learning_signals');
  const oldSnap = await signalsRef
    .where('processed', '==', true)
    .where('createdAt', '<', thirtyDaysAgo.toISOString())
    .limit(500)
    .get();

  if (oldSnap.empty) return 0;

  const batch = db.batch();
  for (const doc of oldSnap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  return oldSnap.size;
}

// ============================================================================
// LOGGING
// ============================================================================

async function logEvolutionRun(
  db: Firestore,
  summary: {
    signalsProcessed: number;
    patternsUpdated: number;
    personasProcessed: number;
    timestamp: string;
  }
): Promise<void> {
  await db.collection('evolution_runs').add({
    ...summary,
    success: true,
  });
}

// ============================================================================
// HTTP TRIGGER (For manual runs)
// ============================================================================

export async function evolutionSchedulerHttp(
  req: { method: string },
  res: { status: (code: number) => { json: (data: unknown) => void } }
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await evolutionScheduler({ data: '' }, { eventId: 'manual', timestamp: new Date().toISOString() });
    res.status(200).json({ success: true, message: 'Evolution cycle complete' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
}

