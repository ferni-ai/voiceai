#!/usr/bin/env npx tsx
/**
 * FTIS V5-860 Router Validation Script
 *
 * Validates the trained router model against a comprehensive test suite
 * covering all 860 tool domains. Uses @ferni/perf OnnxRouter for inference.
 *
 * Usage:
 *   npx tsx scripts/validate-ftis-v5-860.ts
 *   npx tsx scripts/validate-ftis-v5-860.ts --verbose
 *   npx tsx scripts/validate-ftis-v5-860.ts --category music
 *
 * Alternative (Python, no Rust bindings needed):
 *   cd apps/ml-training/router && python validate.py
 */

import * as fs from 'fs';
import * as path from 'path';

// Test case structure
interface TestCase {
  query: string;
  expectedTools: string[]; // At least one should be in top-5 (actual tool IDs from label_map.json)
  category: string;
}

// Comprehensive test suite using actual tool IDs from label_map.json
const TEST_CASES: TestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MUSIC & AUDIO (High frequency)
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "play some jazz music", expectedTools: ["playMusic", "music_play", "spotify_play", "playMoodMusic", "playSonosMusic"], category: "music" },
  { query: "turn up the volume", expectedTools: ["adjustVolume", "musicControl", "setSonosVolume"], category: "music" },
  { query: "skip this song", expectedTools: ["skipTrack", "musicControl"], category: "music" },
  { query: "what song is this", expectedTools: ["musicInfo", "findSong", "whatsSonosPlaying", "musicControl"], category: "music" },
  { query: "add this to my playlist", expectedTools: ["musicControl", "playMusic", "searchMusic"], category: "music" },
  { query: "play something relaxing", expectedTools: ["playMoodMusic", "playMusic", "toggleAmbientMode", "music_play"], category: "music" },
  { query: "shuffle my liked songs", expectedTools: ["playMusic", "musicControl", "spotify_play", "music_play"], category: "music" },
  { query: "pause the music", expectedTools: ["pauseMusic", "musicControl", "pauseSonos"], category: "music" },

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR & SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "schedule a meeting tomorrow at 2pm", expectedTools: ["createCalendarEvent", "scheduleEvent", "calendarArchitecture"], category: "calendar" },
  { query: "what's on my calendar today", expectedTools: ["getCalendarEvents", "getDailyBriefing", "morningBriefing"], category: "calendar" },
  { query: "cancel my 3pm appointment", expectedTools: ["cancelEvent", "cancelScheduled", "modifyEvent"], category: "calendar" },
  { query: "reschedule the dentist to next week", expectedTools: ["rescheduleEvent", "modifyEvent", "cancelEvent"], category: "calendar" },
  { query: "block off Friday afternoon", expectedTools: ["createCalendarEvent", "scheduleEvent", "calendarArchitecture"], category: "calendar" },
  { query: "when is my next meeting", expectedTools: ["getCalendarEvents", "checkAvailability", "getDailyBriefing"], category: "calendar" },
  { query: "set up a recurring standup", expectedTools: ["createCalendarEvent", "scheduleEvent"], category: "calendar" },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "will it rain today", expectedTools: ["getWeather", "getWeatherForecast", "weatherForecast"], category: "weather" },
  { query: "what's the temperature outside", expectedTools: ["getWeather", "getWeatherForecast", "weatherForecast"], category: "weather" },
  { query: "weather forecast for the weekend", expectedTools: ["getWeatherForecast", "weatherForecast", "getWeather"], category: "weather" },
  { query: "should I bring an umbrella", expectedTools: ["getWeather", "getWeatherForecast", "weatherForecast"], category: "weather" },
  { query: "how hot will it be tomorrow", expectedTools: ["getWeatherForecast", "getWeather", "weatherForecast"], category: "weather" },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMUNICATION (SMS, Email, Calls)
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "send a text to mom", expectedTools: ["sendSMS", "sendMessage", "textContact", "sendMessageNow"], category: "communication" },
  { query: "call John", expectedTools: ["callContact", "makeCall", "callAndConverse", "backgroundCall"], category: "communication" },
  { query: "read my messages", expectedTools: ["analyzeMessage", "analyzeInboxPriority", "summarizeThread", "__no_tool__"], category: "communication" },
  { query: "send an email to the team", expectedTools: ["sendEmail", "composeEmail", "scheduleEmail"], category: "communication" },
  { query: "check my inbox", expectedTools: ["analyzeInboxPriority", "analyzeMessage", "sendEmail", "__no_tool__"], category: "communication" },
  { query: "reply to Sarah's email", expectedTools: ["sendEmail", "composeEmail", "difficultEmailDraft"], category: "communication" },
  { query: "forward this to my boss", expectedTools: ["sendEmail", "composeEmail"], category: "communication" },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART HOME
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "turn off the lights", expectedTools: ["controlLights", "controlLight", "setLights"], category: "smart_home" },
  { query: "set thermostat to 72 degrees", expectedTools: ["setThermostat", "adjustTemperature"], category: "smart_home" },
  { query: "lock the front door", expectedTools: ["controlLock"], category: "smart_home" },
  { query: "dim the bedroom lights", expectedTools: ["controlLights", "controlLight", "setLights"], category: "smart_home" },
  { query: "turn on the fan", expectedTools: ["controlLights", "listDevices", "activateScene", "__no_tool__"], category: "smart_home" },

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & FITNESS
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "log my workout", expectedTools: ["logExercise", "trackWorkout", "trackFitnessGoal", "suggestWorkout"], category: "health" },
  { query: "start a run", expectedTools: ["logExercise", "suggestWorkout", "trackWorkout", "trackFitnessGoal"], category: "health" },
  { query: "log 8 glasses of water", expectedTools: ["logWater", "trackHydration"], category: "health" },
  { query: "how did I sleep last night", expectedTools: ["trackSleep", "logSleep", "analyzeSleepPattern", "suggestSleepHygiene"], category: "health" },
  { query: "track my weight", expectedTools: ["trackFitnessGoal", "logExercise", "trackWorkout", "bodyNeutrality"], category: "health" },

  // ═══════════════════════════════════════════════════════════════════════════
  // TASKS & REMINDERS
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "add milk to my shopping list", expectedTools: ["generateShoppingList", "addTask", "createTodo", "orderGroceries"], category: "tasks" },
  { query: "remind me to call mom at 5pm", expectedTools: ["createReminder", "setReminder", "scheduleReminder"], category: "tasks" },
  { query: "what's on my todo list", expectedTools: ["listTodos", "getTasks", "getPriorities"], category: "tasks" },
  { query: "mark groceries as done", expectedTools: ["markDone", "completeTask", "markHabitComplete"], category: "tasks" },
  { query: "set a reminder for my meeting", expectedTools: ["createReminder", "setReminder", "scheduleReminder"], category: "tasks" },
  { query: "delete the dentist reminder", expectedTools: ["cancelReminder", "listReminders"], category: "tasks" },

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVIGATION & TRAVEL
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "find a gas station nearby", expectedTools: ["findBusiness", "searchLocalBusinesses", "findRestaurants"], category: "navigation" },
  { query: "book a flight to New York", expectedTools: ["searchFlights", "getFlightPrice", "planTrip"], category: "navigation" },
  { query: "find hotels in San Francisco", expectedTools: ["searchHotels", "requestHotelQuotes", "planTrip"], category: "navigation" },

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE & SEARCH
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "what's the latest news", expectedTools: ["getNews", "headlines", "search", "webSearch"], category: "knowledge" },
  { query: "search for pasta recipes", expectedTools: ["searchRecipes", "search", "webSearch"], category: "knowledge" },
  { query: "who won the game last night", expectedTools: ["getSports", "getNews", "headlines", "search"], category: "knowledge" },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTERTAINMENT
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "what's trending on YouTube", expectedTools: ["getTrendingVideos", "searchYouTube", "getVideoRecommendations"], category: "entertainment" },
  { query: "tell me a joke", expectedTools: ["becomeSilly", "startGame", "__no_tool__", "cultivatePlayfulness"], category: "entertainment" },

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEM & DEVICE
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "set an alarm for 7am", expectedTools: ["createAlarm", "setAlarm"], category: "system" },
  { query: "set a timer for 10 minutes", expectedTools: ["createTimer", "setTimer"], category: "system" },
  { query: "turn on do not disturb", expectedTools: ["setQuietHours", "notificationDetox", "phoneFreeTime"], category: "system" },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL & CONTACTS
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "add a new contact", expectedTools: ["manageContact", "saveContactInfo"], category: "social" },
  { query: "when is Sarah's birthday", expectedTools: ["getUpcomingBirthdays", "setBirthday", "manageContact"], category: "social" },
  { query: "post to LinkedIn", expectedTools: ["postToLinkedIn", "generateSocialContent", "postToTwitter"], category: "social" },

  // ═══════════════════════════════════════════════════════════════════════════
  // OPEN INTENT (Should route to __no_tool__)
  // ═══════════════════════════════════════════════════════════════════════════
  { query: "how are you doing today", expectedTools: ["__no_tool__"], category: "open_intent" },
  { query: "tell me about yourself", expectedTools: ["__no_tool__"], category: "open_intent" },
  { query: "I'm feeling stressed", expectedTools: ["__no_tool__", "deEscalateAnxiety", "calmingTechnique", "groundingExercise", "breatheWithMe"], category: "open_intent" },
  { query: "what do you think about AI", expectedTools: ["__no_tool__"], category: "open_intent" },
  { query: "good morning", expectedTools: ["__no_tool__", "morningBriefing", "getDailyBriefing"], category: "open_intent" },
];

