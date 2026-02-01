/**
 * Backfill Human Signals from Existing Conversations
 * 
 * This script fixes a critical bug where human signals (dates, values, dreams,
 * fears, growth markers) were never extracted from conversations because the
 * extraction was looking for turns in the wrong place.
 * 
 * What it does:
 * 1. Finds all users with conversations
 * 2. For each user, loads recent conversations with turns
 * 3. Extracts human signals from the conversation turns
 * 4. Saves signals to the human_memory subcollection
 * 
 * Run with:
 *   npx tsx apps/cli/src/commands/jobs/backfill-human-signals.ts
 * 
 * Or dry-run first:
 *   npx tsx apps/cli/src/commands/jobs/backfill-human-signals.ts --dry-run
 */

import { Firestore } from '@google-cloud/firestore';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_USERS = process.argv.includes('--limit') 
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '10', 10)
  : 100;
const CONVERSATIONS_PER_USER = 20; // Process last N conversations per user

const db = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  databaseId: process.env.FIRESTORE_DATABASE || '(default)',
});

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface HumanSignal {
  id: string;
  type: string;
  value: string;
  confidence: number;
  extractedAt: Date;
  source: string;
}

interface ExtractionResult {
  importantDates: HumanSignal[];
  values: HumanSignal[];
  dreams: HumanSignal[];
  fears: HumanSignal[];
  growthMarkers: HumanSignal[];
  comfortPatterns: HumanSignal[];
  emotionalTells: HumanSignal[];
  insideJokes: HumanSignal[];
}

// Simple pattern-based extraction (enhanced version would use LLM)
function extractSignals(turns: ConversationTurn[], userId: string): ExtractionResult {
  const result: ExtractionResult = {
    importantDates: [],
    values: [],
    dreams: [],
    fears: [],
    growthMarkers: [],
    comfortPatterns: [],
    emotionalTells: [],
    insideJokes: [],
  };

  const userTurns = turns.filter(t => t.role === 'user');
  const text = userTurns.map(t => t.content).join(' ');
  const lowerText = text.toLowerCase();

  // Date patterns (birthday, anniversary, etc.)
  const datePatterns = [
    /my birthday is ([\w\s,]+)/i,
    /born on ([\w\s,]+)/i,
    /anniversary is ([\w\s,]+)/i,
    /wedding was ([\w\s,]+)/i,
    /started (?:my job|working) (?:on|in) ([\w\s,]+)/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.importantDates.push({
        id: `date_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'important_date',
        value: match[1].trim(),
        confidence: 0.8,
        extractedAt: new Date(),
        source: 'backfill',
      });
    }
  }

  // Value patterns
  const valuePatterns = [
    { pattern: /i (?:really )?(?:value|believe in|care about) ([\w\s]+)/i, type: 'value' },
    { pattern: /(?:most important|matters most) to me is ([\w\s]+)/i, type: 'value' },
    { pattern: /i always try to ([\w\s]+)/i, type: 'value' },
  ];
  
  for (const { pattern, type } of valuePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.values.push({
        id: `value_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value: match[1].trim(),
        confidence: 0.7,
        extractedAt: new Date(),
        source: 'backfill',
      });
    }
  }

  // Dream/goal patterns
  const dreamPatterns = [
    { pattern: /i (?:want to|dream of|hope to|wish i could) ([\w\s]+)/i, type: 'dream' },
    { pattern: /my goal is to ([\w\s]+)/i, type: 'goal' },
    { pattern: /one day i(?:'ll| will) ([\w\s]+)/i, type: 'dream' },
  ];
  
  for (const { pattern, type } of dreamPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.dreams.push({
        id: `dream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value: match[1].trim(),
        confidence: 0.7,
        extractedAt: new Date(),
        source: 'backfill',
      });
    }
  }

  // Fear/worry patterns
  const fearPatterns = [
    { pattern: /i(?:'m| am) (?:afraid|scared|worried|anxious) (?:of|about|that) ([\w\s]+)/i, type: 'fear' },
    { pattern: /(?:what if|i worry that) ([\w\s]+)/i, type: 'worry' },
  ];
  
  for (const { pattern, type } of fearPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.fears.push({
        id: `fear_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value: match[1].trim(),
        confidence: 0.7,
        extractedAt: new Date(),
        source: 'backfill',
      });
    }
  }

  // Growth patterns
  const growthPatterns = [
    { pattern: /i(?:'ve| have) (?:been working on|learned|grown|improved) ([\w\s]+)/i, type: 'growth' },
    { pattern: /i(?:'m| am) (?:getting better at|proud of) ([\w\s]+)/i, type: 'progress' },
  ];
  
  for (const { pattern, type } of growthPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.growthMarkers.push({
        id: `growth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value: match[1].trim(),
        confidence: 0.7,
        extractedAt: new Date(),
        source: 'backfill',
      });
    }
  }

  // Comfort patterns (what helps them feel better)
  const comfortPatterns = [
    { pattern: /(?:helps|makes) me (?:feel better|relax|calm down) (?:is|when) ([\w\s]+)/i, type: 'comfort' },
    { pattern: /i (?:like to|love to|enjoy) ([\w\s]+) when i(?:'m| am) (?:stressed|down|sad)/i, type: 'coping' },
  ];
  
  for (const { pattern, type } of comfortPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.comfortPatterns.push({
        id: `comfort_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value: match[1].trim(),
        confidence: 0.7,
        extractedAt: new Date(),
        source: 'backfill',
      });
    }
  }

  return result;
}

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
  
  return turnsSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      role: data.role as 'user' | 'assistant',
      content: data.content || data.text || '',
    };
  }).filter(t => t.content.length > 0);
}

