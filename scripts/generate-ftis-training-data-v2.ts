#!/usr/bin/env npx tsx
/**
 * FTIS Training Data Generator v2 - Realistic Natural Language
 *
 * Generates 200K+ NATURAL language training examples for FTIS router.
 * Each example sounds like a real user query, not keyword soup.
 *
 * Usage:
 *   npx tsx scripts/generate-ftis-training-data-v2.ts
 *   npx tsx scripts/generate-ftis-training-data-v2.ts --count 250000
 *
 * @module scripts/generate-ftis-training-data-v2
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { performance } from 'perf_hooks';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const OUTPUT_DIR = './models/ftis-router-v2';
const TARGET_EXAMPLES = parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1] || '200000', 10);

// ============================================================================
// REALISTIC QUERY TEMPLATES BY CATEGORY
// ============================================================================

const CATEGORY_TEMPLATES: Record<string, string[]> = {
  // ============ MUSIC ============
  music_play: [
    'play {genre}',
    'play some {genre}',
    'put on {genre}',
    'I want to hear {genre}',
    'can you play {genre}',
    'play music',
    'play some music',
    'put on some tunes',
    'I want to listen to music',
    'play {artist}',
    'play something by {artist}',
    'play {mood} music',
    'I need some {mood} music',
    'throw on some {genre}',
    'queue up {genre}',
    'lets hear some {genre}',
  ],
  spotify_play: [
    'play {genre} on spotify',
    'spotify play {genre}',
    'open spotify and play {genre}',
    'play my {playlist} playlist',
    'shuffle my liked songs',
    'play my discover weekly',
  ],
  spotify_pause: [
    'pause',
    'pause the music',
    'stop the music',
    'pause playback',
    'hold on pause',
  ],
  spotify_skip: [
    'skip',
    'next song',
    'skip this',
    'next',
    'play the next one',
    'skip to the next track',
  ],

  // ============ WEATHER ============
  weather_current: [
    "what's the weather",
    "what's the weather like",
    "how's the weather",
    'weather',
    "what's it like outside",
    'is it raining',
    'is it cold outside',
    'do I need a jacket',
    'do I need an umbrella',
    "what's the temperature",
    'how hot is it',
    'how cold is it',
    'weather in {city}',
    "what's the weather in {city}",
  ],
  weather_forecast: [
    "what's the forecast",
    'weather forecast',
    'forecast for tomorrow',
    "what's the weather tomorrow",
    'will it rain tomorrow',
    'weekend weather',
    "what's the forecast for {day}",
    'weather this week',
    '5 day forecast',
  ],

  // ============ CALENDAR ============
  calendar_list_events: [
    "what's on my calendar",
    'show my calendar',
    'my schedule',
    "what's on my schedule",
    'any meetings today',
    'do I have anything today',
    "what's happening today",
    'calendar',
    'show my appointments',
    "what's coming up",
  ],
  calendar_create_event: [
    'schedule a meeting',
    'add to my calendar',
    'create an event',
    'schedule {event} for {time}',
    'add {event} to my calendar',
    'book a meeting',
    'set up a meeting with {person}',
    'calendar event for {time}',
    'remind me about {event} on {day}',
  ],
  calendar_check_availability: [
    'am I free {time}',
    'check my availability',
    "what's my availability",
    'am I busy {day}',
    'do I have time {time}',
    'when am I free',
    'check if I have anything {time}',
  ],

  // ============ ALARMS & TIMERS ============
  alarms_set: [
    'set an alarm for {time}',
    'alarm for {time}',
    'wake me up at {time}',
    'set alarm {time}',
    'new alarm {time}',
    'alarm at {time}',
    'wake me at {time}',
    "I need to wake up at {time}",
  ],
  alarms_list: [
    'show my alarms',
    'what alarms do I have',
    'list alarms',
    'my alarms',
    'check my alarms',
  ],
  alarms_delete: [
    'delete my alarm',
    'cancel the alarm',
    'remove the alarm',
    'turn off my alarm',
    'delete alarm for {time}',
  ],
  timer_set: [
    'set a timer for {duration}',
    'timer {duration}',
    '{duration} timer',
    'start a {duration} timer',
    'countdown {duration}',
    'set timer {duration}',
  ],

  // ============ REMINDERS ============
  productivity_set_reminder: [
    'remind me to {task}',
    'reminder to {task}',
    'remind me about {task}',
    'set a reminder for {task}',
    "don't let me forget to {task}",
    'remind me at {time} to {task}',
    'remind me in {duration}',
    'set reminder',
  ],
  productivity_get_reminders: [
    'show my reminders',
    'what reminders do I have',
    'list reminders',
    'my reminders',
  ],
  productivity_cancel_reminder: [
    'cancel reminder',
    'delete reminder',
    'remove reminder',
    'cancel the reminder about {task}',
  ],

  // ============ HABITS ============
  habit_track: [
    'track my {habit}',
    'log {habit}',
    'mark {habit} done',
    'I did my {habit}',
    'completed {habit}',
    '{habit} done',
    'check off {habit}',
    'I completed my {habit} today',
  ],
  habits_list: [
    'show my habits',
    'what habits do I have',
    'my habits',
    'list habits',
    'habit progress',
    'how are my habits',
  ],
  habit_create: [
    'create a new habit',
    'add a habit',
    'new habit',
    'I want to track {habit}',
    'help me build a {habit} habit',
    'start tracking {habit}',
  ],
  habit_coaching: [
    'help with my habits',
    'habit advice',
    "I'm struggling with {habit}",
    'how do I stick to {habit}',
    'habit tips',
    'habit coaching',
  ],

  // ============ HANDOFFS ============
  handoff: [
    'transfer me',
    'switch to someone else',
    'hand me off',
    'I want to talk to someone else',
    'can I talk to a different person',
  ],
  handoff_ferni: [
    'talk to Ferni',
    'switch to Ferni',
    'transfer to Ferni',
    'let me talk to Ferni',
    'I want Ferni',
    'back to Ferni',
    'go back to Ferni',
  ],
  handoff_maya: [
    'talk to Maya',
    'switch to Maya',
    'transfer to Maya',
    'I want to talk to Maya',
    'let me speak with Maya',
    'Maya please',
    'can Maya help',
    'get Maya',
  ],
  handoff_peter: [
    'talk to Peter',
    'switch to Peter',
    'transfer to Peter',
    'I want Peter',
    'can Peter help',
    'let me talk to Peter',
    'Peter please',
  ],
  handoff_alex: [
    'talk to Alex',
    'switch to Alex',
    'transfer to Alex',
    'I want Alex',
    'Alex please',
    'get Alex',
  ],
  handoff_jordan: [
    'talk to Jordan',
    'switch to Jordan',
    'transfer to Jordan',
    'I want Jordan',
    'Jordan please',
  ],
  handoff_nayan: [
    'talk to Nayan',
    'switch to Nayan',
    'transfer to Nayan',
    'I want Nayan',
    'Nayan please',
  ],

  // ============ COMMUNICATION ============
  call_contact: [
    'call {person}',
    'phone {person}',
    'dial {person}',
    'ring {person}',
    'make a call to {person}',
    'call my {relation}',
    'can you call {person}',
    'I need to call {person}',
  ],
  comm_send_message: [
    'send a message to {person}',
    'text {person}',
    'message {person}',
    'send {person} a text',
    'text message to {person}',
    'message my {relation}',
  ],
  sms_read: [
    'read my messages',
    'show my texts',
    'any new messages',
    'check my messages',
    'read texts',
  ],

  // ============ RESEARCH ============
  research_topic: [
    'research {topic}',
    'look up {topic}',
    'find out about {topic}',
    'deep dive on {topic}',
    'I need research on {topic}',
    'can you research {topic}',
  ],
  research_web: [
    'search for {topic}',
    'google {topic}',
    'look up {topic} online',
    'search the web for {topic}',
    'find information about {topic}',
  ],

  // ============ CRISIS ============
  crisis_support: [
    "I'm not okay",
    'I need help',
    "I'm struggling",
    "I don't feel safe",
    "I'm in crisis",
    'I need support',
    'help me',
    "I can't do this",
    "I'm having a hard time",
  ],
  grounding_exercise: [
    "I'm having a panic attack",
    "I can't breathe",
    'help me calm down',
    'I need to ground myself',
    'grounding exercise',
    "I'm panicking",
    "I'm freaking out",
    "I'm so anxious",
    'help me relax',
  ],
  safety_planning: [
    'I need a safety plan',
    'help me stay safe',
    'safety planning',
    "I'm having dark thoughts",
  ],

  // ============ SMART HOME ============
  smarthome_lights: [
    'turn on the lights',
    'turn off the lights',
    'lights on',
    'lights off',
    'dim the lights',
    'brighten the lights',
    'turn on {room} lights',
    'light up the {room}',
  ],
  smarthome_thermostat: [
    'set the temperature to {temp}',
    'set thermostat to {temp}',
    'make it {temp} degrees',
    'turn up the heat',
    'turn down the AC',
    'make it warmer',
    'make it cooler',
    "it's too cold",
    "it's too hot",
  ],
  smarthome_locks: [
    'lock the door',
    'unlock the door',
    'is the door locked',
    'lock the front door',
    'lock up',
  ],

  // ============ GAMES ============
  game_play: [
    'play a game',
    "let's play a game",
    'start a game',
    'game time',
    'I want to play',
    "I'm bored let's play",
  ],
  game_trivia: [
    'trivia',
    'play trivia',
    'quiz me',
    "let's do trivia",
    'trivia game',
    'test my knowledge',
  ],
  game_storytelling: [
    'tell me a story',
    'story time',
    'make up a story',
    'collaborative story',
  ],

  // ============ LISTS ============
  lists_add: [
    'add {item} to my list',
    'add {item} to my {list_type} list',
    'put {item} on my list',
    'remember to buy {item}',
    'add to grocery list {item}',
    'shopping list add {item}',
  ],
  lists_view: [
    "what's on my list",
    'show my list',
    'read my {list_type} list',
    'my shopping list',
    'grocery list',
  ],
  lists_create: [
    'create a new list',
    'make a list',
    'start a {list_type} list',
    'new list called {name}',
  ],

  // ============ HEALTH ============
  health_log_exercise: [
    'log my workout',
    'I exercised today',
    'track my exercise',
    'I went to the gym',
    'I ran {distance}',
    'I worked out for {duration}',
  ],
  health_suggest_workout: [
    'suggest a workout',
    'what exercise should I do',
    'give me a workout',
    'workout ideas',
    'exercise suggestions',
  ],
  health_sleep: [
    'how did I sleep',
    'my sleep',
    'sleep tracking',
    'show my sleep',
    'I slept {duration} hours',
  ],
  health_hydration: [
    'log water',
    'I drank water',
    'track hydration',
    'water reminder',
    'how much water today',
  ],

  // ============ FINANCE ============
  finance_budget: [
    'show my budget',
    "how's my budget",
    'budget check',
    'am I on budget',
    'spending this month',
  ],
  finance_bills: [
    'upcoming bills',
    'when are my bills due',
    'show my bills',
    'bill reminders',
  ],

  // ============ TRAVEL ============
  travel_search_flights: [
    'find flights to {city}',
    'search for flights',
    'flights to {city}',
    'book a flight to {city}',
    'airfare to {city}',
  ],
  travel_search_hotels: [
    'find hotels in {city}',
    'search for hotels',
    'hotels in {city}',
    'book a hotel in {city}',
    'where to stay in {city}',
  ],
  travel_plan_trip: [
    'plan a trip to {city}',
    'help me plan a vacation',
    'trip planning',
    "I'm going to {city}",
    'vacation ideas',
  ],

  // ============ MEMORY ============
  memory_save: [
    'remember that {fact}',
    'save this: {fact}',
    'note that {fact}',
    "don't forget {fact}",
    'remember {fact}',
  ],
  memory_recall: [
    'what do you know about {topic}',
    'what did I tell you about {topic}',
    'remember when {topic}',
    'recall {topic}',
    'what was that thing about {topic}',
  ],

  // ============ VOICE MEMOS ============
  voice_memo_save: [
    'save a voice memo',
    'record a memo',
    'take a note',
    'voice note',
    'memo: {content}',
  ],
  voice_memo_list: [
    'show my memos',
    'list my voice memos',
    'my notes',
    'play back my memos',
  ],

  // ============ BOOKS ============
  books_search: [
    'find books about {topic}',
    'search for books on {topic}',
    'book recommendations',
    'books on {topic}',
  ],
  books_add_to_list: [
    'add {book} to my reading list',
    'I want to read {book}',
    'save {book} to read later',
    'add to reading list',
  ],
  books_get_list: [
    'show my reading list',
    'what books am I reading',
    'my book list',
    'books to read',
  ],

  // ============ INFORMATION ============
  info_time: [
    "what time is it",
    'time',
    "what's the time",
    'current time',
    'time in {city}',
  ],
  info_date: [
    'what day is it',
    "what's today's date",
    'date',
    "what's the date",
    'what day of the week',
  ],
  info_news: [
    "what's the news",
    'news',
    'headlines',
    "what's happening",
    'current events',
    'news about {topic}',
  ],
  info_search: [
    'search {query}',
    'look up {query}',
    'find {query}',
    'what is {query}',
    'tell me about {query}',
  ],

  // ============ RECOMMENDATIONS ============
  recommend_restaurants: [
    'restaurant recommendations',
    'where should I eat',
    'good restaurants nearby',
    'find a restaurant',
    '{cuisine} restaurants near me',
  ],
  recommend_gifts: [
    'gift ideas for {person}',
    'what should I get {person}',
    'gift suggestions',
    'present for {occasion}',
  ],

  // ============ COACHING ============
  coaching_motivation: [
    'I need motivation',
    "I'm not motivated",
    'motivate me',
    'give me a pep talk',
    "I don't feel like doing anything",
  ],
  coaching_procrastination: [
    'help me stop procrastinating',
    "I keep putting things off",
    "I can't get started",
    'procrastination help',
  ],
  coaching_boundaries: [
    'help me set boundaries',
    'I need boundary advice',
    'how do I say no',
    "I'm a people pleaser",
  ],
  coaching_burnout: [
    "I'm burned out",
    'burnout help',
    "I'm exhausted",
    "I can't keep going",
    "I'm so tired",
  ],

  // ============ GRIEF ============
  grief_support: [
    "I'm grieving",
    'I lost someone',
    'dealing with loss',
    '{person} died',
    "I miss {person}",
    'grief support',
  ],
  grief_waves: [
    'grief is hitting me hard',
    "I can't stop crying",
    'the grief comes in waves',
    "I'm having a grief moment",
  ],

  // ============ DECISIONS ============
  decision_help: [
    'help me decide',
    "I can't make a decision",
    "I'm torn between",
    'decision help',
    'should I {option1} or {option2}',
  ],
  decision_procon: [
    'pros and cons of {topic}',
    'help me weigh options',
    'pro con list',
    "what are the pros and cons",
  ],

  // ============ SELF COMPASSION ============
  self_compassion_inner_critic: [
    "I'm so hard on myself",
    "I can't stop beating myself up",
    'inner critic',
    "I hate myself",
    "I'm not good enough",
  ],
  self_compassion_forgiveness: [
    'I need to forgive myself',
    "I can't let go of {mistake}",
    'self forgiveness',
    "I keep thinking about my mistakes",
  ],

  // ============ MEANING ============
  meaning_purpose: [
    "what's my purpose",
    'I feel lost',
    "I don't know what I'm doing with my life",
    'finding meaning',
    'what should I do with my life',
  ],
  meaning_values: [
    'help me identify my values',
    'what do I care about',
    "what's important to me",
    'values exercise',
  ],

  // ============ CAREER ============
  career_job_search: [
    'help me find a job',
    "I'm job hunting",
    'job search help',
    'looking for work',
  ],
  career_interview: [
    'interview prep',
    'help me prepare for an interview',
    'interview tips',
    'practice interview questions',
  ],
  career_resume: [
    'help with my resume',
    'resume tips',
    'review my resume',
    'how to improve my resume',
  ],

  // ============ RELATIONSHIPS ============
  relationship_advice: [
    'relationship advice',
    "I'm having relationship issues",
    'help with my relationship',
    'my partner and I',
  ],
  relationship_conflict: [
    'we had a fight',
    "I'm fighting with {person}",
    'conflict resolution',
    'we keep arguing',
  ],

  // ============ DATING ============
  dating_advice: [
    'dating advice',
    'help me with dating',
    'dating tips',
    "I'm single",
    'how do I meet people',
  ],
  dating_breakup: [
    'breakup advice',
    'we broke up',
    "I'm going through a breakup",
    'getting over an ex',
  ],

  // ============ FAMILY ============
  family_parenting_challenge: [
    "my kid won't {behavior}",
    'parenting help',
    'my child is {behavior}',
    'how do I handle {behavior}',
  ],
  family_conflict: [
    'family drama',
    'fighting with my {relation}',
    'family conflict',
    'issues with my family',
  ],

  // ============ ANGER ============
  anger_validate: [
    "I'm so angry",
    "I'm furious",
    "I'm pissed off",
    "I can't believe they did that",
    "I'm really mad",
  ],
  anger_cool_down: [
    'help me calm down',
    "I need to cool off",
    "I'm about to explode",
    'anger management',
  ],

  // ============ CONVERSATION (NEGATIVE CLASS) ============
  __conversation__: [
    'hey',
    'hi',
    'hello',
    "how's it going",
    'how are you',
    "what's up",
    'thanks',
    'thank you',
    'you are welcome',
    'cool',
    'nice',
    'okay',
    'sure',
    'yeah',
    'yep',
    'no',
    'nope',
    'maybe',
    'I guess',
    'I think so',
    "I'm not sure",
    'whatever',
    'never mind',
    "that's fine",
    'sounds good',
    'got it',
    'makes sense',
    'interesting',
    'tell me more',
    'go on',
    'I see',
    'hmm',
    'uh huh',
    'right',
    "that's true",
    'I agree',
    'I disagree',
    "I don't know",
    'good question',
    'let me think',
    'so anyway',
    'by the way',
    'speaking of which',
    'that reminds me',
    'you know what',
    "I've been thinking",
    "I'm bored",
    "I'm tired",
    "I'm hungry",
    "I'm feeling {emotion}",
    'just talking',
    'just checking in',
    "how's your day",
    'what do you think',
    'do you agree',
    'in my opinion',
    'I believe',
    'it seems like',
    "that's interesting",
    'really',
    'no way',
    'seriously',
    'oh wow',
    'crazy',
    'wild',
  ],
};

// ============================================================================
// SLOT FILLERS
// ============================================================================

const SLOTS = {
  genre: ['jazz', 'rock', 'pop', 'classical', 'hip hop', 'country', 'electronic', 'R&B', 'indie', 'folk', 'metal', 'blues', 'soul', 'reggae', 'latin'],
  artist: ['Taylor Swift', 'Drake', 'The Beatles', 'Adele', 'Ed Sheeran', 'Beyonce', 'Coldplay', 'Kendrick Lamar', 'Billie Eilish'],
  mood: ['relaxing', 'upbeat', 'chill', 'energetic', 'happy', 'sad', 'focus', 'workout', 'party', 'romantic'],
  playlist: ['chill', 'workout', 'focus', 'party', 'favorites', 'discover weekly', 'release radar'],
  city: ['New York', 'Los Angeles', 'London', 'Paris', 'Tokyo', 'San Francisco', 'Chicago', 'Miami', 'Seattle'],
  day: ['Monday', 'Tuesday', 'tomorrow', 'next week', 'this weekend', 'Friday'],
  time: ['7am', '8am', '9am', '6pm', '7pm', '8pm', 'noon', 'midnight', '10 minutes', '30 minutes', 'an hour'],
  duration: ['5 minutes', '10 minutes', '15 minutes', '30 minutes', '1 hour', '2 hours'],
  person: ['John', 'Sarah', 'Mike', 'Emma', 'David', 'Lisa', 'Mom', 'Dad', 'my boss', 'my friend'],
  relation: ['mom', 'dad', 'sister', 'brother', 'wife', 'husband', 'friend', 'boss', 'coworker'],
  topic: ['AI', 'climate change', 'history', 'science', 'cooking', 'fitness', 'investing', 'psychology'],
  habit: ['meditation', 'exercise', 'reading', 'journaling', 'stretching', 'water', 'sleep', 'walking'],
  task: ['call mom', 'take out trash', 'buy groceries', 'submit report', 'pay bills', 'pick up kids'],
  item: ['milk', 'eggs', 'bread', 'bananas', 'coffee', 'paper towels', 'butter'],
  list_type: ['grocery', 'shopping', 'todo', 'wish'],
  room: ['living room', 'bedroom', 'kitchen', 'bathroom', 'office'],
  temp: ['68', '70', '72', '74', '76'],
  event: ['meeting', 'appointment', 'call', 'dinner', 'lunch', 'party'],
  book: ['Atomic Habits', 'The Great Gatsby', 'Sapiens', '1984'],
  cuisine: ['Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Indian'],
  emotion: ['good', 'great', 'okay', 'tired', 'stressed', 'happy', 'sad', 'anxious'],
  behavior: ['listen', 'do homework', 'go to bed', 'eat vegetables', 'share'],
  option1: ['take the job', 'move', 'buy it', 'go'],
  option2: ['stay', 'wait', 'keep looking', 'pass'],
  mistake: ['what I said', 'that decision', 'how I acted'],
  occasion: ['birthday', 'Christmas', 'anniversary', 'wedding'],
  content: ['call dentist', 'meeting at 3', 'project idea', 'remember this'],
  name: ['groceries', 'vacation', 'project', 'party'],
  distance: ['3 miles', '5k', '10k', '30 minutes'],
  query: ['inflation', 'best restaurants', 'how to cook steak', 'weather tomorrow'],
  fact: ['I have a meeting tomorrow', 'my anniversary is June 5th', 'I prefer coffee'],
};

// ============================================================================
// TEMPLATE WRAPPERS (make queries more natural)
// ============================================================================

const PREFIXES = [
  '',
  'hey ',
  'hi ',
  'um ',
  'uh ',
  'so ',
  'okay ',
  'alright ',
  'well ',
  'actually ',
  'hmm ',
];

const SUFFIXES = [
  '',
  ' please',
  ' thanks',
  ' if you can',
  ' for me',
  ' real quick',
  ' when you get a chance',
];

const POLITE_WRAPPERS = [
  'can you {query}',
  'could you {query}',
  'would you {query}',
  'will you {query}',
  'I need you to {query}',
  'I want to {query}',
  "I'd like to {query}",
  'help me {query}',
  'please {query}',
];

// ============================================================================
// GENERATION FUNCTIONS
// ============================================================================

function fillSlots(template: string): string {
  let result = template;
  
  for (const [slot, values] of Object.entries(SLOTS)) {
    const pattern = new RegExp(`\\{${slot}\\}`, 'g');
    if (pattern.test(result)) {
      const value = values[Math.floor(Math.random() * values.length)];
      result = result.replace(pattern, value);
    }
  }
  
  return result;
}

function generateVariation(baseQuery: string): string {
  // Add prefix
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  
  // Add suffix
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  
  // Maybe wrap in polite form
  let query = baseQuery;
  if (Math.random() < 0.3) {
    const wrapper = POLITE_WRAPPERS[Math.floor(Math.random() * POLITE_WRAPPERS.length)];
    query = wrapper.replace('{query}', query);
  }
  
  return (prefix + query + suffix).trim();
}

interface Example {
  query: string;
  label: string;
  category: string;
}

function generateExamplesForLabel(label: string, templates: string[], count: number): Example[] {
  const examples: Example[] = [];
  const category = label.split('_')[0];
  
  while (examples.length < count) {
    for (const template of templates) {
      if (examples.length >= count) break;
      
      // Fill slots
      const filled = fillSlots(template);
      
      // Generate base example
      examples.push({
        query: filled,
        label,
        category,
      });
      
      // Generate variations
      for (let i = 0; i < 3 && examples.length < count; i++) {
        const variation = generateVariation(filled);
        if (variation !== filled) {
          examples.push({
            query: variation,
            label,
            category,
          });
        }
      }
    }
  }
  
  return examples.slice(0, count);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║    FTIS TRAINING DATA GENERATOR v2 - REALISTIC QUERIES     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const startTime = performance.now();

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Calculate distribution
  const labels = Object.keys(CATEGORY_TEMPLATES);
  const examplesPerLabel = Math.ceil(TARGET_EXAMPLES / labels.length);
  
  console.log(`📊 Configuration:`);
  console.log(`   Target Examples:    ${TARGET_EXAMPLES.toLocaleString()}`);
  console.log(`   Labels:             ${labels.length}`);
  console.log(`   Examples/Label:     ~${examplesPerLabel}`);
  console.log('');

  // Generate examples
  console.log('🔄 Generating examples...');
  
  const allExamples: Example[] = [];
  const labelMap: Record<string, number> = {};
  
  let labelIndex = 0;
  for (const [label, templates] of Object.entries(CATEGORY_TEMPLATES)) {
    const examples = generateExamplesForLabel(label, templates, examplesPerLabel);
    allExamples.push(...examples);
    labelMap[label] = labelIndex++;
    
    if (labelIndex % 10 === 0) {
      process.stdout.write(`   Generated ${labelIndex}/${labels.length} labels...\r`);
    }
  }
  
  console.log(`   ✅ Generated ${allExamples.length.toLocaleString()} examples\n`);

  // Shuffle
  console.log('🔀 Shuffling...');
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

  console.log(`   Train:      ${trainData.length.toLocaleString()}`);
  console.log(`   Validation: ${valData.length.toLocaleString()}`);
  console.log(`   Test:       ${testData.length.toLocaleString()}\n`);

  // Write files
  console.log('💾 Writing files...');
  
  writeFileSync(path.join(OUTPUT_DIR, 'train.json'), JSON.stringify(trainData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'validation.json'), JSON.stringify(valData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'test.json'), JSON.stringify(testData, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'label_map.json'), JSON.stringify(labelMap, null, 2));

  const duration = ((performance.now() - startTime) / 1000).toFixed(1);
  
  console.log(`   ✅ Done in ${duration}s\n`);

  // Show samples
  console.log('📝 Sample Queries:');
  console.log('─'.repeat(60));
  
  const samples = allExamples.slice(0, 15);
  for (const s of samples) {
    console.log(`   "${s.query}" → ${s.label}`);
  }
  console.log('─'.repeat(60));
  console.log('');

  console.log('🚀 Next: Run python models/ftis-router-v2/train.py');
  console.log('');
}

main().catch(console.error);