// Results tracking
interface TestResult {
  query: string;
  category: string;
  passed: boolean;
  expectedTools: string[];
  actualTools: string[];
  topScore: number;
}

interface CategoryStats {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
}

interface RouterResult {
  tool: string;
  score: number;
}

// Try to load @ferni/perf OnnxRouter
async function createRouter(): Promise<((query: string) => RouterResult[]) | null> {
  const modelDir = path.resolve(process.cwd(), 'models/ferni-router-v5-860');

  // Check if model exists
  const modelPath = path.join(modelDir, 'model.onnx');
  const int8Path = path.join(modelDir, 'model_int8.onnx');

  if (!fs.existsSync(modelPath) && !fs.existsSync(int8Path)) {
    console.error(`❌ Model not found at: ${modelDir}`);
    console.error('   Run the Python validation instead:');
    console.error('   cd apps/ml-training/router && python validate.py');
    return null;
  }

  try {
    // Dynamic import of @ferni/perf
    const { OnnxRouter } = await import('@ferni/perf');

    const router = new OnnxRouter({
      modelPath: fs.existsSync(modelPath) ? modelPath : int8Path,
      tokenizerPath: path.join(modelDir, 'tokenizer.json'),
      labelMapPath: path.join(modelDir, 'label_map.json'),
      maxLength: 128,
      threshold: 0.01,
      topK: 5,
      numThreads: 0,
    });

    // Warmup
    router.warmup();
    console.log(`  ✅ OnnxRouter loaded (${router.getNumTools()} tools)\n`);

    return (query: string): RouterResult[] => {
      const result = router.predict(query);
      return result.predictions.map((p: { toolId: string; confidence: number }) => ({
        tool: p.toolId,
        score: p.confidence,
      }));
    };
  } catch (error) {
    console.error(`⚠️  @ferni/perf not available: ${error}`);
    console.error('   Rust bindings may not be built. Run the Python validation instead:');
    console.error('   cd apps/ml-training/router && python validate.py\n');
    return null;
  }
}