async function processUser(userId: string): Promise<{
  conversationsProcessed: number;
  signalsFound: number;
}> {
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

  const allSignals: ExtractionResult = {
    importantDates: [],
    values: [],
    dreams: [],
    fears: [],
    growthMarkers: [],
    comfortPatterns: [],
    emotionalTells: [],
    insideJokes: [],
  };

  for (const convDoc of conversationsSnapshot.docs) {
    try {
      const turns = await getConversationTurns(userId, convDoc.id);
      
      if (turns.length < 2) continue;
      
      conversationsProcessed++;
      const signals = extractSignals(turns, userId);
      
      // Merge signals
      allSignals.importantDates.push(...signals.importantDates);
      allSignals.values.push(...signals.values);
      allSignals.dreams.push(...signals.dreams);
      allSignals.fears.push(...signals.fears);
      allSignals.growthMarkers.push(...signals.growthMarkers);
      allSignals.comfortPatterns.push(...signals.comfortPatterns);
      allSignals.emotionalTells.push(...signals.emotionalTells);
      allSignals.insideJokes.push(...signals.insideJokes);
    } catch (e) {
      // Skip conversations that fail
    }
  }

  // Count total signals
  signalsFound = Object.values(allSignals).reduce((sum, arr) => sum + arr.length, 0);

  if (signalsFound > 0 && !DRY_RUN) {
    // Save to human_memory subcollection
    const humanMemoryRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('human_memory')
      .doc('profile');

    await humanMemoryRef.set({
      ...allSignals,
      updatedAt: new Date(),
      backfilledAt: new Date(),
      source: 'backfill-script',
    }, { merge: true });

    // Also update the profile's humanMemory field
    const profileRef = db.collection('bogle_users').doc(userId);
    await profileRef.set({
      humanMemory: {
        importantDates: allSignals.importantDates,
        values: allSignals.values,
        dreams: allSignals.dreams,
        fears: allSignals.fears,
        growthMarkers: allSignals.growthMarkers,
        comfortPatterns: allSignals.comfortPatterns,
        backfilledAt: new Date(),
      },
    }, { merge: true });
  }

  return { conversationsProcessed, signalsFound };
}

async function main() {
  console.log('🧠 Backfill Human Signals');
  console.log('='.repeat(50));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update Firestore)'}`);
  console.log(`Processing up to ${LIMIT_USERS} users`);
  console.log(`Analyzing last ${CONVERSATIONS_PER_USER} conversations per user\n`);

  // Get users with conversations
  const usersSnapshot = await db
    .collection('bogle_users')
    .where('totalConversations', '>', 0)
    .orderBy('totalConversations', 'desc')
    .limit(LIMIT_USERS)
    .get();

  console.log(`Found ${usersSnapshot.size} users with conversations\n`);

  let totalSignals = 0;
  let totalConversations = 0;
  let usersWithSignals = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    try {
      const result = await processUser(userId);
      
      if (result.signalsFound > 0) {
        console.log(`✅ ${userId.substring(0, 20)}... : ${result.signalsFound} signals from ${result.conversationsProcessed} conversations`);
        usersWithSignals++;
        totalSignals += result.signalsFound;
      }
      
      totalConversations += result.conversationsProcessed;
    } catch (e) {
      console.log(`❌ ${userId.substring(0, 20)}... : error - ${(e as Error).message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`  Users processed:        ${usersSnapshot.size}`);
  console.log(`  Users with signals:     ${usersWithSignals}`);
  console.log(`  Conversations analyzed: ${totalConversations}`);
  console.log(`  Total signals found:    ${totalSignals}`);

  if (DRY_RUN) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Backfill complete! Human signals saved to Firestore.');
  }
}

main().catch(console.error);
