/**
 * LLM-Powered Memory Backfill Script
 *
 * This script processes historical conversations using Gemini 1.5 Flash to extract:
 * - Entities (people, places, events)
 * - Human signals (dates, values, dreams, fears)
 * - Relationships between entities
 * - Facts about entities
 *
 * Part of the "Better Than Human Memory System" implementation (Jan 2026)
 *
 * Run with:
 *   npx tsx apps/cli/src/commands/jobs/backfill-memory-llm.ts
 *   npx tsx apps/cli/src/commands/jobs/backfill-memory-llm.ts --dry-run
 *   npx tsx apps/cli/src/commands/jobs/backfill-memory-llm.ts --user-id=ABC123
 *   npx tsx apps/cli/src/commands/jobs/backfill-memory-llm.ts --limit=10
 */

import { Firestore } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_USER = process.argv.find(arg => arg.startsWith('--user-id='))?.split('=')[1];
const LIMIT_USERS = SPECIFIC_USER ? 1 : (process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '50', 10)
  : 50);
const CONVERSATIONS_PER_USER = parseInt(
  process.argv.find(arg => arg.startsWith('--conversations='))?.split('=')[1] || '100',
  10
); // Process last N conversations per user
const BATCH_SIZE = 5; // Process N conversations at a time to avoid rate limits
const RATE_LIMIT_DELAY_MS = 1000; // Delay between batches

const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  databaseId: process.env.FIRESTORE_DATABASE || '(default)',
});

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GOOGLE_API_KEY or GEMINI_API_KEY environment variable required');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash', // Updated model name (Jan 2026)
  generationConfig: {
    temperature: 0.1, // Low for structured extraction
    maxOutputTokens: 4000,
    responseMimeType: 'application/json',
  },
});

// ============================================================================
// TYPES
// ============================================================================

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface ExtractedEntity {
  name: string;
  type: string;
  relationship?: string;
  attributes: Record<string, unknown>;
  confidence: number;
}

interface ExtractedSignal {
  id: string;
  type: string;
  value: string;
  context?: string;
  confidence: number;
  extractedAt: Date;
}

interface ExtractionResult {
  entities: ExtractedEntity[];
  humanSignals: {
    importantDates: ExtractedSignal[];
    values: ExtractedSignal[];
    dreams: ExtractedSignal[];
    fears: ExtractedSignal[];
    growthMarkers: ExtractedSignal[];
    comfortPatterns: ExtractedSignal[];
    challenges: ExtractedSignal[];
    stressTriggers: ExtractedSignal[];
    importantPeople: ExtractedSignal[];
  };
}

// ============================================================================
// LLM EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_PROMPT = `You are analyzing a conversation to build a "superhuman memory" for an AI life coach.
Extract ALL meaningful information that a human friend would probably forget but an AI should remember.

## EXTRACT THESE ENTITY TYPES:
1. **PEOPLE** - Named individuals or relationship mentions (e.g., "my brother Mike", "my therapist")
2. **PLACES** - Significant locations in the user's life
3. **EVENTS** - Past or upcoming events with dates if mentioned
4. **GOALS** - Things the user wants to achieve
5. **COMMITMENTS** - Promises or intentions stated

## EXTRACT THESE HUMAN SIGNALS:
1. **Important Dates** - Birthdays, anniversaries, milestones (with actual dates if mentioned)
2. **Values** - What the user believes in, cares about, prioritizes
3. **Dreams** - Long-term aspirations, wishes, hopes
4. **Fears** - Worries, anxieties, concerns
5. **Growth Markers** - Areas of personal development, progress made
6. **Comfort Patterns** - What helps them feel better, coping mechanisms
7. **Challenges** - Current struggles, obstacles
8. **Stress Triggers** - What causes them stress or anxiety
9. **Important People** - Key relationships and why they matter

## OUTPUT FORMAT (JSON):
{
  "entities": [
    {
      "name": "Mike",
      "type": "person",
      "relationship": "brother",
      "attributes": {"age": "30", "lives_in": "Boston"},
      "confidence": 0.9
    }
  ],
  "humanSignals": {
    "importantDates": [{"type": "birthday", "value": "March 15", "context": "user's birthday"}],
    "values": [{"type": "value", "value": "family", "context": "frequently mentions family"}],
    "dreams": [{"type": "dream", "value": "start a business", "context": "mentioned wanting to..."}],
    "fears": [{"type": "fear", "value": "failure", "context": "worried about..."}],
    "growthMarkers": [{"type": "progress", "value": "meditation", "context": "started meditating daily"}],
    "comfortPatterns": [{"type": "coping", "value": "walking", "context": "walks when stressed"}],
    "challenges": [{"type": "challenge", "value": "work-life balance", "context": "struggling with..."}],
    "stressTriggers": [{"type": "trigger", "value": "deadlines", "context": "gets anxious about..."}],
    "importantPeople": [{"type": "person", "value": "Sarah", "context": "best friend since college"}]
  }
}