async function runValidation(verbose = false, categoryFilter?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  FTIS V5-860 Router Validation');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Test cases: ${TEST_CASES.length}`);
  console.log(`  Category filter: ${categoryFilter || 'all'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Try to create the router
  const router = await createRouter();
  if (!router) {
    process.exit(1);
  }

  const results: TestResult[] = [];
  const categoryStats: Record<string, CategoryStats> = {};

  // Filter test cases if category specified
  const testCases = categoryFilter
    ? TEST_CASES.filter(tc => tc.category === categoryFilter)
    : TEST_CASES;

  for (const testCase of testCases) {
    try {
      const routerResults = router(testCase.query);
      const topTools = routerResults.slice(0, 5).map(r => r.tool);
      const topScore = routerResults[0]?.score || 0;

      // Check if any expected tool is in top-5 results (exact match)
      const passed = testCase.expectedTools.some(expected =>
        topTools.includes(expected)
      );

      const result: TestResult = {
        query: testCase.query,
        category: testCase.category,
        passed,
        expectedTools: testCase.expectedTools,
        actualTools: topTools,
        topScore,
      };
      results.push(result);

      // Update category stats
      if (!categoryStats[testCase.category]) {
        categoryStats[testCase.category] = { passed: 0, failed: 0, total: 0, passRate: 0 };
      }
      categoryStats[testCase.category].total++;
      if (passed) {
        categoryStats[testCase.category].passed++;
      } else {
        categoryStats[testCase.category].failed++;
      }

      // Print result
      if (verbose || !passed) {
        const icon = passed ? '✅' : '❌';
        console.log(`${icon} [${testCase.category}] "${testCase.query}"`);
        if (!passed || verbose) {
          console.log(`   Expected: ${testCase.expectedTools.join(', ')}`);
          console.log(`   Actual:   ${routerResults.slice(0, 5).map(r => `${r.tool} (${r.score.toFixed(3)})`).join(', ') || '(no results)'}`);
        }
      } else if (passed) {
        process.stdout.write('.');
      }
    } catch (error) {
      console.error(`❌ Error testing "${testCase.query}": ${error}`);
      results.push({
        query: testCase.query,
        category: testCase.category,
        passed: false,
        expectedTools: testCase.expectedTools,
        actualTools: [],
        topScore: 0,
      });
    }
  }

  // Calculate final stats
  const totalPassed = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const passRate = (totalPassed / totalTests * 100).toFixed(1);

  // Calculate category pass rates
  for (const category of Object.keys(categoryStats)) {
    const stats = categoryStats[category];
    stats.passRate = stats.passed / stats.total * 100;
  }

  // Print summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Total: ${totalPassed}/${totalTests} passed (${passRate}%)`);
  console.log('');
  console.log('  By Category:');

  const sortedCategories = Object.entries(categoryStats)
    .sort((a, b) => b[1].passRate - a[1].passRate);

  for (const [category, stats] of sortedCategories) {
    const bar = '█'.repeat(Math.round(stats.passRate / 5)) + '░'.repeat(20 - Math.round(stats.passRate / 5));
    const icon = stats.passRate >= 80 ? '✅' : stats.passRate >= 60 ? '⚠️' : '❌';
    console.log(`  ${icon} ${category.padEnd(15)} ${bar} ${stats.passRate.toFixed(0)}% (${stats.passed}/${stats.total})`);
  }

  console.log('═══════════════════════════════════════════════════════════════════');

  // Print failures
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log(`\n  ❌ FAILURES (${failures.length}):`);
    for (const f of failures) {
      console.log(`     [${f.category}] "${f.query}"`);
      console.log(`       Expected: ${f.expectedTools.join(', ')}`);
      console.log(`       Got:      ${f.actualTools.join(', ')}`);
    }
  }

  // Exit with error code if pass rate is below threshold
  const PASS_THRESHOLD = 80;
  if (parseFloat(passRate) < PASS_THRESHOLD) {
    console.log(`\n❌ FAILED: Pass rate ${passRate}% is below threshold ${PASS_THRESHOLD}%`);
    process.exit(1);
  } else {
    console.log(`\n✅ PASSED: Pass rate ${passRate}% meets threshold ${PASS_THRESHOLD}%`);
  }
}

// Parse CLI args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const categoryIndex = args.findIndex(a => a === '--category' || a === '-c');
const categoryFilter = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;

// Run validation
runValidation(verbose, categoryFilter).catch(console.error);
