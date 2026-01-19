#!/usr/bin/env npx tsx
/**
 * FTIS High-Quality Training Data Generator
 * 
 * Two-pronged approach:
 * 1. Reduce 887 labels → 100 core categories (domain-level routing)
 * 2. Use Gemini Flash to generate diverse, natural examples
 * 
 * Expected improvement: 17% → 70%+ accuracy
 * 
 * Usage:
 *   npx tsx scripts/generate-ftis-high-quality.ts
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

// Load .env file FIRST, before any other imports
config();

// Force API key mode (not Vertex AI) for this script
process.env.USE_VERTEX_AI = 'false';

const OUTPUT_DIR = './models/ftis-router-v3';
const EXAMPLES_PER_CATEGORY = 500;

// Now import gemini config AFTER setting env vars
const { getGeminiClient, getExtractionModel, isGeminiConfigured, getGeminiConfigStatus } = await import('../src/config/gemini-config.js');

// ============================================================================
// 100 CORE CATEGORIES (collapsed from 887)
// Each category maps to multiple fine-grained tools
// ============================================================================

interface Category {
  id: string;
  description: string;
  keywords: string[];
  exampleQueries: string[];
  mappedTools: string[]; // The original 887 tool IDs that map here
}

const CORE_CATEGORIES: Category[] = [
  // ==================== MUSIC (1-5) ====================
  {
    id: 'music_play',
    description: 'Playing music, starting playback',
    keywords: ['play', 'music', 'song', 'track', 'tune', 'jam'],
    exampleQueries: [
      'play some music', 'put on some jazz', 'play my playlist',
      'I want to hear some rock', 'play something upbeat'
    ],
    mappedTools: ['spotify_play', 'music_play', 'sonos_play'],
  },
  {
    id: 'music_control',
    description: 'Controlling playback: pause, skip, volume',
    keywords: ['pause', 'stop', 'skip', 'next', 'previous', 'volume', 'louder', 'quieter'],
    exampleQueries: [
      'pause the music', 'skip this song', 'turn it up', 'next track', 'stop playing'
    ],
    mappedTools: ['spotify_pause', 'spotify_skip', 'spotify_previous', 'spotify_volume', 'sonos_pause', 'sonos_volume'],
  },
  {
    id: 'music_search',
    description: 'Searching for music, finding songs',
    keywords: ['find', 'search', 'look for', 'what song', 'who sings'],
    exampleQueries: [
      'find songs by Taylor Swift', 'search for 80s hits', 'what song is this', 'who sings this'
    ],
    mappedTools: ['spotify_search', 'spotify_current', 'music_search'],
  },
  {
    id: 'music_playlist',
    description: 'Managing playlists',
    keywords: ['playlist', 'add to', 'create playlist', 'my playlist'],
    exampleQueries: [
      'add this to my favorites', 'create a workout playlist', 'show my playlists'
    ],
    mappedTools: ['spotify_playlist', 'spotify_like', 'spotify_queue'],
  },
  {
    id: 'music_mood',
    description: 'Music for mood/activity',
    keywords: ['relaxing', 'energetic', 'focus', 'sleep', 'workout'],
    exampleQueries: [
      'play something relaxing', 'music for studying', 'workout playlist', 'sleep sounds'
    ],
    mappedTools: ['music_mood', 'music_recommendations', 'ambient_set'],
  },

  // ==================== CALENDAR (6-10) ====================
  {
    id: 'calendar_create',
    description: 'Creating calendar events',
    keywords: ['schedule', 'create event', 'add to calendar', 'book', 'set up'],
    exampleQueries: [
      'schedule a meeting tomorrow', 'add dentist to my calendar', 'book lunch with Sarah'
    ],
    mappedTools: ['calendar_create_event', 'scheduling_find_time'],
  },
  {
    id: 'calendar_view',
    description: 'Viewing calendar, checking schedule',
    keywords: ['what\'s on', 'my schedule', 'calendar', 'appointments', 'events today'],
    exampleQueries: [
      'what\'s on my calendar today', 'show my schedule', 'any meetings tomorrow', 'am I free at 3'
    ],
    mappedTools: ['calendar_list_events', 'calendar_check_availability', 'scheduling_conflicts'],
  },
  {
    id: 'calendar_modify',
    description: 'Modifying or canceling events',
    keywords: ['cancel', 'move', 'reschedule', 'change', 'delete event'],
    exampleQueries: [
      'cancel my 3pm meeting', 'move my dentist to Friday', 'reschedule the call'
    ],
    mappedTools: ['calendar_update_event', 'calendar_delete_event', 'calendar_reschedule'],
  },

  // ==================== ALARMS & TIMERS (11-15) ====================
  {
    id: 'alarm_set',
    description: 'Setting alarms and wake-up times',
    keywords: ['alarm', 'wake me', 'wake up', 'alarm for'],
    exampleQueries: [
      'set an alarm for 7am', 'wake me up at 6', 'alarm for tomorrow morning'
    ],
    mappedTools: ['alarm_set', 'alarm_create'],
  },
  {
    id: 'alarm_manage',
    description: 'Managing alarms: snooze, delete, list',
    keywords: ['snooze', 'cancel alarm', 'delete alarm', 'my alarms', 'turn off alarm'],
    exampleQueries: [
      'snooze for 5 minutes', 'cancel my alarm', 'show my alarms', 'turn off the alarm'
    ],
    mappedTools: ['alarm_delete', 'alarm_list', 'alarm_snooze'],
  },
  {
    id: 'timer_set',
    description: 'Setting timers and countdowns',
    keywords: ['timer', 'countdown', 'minutes', 'timer for'],
    exampleQueries: [
      'set a timer for 10 minutes', 'start a 30 minute timer', '5 minute countdown'
    ],
    mappedTools: ['timer_set', 'timer_create'],
  },
  {
    id: 'timer_manage',
    description: 'Managing timers: check, cancel, pause',
    keywords: ['how much time', 'cancel timer', 'stop timer', 'pause timer'],
    exampleQueries: [
      'how much time left', 'cancel the timer', 'stop the countdown', 'pause the timer'
    ],
    mappedTools: ['timer_cancel', 'timer_check', 'timer_pause'],
  },

  // ==================== REMINDERS & TASKS (16-22) ====================
  {
    id: 'reminder_set',
    description: 'Setting reminders',
    keywords: ['remind me', 'reminder', 'don\'t let me forget', 'remember to'],
    exampleQueries: [
      'remind me to call mom at 5', 'set a reminder for the meeting', 'remind me when I get home'
    ],
    mappedTools: ['reminder_set', 'reminder_create', 'productivity_commitments'],
  },
  {
    id: 'reminder_manage',
    description: 'Viewing and managing reminders',
    keywords: ['my reminders', 'show reminders', 'delete reminder', 'cancel reminder'],
    exampleQueries: [
      'what reminders do I have', 'show my reminders', 'cancel the reminder'
    ],
    mappedTools: ['reminder_list', 'reminder_delete', 'reminder_complete'],
  },
  {
    id: 'todo_add',
    description: 'Adding tasks to todo list',
    keywords: ['add to todo', 'add task', 'to my list', 'need to do'],
    exampleQueries: [
      'add buy milk to my todo list', 'add a task to call dentist', 'put this on my list'
    ],
    mappedTools: ['todo_add', 'lists_add_item'],
  },
  {
    id: 'todo_view',
    description: 'Viewing todo lists',
    keywords: ['todo list', 'my tasks', 'what do I need to do', 'show list'],
    exampleQueries: [
      'show my todo list', 'what tasks do I have', 'what\'s on my list'
    ],
    mappedTools: ['todo_list', 'lists_view'],
  },
  {
    id: 'todo_complete',
    description: 'Completing or removing tasks',
    keywords: ['done', 'completed', 'finished', 'mark as done', 'check off'],
    exampleQueries: [
      'mark buy milk as done', 'I finished the dishes', 'check off groceries'
    ],
    mappedTools: ['todo_complete', 'todo_delete', 'lists_delete_item'],
  },
  {
    id: 'list_manage',
    description: 'Managing lists (shopping, grocery, etc)',
    keywords: ['shopping list', 'grocery list', 'create list', 'my lists'],
    exampleQueries: [
      'add milk to shopping list', 'show my grocery list', 'create a packing list'
    ],
    mappedTools: ['lists_create', 'lists_view', 'grocery_add', 'grocery_view'],
  },

  // ==================== WEATHER (23-25) ====================
  {
    id: 'weather_current',
    description: 'Current weather conditions',
    keywords: ['weather', 'temperature', 'outside', 'how hot', 'how cold'],
    exampleQueries: [
      'what\'s the weather', 'how cold is it', 'temperature outside', 'is it raining'
    ],
    mappedTools: ['weather_current', 'weather_now'],
  },
  {
    id: 'weather_forecast',
    description: 'Weather forecasts',
    keywords: ['forecast', 'tomorrow', 'this week', 'weekend', 'will it rain'],
    exampleQueries: [
      'will it rain tomorrow', 'weekend forecast', 'weather this week', 'forecast for Saturday'
    ],
    mappedTools: ['weather_forecast', 'weather_hourly', 'weather_weekly'],
  },

  // ==================== HABITS & ROUTINES (26-32) ====================
  {
    id: 'habit_log',
    description: 'Logging habit completion',
    keywords: ['log', 'did', 'completed', 'finished', 'track'],
    exampleQueries: [
      'log my meditation', 'I did my workout', 'mark exercise as done', 'track my reading'
    ],
    mappedTools: ['habit_log', 'habit_complete', 'habit_track'],
  },
  {
    id: 'habit_create',
    description: 'Creating new habits',
    keywords: ['new habit', 'start habit', 'want to build', 'create habit'],
    exampleQueries: [
      'create a habit for reading', 'I want to start meditating daily', 'help me build a workout habit'
    ],
    mappedTools: ['habit_create', 'habit_dna', 'habit_bundles'],
  },
  {
    id: 'habit_view',
    description: 'Viewing habits and progress',
    keywords: ['my habits', 'habit list', 'streak', 'how am I doing', 'progress'],
    exampleQueries: [
      'show my habits', 'what\'s my streak', 'how am I doing with meditation', 'habit progress'
    ],
    mappedTools: ['habit_list', 'habit_streak', 'habit_progress'],
  },
  {
    id: 'habit_coaching',
    description: 'Habit coaching and advice',
    keywords: ['habit advice', 'help with habit', 'struggling', 'stick to'],
    exampleQueries: [
      'help me stick to my habit', 'I keep failing', 'habit coaching', 'how to build consistency'
    ],
    mappedTools: ['habit_coaching', 'habit_pace', 'habit_guidance'],
  },
  {
    id: 'routine_run',
    description: 'Running routines',
    keywords: ['morning routine', 'bedtime routine', 'start routine', 'run routine'],
    exampleQueries: [
      'start my morning routine', 'run bedtime routine', 'begin my evening routine'
    ],
    mappedTools: ['routine_run', 'routine_start', 'winddown_start'],
  },
  {
    id: 'routine_manage',
    description: 'Creating and managing routines',
    keywords: ['create routine', 'edit routine', 'my routines', 'routine list'],
    exampleQueries: [
      'create a morning routine', 'show my routines', 'edit bedtime routine'
    ],
    mappedTools: ['routine_create', 'routine_list', 'routine_edit'],
  },

  // ==================== HANDOFFS (33-38) ====================
  {
    id: 'handoff_maya',
    description: 'Switch to Maya (habits coach)',
    keywords: ['maya', 'habits coach', 'talk to maya'],
    exampleQueries: [
      'let me talk to Maya', 'switch to Maya', 'can I speak with Maya', 'get Maya'
    ],
    mappedTools: ['handoff_maya', 'handoff'],
  },
  {
    id: 'handoff_peter',
    description: 'Switch to Peter (research)',
    keywords: ['peter', 'research', 'talk to peter'],
    exampleQueries: [
      'let me talk to Peter', 'switch to Peter', 'I need Peter', 'get Peter on'
    ],
    mappedTools: ['handoff_peter', 'handoff'],
  },
  {
    id: 'handoff_alex',
    description: 'Switch to Alex (communication)',
    keywords: ['alex', 'communication', 'talk to alex'],
    exampleQueries: [
      'switch to Alex', 'let me talk to Alex', 'can Alex help me', 'get Alex'
    ],
    mappedTools: ['handoff_alex', 'handoff'],
  },
  {
    id: 'handoff_jordan',
    description: 'Switch to Jordan (events)',
    keywords: ['jordan', 'events', 'planning', 'talk to jordan'],
    exampleQueries: [
      'switch to Jordan', 'let me talk to Jordan', 'I need Jordan', 'get Jordan'
    ],
    mappedTools: ['handoff_jordan', 'handoff'],
  },
  {
    id: 'handoff_nayan',
    description: 'Switch to Nayan (wisdom)',
    keywords: ['nayan', 'wisdom', 'philosophy', 'talk to nayan'],
    exampleQueries: [
      'switch to Nayan', 'let me talk to Nayan', 'can I speak with Nayan', 'get Nayan'
    ],
    mappedTools: ['handoff_nayan', 'handoff'],
  },
  {
    id: 'handoff_ferni',
    description: 'Switch to Ferni (main coach)',
    keywords: ['ferni', 'back to ferni', 'main coach'],
    exampleQueries: [
      'switch back to Ferni', 'let me talk to Ferni', 'back to Ferni'
    ],
    mappedTools: ['handoff_ferni', 'handoff'],
  },

  // ==================== COMMUNICATION (39-45) ====================
  {
    id: 'call_make',
    description: 'Making phone calls',
    keywords: ['call', 'phone', 'dial', 'ring'],
    exampleQueries: [
      'call mom', 'phone John', 'dial Sarah', 'make a call to my doctor'
    ],
    mappedTools: ['call_make', 'telephony_call'],
  },
  {
    id: 'call_manage',
    description: 'Managing calls, voicemail',
    keywords: ['voicemail', 'missed calls', 'call history', 'who called'],
    exampleQueries: [
      'check my voicemail', 'who called me', 'any missed calls', 'call history'
    ],
    mappedTools: ['call_voicemail', 'call_history'],
  },
  {
    id: 'message_send',
    description: 'Sending text messages',
    keywords: ['text', 'message', 'send', 'tell them'],
    exampleQueries: [
      'text John I\'m running late', 'send a message to mom', 'tell Sarah I\'ll be there soon'
    ],
    mappedTools: ['sms_send', 'message_send'],
  },
  {
    id: 'message_read',
    description: 'Reading messages',
    keywords: ['read messages', 'my texts', 'any messages', 'unread'],
    exampleQueries: [
      'read my messages', 'any new texts', 'show my messages', 'unread messages'
    ],
    mappedTools: ['sms_read', 'sms_search'],
  },
  {
    id: 'email_send',
    description: 'Sending emails',
    keywords: ['email', 'send email', 'compose', 'draft'],
    exampleQueries: [
      'send an email to my boss', 'email John about the meeting', 'compose an email'
    ],
    mappedTools: ['email_send', 'email_draft', 'message_craft'],
  },
  {
    id: 'email_read',
    description: 'Reading and managing emails',
    keywords: ['check email', 'inbox', 'read email', 'any emails'],
    exampleQueries: [
      'check my email', 'any new emails', 'show my inbox', 'emails from today'
    ],
    mappedTools: ['email_read', 'email_search', 'email_prioritize'],
  },
  {
    id: 'contact_manage',
    description: 'Managing contacts',
    keywords: ['add contact', 'save number', 'contact info', 'phone number'],
    exampleQueries: [
      'save this number as John', 'add contact for Sarah', 'what\'s mom\'s number'
    ],
    mappedTools: ['contact_add', 'contact_find', 'contact_list'],
  },

  // ==================== CRISIS & WELLNESS (46-52) ====================
  {
    id: 'crisis_support',
    description: 'Crisis and urgent mental health support',
    keywords: ['crisis', 'panic', 'emergency', 'help me', 'can\'t breathe'],
    exampleQueries: [
      'I\'m having a panic attack', 'I need help right now', 'I\'m in crisis', 'I can\'t breathe'
    ],
    mappedTools: ['crisis_support', 'crisis_resources', 'crisis_safety_plan'],
  },
  {
    id: 'grounding',
    description: 'Grounding and breathing exercises',
    keywords: ['grounding', 'breathing', 'calm down', 'anxious', 'relax'],
    exampleQueries: [
      'help me calm down', 'do a breathing exercise', 'I\'m anxious', 'grounding exercise'
    ],
    mappedTools: ['grounding_exercise', 'grounding_breathing', 'grounding_sensory'],
  },
  {
    id: 'wellness_check',
    description: 'Wellness check-ins',
    keywords: ['check in', 'how am I', 'wellness', 'mood check'],
    exampleQueries: [
      'wellness check in', 'check in on my mood', 'how am I doing today'
    ],
    mappedTools: ['wellness_checkin', 'wellness_mood'],
  },

  // ==================== COACHING & GROWTH (53-60) ====================
  {
    id: 'coaching_motivation',
    description: 'Motivation and encouragement',
    keywords: ['motivation', 'motivate', 'encourage', 'pep talk', 'inspire'],
    exampleQueries: [
      'I need motivation', 'give me a pep talk', 'motivate me', 'I feel unmotivated'
    ],
    mappedTools: ['coaching_motivation', 'coaching_encouragement'],
  },
  {
    id: 'coaching_goals',
    description: 'Goal setting and tracking',
    keywords: ['goals', 'set goal', 'my goals', 'goal progress'],
    exampleQueries: [
      'help me set goals', 'what are my goals', 'track my goal progress', 'review my goals'
    ],
    mappedTools: ['coaching_goals', 'goals_set', 'goals_progress'],
  },
  {
    id: 'coaching_reflection',
    description: 'Reflection and self-assessment',
    keywords: ['reflect', 'reflection', 'think about', 'review'],
    exampleQueries: [
      'let\'s do a reflection', 'help me reflect on today', 'weekly reflection', 'review my week'
    ],
    mappedTools: ['coaching_reflection', 'reflection_daily', 'reflection_weekly'],
  },
  {
    id: 'grief_support',
    description: 'Grief and loss support',
    keywords: ['grief', 'loss', 'died', 'passed away', 'grieving', 'mourning'],
    exampleQueries: [
      'I lost my dad', 'I\'m grieving', 'help me with loss', 'my friend passed away'
    ],
    mappedTools: ['grief_support', 'grief_process', 'grief_stages', 'grief_memories'],
  },
  {
    id: 'relationship_advice',
    description: 'Relationship advice and support',
    keywords: ['relationship', 'partner', 'marriage', 'dating', 'love'],
    exampleQueries: [
      'relationship advice', 'my partner and I are fighting', 'help with my marriage'
    ],
    mappedTools: ['relationship_advice', 'relationship_conflict', 'relationship_communication'],
  },
  {
    id: 'breakup_support',
    description: 'Breakup and heartbreak support',
    keywords: ['breakup', 'ex', 'heartbreak', 'broke up', 'ending'],
    exampleQueries: [
      'my partner and I broke up', 'I\'m heartbroken', 'getting over my ex', 'breakup advice'
    ],
    mappedTools: ['breakup_support', 'breakup_healing', 'breakup_no_contact'],
  },
  {
    id: 'self_compassion',
    description: 'Self-compassion and inner critic work',
    keywords: ['self compassion', 'inner critic', 'hard on myself', 'self criticism'],
    exampleQueries: [
      'I\'m being too hard on myself', 'help with my inner critic', 'practice self compassion'
    ],
    mappedTools: ['self_compassion', 'self_compassion_comparison', 'critic_quiet', 'critic_reframe'],
  },
  {
    id: 'imposter_syndrome',
    description: 'Imposter syndrome support',
    keywords: ['imposter', 'fraud', 'don\'t belong', 'not good enough'],
    exampleQueries: [
      'I feel like an imposter', 'imposter syndrome', 'I don\'t belong here', 'I\'m not qualified'
    ],
    mappedTools: ['imposter_syndrome', 'confidence_boost'],
  },

  // ==================== SMART HOME (61-65) ====================
  {
    id: 'lights',
    description: 'Controlling lights',
    keywords: ['lights', 'light', 'turn on', 'turn off', 'dim', 'bright'],
    exampleQueries: [
      'turn on the lights', 'dim the bedroom lights', 'lights off', 'turn on living room light'
    ],
    mappedTools: ['smarthome_lights', 'lights_on', 'lights_off', 'lights_dim'],
  },
  {
    id: 'thermostat',
    description: 'Controlling temperature',
    keywords: ['thermostat', 'temperature', 'heat', 'cool', 'warmer', 'cooler'],
    exampleQueries: [
      'set thermostat to 72', 'make it warmer', 'turn up the heat', 'temperature to 68'
    ],
    mappedTools: ['smarthome_thermostat', 'thermostat_set'],
  },
  {
    id: 'locks',
    description: 'Controlling locks and doors',
    keywords: ['lock', 'unlock', 'door', 'locked', 'front door'],
    exampleQueries: [
      'lock the front door', 'is the door locked', 'unlock the back door'
    ],
    mappedTools: ['smarthome_locks', 'locks_control'],
  },
  {
    id: 'garage',
    description: 'Garage door control',
    keywords: ['garage', 'garage door', 'open garage', 'close garage'],
    exampleQueries: [
      'open the garage', 'close garage door', 'is the garage closed'
    ],
    mappedTools: ['smarthome_garage', 'garage_control'],
  },

  // ==================== HEALTH & FITNESS (66-72) ====================
  {
    id: 'exercise_log',
    description: 'Logging workouts',
    keywords: ['workout', 'exercise', 'gym', 'ran', 'walked', 'lifted'],
    exampleQueries: [
      'log my workout', 'I went to the gym', 'track my run', 'I walked 5 miles'
    ],
    mappedTools: ['health_exercise', 'fitness_workout', 'fitness_log'],
  },
  {
    id: 'nutrition',
    description: 'Nutrition and meal tracking',
    keywords: ['calories', 'food', 'ate', 'meal', 'nutrition', 'diet'],
    exampleQueries: [
      'track my lunch', 'how many calories', 'log my dinner', 'what did I eat today'
    ],
    mappedTools: ['health_nutrition', 'meal_track', 'calories_count'],
  },
  {
    id: 'water',
    description: 'Water intake tracking',
    keywords: ['water', 'hydration', 'drank', 'glasses'],
    exampleQueries: [
      'log my water', 'I drank a glass of water', 'how much water today', 'track hydration'
    ],
    mappedTools: ['health_water', 'water_track'],
  },
  {
    id: 'sleep',
    description: 'Sleep tracking and analysis',
    keywords: ['sleep', 'slept', 'bedtime', 'wake up', 'rest'],
    exampleQueries: [
      'how did I sleep', 'track my sleep', 'sleep analysis', 'I slept 7 hours'
    ],
    mappedTools: ['sleep_track', 'sleep_analyze', 'sleep_quality'],
  },

  // ==================== FINANCE (73-76) ====================
  {
    id: 'budget',
    description: 'Budget and spending',
    keywords: ['budget', 'spending', 'spent', 'expenses', 'money'],
    exampleQueries: [
      'how\'s my budget', 'what did I spend this week', 'track my spending', 'expenses this month'
    ],
    mappedTools: ['finance_budget', 'finance_spending'],
  },
  {
    id: 'bills',
    description: 'Bills and payments',
    keywords: ['bills', 'due', 'payment', 'pay', 'bill'],
    exampleQueries: [
      'when is rent due', 'my upcoming bills', 'pay my credit card', 'bill reminders'
    ],
    mappedTools: ['finance_bills', 'finance_payments'],
  },

  // ==================== TRAVEL (77-80) ====================
  {
    id: 'travel_plan',
    description: 'Trip planning',
    keywords: ['trip', 'vacation', 'travel', 'visit', 'go to'],
    exampleQueries: [
      'plan a trip to Paris', 'help me plan my vacation', 'I want to visit Japan'
    ],
    mappedTools: ['travel_plan', 'travel_suggestions'],
  },
  {
    id: 'flights',
    description: 'Flight search and booking',
    keywords: ['flight', 'fly', 'airplane', 'plane', 'book flight'],
    exampleQueries: [
      'find flights to New York', 'book a flight', 'cheapest flight to LA'
    ],
    mappedTools: ['travel_flights', 'flights_search'],
  },
  {
    id: 'directions',
    description: 'Directions and navigation',
    keywords: ['directions', 'navigate', 'how to get', 'route', 'way to'],
    exampleQueries: [
      'directions to the airport', 'how do I get to downtown', 'navigate to work'
    ],
    mappedTools: ['traffic_directions', 'navigation'],
  },

  // ==================== RECOMMENDATIONS (81-85) ====================
  {
    id: 'restaurant_rec',
    description: 'Restaurant recommendations',
    keywords: ['restaurant', 'eat', 'dinner', 'lunch', 'food', 'place to eat'],
    exampleQueries: [
      'recommend a restaurant', 'where should I eat', 'good Italian food nearby'
    ],
    mappedTools: ['recommend_restaurants', 'local_restaurants'],
  },
  {
    id: 'movie_rec',
    description: 'Movie and show recommendations',
    keywords: ['movie', 'show', 'watch', 'netflix', 'film'],
    exampleQueries: [
      'recommend a movie', 'what should I watch', 'good shows on netflix'
    ],
    mappedTools: ['recommend_movies', 'entertainment_suggest'],
  },
  {
    id: 'book_rec',
    description: 'Book recommendations',
    keywords: ['book', 'read', 'reading', 'novel', 'author'],
    exampleQueries: [
      'recommend a book', 'what should I read', 'good books about AI'
    ],
    mappedTools: ['recommend_books', 'books_search'],
  },
  {
    id: 'podcast_rec',
    description: 'Podcast recommendations',
    keywords: ['podcast', 'listen', 'podcasts', 'episodes'],
    exampleQueries: [
      'recommend a podcast', 'good podcasts about business', 'podcast for my commute'
    ],
    mappedTools: ['recommend_podcasts', 'podcast_search'],
  },

  // ==================== GAMES & FUN (86-88) ====================
  {
    id: 'game',
    description: 'Playing games',
    keywords: ['game', 'play', 'trivia', 'quiz', 'bored'],
    exampleQueries: [
      'let\'s play a game', 'trivia question', 'I\'m bored', 'play would you rather'
    ],
    mappedTools: ['game_trivia', 'game_story', 'game_wordplay'],
  },
  {
    id: 'joke',
    description: 'Jokes and humor',
    keywords: ['joke', 'funny', 'laugh', 'humor'],
    exampleQueries: [
      'tell me a joke', 'make me laugh', 'something funny', 'fun fact'
    ],
    mappedTools: ['humor_joke', 'humor_funfact'],
  },

  // ==================== VOICE MEMOS & MEMORY (89-92) ====================
  {
    id: 'voice_memo',
    description: 'Voice memos and notes',
    keywords: ['voice memo', 'record', 'note', 'save this', 'memo'],
    exampleQueries: [
      'save a voice memo', 'record a note', 'play my last memo', 'voice note'
    ],
    mappedTools: ['voice_memo_save', 'voice_memo_play', 'voice_memo_list'],
  },
  {
    id: 'memory_save',
    description: 'Saving things to memory',
    keywords: ['remember', 'save', 'note that', 'keep in mind'],
    exampleQueries: [
      'remember that I like jazz', 'save this for later', 'note that my birthday is March 5'
    ],
    mappedTools: ['memory_save', 'memory_note'],
  },
  {
    id: 'memory_recall',
    description: 'Recalling from memory',
    keywords: ['recall', 'what do you know', 'did I tell you', 'remember'],
    exampleQueries: [
      'what do you know about me', 'did I tell you about my sister', 'recall my preferences'
    ],
    mappedTools: ['memory_recall', 'memory_search'],
  },

  // ==================== CEO FEATURES (93-96) ====================
  {
    id: 'briefing',
    description: 'Daily briefings',
    keywords: ['briefing', 'brief me', 'what\'s happening', 'morning update'],
    exampleQueries: [
      'give me my briefing', 'morning briefing', 'brief me on today', 'what\'s happening today'
    ],
    mappedTools: ['ceo_briefing', 'briefing_morning'],
  },
  {
    id: 'priorities',
    description: 'Managing priorities',
    keywords: ['priorities', 'focus', 'important', 'priority'],
    exampleQueries: [
      'what are my priorities', 'set today\'s focus', 'what should I focus on'
    ],
    mappedTools: ['ceo_priorities', 'priorities_set'],
  },
  {
    id: 'journal',
    description: 'Journaling',
    keywords: ['journal', 'diary', 'write', 'entry'],
    exampleQueries: [
      'journal entry', 'add to my journal', 'daily journal', 'write in my diary'
    ],
    mappedTools: ['ceo_journal', 'journal_add'],
  },
  {
    id: 'gratitude',
    description: 'Gratitude logging',
    keywords: ['gratitude', 'grateful', 'thankful', 'appreciate'],
    exampleQueries: [
      'log gratitude', 'I\'m grateful for', 'add to gratitude journal', 'what am I thankful for'
    ],
    mappedTools: ['ceo_gratitude', 'gratitude_add'],
  },

  // ==================== ESSENTIALS (97-100) ====================
  {
    id: 'time',
    description: 'Asking the time',
    keywords: ['time', 'what time', 'clock'],
    exampleQueries: [
      'what time is it', 'what\'s the time', 'current time'
    ],
    mappedTools: ['info_time', 'essentials_time'],
  },
  {
    id: 'date',
    description: 'Asking the date',
    keywords: ['date', 'what day', 'today', 'what date'],
    exampleQueries: [
      'what\'s today\'s date', 'what day is it', 'what\'s the date'
    ],
    mappedTools: ['info_date', 'essentials_date'],
  },
  {
    id: 'capabilities',
    description: 'Asking what Ferni can do',
    keywords: ['what can you do', 'help', 'capabilities', 'features'],
    exampleQueries: [
      'what can you do', 'help me', 'show me what you can do', 'your capabilities'
    ],
    mappedTools: ['essentials_help', 'essentials_capabilities'],
  },
  {
    id: 'conversation',
    description: 'General conversation, small talk',
    keywords: ['hi', 'hello', 'hey', 'thanks', 'okay', 'yes', 'no'],
    exampleQueries: [
      'hey', 'hi there', 'thanks', 'okay', 'sounds good', 'never mind', 'that\'s fine'
    ],
    mappedTools: ['__conversation__'],
  },
];

// ============================================================================
// LLM GENERATION
// ============================================================================

// Client will be initialized lazily
let geminiClient: any = null;

async function generateExamplesForCategory(category: Category): Promise<Array<{ query: string; label: string }>> {
  // Initialize client if needed
  if (!geminiClient) {
    geminiClient = await getGeminiClient();
    if (!geminiClient) {
      throw new Error('Failed to initialize Gemini client');
    }
  }
  
  // Use gemini-2.0-flash-exp which is available with this API key
  const modelName = 'gemini-2.0-flash-exp';
  const prompt = `Generate ${EXAMPLES_PER_CATEGORY} unique voice command queries for this category:

CATEGORY: ${category.id}
DESCRIPTION: ${category.description}
KEYWORDS: ${category.keywords.join(', ')}

EXAMPLE QUERIES (for style reference):
${category.exampleQueries.map(q => `- "${q}"`).join('\n')}

REQUIREMENTS:
1. Natural spoken language (not formal writing)
2. Include these variations:
   - Very short (2-4 words): "play jazz", "skip song"
   - Casual with filler: "um play some music", "hey can you..."
   - Direct commands: "set alarm 7am"
   - Polite requests: "could you please..."
   - Questions: "what's on my..."
   - Incomplete/natural: "music... something relaxing"
3. Mix of different phrasings for the same intent
4. Include common typos/speech artifacts naturally
5. DO NOT include queries that could belong to a different category

OUTPUT: JSON array only, no other text:
[{"query": "...", "label": "${category.id}"}, ...]

Generate exactly ${EXAMPLES_PER_CATEGORY} unique examples.`;

  try {
    // Use the @google/genai SDK pattern
    const response = await geminiClient.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    
    const text = response.text || '';
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`  ⚠️ No JSON for ${category.id}`);
      return [];
    }
    
    const examples = JSON.parse(jsonMatch[0]) as Array<{ query: string; label: string }>;

    // Ensure all have correct label
    return examples.map(e => ({ query: e.query, label: category.id }));
  } catch (error) {
    console.error(`  ❌ Error for ${category.id}:`, error);
    return [];
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   FTIS HIGH-QUALITY TRAINING DATA (100 CATEGORIES)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (!isGeminiConfigured()) {
    console.error(`❌ Gemini not configured: ${getGeminiConfigStatus()}`);
    process.exit(1);
  }
  console.log(`✅ Gemini: ${getGeminiConfigStatus()}\n`);

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`📊 Configuration:`);
  console.log(`   Categories: ${CORE_CATEGORIES.length}`);
  console.log(`   Examples per category: ${EXAMPLES_PER_CATEGORY}`);
  console.log(`   Target total: ${CORE_CATEGORIES.length * EXAMPLES_PER_CATEGORY}`);
  console.log('');

  const allExamples: Array<{ query: string; label: string }> = [];
  const labelMap: Record<string, number> = {};

  // Create label map
  CORE_CATEGORIES.forEach((cat, idx) => {
    labelMap[cat.id] = idx;
  });

  // Generate for each category
  for (let i = 0; i < CORE_CATEGORIES.length; i++) {
    const category = CORE_CATEGORIES[i];
    console.log(`\n[${i + 1}/${CORE_CATEGORIES.length}] Generating: ${category.id}...`);
    
    const examples = await generateExamplesForCategory(category);
    console.log(`   ✅ ${examples.length} examples`);
    
    allExamples.push(...examples);
    
    // Rate limiting - be nice to API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Total examples: ${allExamples.length}`);

  // Shuffle
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  // Split 80/10/10
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
  
  writeFileSync(`${OUTPUT_DIR}/train.json`, JSON.stringify(trainData, null, 2));
  writeFileSync(`${OUTPUT_DIR}/validation.json`, JSON.stringify(valData, null, 2));
  writeFileSync(`${OUTPUT_DIR}/test.json`, JSON.stringify(testData, null, 2));
  writeFileSync(`${OUTPUT_DIR}/label_map.json`, JSON.stringify(labelMap, null, 2));

  // Also save category mapping for runtime
  const categoryMapping = CORE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = cat.mappedTools;
    return acc;
  }, {} as Record<string, string[]>);
  writeFileSync(`${OUTPUT_DIR}/category_to_tools.json`, JSON.stringify(categoryMapping, null, 2));

  // Samples
  console.log('\n📝 Sample Queries:');
  console.log('─'.repeat(70));
  for (const s of allExamples.slice(0, 15)) {
    console.log(`   "${s.query.slice(0, 45).padEnd(45)}" → ${s.label}`);
  }
  console.log('─'.repeat(70));

  console.log('\n✅ Generation complete!');
  console.log('\n📋 Next steps:');
  console.log('   1. Copy train.py to v3 folder');
  console.log('   2. Run training: python models/ftis-router-v3/train.py');
  console.log('   3. Expected accuracy: 70%+ (vs 17% with 887 labels)');
}

main().catch(console.error);