Be thorough but only include what's explicitly or strongly implied in the conversation.
Confidence: 0.9+ for explicit mentions, 0.7-0.9 for strong implications, 0.5-0.7 for weak implications.

CONVERSATION TO ANALYZE:
`;

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

async function extractWithLLM(turns: ConversationTurn[]): Promise<ExtractionResult> {
  const defaultResult: ExtractionResult = {
    entities: [],
    humanSignals: {
      importantDates: [],
      values: [],
      dreams: [],
      fears: [],
      growthMarkers: [],
      comfortPatterns: [],
      challenges: [],
      stressTriggers: [],
      importantPeople: [],
    },
  };

  if (turns.length < 2) return defaultResult;

  // Format conversation for LLM
  const conversationText = turns
    .map(t => `${t.role === 'user' ? 'User' : 'Ferni'}: ${t.content}`)
    .join('\n');

  try {
    const result = await model.generateContent(EXTRACTION_PROMPT + conversationText);
    const response = await result.response;
    const text = response.text();

    const parsed = JSON.parse(text);
    
    // Validate and add IDs/timestamps to signals
    const now = new Date();
    for (const category of Object.keys(parsed.humanSignals || {})) {
      const signals = parsed.humanSignals[category];
      if (Array.isArray(signals)) {
        for (const signal of signals) {
          signal.id = signal.id || `${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          signal.extractedAt = now;
          signal.confidence = signal.confidence || 0.7;
        }
      }
    }

    return {
      entities: parsed.entities || [],
      humanSignals: {
        importantDates: parsed.humanSignals?.importantDates || [],
        values: parsed.humanSignals?.values || [],
        dreams: parsed.humanSignals?.dreams || [],
        fears: parsed.humanSignals?.fears || [],
        growthMarkers: parsed.humanSignals?.growthMarkers || [],
        comfortPatterns: parsed.humanSignals?.comfortPatterns || [],
        challenges: parsed.humanSignals?.challenges || [],
        stressTriggers: parsed.humanSignals?.stressTriggers || [],
        importantPeople: parsed.humanSignals?.importantPeople || [],
      },
    };
  } catch (error) {
    console.log(`  ⚠️  LLM extraction failed: ${(error as Error).message}`);
    return defaultResult;
  }
}

// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================

async function getConversationTurns(
  userId: string,
  conversationId: string
): Promise<ConversationTurn[]> {
  const turnsRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversations')
    .doc(conversationId)
    .collection('turns');

  const turnsSnapshot = await turnsRef.orderBy('timestamp', 'asc').get();

  return turnsSnapshot.docs
    .map(doc => {
      const data = doc.data();
      return {
        role: data.role as 'user' | 'assistant',
        content: data.content || data.text || '',
        timestamp: data.timestamp?.toDate?.() || new Date(),
      };
    })
    .filter(t => t.content.length > 0);
}

function mergeSignals<T extends { id: string; value: string }>(
  existing: T[],
  newSignals: T[]
): T[] {
  const existingValues = new Set(existing.map(s => s.value.toLowerCase()));
  const merged = [...existing];

  for (const signal of newSignals) {
    if (!existingValues.has(signal.value.toLowerCase())) {
      merged.push(signal);
      existingValues.add(signal.value.toLowerCase());
    }
  }

  return merged;
}

