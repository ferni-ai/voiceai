#!/usr/bin/env npx tsx
/**
 * FTIS Hard Negatives Generator
 * 
 * Generates targeted training data to address specific confusion patterns.
 * Uses contrastive learning approach: for each confused pair, generate
 * examples that clearly distinguish between them.
 * 
 * Target: Improve weak categories from 91-97% to 98-99%
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

config();
process.env.USE_VERTEX_AI = 'false';

const { getGeminiClient, isGeminiConfigured, getGeminiConfigStatus } = await import('../src/config/gemini-config.js');

const OUTPUT_DIR = 'models/ftis-hierarchical-v2';
const EXAMPLES_PER_CONFUSION_PAIR = 100;

// Define confusion patterns and how to differentiate
interface ConfusionPattern {
  category1: string;
  category2: string;
  differentiator: string;
  category1Markers: string[];
  category2Markers: string[];
}

interface CategoryToImprove {
  superCategory: string;
  currentAccuracy: number;
  targetAccuracy: number;
  confusionPatterns: ConfusionPattern[];
  additionalExamplesPerCategory: number;
}

const CATEGORIES_TO_IMPROVE: CategoryToImprove[] = [
  // Health (91.60% → 98%+)
  {
    superCategory: 'health',
    currentAccuracy: 0.916,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 300,
    confusionPatterns: [
      {
        category1: 'habit_log',
        category2: 'exercise_log',
        differentiator: 'habit_log is for any habit (meditation, reading, water), exercise_log is specifically physical activity',
        category1Markers: ['habit', 'streak', 'did my', 'practiced', 'completed habit'],
        category2Markers: ['workout', 'ran', 'gym', 'exercise', 'steps', 'miles', 'lifted', 'cardio'],
      },
      {
        category1: 'habit_coaching',
        category2: 'routine_manage',
        differentiator: 'habit_coaching is asking for advice/motivation, routine_manage is creating/editing routines',
        category1Markers: ['struggling with', 'help me', 'advice', 'motivate', 'cant seem to', 'tips for'],
        category2Markers: ['create routine', 'edit routine', 'add to routine', 'change my routine', 'new routine'],
      },
      {
        category1: 'nutrition',
        category2: 'water',
        differentiator: 'nutrition is food/calories/meals, water is specifically hydration',
        category1Markers: ['ate', 'food', 'calories', 'meal', 'breakfast', 'lunch', 'dinner', 'snack'],
        category2Markers: ['water', 'hydration', 'glasses', 'drank', 'oz of water', 'cups of water'],
      },
      {
        category1: 'habit_log',
        category2: 'habit_view',
        differentiator: 'habit_log is marking done, habit_view is checking progress/streaks',
        category1Markers: ['did', 'completed', 'done', 'finished', 'log', 'mark'],
        category2Markers: ['how am i doing', 'streak', 'progress', 'show', 'view', 'check'],
      },
    ],
  },
  
  // Productivity (92.00% → 98%+)
  {
    superCategory: 'productivity',
    currentAccuracy: 0.92,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 250,
    confusionPatterns: [
      {
        category1: 'todo_add',
        category2: 'list_manage',
        differentiator: 'todo_add is adding a task, list_manage is about shopping lists or named lists',
        category1Markers: ['add task', 'remind me to', 'need to', 'todo', 'add to do'],
        category2Markers: ['shopping list', 'grocery', 'add to list', 'my list', 'create list'],
      },
      {
        category1: 'voice_memo',
        category2: 'memory_save',
        differentiator: 'voice_memo is recording audio, memory_save is storing text information',
        category1Markers: ['record', 'voice memo', 'note to self', 'dictate', 'recording'],
        category2Markers: ['remember', 'save', 'store', 'keep this', 'dont forget that'],
      },
      {
        category1: 'journal',
        category2: 'gratitude',
        differentiator: 'journal is general reflection, gratitude is specifically thankfulness',
        category1Markers: ['journal', 'diary', 'write about', 'today was', 'reflect on'],
        category2Markers: ['grateful', 'thankful', 'appreciate', 'gratitude', 'blessed'],
      },
      {
        category1: 'priorities',
        category2: 'todo_view',
        differentiator: 'priorities is about importance/focus, todo_view is listing tasks',
        category1Markers: ['priority', 'focus on', 'important', 'main thing', 'top priority'],
        category2Markers: ['todos', 'tasks', 'whats on my list', 'show tasks', 'pending'],
      },
      {
        category1: 'memory_save',
        category2: 'memory_recall',
        differentiator: 'memory_save is storing new info, memory_recall is retrieving past info',
        category1Markers: ['remember this', 'save', 'store', 'note that', 'keep in mind'],
        category2Markers: ['what did i', 'recall', 'when did', 'remember when', 'what was'],
      },
    ],
  },
  
  // Emotional (93.64% → 98%+)
  {
    superCategory: 'emotional',
    currentAccuracy: 0.9364,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 250,
    confusionPatterns: [
      {
        category1: 'grounding',
        category2: 'crisis_support',
        differentiator: 'grounding is calming exercises, crisis_support is emergency emotional help',
        category1Markers: ['breathe', 'calm', 'grounding', 'anxious', 'meditation', 'relax'],
        category2Markers: ['crisis', 'emergency', 'cant cope', 'breaking down', 'panic attack', 'help now'],
      },
      {
        category1: 'breakup_support',
        category2: 'relationship_advice',
        differentiator: 'breakup_support is post-breakup healing, relationship_advice is ongoing relationship guidance',
        category1Markers: ['broke up', 'ex', 'breakup', 'ended', 'dumped', 'heartbreak', 'over'],
        category2Markers: ['relationship', 'partner', 'dating', 'spouse', 'boyfriend', 'girlfriend', 'married'],
      },
      {
        category1: 'self_compassion',
        category2: 'imposter_syndrome',
        differentiator: 'self_compassion is self-care/kindness, imposter_syndrome is about feeling like a fraud',
        category1Markers: ['hard on myself', 'self-care', 'be kind', 'deserve', 'self-compassion'],
        category2Markers: ['imposter', 'fraud', 'dont belong', 'not good enough', 'fake', 'found out'],
      },
      {
        category1: 'coaching_motivation',
        category2: 'coaching_goals',
        differentiator: 'coaching_motivation is encouragement/energy, coaching_goals is about setting/tracking goals',
        category1Markers: ['motivate', 'inspire', 'pump up', 'encourage', 'get going', 'fired up'],
        category2Markers: ['goal', 'objective', 'target', 'achieve', 'set a goal', 'my goals'],
      },
    ],
  },
  
  // Media (93.81% → 98%+)
  {
    superCategory: 'media',
    currentAccuracy: 0.9381,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 250,
    confusionPatterns: [
      {
        category1: 'music_play',
        category2: 'music_mood',
        differentiator: 'music_play is specific songs/artists, music_mood is music for a feeling/activity',
        category1Markers: ['play', 'song', 'artist', 'album', 'track', 'by'],
        category2Markers: ['mood', 'vibe', 'feeling', 'energy', 'workout music', 'relax music', 'focus music'],
      },
      {
        category1: 'music_search',
        category2: 'music_playlist',
        differentiator: 'music_search is finding music, music_playlist is managing playlists',
        category1Markers: ['find', 'search', 'look for', 'whats this song', 'who sings'],
        category2Markers: ['playlist', 'add to playlist', 'queue', 'my playlist', 'create playlist'],
      },
      {
        category1: 'book_rec',
        category2: 'podcast_rec',
        differentiator: 'book_rec is book recommendations, podcast_rec is podcast recommendations',
        category1Markers: ['book', 'read', 'novel', 'author', 'reading'],
        category2Markers: ['podcast', 'episode', 'listen to', 'show', 'podcasts'],
      },
      {
        category1: 'music_play',
        category2: 'music_control',
        differentiator: 'music_play starts new music, music_control adjusts current playback',
        category1Markers: ['play', 'put on', 'start', 'i want to hear'],
        category2Markers: ['pause', 'stop', 'skip', 'next', 'volume', 'quieter', 'louder'],
      },
    ],
  },
  
  // Finance (94.00% → 98%+)
  {
    superCategory: 'finance',
    currentAccuracy: 0.94,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 400, // More examples for only 2 categories
    confusionPatterns: [
      {
        category1: 'budget',
        category2: 'bills',
        differentiator: 'budget is tracking spending/savings, bills is specific payments due',
        category1Markers: ['budget', 'spending', 'spent', 'save', 'finances', 'money tracker'],
        category2Markers: ['bill', 'pay', 'due', 'payment', 'electric bill', 'rent', 'invoice'],
      },
    ],
  },
  
  // Travel (96.02% → 98%+)
  {
    superCategory: 'travel',
    currentAccuracy: 0.9602,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 200,
    confusionPatterns: [
      {
        category1: 'weather_current',
        category2: 'weather_forecast',
        differentiator: 'weather_current is right now, weather_forecast is future',
        category1Markers: ['weather now', 'right now', 'currently', 'outside', 'is it'],
        category2Markers: ['forecast', 'tomorrow', 'this week', 'weekend', 'will it', 'going to'],
      },
      {
        category1: 'travel_plan',
        category2: 'flights',
        differentiator: 'travel_plan is general trip planning, flights is specifically about air travel',
        category1Markers: ['trip', 'vacation', 'travel', 'plan', 'itinerary', 'visit'],
        category2Markers: ['flight', 'fly', 'airline', 'airport', 'plane', 'book flight'],
      },
    ],
  },
  
  // Communication (97.72% → 98%+)
  {
    superCategory: 'communication',
    currentAccuracy: 0.9772,
    targetAccuracy: 0.98,
    additionalExamplesPerCategory: 150,
    confusionPatterns: [
      {
        category1: 'call_make',
        category2: 'message_send',
        differentiator: 'call_make is phone calls, message_send is text messages',
        category1Markers: ['call', 'phone', 'dial', 'ring', 'call them'],
        category2Markers: ['text', 'message', 'sms', 'send a message'],
      },
      {
        category1: 'email_send',
        category2: 'message_send',
        differentiator: 'email_send is emails, message_send is text messages',
        category1Markers: ['email', 'send email', 'compose email', 'mail'],
        category2Markers: ['text', 'message', 'sms', 'imessage'],
      },
    ],
  },
];

let geminiClient: any = null;

async function generateContrastiveExamples(
  category: string,
  confusionPattern: ConfusionPattern,
  count: number
): Promise<string[]> {
  if (!geminiClient) {
    geminiClient = await getGeminiClient();
    if (!geminiClient) throw new Error('Failed to get Gemini client');
  }
  
  const isCategory1 = category === confusionPattern.category1;
  const targetCategory = isCategory1 ? confusionPattern.category1 : confusionPattern.category2;
  const confusedWith = isCategory1 ? confusionPattern.category2 : confusionPattern.category1;
  const markers = isCategory1 ? confusionPattern.category1Markers : confusionPattern.category2Markers;
  const avoidMarkers = isCategory1 ? confusionPattern.category2Markers : confusionPattern.category1Markers;
  
  const prompt = `Generate ${count} voice queries for "${targetCategory}" that are CLEARLY DIFFERENT from "${confusedWith}".

IMPORTANT DISTINCTION:
${confusionPattern.differentiator}

TARGET: ${targetCategory}
MUST INCLUDE these markers: ${markers.join(', ')}
MUST AVOID these markers (they belong to ${confusedWith}): ${avoidMarkers.join(', ')}

Generate natural voice queries that:
1. Clearly belong to "${targetCategory}"
2. Could NOT be confused with "${confusedWith}"
3. Include typos, casual language, abbreviations
4. Vary in length and formality

Output ONLY a JSON array of strings. No explanation.`;

  try {
    const response = await geminiClient.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const queries = JSON.parse(match[0]) as string[];
    return queries.filter((q: unknown): q is string => typeof q === 'string' && q.length > 0);
  } catch (error) {
    console.log(`    ❌ Error: ${error}`);
    return [];
  }
}

async function generateAdditionalExamples(
  category: string,
  description: string,
  count: number
): Promise<string[]> {
  if (!geminiClient) {
    geminiClient = await getGeminiClient();
    if (!geminiClient) throw new Error('Failed to get Gemini client');
  }
  
  const prompt = `Generate ${count} diverse, natural voice queries for "${category}".

Category: ${category}
Description: ${description}

Requirements:
1. Each query must be something a REAL person would SAY to a voice assistant
2. Include typos, misspellings, casual language
3. Vary formality: some short commands, some polite requests
4. Include different contexts (morning, tired, rushed, relaxed)
5. Make them clearly belong to this category

Output ONLY a JSON array of strings.`;

  try {
    const response = await geminiClient.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const queries = JSON.parse(match[0]) as string[];
    return queries.filter((q: unknown): q is string => typeof q === 'string' && q.length > 0);
  } catch (error) {
    console.log(`    ❌ Error: ${error}`);
    return [];
  }
}

async function main() {
  console.log('🎯 FTIS Hard Negatives Generator');
  console.log('   Targeted improvement for weak categories');
  console.log('=' .repeat(60) + '\n');
  
  if (!isGeminiConfigured()) {
    console.error('❌ Gemini not configured');
    process.exit(1);
  }
  console.log(`📡 Gemini: ${getGeminiConfigStatus()}\n`);
  
  // Create output directories
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const allNewExamples: Record<string, Record<string, { query: string; label: string }[]>> = {};
  
  for (const catConfig of CATEGORIES_TO_IMPROVE) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 ${catConfig.superCategory.toUpperCase()} (${(catConfig.currentAccuracy * 100).toFixed(1)}% → ${(catConfig.targetAccuracy * 100).toFixed(0)}%)`);
    console.log('='.repeat(60));
    
    allNewExamples[catConfig.superCategory] = {};
    
    // Generate contrastive examples for each confusion pattern
    for (const pattern of catConfig.confusionPatterns) {
      console.log(`\n  🔄 Confusion: ${pattern.category1} ↔ ${pattern.category2}`);
      
      // Generate for category1
      console.log(`    Generating for ${pattern.category1}...`);
      const cat1Examples = await generateContrastiveExamples(
        pattern.category1, 
        pattern, 
        EXAMPLES_PER_CONFUSION_PAIR
      );
      
      if (!allNewExamples[catConfig.superCategory][pattern.category1]) {
        allNewExamples[catConfig.superCategory][pattern.category1] = [];
      }
      allNewExamples[catConfig.superCategory][pattern.category1].push(
        ...cat1Examples.map(q => ({ query: q, label: pattern.category1 }))
      );
      console.log(`      ✅ ${cat1Examples.length} examples`);
      
      await new Promise(r => setTimeout(r, 300));
      
      // Generate for category2
      console.log(`    Generating for ${pattern.category2}...`);
      const cat2Examples = await generateContrastiveExamples(
        pattern.category2, 
        pattern, 
        EXAMPLES_PER_CONFUSION_PAIR
      );
      
      if (!allNewExamples[catConfig.superCategory][pattern.category2]) {
        allNewExamples[catConfig.superCategory][pattern.category2] = [];
      }
      allNewExamples[catConfig.superCategory][pattern.category2].push(
        ...cat2Examples.map(q => ({ query: q, label: pattern.category2 }))
      );
      console.log(`      ✅ ${cat2Examples.length} examples`);
      
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  // Merge with existing data and save
  console.log('\n' + '='.repeat(60));
  console.log('💾 Merging with existing data...');
  console.log('='.repeat(60));
  
  for (const [superCat, categories] of Object.entries(allNewExamples)) {
    const sourceDir = `models/ftis-hierarchical/stage2/${superCat}`;
    const destDir = `${OUTPUT_DIR}/stage2/${superCat}`;
    mkdirSync(destDir, { recursive: true });
    
    // Load existing data
    const existingTrain: { query: string; label: string }[] = JSON.parse(
      readFileSync(`${sourceDir}/train.json`, 'utf-8')
    );
    const existingVal: { query: string; label: string }[] = JSON.parse(
      readFileSync(`${sourceDir}/validation.json`, 'utf-8')
    );
    const existingTest: { query: string; label: string }[] = JSON.parse(
      readFileSync(`${sourceDir}/test.json`, 'utf-8')
    );
    const labelMap = JSON.parse(readFileSync(`${sourceDir}/label_map.json`, 'utf-8'));
    
    // Collect all new examples
    let allNew: { query: string; label: string }[] = [];
    for (const examples of Object.values(categories)) {
      allNew.push(...examples);
    }
    
    // Shuffle
    for (let i = allNew.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNew[i], allNew[j]] = [allNew[j], allNew[i]];
    }
    
    // Split 80/10/10
    const trainSize = Math.floor(allNew.length * 0.8);
    const valSize = Math.floor(allNew.length * 0.1);
    
    const newTrain = allNew.slice(0, trainSize);
    const newVal = allNew.slice(trainSize, trainSize + valSize);
    const newTest = allNew.slice(trainSize + valSize);
    
    // Merge
    const mergedTrain = [...existingTrain, ...newTrain];
    const mergedVal = [...existingVal, ...newVal];
    const mergedTest = [...existingTest, ...newTest];
    
    // Shuffle merged
    for (let i = mergedTrain.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mergedTrain[i], mergedTrain[j]] = [mergedTrain[j], mergedTrain[i]];
    }
    
    // Save
    writeFileSync(`${destDir}/train.json`, JSON.stringify(mergedTrain, null, 2));
    writeFileSync(`${destDir}/validation.json`, JSON.stringify(mergedVal, null, 2));
    writeFileSync(`${destDir}/test.json`, JSON.stringify(mergedTest, null, 2));
    writeFileSync(`${destDir}/label_map.json`, JSON.stringify(labelMap, null, 2));
    
    console.log(`  ${superCat}: +${allNew.length} examples (total: ${mergedTrain.length + mergedVal.length + mergedTest.length})`);
  }
  
  // Copy stage1 data unchanged
  console.log('\n📋 Copying Stage 1 data (unchanged)...');
  const stage1Dir = `${OUTPUT_DIR}/stage1`;
  mkdirSync(stage1Dir, { recursive: true });
  
  for (const file of ['train.json', 'validation.json', 'test.json', 'label_map.json']) {
    const content = readFileSync(`models/ftis-hierarchical/stage1/${file}`, 'utf-8');
    writeFileSync(`${stage1Dir}/${file}`, content);
  }
  
  // Copy hierarchy
  const hierarchy = readFileSync('models/ftis-hierarchical/hierarchy.json', 'utf-8');
  writeFileSync(`${OUTPUT_DIR}/hierarchy.json`, hierarchy);
  
  // Copy untouched stage2 categories
  console.log('\n📋 Copying unchanged categories...');
  const touchedCategories = new Set(Object.keys(allNewExamples));
  const allCategories = ['media', 'calendar', 'productivity', 'communication', 'health', 'emotional', 'home', 'travel', 'finance', 'system'];
  
  for (const cat of allCategories) {
    if (!touchedCategories.has(cat)) {
      const sourceDir = `models/ftis-hierarchical/stage2/${cat}`;
      const destDir = `${OUTPUT_DIR}/stage2/${cat}`;
      mkdirSync(destDir, { recursive: true });
      
      for (const file of ['train.json', 'validation.json', 'test.json', 'label_map.json']) {
        const content = readFileSync(`${sourceDir}/${file}`, 'utf-8');
        writeFileSync(`${destDir}/${file}`, content);
      }
      console.log(`  ${cat}: copied unchanged`);
    }
  }
  
  console.log(`
✅ Generation Complete!

📁 Output: ${OUTPUT_DIR}/
   stage1/     - Unchanged (already 97%+)
   stage2/     - Augmented with hard negatives

📋 Next steps:
   1. Copy train_all.py to v2
   2. Run training
   3. Expected improvement: 91-97% → 98%+
`);
}

main().catch(console.error);
