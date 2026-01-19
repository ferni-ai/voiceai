#!/usr/bin/env npx tsx
/**
 * FTIS LLM-Generated Synthetic Training Data
 * 
 * Uses Gemini Flash to generate high-quality, diverse training examples.
 * 
 * Strategy:
 * 1. Hierarchical: 50 domains → specific tools
 * 2. LLM generates 50 diverse examples per tool
 * 3. Includes variations: casual, formal, broken grammar, typos
 * 
 * Usage:
 *   npx tsx scripts/generate-ftis-llm-synthetic.ts
 *   npx tsx scripts/generate-ftis-llm-synthetic.ts --domain=music
 *   npx tsx scripts/generate-ftis-llm-synthetic.ts --count=100
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';

const OUTPUT_DIR = './models/ftis-router-v3';
const EXAMPLES_PER_TOOL = parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1] || '50', 10);
const SPECIFIC_DOMAIN = process.argv.find(a => a.startsWith('--domain='))?.split('=')[1];
const BATCH_SIZE = 20; // Tools per LLM batch

// ============================================================================
// DOMAIN HIERARCHY - Reduce 887 → 50 core domains
// ============================================================================

interface DomainConfig {
  description: string;
  exampleQueries: string[];
  tools: string[];
}

// Map each tool to its domain
const DOMAIN_HIERARCHY: Record<string, DomainConfig> = {
  // ==================== MUSIC & AUDIO ====================
  music: {
    description: 'Playing music, controlling playback, managing playlists',
    exampleQueries: [
      'play some jazz',
      'put on my workout playlist',
      'skip this song',
      'what song is this',
      'turn up the volume',
    ],
    tools: [
      'spotify_play', 'spotify_pause', 'spotify_skip', 'spotify_previous',
      'spotify_volume', 'spotify_shuffle', 'spotify_repeat', 'spotify_queue',
      'spotify_playlist', 'spotify_search', 'spotify_current', 'spotify_like',
      'music_play', 'music_recommendations', 'music_mood',
      'sonos_play', 'sonos_pause', 'sonos_volume', 'sonos_group',
    ],
  },

  // ==================== CALENDAR & SCHEDULING ====================
  calendar: {
    description: 'Managing calendar events, scheduling meetings, checking availability',
    exampleQueries: [
      'schedule a meeting tomorrow at 2pm',
      "what's on my calendar today",
      'cancel my 3 oclock',
      'move my dentist appointment to Friday',
      'am I free next Tuesday',
    ],
    tools: [
      'calendar_create_event', 'calendar_list_events', 'calendar_update_event',
      'calendar_delete_event', 'calendar_check_availability', 'calendar_reschedule',
      'scheduling_find_time', 'scheduling_best_time', 'scheduling_conflicts',
    ],
  },

  // ==================== ALARMS & TIMERS ====================
  alarms: {
    description: 'Setting alarms, timers, and wake-up reminders',
    exampleQueries: [
      'set an alarm for 7am',
      'wake me up in 30 minutes',
      'start a 10 minute timer',
      'cancel my morning alarm',
      'snooze for 5 minutes',
    ],
    tools: [
      'alarm_set', 'alarm_delete', 'alarm_list', 'alarm_snooze',
      'timer_set', 'timer_cancel', 'timer_check', 'timer_pause',
    ],
  },

  // ==================== REMINDERS & TASKS ====================
  reminders: {
    description: 'Setting reminders, managing to-do lists, task tracking',
    exampleQueries: [
      'remind me to call mom at 5pm',
      'add milk to my shopping list',
      "what's on my todo list",
      'mark the dishes as done',
      'remind me when I get home',
    ],
    tools: [
      'reminder_set', 'reminder_list', 'reminder_delete', 'reminder_complete',
      'todo_add', 'todo_list', 'todo_complete', 'todo_delete',
      'lists_create', 'lists_add_item', 'lists_view', 'lists_delete_item',
      'productivity_focus', 'productivity_commitments',
    ],
  },

  // ==================== WEATHER ====================
  weather: {
    description: 'Current weather, forecasts, weather alerts',
    exampleQueries: [
      "what's the weather like",
      'will it rain tomorrow',
      'temperature in New York',
      'do I need an umbrella',
      'weekend forecast',
    ],
    tools: [
      'weather_current', 'weather_forecast', 'weather_alerts',
      'weather_hourly', 'weather_weekly',
    ],
  },

  // ==================== HABITS & ROUTINES ====================
  habits: {
    description: 'Tracking habits, building routines, checking streaks',
    exampleQueries: [
      'log my meditation',
      'did I exercise today',
      "what's my streak",
      'create a new habit for reading',
      'show my morning routine',
    ],
    tools: [
      'habit_log', 'habit_create', 'habit_list', 'habit_streak',
      'habit_coaching', 'habit_dna', 'habit_pace', 'habit_bundles',
      'routine_create', 'routine_run', 'routine_list',
    ],
  },

  // ==================== HANDOFFS (PERSONA SWITCHING) ====================
  handoff: {
    description: 'Switching to different AI personas/team members',
    exampleQueries: [
      'let me talk to Maya',
      'switch to Peter',
      'can I speak with Alex',
      'transfer me to Jordan',
      'get Nayan on the line',
    ],
    tools: [
      'handoff', 'handoff_ferni', 'handoff_maya', 'handoff_peter',
      'handoff_alex', 'handoff_jordan', 'handoff_nayan',
    ],
  },

  // ==================== COMMUNICATION ====================
  communication: {
    description: 'Making calls, sending messages, emails',
    exampleQueries: [
      'call mom',
      'text John I am running late',
      'read my messages',
      'send an email to my boss',
      'who called me today',
    ],
    tools: [
      'call_make', 'call_schedule', 'call_voicemail',
      'sms_send', 'sms_read', 'sms_search',
      'email_send', 'email_read', 'email_search', 'email_draft',
      'contact_add', 'contact_find', 'contact_list',
    ],
  },

  // ==================== CRISIS & MENTAL HEALTH ====================
  crisis: {
    description: 'Mental health support, grounding exercises, crisis help',
    exampleQueries: [
      "I'm having a panic attack",
      'help me calm down',
      'I need to talk to someone',
      'do a breathing exercise',
      "I'm feeling really anxious",
    ],
    tools: [
      'crisis_support', 'crisis_safety_plan', 'crisis_resources',
      'grounding_exercise', 'grounding_breathing', 'grounding_sensory',
      'wellness_checkin', 'wellness_mood',
    ],
  },

  // ==================== SMART HOME ====================
  smarthome: {
    description: 'Controlling lights, thermostat, locks, appliances',
    exampleQueries: [
      'turn on the living room lights',
      'set thermostat to 72',
      'lock the front door',
      'dim the bedroom lights',
      'is the garage door closed',
    ],
    tools: [
      'smarthome_lights', 'smarthome_thermostat', 'smarthome_locks',
      'smarthome_garage', 'smarthome_appliances', 'smarthome_scenes',
    ],
  },

  // ==================== COACHING & GROWTH ====================
  coaching: {
    description: 'Life coaching, motivation, personal development',
    exampleQueries: [
      'I need some motivation',
      'help me set goals',
      'I feel stuck',
      "let's talk about my career",
      'give me a pep talk',
    ],
    tools: [
      'coaching_motivation', 'coaching_goals', 'coaching_reflection',
      'coaching_accountability', 'coaching_celebration',
      'growth_areas', 'growth_tracking',
    ],
  },

  // ==================== GRIEF & LOSS ====================
  grief: {
    description: 'Processing grief, dealing with loss',
    exampleQueries: [
      "I lost my dad last month",
      "I'm grieving",
      'help me process this loss',
      'I miss my friend who passed',
      'dealing with death',
    ],
    tools: [
      'grief_support', 'grief_process', 'grief_stages',
      'grief_memories', 'grief_rituals',
    ],
  },

  // ==================== RELATIONSHIPS ====================
  relationships: {
    description: 'Relationship advice, conflict resolution, dating',
    exampleQueries: [
      "my partner and I had a fight",
      'how do I communicate better',
      'relationship advice',
      "I'm having trouble with my friend",
      'dating tips',
    ],
    tools: [
      'relationship_advice', 'relationship_conflict', 'relationship_communication',
      'dating_advice', 'dating_profile',
      'breakup_support', 'breakup_healing', 'breakup_no_contact',
    ],
  },

  // ==================== HEALTH & FITNESS ====================
  health: {
    description: 'Exercise tracking, nutrition, sleep, wellness',
    exampleQueries: [
      'log my workout',
      'track my water intake',
      'how did I sleep',
      'meal plan for today',
      'count my calories',
    ],
    tools: [
      'health_exercise', 'health_nutrition', 'health_water',
      'sleep_track', 'sleep_analyze', 'sleep_tips',
      'fitness_workout', 'fitness_progress',
    ],
  },

  // ==================== FINANCE ====================
  finance: {
    description: 'Budget tracking, bills, expenses',
    exampleQueries: [
      "what's my budget looking like",
      'track my spending',
      'when is my credit card due',
      'how much did I spend on food',
      'savings goal progress',
    ],
    tools: [
      'finance_budget', 'finance_spending', 'finance_bills',
      'finance_savings', 'finance_subscriptions',
      'currency_convert',
    ],
  },

  // ==================== TRAVEL ====================
  travel: {
    description: 'Trip planning, flights, hotels, directions',
    exampleQueries: [
      'plan a trip to Paris',
      'find flights to New York',
      'book a hotel near the beach',
      'directions to the airport',
      'what do I need to pack',
    ],
    tools: [
      'travel_plan', 'travel_flights', 'travel_hotels',
      'travel_packing', 'travel_suggestions',
      'traffic_check', 'traffic_directions',
    ],
  },

  // ==================== RECOMMENDATIONS ====================
  recommendations: {
    description: 'Restaurant, movie, book, podcast recommendations',
    exampleQueries: [
      'recommend a good restaurant nearby',
      'what movie should I watch',
      'suggest a book to read',
      'good podcast for commute',
      'gift ideas for my wife',
    ],
    tools: [
      'recommend_restaurants', 'recommend_movies', 'recommend_books',
      'recommend_podcasts', 'recommend_gifts',
      'local_search', 'local_restaurants',
    ],
  },

  // ==================== GAMES & FUN ====================
  games: {
    description: 'Playing games, trivia, jokes',
    exampleQueries: [
      "let's play a game",
      'tell me a joke',
      'trivia question',
      'would you rather',
      "I'm bored entertain me",
    ],
    tools: [
      'game_trivia', 'game_story', 'game_wordplay',
      'humor_joke', 'humor_funfact',
    ],
  },

  // ==================== VOICE MEMOS ====================
  voice_memos: {
    description: 'Recording and playing back voice notes',
    exampleQueries: [
      'save a voice memo',
      'play my last recording',
      'what memos do I have',
      'record a note for later',
      'find my memo about the meeting',
    ],
    tools: [
      'voice_memo_save', 'voice_memo_play', 'voice_memo_list',
      'voice_memo_search', 'voice_memo_delete',
    ],
  },

  // ==================== MEMORY ====================
  memory: {
    description: 'Remembering things, recalling past conversations',
    exampleQueries: [
      'remember that I like jazz',
      'what do you know about me',
      "did I tell you about my sister",
      'save this for later',
      'forget what I said about John',
    ],
    tools: [
      'memory_save', 'memory_recall', 'memory_list',
      'memory_forget', 'memory_search',
    ],
  },

  // ==================== CEO FEATURES ====================
  ceo: {
    description: 'Executive briefings, priorities, journaling',
    exampleQueries: [
      'give me my morning briefing',
      "what's my focus today",
      'log a win',
      'journal entry',
      "what are today's priorities",
    ],
    tools: [
      'ceo_briefing', 'ceo_priorities', 'ceo_wins',
      'ceo_journal', 'ceo_gratitude', 'ceo_focus',
    ],
  },

  // ==================== SELF IMPROVEMENT ====================
  self_improvement: {
    description: 'Self-compassion, inner critic, confidence',
    exampleQueries: [
      "I'm being too hard on myself",
      'help with my inner critic',
      'I feel like an imposter',
      'boost my confidence',
      'practice self-compassion',
    ],
    tools: [
      'self_compassion', 'self_compassion_comparison', 'self_compassion_forgiveness',
      'imposter_syndrome', 'critic_quiet', 'critic_reframe',
      'confidence_boost',
    ],
  },

  // ==================== FAMILY ====================
  family: {
    description: 'Parenting, family relationships, co-parenting',
    exampleQueries: [
      'parenting advice',
      'how to deal with my teenager',
      'co-parenting tips',
      'family conflict',
      'help with my in-laws',
    ],
    tools: [
      'family_parenting', 'family_conflict', 'family_boundaries',
      'family_coparenting', 'family_blended',
    ],
  },

  // ==================== CAREER ====================
  career: {
    description: 'Job search, interviews, career development',
    exampleQueries: [
      'help me update my resume',
      'practice for my interview',
      'career advice',
      'negotiating salary',
      'job search tips',
    ],
    tools: [
      'career_resume', 'career_interview', 'career_advice',
      'career_negotiation', 'career_search',
      'job_loss_support',
    ],
  },

  // ==================== CONVERSATION ====================
  conversation: {
    description: 'General chat, small talk, no specific tool needed',
    exampleQueries: [
      'hey how are you',
      'thanks',
      'that sounds good',
      'tell me more',
      'interesting',
      'never mind',
    ],
    tools: ['__conversation__'],
  },
};

// ============================================================================
// LLM GENERATION
// ============================================================================

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

async function generateExamplesForDomain(
  domain: string,
  config: DomainConfig
): Promise<Array<{ query: string; label: string }>> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const prompt = `You are generating training data for a voice command classification system.

DOMAIN: ${domain}
DESCRIPTION: ${config.description}

TOOLS IN THIS DOMAIN:
${config.tools.map(t => `- ${t}`).join('\n')}

EXAMPLE QUERIES (for reference):
${config.exampleQueries.map(q => `- "${q}"`).join('\n')}

Generate ${EXAMPLES_PER_TOOL} unique, diverse voice command queries for EACH tool listed above.

REQUIREMENTS:
1. Each query should be natural spoken language (not formal writing)
2. Include variations:
   - Casual: "yo play some jazz", "hey whats the weather"
   - Polite: "could you please set an alarm"
   - Direct: "set alarm 7am"
   - Incomplete: "alarm... um... 7am"
   - Different phrasings of the same intent
3. Include minor typos/speech artifacts naturally: "um", "uh", "like"
4. Vary length: some very short (2-3 words), some longer (full sentences)
5. Each tool should have clearly distinguishing queries

OUTPUT FORMAT (JSON array):
[
  {"query": "play some jazz music", "label": "spotify_play"},
  {"query": "whats on my calendar", "label": "calendar_list_events"},
  ...
]

Generate ONLY the JSON array, no other text. Ensure valid JSON.
Generate at least ${EXAMPLES_PER_TOOL * config.tools.length} total examples.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`  ⚠️ No JSON found in response for ${domain}`);
      return [];
    }
    
    const examples = JSON.parse(jsonMatch[0]) as Array<{ query: string; label: string }>;
    
    // Validate labels
    const validLabels = new Set(config.tools);
    const validExamples = examples.filter(e => validLabels.has(e.label));
    
    return validExamples;
  } catch (error) {
    console.error(`  ❌ Error generating for ${domain}:`, error);
    return [];
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   FTIS LLM-GENERATED SYNTHETIC TRAINING DATA               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not set');
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const domains = SPECIFIC_DOMAIN 
    ? { [SPECIFIC_DOMAIN]: DOMAIN_HIERARCHY[SPECIFIC_DOMAIN] }
    : DOMAIN_HIERARCHY;

  if (SPECIFIC_DOMAIN && !DOMAIN_HIERARCHY[SPECIFIC_DOMAIN]) {
    console.error(`❌ Unknown domain: ${SPECIFIC_DOMAIN}`);
    console.log('Available domains:', Object.keys(DOMAIN_HIERARCHY).join(', '));
    process.exit(1);
  }

  console.log(`📊 Configuration:`);
  console.log(`   Domains: ${Object.keys(domains).length}`);
  console.log(`   Examples per tool: ${EXAMPLES_PER_TOOL}`);
  console.log('');

  const allExamples: Array<{ query: string; label: string }> = [];
  const labelMap: Record<string, number> = {};
  let labelIndex = 0;

  // Process each domain
  for (const [domain, config] of Object.entries(domains)) {
    console.log(`\n🔄 Generating: ${domain} (${config.tools.length} tools)...`);
    
    const examples = await generateExamplesForDomain(domain, config);
    console.log(`   ✅ Generated ${examples.length} examples`);
    
    // Add to label map
    for (const tool of config.tools) {
      if (!(tool in labelMap)) {
        labelMap[tool] = labelIndex++;
      }
    }
    
    allExamples.push(...examples);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Total examples: ${allExamples.length}`);

  // Shuffle
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  // Split
  const trainEnd = Math.floor(allExamples.length * 0.8);
  const valEnd = trainEnd + Math.floor(allExamples.length * 0.1);
  
  const trainData = allExamples.slice(0, trainEnd);
  const valData = allExamples.slice(trainEnd, valEnd);
  const testData = allExamples.slice(valEnd);

  console.log(`   Train: ${trainData.length}`);
  console.log(`   Validation: ${valData.length}`);
  console.log(`   Test: ${testData.length}`);

  // Write files
  console.log('\n💾 Writing files...');
  
  writeFileSync(path.join(OUTPUT_DIR, 'train.json'), JSON.stringify(trainData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'validation.json'), JSON.stringify(valData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'test.json'), JSON.stringify(testData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'label_map.json'), JSON.stringify(labelMap, null, 2));

  // Show samples
  console.log('\n📝 Sample Queries:');
  console.log('─'.repeat(70));
  for (const s of allExamples.slice(0, 15)) {
    console.log(`   "${s.query.slice(0, 45).padEnd(45)}" → ${s.label}`);
  }
  console.log('─'.repeat(70));

  console.log('\n✅ Generation complete!');
  console.log(`\n🚀 Next: python ${OUTPUT_DIR}/train.py`);
}

main().catch(console.error);