async function saveExtraction(
  userId: string,
  extraction: ExtractionResult
): Promise<void> {
  if (DRY_RUN) return;

  const batch = db.batch();
  const userRef = db.collection('bogle_users').doc(userId);

  // Save entities to dynamic_entities collection
  for (const entity of extraction.entities) {
    const entityId = `${entity.type}_${entity.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const entityRef = userRef.collection('dynamic_entities').doc(entityId);
    batch.set(entityRef, {
      ...entity,
      userId,
      createdAt: new Date(),
      source: 'llm_backfill',
    }, { merge: true });
  }

  // Save human signals to human_memory subcollection
  const humanMemoryRef = userRef.collection('human_memory').doc('profile');
  const existingDoc = await humanMemoryRef.get();
  const existingData = existingDoc.exists ? existingDoc.data() : {};

  const mergedSignals = {
    importantDates: mergeSignals(existingData?.importantDates || [], extraction.humanSignals.importantDates),
    values: mergeSignals(existingData?.values || [], extraction.humanSignals.values),
    dreams: mergeSignals(existingData?.dreams || [], extraction.humanSignals.dreams),
    fears: mergeSignals(existingData?.fears || [], extraction.humanSignals.fears),
    growthMarkers: mergeSignals(existingData?.growthMarkers || [], extraction.humanSignals.growthMarkers),
    comfortPatterns: mergeSignals(existingData?.comfortPatterns || [], extraction.humanSignals.comfortPatterns),
    challenges: mergeSignals(existingData?.challenges || [], extraction.humanSignals.challenges),
    stressTriggers: mergeSignals(existingData?.stressTriggers || [], extraction.humanSignals.stressTriggers),
    importantPeople: mergeSignals(existingData?.importantPeople || [], extraction.humanSignals.importantPeople),
  };

  batch.set(humanMemoryRef, {
    ...mergedSignals,
    updatedAt: new Date(),
    llmBackfilledAt: new Date(),
    source: 'llm_backfill',
  }, { merge: true });

  await batch.commit();
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processUser(userId: string): Promise<{
  conversationsProcessed: number;
  entitiesFound: number;
  signalsFound: number;
}> {
  let entitiesFound = 0;
  let signalsFound = 0;
  let conversationsProcessed = 0;

  // Get recent conversations
  const conversationsRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversations');

  const conversationsSnapshot = await conversationsRef
    .orderBy('startedAt', 'desc')
    .limit(CONVERSATIONS_PER_USER)
    .get();

  const allExtractions: ExtractionResult = {
    entities: [],
    humanSignals: {
      importantDates: [],
      values: [],
      dreams: [],
      fears: [],
      growthMarkers: [],
      comfortPatterns: [],
      challenges: [],
      stressTriggers: [],
      importantPeople: [],
    },
  };

  // Process in batches to avoid rate limits
  const conversations = conversationsSnapshot.docs;
  for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    const batch = conversations.slice(i, i + BATCH_SIZE);

    for (const convDoc of batch) {
      try {
        const turns = await getConversationTurns(userId, convDoc.id);

        if (turns.length < 2) continue;

        conversationsProcessed++;
        const extraction = await extractWithLLM(turns);

        // Merge extractions
        allExtractions.entities.push(...extraction.entities);
        for (const category of Object.keys(extraction.humanSignals) as Array<keyof typeof extraction.humanSignals>) {
          allExtractions.humanSignals[category].push(...extraction.humanSignals[category]);
        }

        entitiesFound += extraction.entities.length;
        signalsFound += Object.values(extraction.humanSignals).reduce(
          (sum, arr) => sum + arr.length,
          0
        );
      } catch (e) {
        // Skip conversations that fail
        console.log(`    ⚠️  Conv ${convDoc.id.substring(0, 8)}... failed: ${(e as Error).message}`);
      }
    }

    // Rate limit delay between batches
    if (i + BATCH_SIZE < conversations.length) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  // Save merged extractions
  if (entitiesFound > 0 || signalsFound > 0) {
    await saveExtraction(userId, allExtractions);
  }

  return { conversationsProcessed, entitiesFound, signalsFound };
}

async function main() {
  console.log('🧠 LLM-Powered Memory Backfill');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update Firestore)'}`);
  console.log(`Model: gemini-1.5-flash`);
  if (SPECIFIC_USER) {
    console.log(`Target user: ${SPECIFIC_USER}`);
  } else {
    console.log(`Processing up to ${LIMIT_USERS} users`);
  }
  console.log(`Analyzing last ${CONVERSATIONS_PER_USER} conversations per user`);
  console.log(`Batch size: ${BATCH_SIZE} (with ${RATE_LIMIT_DELAY_MS}ms delay)\n`);

  let usersSnapshot;
  
  if (SPECIFIC_USER) {
    // Process specific user
    const userDoc = await db.collection('bogle_users').doc(SPECIFIC_USER).get();
    if (!userDoc.exists) {
      console.error(`❌ User ${SPECIFIC_USER} not found`);
      process.exit(1);
    }
    usersSnapshot = { docs: [userDoc], size: 1 };
  } else {
    // Get users with conversations
    usersSnapshot = await db
      .collection('bogle_users')
      .where('totalConversations', '>', 0)
      .orderBy('totalConversations', 'desc')
      .limit(LIMIT_USERS)
      .get();
  }

  console.log(`Found ${usersSnapshot.size} users to process\n`);

  let totalEntities = 0;
  let totalSignals = 0;
  let totalConversations = 0;
  let usersProcessed = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    console.log(`\n📝 Processing ${userId.substring(0, 20)}... (${userData?.totalConversations || '?'} conversations)`);

    try {
      const result = await processUser(userId);

      console.log(`   ✅ ${result.conversationsProcessed} convs → ${result.entitiesFound} entities, ${result.signalsFound} signals`);
      
      usersProcessed++;
      totalEntities += result.entitiesFound;
      totalSignals += result.signalsFound;
      totalConversations += result.conversationsProcessed;
    } catch (e) {
      console.log(`   ❌ Error: ${(e as Error).message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  Users processed:        ${usersProcessed}`);
  console.log(`  Conversations analyzed: ${totalConversations}`);
  console.log(`  Entities extracted:     ${totalEntities}`);
  console.log(`  Human signals found:    ${totalSignals}`);

  if (DRY_RUN) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ LLM backfill complete! Memory data saved to Firestore.');
  }
}

main().catch(console.error);
