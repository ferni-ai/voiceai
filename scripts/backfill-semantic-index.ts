#!/usr/bin/env npx tsx

/**
 * Semantic Index Backfill Script
 *
 * Backfills existing data into the semantic memory index.
 * Run this after deploying the new semantic data layer.
 *
 * Usage:
 *   npx tsx scripts/backfill-semantic-index.ts [options]
 *
 * Options:
 *   --user <userId>     Backfill for a specific user
 *   --domain <domain>   Backfill only one domain (trust, superhuman, etc.)
 *   --dry-run           Show what would be backfilled without doing it
 *   --batch <size>      Batch size (default: 50)
 *   --limit <n>         Limit total documents to process
 *
 * Examples:
 *   npx tsx scripts/backfill-semantic-index.ts --dry-run
 *   npx tsx scripts/backfill-semantic-index.ts --user user_123
 *   npx tsx scripts/backfill-semantic-index.ts --domain trust --batch 100
 *
 * @module scripts/backfill-semantic-index
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { createLogger } from '../src/utils/safe-logger.js';
import { getFirestoreVectorStore } from '../src/memory/firestore-vector-store.js';
import { shouldIndex, buildIndexContent, getEntityPolicy } from '../src/services/data-layer/indexing-policy.js';
import type { EntityType, StoreType } from '../src/services/data-layer/types.js';

const log = createLogger({ name: 'BackfillSemanticIndex' });

// ============================================================================
// TYPES
// ============================================================================

interface BackfillOptions {
  userId?: string;
  domain?: StoreType;
  dryRun: boolean;
  batchSize: number;
  limit?: number;
}

interface BackfillStats {
  processed: number;
  indexed: number;
  skipped: number;
  errors: number;
  byDomain: Record<string, number>;
}

interface CollectionMapping {
  collection: string;
  subcollection?: string;
  entityType: EntityType;
  storeType: StoreType;
  contentBuilder?: (doc: DocumentData) => string;
}

// ============================================================================
// COLLECTION MAPPINGS
// ============================================================================

const COLLECTION_MAPPINGS: CollectionMapping[] = [
  // Productivity Store
  {
    collection: 'bogle_users',
    subcollection: 'habits',
    entityType: 'habit',
    storeType: 'productivity',
    contentBuilder: (doc) => `Habit: ${doc.name || doc.title}. ${doc.description || ''}. Frequency: ${doc.frequency}. Streak: ${doc.streakCurrent || 0} days.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'tasks',
    entityType: 'task',
    storeType: 'productivity',
    contentBuilder: (doc) => `Task: ${doc.title || doc.name}. ${doc.description || ''}. Priority: ${doc.priority}. Due: ${doc.dueDate || 'No due date'}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'routines',
    entityType: 'routine',
    storeType: 'productivity',
    contentBuilder: (doc) => `Routine: ${doc.name}. ${doc.description || ''}. Time: ${doc.timeOfDay}.`,
  },

  // Financial Store
  {
    collection: 'bogle_users',
    subcollection: 'budgets',
    entityType: 'budget',
    storeType: 'financial',
    contentBuilder: (doc) => `Budget: ${doc.name}. Monthly limit: $${doc.monthlyLimit}. Spent: $${doc.spent || 0}. Remaining: $${doc.remaining || doc.monthlyLimit}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'savings_goals',
    entityType: 'savings_goal',
    storeType: 'financial',
    contentBuilder: (doc) => `Savings goal: ${doc.name}. Target: $${doc.targetAmount}. Current: $${doc.currentAmount || 0}. Priority: ${doc.priority}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'subscriptions',
    entityType: 'subscription',
    storeType: 'financial',
    contentBuilder: (doc) => `Subscription: ${doc.name}. $${doc.amount}/${doc.frequency}. Category: ${doc.category}.`,
  },

  // Life Data Store
  {
    collection: 'bogle_users',
    subcollection: 'milestones',
    entityType: 'milestone',
    storeType: 'life-data',
    contentBuilder: (doc) => `Milestone: ${doc.name}. Category: ${doc.category}. Status: ${doc.status}. Target: ${doc.targetDate}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'life_goals',
    entityType: 'life_goal',
    storeType: 'life-data',
    contentBuilder: (doc) => `Life goal: ${doc.title}. ${doc.description || ''}. Category: ${doc.category}. Timeframe: ${doc.timeframe}.`,
  },

  // Trust Systems
  {
    collection: 'bogle_users',
    subcollection: 'trust_profiles/commitment_keeper/commitments',
    entityType: 'commitment',
    storeType: 'trust',
    contentBuilder: (doc) => `Commitment: ${doc.description}. Made by: ${doc.madeBy}. Status: ${doc.status}. ${doc.deadline ? `Deadline: ${doc.deadline}` : ''}`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'trust_profiles/boundary_memory/boundaries',
    entityType: 'boundary',
    storeType: 'trust',
    contentBuilder: (doc) => `Boundary: Do not bring up "${doc.topic}". Severity: ${doc.severity}. ${doc.reason ? `Reason: ${doc.reason}` : ''}`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'trust_profiles/growth_reflection/reflections',
    entityType: 'growth_reflection',
    storeType: 'trust',
    contentBuilder: (doc) => `Growth observed: ${doc.observation}. Area: ${doc.area}. Evidence: ${doc.evidence}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'trust_profiles/inside_jokes/jokes',
    entityType: 'inside_joke',
    storeType: 'trust',
    contentBuilder: (doc) => `Inside joke: "${doc.joke}". Context: ${doc.context}. Shared moment: ${doc.sharedMoment}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'trust_profiles/small_wins/wins',
    entityType: 'small_win',
    storeType: 'trust',
    contentBuilder: (doc) => `Small win: ${doc.win}. Effort: ${doc.effort}. ${doc.celebration ? `Celebration: ${doc.celebration}` : ''}`,
  },

  // Superhuman Services
  {
    collection: 'bogle_users',
    subcollection: 'superhuman/dream_keeper/dreams',
    entityType: 'dream',
    storeType: 'superhuman',
    contentBuilder: (doc) => `Dream: ${doc.dream}. Category: ${doc.category}. ${doc.timeframe ? `Timeframe: ${doc.timeframe}` : ''}`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'superhuman/life_narrative/chapters',
    entityType: 'life_chapter',
    storeType: 'superhuman',
    contentBuilder: (doc) => `Life chapter: "${doc.title}". ${doc.summary}. Themes: ${(doc.themes || []).join(', ')}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'superhuman/capacity_guardian/states',
    entityType: 'capacity_state',
    storeType: 'superhuman',
    contentBuilder: (doc) => `Capacity: ${doc.level}. Factors: ${(doc.factors || []).join(', ')}. Recommendation: ${doc.recommendation}.`,
  },

  // Health & Wellness
  {
    collection: 'bogle_users',
    subcollection: 'health/goals',
    entityType: 'health_goal',
    storeType: 'health',
    contentBuilder: (doc) => `Health goal: ${doc.goal}. Category: ${doc.category}. ${doc.targetDate ? `Target: ${doc.targetDate}` : ''}`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'health/wellness_checkins',
    entityType: 'wellness_checkin',
    storeType: 'health',
    contentBuilder: (doc) => `Wellness check: Mood ${doc.mood}/10, Energy ${doc.energy}/10. ${doc.notes || ''}`,
  },

  // Coaching
  {
    collection: 'bogle_users',
    subcollection: 'coaching/insights',
    entityType: 'coaching_insight',
    storeType: 'coaching',
    contentBuilder: (doc) => `Coaching insight: ${doc.insight}. Context: ${doc.context}. Category: ${doc.category}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'coaching/breakthroughs',
    entityType: 'breakthrough_moment',
    storeType: 'coaching',
    contentBuilder: (doc) => `Breakthrough: ${doc.description}. Trigger: ${doc.trigger}. Impact: ${doc.impact}.`,
  },

  // Wisdom
  {
    collection: 'bogle_users',
    subcollection: 'wisdom/insights',
    entityType: 'wisdom_insight',
    storeType: 'wisdom',
    contentBuilder: (doc) => `Wisdom: ${doc.insight}. ${doc.source ? `Source: ${doc.source}` : ''} Category: ${doc.category}.`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'wisdom/life_lessons',
    entityType: 'life_lesson',
    storeType: 'wisdom',
    contentBuilder: (doc) => `Life lesson: ${doc.lesson}. From: ${doc.experience}. ${doc.applicationArea ? `Application: ${doc.applicationArea}` : ''}`,
  },

  // Contacts
  {
    collection: 'bogle_users',
    subcollection: 'contacts',
    entityType: 'contact',
    storeType: 'contacts',
    contentBuilder: (doc) => `Contact: ${doc.name}. Relationship: ${doc.relationship}. ${doc.notes || ''}`,
  },

  // Calendar
  {
    collection: 'bogle_users',
    subcollection: 'calendar/events',
    entityType: 'calendar_event',
    storeType: 'calendar',
    contentBuilder: (doc) => `Event: ${doc.title}. Date: ${doc.date}${doc.time ? ` at ${doc.time}` : ''}. ${doc.notes || ''}`,
  },
  {
    collection: 'bogle_users',
    subcollection: 'calendar/meeting_memories',
    entityType: 'meeting_memory',
    storeType: 'calendar',
    contentBuilder: (doc) => `Meeting: ${doc.meetingTitle}. Key points: ${(doc.keyPoints || []).join('; ')}.`,
  },

  // ============================================================================
  // BETTER THAN HUMAN - What makes us superhuman
  // ============================================================================

  // Voice biomarkers - "We hear what you're not saying"
  {
    collection: 'bogle_users',
    subcollection: 'voice_biomarkers',
    entityType: 'voice_biomarker',
    storeType: 'superhuman-intelligence',
    contentBuilder: (doc) => `Voice Biomarker: Fatigue ${Math.round((doc.biomarkers?.fatigueLevel || 0) * 100)}%, Stress: ${doc.biomarkers?.stressTrajectory || 'stable'}, Illness Risk: ${Math.round((doc.biomarkers?.illnessRisk || 0) * 100)}%`,
  },

  // Session summaries - "We remember your whole story"
  {
    collection: 'bogle_users',
    subcollection: 'session_summaries',
    entityType: 'session_summary',
    storeType: 'session-context',
    contentBuilder: (doc) => `Session Summary: ${doc.naturalSummary || doc.summary}. Topics: ${(doc.mainTopics || []).join(', ')}. Emotional arc: ${(doc.emotionalArc || []).map((e: { emotion: string }) => e.emotion).join(' → ')}`,
  },

  // Pattern insights - "We see patterns you can't see"
  {
    collection: 'bogle_users',
    subcollection: 'pattern_insights',
    entityType: 'pattern_insight',
    storeType: 'superhuman-intelligence',
    contentBuilder: (doc) => `Pattern Insight: ${doc.insight}. Type: ${doc.type}. ${doc.gentleProbe || ''}`,
  },

  // Behavioral patterns
  {
    collection: 'bogle_users',
    subcollection: 'sabotage_patterns',
    entityType: 'behavioral_pattern',
    storeType: 'superhuman-intelligence',
    contentBuilder: (doc) => `Behavioral Pattern: ${doc.behavior}. Trigger: ${doc.trigger}. Consequence: ${doc.consequence}`,
  },

  // Cross-session threads - "We connect dots across time"
  {
    collection: 'bogle_users',
    subcollection: 'semantic_threads',
    entityType: 'cross_session_thread',
    storeType: 'session-context',
    contentBuilder: (doc) => `Cross-Session Thread: ${doc.theme}. Connection: ${doc.connectionInsight}. Depth: ${doc.depth} sessions`,
  },

  // Correlation insights - "We find hidden connections"
  {
    collection: 'bogle_users',
    subcollection: 'semantic_correlations',
    entityType: 'correlation_insight',
    storeType: 'superhuman-intelligence',
    contentBuilder: (doc) => `Correlation: ${doc.connectionInsight}. ${doc.domainA?.pattern} ↔ ${doc.domainB?.pattern}. Strength: ${Math.round((doc.strength || 0) * 100)}%`,
  },

  // Protective moments - "We know when NOT to speak"
  {
    collection: 'bogle_users',
    subcollection: 'protective_boundaries',
    entityType: 'protective_moment',
    storeType: 'superhuman-intelligence',
    contentBuilder: (doc) => `Protective Boundary: Avoid "${doc.topic}". Severity: ${doc.severity}. ${doc.reason || ''}`,
  },

  // Voice recognition - "We know your voice"
  {
    collection: 'bogle_users',
    subcollection: 'voice_profiles',
    entityType: 'voice_recognition',
    storeType: 'voice',
    contentBuilder: (doc) => `Voice Profile: ${doc.displayName || 'User'}. Quality: ${Math.round((doc.qualityScore || 0) * 100)}%. Verifications: ${doc.verificationCount || 0}`,
  },
];

// ============================================================================
// INITIALIZATION
// ============================================================================

function initFirebase(): void {
  if (getApps().length === 0) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'ferni-ai-dev';

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({
        credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId,
      });
    } else {
      initializeApp({ projectId });
    }
  }
}

// ============================================================================
// BACKFILL LOGIC
// ============================================================================

async function backfillCollection(
  mapping: CollectionMapping,
  options: BackfillOptions,
  stats: BackfillStats
): Promise<void> {
  const db = getFirestore();

  log.info(
    { collection: mapping.collection, subcollection: mapping.subcollection, entityType: mapping.entityType },
    'Starting collection backfill'
  );

  let query;

  if (mapping.subcollection) {
    // For subcollections, we need to iterate through parent documents
    const parentCollection = mapping.collection;

    let parentQuery = db.collection(parentCollection);
    if (options.userId) {
      parentQuery = parentQuery.where('__name__', '==', options.userId) as unknown as typeof parentQuery;
    }

    const parentDocs = await parentQuery.limit(options.limit || 1000).get();

    for (const parentDoc of parentDocs.docs) {
      const userId = parentDoc.id;
      const subcollectionRef = parentDoc.ref.collection(mapping.subcollection);
      const subcollectionDocs = await subcollectionRef.limit(options.batchSize).get();

      await processDocuments(
        subcollectionDocs.docs,
        userId,
        mapping,
        options,
        stats
      );
    }
  } else {
    // Simple collection
    query = db.collection(mapping.collection);

    if (options.userId) {
      query = query.where('userId', '==', options.userId);
    }

    const docs = await query.limit(options.limit || 1000).get();
    await processDocuments(docs.docs, options.userId || 'unknown', mapping, options, stats);
  }
}

async function processDocuments(
  docs: QueryDocumentSnapshot<DocumentData>[],
  userId: string,
  mapping: CollectionMapping,
  options: BackfillOptions,
  stats: BackfillStats
): Promise<void> {
  const vectorStore = getFirestoreVectorStore();

  for (const doc of docs) {
    stats.processed++;

    const data = doc.data();

    // Check if should index based on policy
    const indexCheck = shouldIndex(mapping.entityType, data);
    if (!indexCheck.shouldIndex) {
      stats.skipped++;
      log.debug(
        { docId: doc.id, reason: indexCheck.reason },
        'Skipping document'
      );
      continue;
    }

    // Build content
    const content = mapping.contentBuilder
      ? mapping.contentBuilder(data)
      : buildIndexContent(mapping.entityType, data);

    if (!content || content.length < 10) {
      stats.skipped++;
      continue;
    }

    if (options.dryRun) {
      log.info(
        { docId: doc.id, entityType: mapping.entityType, content: content.slice(0, 100) + '...' },
        '[DRY RUN] Would index document'
      );
      stats.indexed++;
      continue;
    }

    try {
      await vectorStore.addDocument({
        id: `${mapping.entityType}_${doc.id}`,
        text: content,
        metadata: {
          userId,
          entityType: mapping.entityType,
          storeType: mapping.storeType,
          entityId: doc.id,
          source: 'backfill',
          backfilledAt: new Date().toISOString(),
        },
      });

      stats.indexed++;
      stats.byDomain[mapping.storeType] = (stats.byDomain[mapping.storeType] || 0) + 1;

      if (stats.indexed % 50 === 0) {
        log.info({ indexed: stats.indexed, processed: stats.processed }, 'Progress update');
      }
    } catch (error) {
      stats.errors++;
      log.error({ error: String(error), docId: doc.id }, 'Failed to index document');
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: args.includes('--dry-run'),
    batchSize: 50,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user' && args[i + 1]) {
      options.userId = args[++i];
    } else if (args[i] === '--domain' && args[i + 1]) {
      options.domain = args[++i] as StoreType;
    } else if (args[i] === '--batch' && args[i + 1]) {
      options.batchSize = parseInt(args[++i], 10);
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    }
  }

  log.info({ options }, 'Starting semantic index backfill');

  // Initialize
  initFirebase();
  const vectorStore = getFirestoreVectorStore();
  await vectorStore.initialize();

  const stats: BackfillStats = {
    processed: 0,
    indexed: 0,
    skipped: 0,
    errors: 0,
    byDomain: {},
  };

  // Filter mappings by domain if specified
  const mappings = options.domain
    ? COLLECTION_MAPPINGS.filter((m) => m.storeType === options.domain)
    : COLLECTION_MAPPINGS;

  log.info({ mappingCount: mappings.length, domain: options.domain || 'all' }, 'Processing mappings');

  // Process each mapping
  for (const mapping of mappings) {
    try {
      await backfillCollection(mapping, options, stats);
    } catch (error) {
      log.error(
        { error: String(error), mapping: mapping.entityType },
        'Failed to backfill collection'
      );
      stats.errors++;
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('BACKFILL COMPLETE');
  console.log('========================================');
  console.log(`Processed: ${stats.processed}`);
  console.log(`Indexed: ${stats.indexed}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log('\nBy Domain:');
  for (const [domain, count] of Object.entries(stats.byDomain)) {
    console.log(`  ${domain}: ${count}`);
  }
  if (options.dryRun) {
    console.log('\n[DRY RUN - No actual changes made]');
  }
  console.log('========================================\n');
}

main().catch((error) => {
  log.error({ error: String(error) }, 'Backfill failed');
  process.exit(1);
});
