/**
 * Tool Call Text Sanitizer
 *
 * Detects and filters out malformed function-call-like text that Gemini
 * sometimes outputs instead of making actual function calls.
 *
 * ⚠️ MULTI-LAYER DEFENSE (Dec 2024):
 * Tool calling now has THREE layers of defense:
 *
 *   1. SEMANTIC ROUTER (src/tools/semantic-router/) - Pre-LLM routing
 *      - High confidence tool requests bypass LLM entirely
 *      - Never reaches this sanitizer if semantic router handles it
 *
 *   2. JSON FUNCTION CALLING (json-function-executor.ts) - LLM fallback
 *      - LLM outputs JSON like: {"fn":"playMusic","args":{"query":"jazz"}}
 *      - This sanitizer catches and executes that JSON
 *
 *   3. LEAKAGE SANITIZATION (this module) - Last line of defense
 *      - Catches any JSON that slips through to TTS
 *      - Detects "I'll call the playMusic function" style leaks
 *      - Suppresses leaked behavioral markers
 *
 * Examples of what we're catching:
 * - {"fn":"playMusic","args":{"query":"jazz"}} (our instructed format)
 * - "Play music query christmas music" (should be a playMusic() call)
 * - "I'll call the playMusic function" (should just call it)
 * - "Let me transfer you to Maya" (should call handoffToMaya)
 *
 * This is a defensive filter - the semantic router handles most cases,
 * but this catches any leakage from the JSON fallback path.
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  detectsToolCallLeakage as primingDetectsLeakage,
  generateRetryPrompt,
} from './conversation-priming.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';
// "Better than Human" semantic tool presence for emotion-aware feedback
import { startToolPresence } from '../../tools/execution/index.js';

// TransformStream is available globally in Node.js 18+
// Using loose type due to incompatibilities between Web Streams and Node.js streams in piping
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransformStream = any;

const log = createLogger({ module: 'tool-call-sanitizer' });

// ============================================================================
// TOOL DEDUPLICATION CACHE
// Prevents duplicate tool execution when semantic router already handled the tool
// ============================================================================

/**
 * Cache of recently executed tools per session.
 * Key: sessionId, Value: Map<toolId, timestamp>
 * 
 * When semantic router executes a tool with bypassLLM=true, it should call
 * `markToolExecutedBySemanticRouter()` to prevent the JSON workaround from
 * executing the same tool again.
 */
const recentlyExecutedTools = new Map<string, Map<string, number>>();

/** Time window (ms) to consider a tool as "recently executed" */
const DEDUP_WINDOW_MS = 5000; // 5 seconds

/**
 * Mark a tool as executed by the semantic router.
 * Call this after semantic router auto-executes a tool.
 */
export function markToolExecutedBySemanticRouter(sessionId: string, toolId: string): void {
  if (!sessionId) return;
  
  let sessionTools = recentlyExecutedTools.get(sessionId);
  if (!sessionTools) {
    sessionTools = new Map();
    recentlyExecutedTools.set(sessionId, sessionTools);
  }
  sessionTools.set(toolId.toLowerCase(), Date.now());
  
  log.debug(
    { sessionId, toolId },
    '🎯 Tool marked as executed by semantic router (dedup cache)'
  );
}

/**
 * Check if a tool was recently executed by the semantic router.
 * Returns true if we should SKIP execution (dedup).
 */
function wasRecentlyExecutedBySemanticRouter(sessionId: string | undefined, toolId: string): boolean {
  if (!sessionId) return false;
  
  const sessionTools = recentlyExecutedTools.get(sessionId);
  if (!sessionTools) return false;
  
  const executedAt = sessionTools.get(toolId.toLowerCase());
  if (!executedAt) return false;
  
  const elapsed = Date.now() - executedAt;
  if (elapsed < DEDUP_WINDOW_MS) {
    log.info(
      { sessionId, toolId, elapsedMs: elapsed, windowMs: DEDUP_WINDOW_MS },
      '🚫 DEDUP: Skipping JSON workaround execution - semantic router already handled this tool'
    );
    return true;
  }
  
  // Clean up expired entry
  sessionTools.delete(toolId.toLowerCase());
  return false;
}

/**
 * Clean up session from dedup cache (call on session end)
 */
export function clearToolDeduplicationForSession(sessionId: string): void {
  recentlyExecutedTools.delete(sessionId);
}

// ============================================================================
// GUIDANCE BLOCK STRIPPING
// ============================================================================

/**
 * CRITICAL FIX: Strip [INTERNAL GUIDANCE] blocks and everything after them.
 *
 * The LLM sometimes echoes back guidance blocks that were meant to inform
 * its response, not be spoken. This strips them from text before TTS.
 *
 * Pattern matches:
 * - [INTERNAL GUIDANCE] ... [DO: ...]
 * - [INTERNAL GUIDANCE - DO NOT SPEAK THIS] ...
 * - Everything from the marker to end of string
 *
 * @example
 * Input: "Hmm, that's interesting.\n[INTERNAL GUIDANCE]\nThe user said..."
 * Output: "Hmm, that's interesting."
 */
function stripGuidanceBlocks(text: string): string {
  // Pattern to match [INTERNAL ...] and everything after it
  // This catches: [INTERNAL GUIDANCE], [INTERNAL GUIDANCE - DO NOT SPEAK THIS], etc.
  const guidancePattern = /\n?\[INTERNAL[^\]]*\][\s\S]*$/i;

  // Also catch [SITUATION:...], [DO:...], [TOOL RESULT:...], [DATA:...] blocks
  const otherMarkers = /\n?\[(SITUATION|DO|TOOL RESULT|DATA):[^\]]*\][\s\S]*$/i;

  let result = text.replace(guidancePattern, '');
  result = result.replace(otherMarkers, '');

  // Trim trailing whitespace/newlines left behind
  result = result.trimEnd();

  if (result !== text) {
    log.info(
      {
        originalLength: text.length,
        strippedLength: result.length,
        preview: text.slice(0, 100),
      },
      '🛡️ GUIDANCE STRIPPED: Removed [INTERNAL GUIDANCE] block before TTS'
    );
  }

  return result;
}

/**
 * Check if text might have a guidance block coming (for look-ahead buffering).
 * Returns true if we see patterns that often precede guidance blocks.
 */
function mightHaveGuidanceComing(text: string): boolean {
  // If text ends with newline(s), guidance might follow
  if (/\n\s*$/.test(text)) {
    return true;
  }
  // If we see incomplete marker patterns
  if (/\[INTERNAL\s*$/.test(text) || /\[SITUATION\s*$/.test(text)) {
    return true;
  }
  // If text ends mid-sentence with certain patterns that precede guidance
  if (/\?\s*$/.test(text) || /\.\s*\n?$/.test(text)) {
    // These could be followed by guidance, but usually aren't
    // Only flag if we're at a suspiciously short length
    return text.length < 200;
  }
  return false;
}

// ============================================================================
// RETRY LOGIC FOR FAILED TOOL CALLS
// ============================================================================

/** Maximum number of retry attempts for tool call leakage */
const MAX_RETRY_ATTEMPTS = 2;

/** Session-scoped retry counters (weak map prevents memory leaks) */
const retryCounters = new WeakMap<object, Map<string, number>>();

/**
 * Get or create retry counter for a session.
 * Uses WeakMap to automatically cleanup when session is garbage collected.
 */
function getRetryCounter(session: object): Map<string, number> {
  if (!retryCounters.has(session)) {
    retryCounters.set(session, new Map());
  }
  return retryCounters.get(session)!;
}

/**
 * Analyze a response for tool call leakage and determine if retry is warranted.
 *
 * This combines detection from both systems:
 * 1. tool-call-sanitizer detection (comprehensive pattern matching)
 * 2. conversation-priming detection (behavioral pattern matching)
 *
 * @param response - The LLM response text
 * @param session - Session object for tracking retries (can be any object)
 * @param originalMessage - Original user message (for retry prompt generation)
 * @returns Retry information or null if no retry needed
 */
export function analyzeForRetry(
  response: string,
  session: object,
  originalMessage: string
): {
  shouldRetry: boolean;
  retryPrompt: string | null;
  suggestedTool: string | null;
  pattern: string | null;
  attempt: number;
} | null {
  // First check with our comprehensive detection
  const sanitizerDetection = detectsFunctionCallLeakage(response);

  // Also check with priming detection (behavioral patterns)
  const primingDetection = primingDetectsLeakage(response);

  const isLeakage = sanitizerDetection.detected || primingDetection.isLeakage;

  if (!isLeakage) {
    // Reset retry counter on successful response
    const counter = getRetryCounter(session);
    counter.delete(originalMessage);
    return null;
  }

  // Determine the suggested tool from whichever detector found it
  const suggestedTool = sanitizerDetection.toolName || primingDetection.suggestedTool;
  const pattern = sanitizerDetection.pattern || primingDetection.pattern;

  // Get retry counter for this session and message
  const counter = getRetryCounter(session);
  const messageKey = originalMessage.toLowerCase().trim();
  const currentAttempt = (counter.get(messageKey) || 0) + 1;

  log.info(
    {
      response: response.slice(0, 100),
      suggestedTool,
      pattern,
      attempt: currentAttempt,
      maxAttempts: MAX_RETRY_ATTEMPTS,
    },
    '🔄 RETRY ANALYSIS: Leakage detected, evaluating retry'
  );

  // Check if we've exceeded retry attempts
  if (currentAttempt > MAX_RETRY_ATTEMPTS) {
    log.warn(
      { originalMessage: originalMessage.slice(0, 50), attempts: currentAttempt },
      '🔄 RETRY: Max attempts exceeded, not retrying'
    );
    // Reset counter to prevent blocking future attempts
    counter.delete(messageKey);
    return {
      shouldRetry: false,
      retryPrompt: null,
      suggestedTool,
      pattern,
      attempt: currentAttempt,
    };
  }

  // Update counter
  counter.set(messageKey, currentAttempt);

  // Generate retry prompt
  const retryPrompt = generateRetryPrompt(originalMessage, suggestedTool, currentAttempt);

  log.info(
    {
      attempt: currentAttempt,
      suggestedTool,
      retryPromptPreview: retryPrompt.slice(0, 80),
    },
    '🔄 RETRY: Generating retry prompt for failed tool call'
  );

  return {
    shouldRetry: true,
    retryPrompt,
    suggestedTool,
    pattern,
    attempt: currentAttempt,
  };
}

/**
 * Clear retry counter for a session (call on session end).
 */
export function clearRetryCounter(session: object): void {
  retryCounters.delete(session);
  log.debug('🔄 RETRY: Cleared retry counter for session');
}

/**
 * Known tool names that might leak into spoken output.
 * Add new tool names here as they're created.
 *
 * NOTE: We use case-insensitive matching for most patterns, so only need
 * the camelCase version. Multiple casings only for common spoken forms.
 */
const TOOL_NAME_PATTERNS = [
  // Speak pseudo-tool (dynamic silence responses)
  // These generate text that should be spoken directly via session.say()
  'speak',
  'say',
  'dynamicResponse',
  'dynamicresponse',

  // Music tools
  'playMusic',
  'play music',
  'Play music',
  'Playing music', // Gerund form - "Playing music query"
  'playing music',
  'searchMusic',
  'search music',
  'Searching music',
  'searching music',
  'musicControl',
  'music control',
  'musicInfo',
  'music info',
  'searchAppleMusic',
  'pauseMusic',
  'pause music',
  'Pausing music',
  'resumeMusic',
  'resume music',
  'stopMusic',
  'stop music',
  'skipMusic',
  'skip music',
  'nextSong',
  'next song',
  'skipSong',
  'skip song',
  'whatsPlaying',
  'whats playing',

  // Memory tools
  'rememberAboutUser',
  'remember about user',
  'rememberName',
  'recallFromMemory',
  'recall from memory',
  'forgetMemory',
  'updateMemory',
  'getRelationshipSummary',
  'get relationship summary',
  'reinforceMemory',
  'reinforce memory',

  // Information tools
  'getWeather',
  'get weather',
  'getWeatherForecast',
  'searchNews',
  'search news',
  'getNews',
  'getCurrentTime',
  'get current time',
  'getMarketSummary',

  // Handoff tools
  'handoffTo',
  'handoff to',
  'transferTo',
  'transfer to',
  'handoffToMaya',
  'handoffToAlex',
  'handoffToPeter',
  'handoffToJordan',
  'handoffToNayan',
  'handoffToFerni',

  // Crisis/Wellness tools (CRITICAL - must not leak)
  'getCrisisResources',
  'get crisis resources',
  'groundingExercise',
  'grounding exercise',
  'performBreathingExercise',
  'breathing exercise',
  'getEmergencyServices',
  'getCrisisHotlines',
  'logMood',
  'getMoodHistory',

  // Habit/Productivity tools
  'addHabit',
  'add habit',
  'createHabit',
  'trackHabit',
  'logHabitCompletion',
  'completeHabit',
  'skipHabit',
  'deleteHabit',
  'updateHabit',
  'getHabits',
  'getHabitStats',
  'getHabitStreak',
  'setTimer',
  'set timer',
  'getTimer',
  'cancelTimer',
  'addTask',
  'getTasks',
  'completeTask',

  // Notes/Journal tools
  'saveNote',
  'getNotes',
  'journal',

  // Calendar/Scheduling tools
  'scheduleEvent',
  'schedule event',
  'scheduleReminder',
  'getCalendarToday',
  'createCalendarEvent',
  'createAppointment',
  'manageAppointment',
  'getEvents',
  'cancelEvent',
  'updateEvent',
  'addGuests',

  // Scheduling domain tools (SMS, calls, emails)
  'scheduleMessage',
  'schedule message',
  'Schedule message',
  'scheduleText',
  'schedule text',
  'Schedule text',
  'scheduleCall',
  'schedule call',
  'Schedule call',
  'scheduleEmail',
  'schedule email',
  'Schedule email',
  'sendMessageNow',
  'send message now',
  'sendTextNow',
  'send text now',
  'listScheduled',
  'list scheduled',
  'getScheduled',
  'get scheduled',
  'cancelScheduled',
  'cancel scheduled',
  'cancelReminder',
  'cancel reminder',
  'saveContactInfo',
  'save contact info',
  'saveContact',
  'save contact',
  'addContact',
  'add contact',

  // Intelligent scheduling tools (ML-based optimal timing)
  'getOptimalSendTime',
  'get optimal send time',
  'Get optimal send time',
  'optimal send time',
  'best time to reach',
  'Best time to reach',
  'bestTimeToReach',
  'when to reach',
  'When to reach',
  'scheduleAtBestTime',
  'schedule at best time',
  'Schedule at best time',
  'schedule at optimal time',
  'Schedule at optimal time',
  'text at best time',
  'Text at best time',
  'send at best time',
  'Send at best time',
  'email at best time',
  'Email at best time',
  'call at best time',
  'Call at best time',
  'optimal timing',
  'Optimal timing',
  'when they respond',
  'When they respond',

  // Unified outreach (Better than Human - auto-selects channel)
  'reachOut',
  'reach out',
  'Reach out',
  'reaching out',
  'Reaching out',
  
  // Telephony tools (phone calls)
  'makePhoneCall',
  'make phone call',
  'Make phone call',
  'callContact',
  'call contact',
  'Call contact',
  'callUser',
  'call user',
  // Conversational calls (Ferni has real 1:1 conversations)
  'callAndConverse',
  'call and converse',
  'Call and converse',
  'haveFerniCall',
  'have ferni call',
  'Have ferni call',
  'callForConversation',
  'call for conversation',
  'Call for conversation',
  'talkTo',
  'talk to',
  'Talk to',
  'haveConversationWith',
  'have conversation with',

  // Communication tools
  'sendMessage',
  'send message',
  'Send message',
  'sendText',
  'send text',
  'Send text',
  'sendSMS',
  'send SMS',
  'Send SMS',
  'text message',
  'sendEmail',
  'send email',
  'Send email',
  'sendVoiceMessage',
  'send voice message',
  'Send voice message',
  'voice message',
  'draftMessage',
  'analyzeMessage',

  // Finance tools
  'getQuote',
  'getMarketStatus',
  'getBudgetSummary',
  'trackExpense',
  'payBill',
  'addBill',
  'getBills',
  'calculateTip',

  // Goal/Planning tools
  'addGoal',
  'updateGoal',
  'getGoals',
  'addGoalMilestone',
  'setFinancialGoal',
  'lifePortfolioReview',
  'predictionMarket',

  // Shopping/Packages tools
  'shoppingList',
  'trackPackage',
  'getPackages',

  // Travel tools
  'searchFlights',
  'searchHotels',
  'planTrip',

  // Medication tools
  'manageMedication',
  'medicationSchedule',

  // Smart Home tools
  'controlLight',
  'setThermostat',
  'activateScene',
  'controlLock',
  'getHomeStatus',

  // Game tools
  'startGame',
  'submitGameAnswer',
  'getGameHint',
  'skipGameRound',
  'endGame',
  'getGameStatus',
  'suggestGame',
  'startTextGame',
  'makeTextGameMove',
  'getTextGameBoard',
  'endTextGame',
  'inboxZeroChallenge',
  'sundayPrepGame',
  'compoundInterestGame',
  'paradoxOfTheDay',
  'questionBeneath',

  // Presence/Mode tools
  'shiftMode',
  'processing',
  'holdSpace',
  'wrapUpConversation',

  // Conversation tools
  'noteEmotionalState',
  'shareStory',
  'endConversation',
  'gracefulExit',

  // Cameo tools
  'inviteCameo',
  'completeCameo',

  // Voice Memos tools
  'saveVoiceMemo',
  'save voice memo',
  'listVoiceMemos',
  'list voice memos',
  'recallVoiceMemo',
  'recall voice memo',
  'deleteVoiceMemo',
  'delete voice memo',
  'searchVoiceMemos',
  'search voice memos',

  // SMS / Text Messages tools
  'readSMS',
  'read SMS',
  'read sms',
  'checkNewMessages',
  'check new messages',
  'searchMessages',
  'search messages',

  // Telephony tools (phone calls)
  'callOnBehalf',
  'call on behalf',
  'calling on behalf',
  'makeCall',
  'make call',
  'making call',

  // Scheduling tools (scheduled messages, calls, emails)
  'scheduleMessage',
  'schedule message',
  'Schedule message',
  'scheduleText',
  'schedule text',
  'Schedule text',
  'scheduleCall',
  'schedule call',
  'Schedule call',
  'scheduleEmail',
  'schedule email',
  'Schedule email',
  'sendMessageNow',
  'send message now',
  'sendTextNow',
  'send text now',
  'listScheduled',
  'list scheduled',
  'getScheduled',
  'cancelScheduled',
  'cancel scheduled',
  'saveContact',
  'save contact',
  'saveContactInfo',
  'save contact info',
  'addContact',
  'add contact',

  // Concierge tools (AI-powered outreach)
  'requestHotelQuotes',
  'request hotel quotes',
  'Request hotel quotes',
  'hotel quotes',
  'Hotel quotes',
  'get hotel rates',
  'Get hotel rates',
  'find hotels',
  'Find hotels',
  'makeRestaurantReservation',
  'make restaurant reservation',
  'Make restaurant reservation',
  'restaurant reservation',
  'Restaurant reservation',
  'book a table',
  'Book a table',
  'make a reservation',
  'Make a reservation',
  'scheduleHealthcareAppointment',
  'schedule healthcare appointment',
  'Schedule healthcare appointment',
  'healthcare appointment',
  'Healthcare appointment',
  'schedule dentist',
  'Schedule dentist',
  'schedule doctor',
  'Schedule doctor',
  'find a doctor',
  'Find a doctor',
  'find a dentist',
  'Find a dentist',
  'getServiceQuotes',
  'get service quotes',
  'Get service quotes',
  'service quotes',
  'Service quotes',
  'find a plumber',
  'Find a plumber',
  'find an electrician',
  'Find an electrician',
  'get quotes',
  'Get quotes',
  'checkConciergeStatus',
  'check concierge status',
  'Check concierge status',
  'concierge status',
  'Concierge status',
  'check on my request',
  'Check on my request',
  'status of my reservation',
  'Status of my reservation',

  // ============================================================================
  // UNTESTED DOMAIN PATTERNS (Added Dec 2024 for E2E reliability)
  // These domains were identified in the E2E Tool Calling Audit as lacking patterns
  // ============================================================================

  // Ambient Mode tools
  'startAmbientMode',
  'start ambient mode',
  'ambient mode',
  'enable ambient',
  'Enable ambient',
  'background listening',
  'Background listening',
  'always listening',
  'Always listening',

  // Anger/Emotion regulation tools
  'processAnger',
  'process anger',
  'anger management',
  'Anger management',
  'I am angry',
  'I am frustrated',
  'feeling angry',
  'Feeling angry',
  'calm down',
  'Calm down',

  // Anxiety tools
  'manageAnxiety',
  'manage anxiety',
  'anxiety relief',
  'Anxiety relief',
  'feeling anxious',
  'Feeling anxious',
  'panic attack',
  'Panic attack',
  'anxious thoughts',
  'Anxious thoughts',

  // Boundaries tools
  'setBoundary',
  'set boundary',
  'setting boundaries',
  'Setting boundaries',
  'boundary check',
  'Boundary check',
  'healthy boundaries',
  'Healthy boundaries',

  // Breathwork tools
  'startBreathwork',
  'start breathwork',
  'breathing exercise',
  'Breathing exercise',
  'box breathing',
  'Box breathing',
  'deep breathing',
  'Deep breathing',
  'breath work',
  'Breath work',

  // Burnout tools
  'assessBurnout',
  'assess burnout',
  'burnout check',
  'Burnout check',
  'feeling burned out',
  'Feeling burned out',
  'exhausted',
  'Exhausted',
  'overwhelmed',
  'Overwhelmed',

  // Coaching/Support tools
  'getCoaching',
  'get coaching',
  'coaching session',
  'Coaching session',
  'life coaching',
  'Life coaching',
  'support session',
  'Support session',

  // Dating tools
  'datingAdvice',
  'dating advice',
  'relationship advice',
  'Relationship advice',
  'dating tips',
  'Dating tips',
  'dating help',
  'Dating help',

  // Gratitude tools
  'logGratitude',
  'log gratitude',
  'gratitude journal',
  'Gratitude journal',
  'grateful for',
  'Grateful for',
  'thankful for',
  'Thankful for',
  'gratitude practice',
  'Gratitude practice',

  // Grounding tools
  'groundingExercise',
  'grounding exercise',
  '5 4 3 2 1',
  'grounding technique',
  'Grounding technique',
  'feel grounded',
  'Feel grounded',
  'anchor myself',
  'Anchor myself',

  // Human Transfer tools
  'transferToHuman',
  'transfer to human',
  'speak to a human',
  'Speak to a human',
  'talk to a person',
  'Talk to a person',
  'human support',
  'Human support',
  'real person',
  'Real person',

  // Intimacy tools
  'intimacyTips',
  'intimacy tips',
  'intimacy advice',
  'Intimacy advice',
  'relationship intimacy',
  'Relationship intimacy',

  // Life Planning tools
  'createLifePlan',
  'create life plan',
  'life planning',
  'Life planning',
  'life goals',
  'Life goals',
  'future planning',
  'Future planning',
  'five year plan',
  'Five year plan',

  // Mindfulness tools
  'startMindfulness',
  'start mindfulness',
  'mindfulness exercise',
  'Mindfulness exercise',
  'be present',
  'Be present',
  'mindful moment',
  'Mindful moment',
  'meditation',
  'Meditation',

  // Purpose/Meaning tools
  'explorePurpose',
  'explore purpose',
  'find my purpose',
  'Find my purpose',
  'life purpose',
  'Life purpose',
  'meaning of life',
  'Meaning of life',
  'what is my purpose',
  'What is my purpose',

  // Sleep tools
  'improveSleep',
  'improve sleep',
  'sleep better',
  'Sleep better',
  'sleep hygiene',
  'Sleep hygiene',
  'insomnia',
  'Insomnia',
  'cant sleep',
  'Can not sleep',
  'trouble sleeping',
  'Trouble sleeping',

  // Stress tools
  'manageStress',
  'manage stress',
  'stress relief',
  'Stress relief',
  'feeling stressed',
  'Feeling stressed',
  'under pressure',
  'Under pressure',
  'stressed out',
  'Stressed out',

  // Trust tools
  'buildTrust',
  'build trust',
  'trust issues',
  'Trust issues',
  'trusting others',
  'Trusting others',

  // Visual Memory tools
  'saveVisualMemory',
  'save visual memory',
  'remember this image',
  'Remember this image',
  'visual note',
  'Visual note',
  'picture memory',
  'Picture memory',

  // Voice Log tools
  'createVoiceLog',
  'create voice log',
  'voice diary',
  'Voice diary',
  'audio journal',
  'Audio journal',
  'record my thoughts',
  'Record my thoughts',

  // World Awareness tools
  'getWorldContext',
  'get world context',
  'world news',
  'World news',
  'current events',
  'Current events',
  'whats happening',
  'What is happening',
];

/**
 * Parameter names that indicate function call leakage.
 */
const PARAM_PATTERNS = ['query', 'Query', 'search', 'Search', 'input', 'Input', 'text', 'Text'];

/**
 * Phrases that indicate Gemini is TALKING ABOUT calling a function
 * instead of actually calling it.
 */
const TOOL_CALL_ANNOUNCEMENT_PATTERNS = [
  // "I'll call/use the X function/tool"
  /i(?:'ll| will) (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)(?: function| tool)?/i,
  // "Let me call/use X"
  /let me (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  // "I'm going to call/use X"
  /i(?:'m| am) going to (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  // "I need to call/use X"
  /i need to (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  // "Calling X" or "Using X tool"
  /^(?:calling|using|invoking|executing|running|triggering) (?:the )?(\w+)/i,
  // "I'll transfer you to X" / "Let me transfer you to X"
  /(?:i(?:'ll| will)|let me) transfer (?:you )?to (\w+)/i,
  // "Transferring to X" / "Transferring you to X"
  /transferring (?:you )?to (\w+)/i,
  // "I'll connect you with X"
  /(?:i(?:'ll| will)|let me) connect you (?:with|to) (\w+)/i,
  // "Connecting you with/to X"
  /connecting you (?:with|to) (\w+)/i,
  // "I'll hand you off to X"
  /(?:i(?:'ll| will)|let me) hand (?:you )?off to (\w+)/i,
  // "I'm going to hand you off to X"
  /i(?:'m| am) going to hand (?:you )?off to (\w+)/i,
  // "Handing you off to X"
  /handing (?:you )?off to (\w+)/i,
  // "I'll get X to help" (team member names)
  /(?:i(?:'ll| will)|let me) get (\w+) to help/i,
  // Function call syntax: "functionName(args)" or "functionName()"
  /(\w+)\s*\([^)]*\)/,
  // JSON-like: {"function": "X", ...} or {"name": "X", ...}
  /\{\s*"(?:function|name|tool)":\s*"(\w+)"/i,
  // "The X function" or "the X tool" when describing what to do
  /(?:use|call|invoke|execute) the (\w+) (?:function|tool)/i,
  // NEW (Dec 2024): Gemini Live API specific patterns
  // "[call X with Y]" or "[call X with query Y]"
  /\[(?:silently )?calls? (\w+)(?: with (?:query )?["']?[^"\]]+["']?)?\]/i,
  // "silently calls X with query Y" (without brackets)
  /silently calls? (\w+)(?: with (?:query )?["']?[^"]+["']?)?/i,
  // "[silently calls X]" or "silently calls X"
  /(?:\[)?silently (?:call|calls|calling) (\w+)(?:\])?/i,
];

/**
 * Team member names that indicate handoff announcements
 */
const TEAM_MEMBER_NAMES = ['maya', 'alex', 'peter', 'jordan', 'nayan'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Result type for tool call detection */
interface LeakageDetection {
  detected: boolean;
  toolName?: string;
  parameter?: string;
  value?: string;
  pattern?: string;
}

// ============================================================================
// JSON FUNCTION CALL DETECTION (Our instructed format)
// ============================================================================

/** Result type for JSON function call detection */
interface JsonFunctionCall {
  fn: string;
  args: Record<string, unknown>;
}

/**
 * Extract a balanced JSON object starting from a given position.
 * Handles nested braces properly.
 */
function extractBalancedJson(text: string, startIndex: number): string | null {
  if (text[startIndex] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }
  }

  return null; // Unbalanced braces
}

/**
 * Detect our instructed JSON format: {"fn":"playMusic","args":{"query":"jazz"}}
 * Also handles markdown-wrapped JSON: ```json\n{...}\n```
 * Now handles nested args objects properly with balanced brace matching.
 * Returns the parsed call if found, null otherwise.
 */
function detectJsonFunctionCall(text: string): JsonFunctionCall | null {
  // First, strip markdown code fences if present
  // Handles: ```json\n{...}\n``` or ```\n{...}\n```
  let cleanText = text;

  // Remove markdown code fences
  const markdownMatch = text.match(/```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/i);
  if (markdownMatch) {
    cleanText = markdownMatch[1];
    log.debug(
      { original: text.slice(0, 50), cleaned: cleanText.slice(0, 50) },
      '📝 Stripped markdown code fence'
    );
  }

  // STRATEGY 1: Find "fn" and extract the complete JSON object with balanced braces
  // This handles nested args like {"fn":"tool","args":{"nested":{"key":"value"}}}
  const fnMatch = cleanText.match(/"fn"\s*:\s*"(\w+)"/);
  if (fnMatch) {
    // Find the opening brace before "fn"
    const fnIndex = fnMatch.index!;
    const braceIndex = cleanText.lastIndexOf('{', fnIndex);

    if (braceIndex !== -1) {
      const jsonStr = extractBalancedJson(cleanText, braceIndex);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
          if (
            typeof parsed.fn === 'string' &&
            typeof parsed.args === 'object' &&
            parsed.args !== null
          ) {
            log.info(
              { fn: parsed.fn, args: parsed.args, method: 'balanced-brace' },
              '🎯 JSON function call detected (balanced brace extraction)'
            );
            return { fn: parsed.fn, args: parsed.args as Record<string, unknown> };
          }
        } catch (parseErr) {
          log.debug(
            { error: String(parseErr), jsonStr: jsonStr.slice(0, 100) },
            '🔧 Balanced brace extraction found invalid JSON, trying fallback'
          );
        }
      }
    }
  }

  // STRATEGY 2 (FALLBACK): Simple regex for flat args objects
  // This is faster but only works with non-nested args
  const jsonMatch = cleanText.match(
    /\{\s*"?fn"?\s*:\s*"(\w+)"\s*,\s*"?args"?\s*:\s*(\{[^}]*\})\s*\}/i
  );
  if (jsonMatch) {
    try {
      const fn = jsonMatch[1];
      const argsStr = jsonMatch[2];
      const args = JSON.parse(argsStr) as Record<string, unknown>;
      log.info(
        { fn, args, method: 'simple-regex' },
        '🎯 JSON function call detected in text stream'
      );
      return { fn, args };
    } catch {
      // Fall through to loose match
    }
  }

  // STRATEGY 3 (LAST RESORT): More permissive match for split chunks
  const looseMatch = cleanText.match(/"fn"\s*:\s*"(\w+)".*"args"\s*:\s*(\{[^}]*\})/is);
  if (looseMatch) {
    try {
      const fn = looseMatch[1];
      const argsStr = looseMatch[2];
      const args = JSON.parse(argsStr) as Record<string, unknown>;
      log.info({ fn, args, method: 'loose-match' }, '🎯 JSON function call detected (loose match)');
      return { fn, args };
    } catch {
      return null;
    }
  }

  // Log when we don't detect JSON (helps diagnose failures)
  if (cleanText.includes('"fn"') || cleanText.includes('"args"')) {
    log.debug(
      { text: cleanText.slice(0, 150) },
      '🔍 Text contains fn/args but no valid JSON detected - may be partial'
    );
  }

  return null;
}

/** Result from tool execution */
interface ToolExecutionResult {
  success: boolean;
  fn: string;
  result?: unknown;
  error?: string;
  /** If true, result should be spoken directly via session.say() (no LLM summarization) */
  speakDirectly?: boolean;
  /** If true, execution was skipped because semantic router already handled this tool */
  skippedDueToDedupe?: boolean;
  /** If true, execution was blocked because user was asking a question, not making a request */
  blockedDueToQuestion?: boolean;
}

// ============================================================================
// HIGH-RISK TOOL PROTECTION
// ============================================================================

/**
 * Tools that should NOT execute when the user is asking a question.
 * These are high-risk actions that could have unintended consequences.
 */
const HIGH_RISK_TOOLS = new Set([
  'makephonecall',
  'callandconverse',
  'callonbehalf',
  'calluser',
  'callcontact',
  'schedulecall',
  'sendtext',
  'sendsms',
  'sendmessage',
  'sendemail',
  'paybill',
  'transfermoney',
  'schedulemessage',
  'sendemailnow',
  'sendtextnow',
]);

/**
 * Patterns that indicate the user is asking a QUESTION about a past action,
 * not requesting a new action. These should block high-risk tool execution.
 */
const QUESTION_PATTERNS = [
  // "Did you X?" questions
  /^(?:did|have|has|had)\s+(?:you|ferni)\s+(?:already\s+)?(?:call|text|email|message|send|pay)/i,
  // "Was it X?" questions  
  /^(?:was|were|is)\s+(?:that|it|the)\s+(?:call|text|email|message|payment)/i,
  // Questions about what happened
  /(?:what|who|when|where|how)\s+did\s+(?:you|ferni)\s+(?:call|text|email|message|send)/i,
  // Questioning a recent action
  /(?:you\s+)?(?:already|just)\s+(?:called|texted|emailed|messaged|sent|paid)\s*\??/i,
  // "Did you X my Y?" pattern (e.g., "did you call my mom?")
  /did\s+you\s+(?:call|text|email|contact|message|reach)\s+(?:my|the)\s+/i,
];

/**
 * Check if text appears to be a question about a past action.
 * Used to prevent accidental tool execution when user asks "did you call my mom?"
 */
function isQuestionAboutPastAction(text: string): boolean {
  if (!text) return false;
  
  const normalized = text.trim().toLowerCase();
  
  // Ends with question mark - strong signal
  const hasQuestionMark = normalized.endsWith('?');
  
  // Check against question patterns
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  
  // Additional heuristic: starts with question words + "you" near "call/text/etc"
  if (hasQuestionMark) {
    const hasQuestionWord = /^(?:did|have|has|was|were|what|who|when|where|how|why)\b/.test(normalized);
    const hasActionWord = /\b(?:call|text|email|message|send|pay|contact)\b/.test(normalized);
    if (hasQuestionWord && hasActionWord) {
      return true;
    }
  }
  
  return false;
}

/**
 * Execute a tool based on the JSON function call we detected.
 * This is the workaround for Gemini not making proper function calls.
 *
 * Routes to the general-purpose json-function-executor for comprehensive tool support.
 * Returns the result so it can be spoken via TTS.
 *
 * IMPORTANT: This is the JSON WORKAROUND path - called when LLM outputs JSON.
 * The semantic router handles high-confidence calls directly; this is for fallback.
 */
async function executeJsonFunctionCall(
  call: JsonFunctionCall,
  sessionId?: string,
  userId?: string,
  personaId?: string,
  originalTranscript?: string
): Promise<ToolExecutionResult | null> {
  try {
    // 🛡️ HIGH-RISK TOOL PROTECTION: Block execution if user was asking a question
    // Prevents "did you call my mom?" from triggering an actual phone call
    const toolNameLower = call.fn.toLowerCase();
    if (HIGH_RISK_TOOLS.has(toolNameLower)) {
      // Check if we have transcript context suggesting this was a question
      if (originalTranscript && isQuestionAboutPastAction(originalTranscript)) {
        log.warn(
          { fn: call.fn, transcript: originalTranscript.slice(0, 100), sessionId },
          '🛡️ HIGH-RISK TOOL BLOCKED: User appears to be asking a question, not making a request'
        );
        return {
          success: false,
          fn: call.fn,
          result: "I think you're asking about something I did - let me clarify what happened.",
          error: 'Blocked: User was asking a question, not making a request',
          blockedDueToQuestion: true,
        };
      }
      
      // Also check the args for question patterns (LLM sometimes puts transcript there)
      const argsText = JSON.stringify(call.args);
      if (isQuestionAboutPastAction(argsText)) {
        log.warn(
          { fn: call.fn, args: call.args, sessionId },
          '🛡️ HIGH-RISK TOOL BLOCKED: Args suggest this was a question'
        );
        return {
          success: false,
          fn: call.fn,
          result: "I think you're asking about something - what would you like to know?",
          error: 'Blocked: Args contain question pattern',
          blockedDueToQuestion: true,
        };
      }
    }

    // 🚫 DEDUPLICATION CHECK: Skip if semantic router already executed this tool
    // This prevents the race condition where:
    // 1. Semantic router executes tool (bypassLLM=true)
    // 2. LLM (running in parallel) also outputs JSON for the same tool
    // 3. JSON workaround would execute the tool AGAIN
    if (wasRecentlyExecutedBySemanticRouter(sessionId, call.fn)) {
      log.info(
        { fn: call.fn, sessionId },
        '🚫 JSON WORKAROUND SKIPPED: Tool already executed by semantic router'
      );
      return {
        success: true,
        fn: call.fn,
        result: '[Tool already executed by semantic router]',
        skippedDueToDedupe: true,
      };
    }

    // Record JSON workaround execution for observability
    if (sessionId) {
      void (async () => {
        try {
          const { recordJsonWorkaroundExecution } =
            await import('../../tools/semantic-router/integration/routing-observability.js');
          recordJsonWorkaroundExecution(sessionId, userId || 'anonymous', call.fn);
        } catch {
          // Non-critical
        }
      })();
    }

    log.info(
      { fn: call.fn, sessionId },
      '🔄 JSON WORKAROUND: Executing tool via LLM JSON output (semantic router did not handle)'
    );

    // 🎯 "Better than Human": Start semantic tool presence tracking
    // This enables emotion-aware feedback during tool execution
    if (sessionId) {
      startToolPresence({
        toolName: call.fn,
        sessionId,
        userId: userId || 'anonymous',
        personaId: personaId || 'ferni',
        startTime: Date.now(),
        // userEmotion will be detected from session state if available
      });
    }

    // Use the general-purpose executor with context
    const { executeJsonFunction } = await import('./json-function-executor.js');
    // Add 'raw' field expected by the executor
    const result = await executeJsonFunction(
      { ...call, raw: JSON.stringify(call) },
      {
        sessionId,
        userId,
        personaId: personaId || 'ferni',
      }
    );
    return {
      success: result.success,
      fn: call.fn,
      result: result.result,
      error: result.error,
      // Pass through speakDirectly flag for pseudo-tools like "speak"
      speakDirectly: result.speakDirectly,
    };
  } catch (err) {
    log.error(
      { fn: call.fn, args: call.args, error: String(err) },
      '❌ Failed to execute JSON function call'
    );
    return { success: false, fn: call.fn, error: String(err) };
  }
}

/** Check if a name matches known tools or team members */
function isKnownToolOrTeamMember(name: string): boolean {
  const lowerName = name.toLowerCase();
  const isKnownTool = TOOL_NAME_PATTERNS.some(
    (t) => t.toLowerCase() === lowerName || t.toLowerCase().includes(lowerName)
  );
  return isKnownTool || TEAM_MEMBER_NAMES.includes(lowerName);
}

/** Check for announcement patterns like "I'll call the X function" */
function checkAnnouncementPatterns(text: string): LeakageDetection | null {
  for (const pattern of TOOL_CALL_ANNOUNCEMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && isKnownToolOrTeamMember(match[1])) {
      return { detected: true, toolName: match[1], pattern: 'announcement' };
    }
  }
  return null;
}

/** Check for intention patterns like "I'll play jazz for you" */
function checkIntentionPatterns(text: string): LeakageDetection | null {
  const intentionPatterns = [
    /i(?:'ll| will) (?:play|find|search for|look up|get|fetch) (?:some )?(.+?) (?:for you|now)/i,
    /let me (?:play|find|search for|look up|get|fetch) (?:some )?(.+?) (?:for you)?/i,
    // "Playing X now" pattern - catches "Playing 'Bohemian Rhapsody' now"
    /^playing\s+['"]?([^'"]+?)['"]?\s*(?:now|for you)/i,
    // "Playing some X" pattern
    /^playing\s+(?:some\s+)?['"]?([^'"]+?)['"]?\s*$/i,
    // Memory-related announcements (CRITICAL - these leak frequently)
    /i(?:'ll| will| want to| need to) (?:store|save|remember|note|record) (?:that|this|a memory|the memory)/i,
    /let me (?:store|save|remember|note|record) (?:that|this|a memory|the memory)/i,
    /i(?:'m| am) going to (?:store|save|remember|note|record) (?:that|this)/i,
    /(?:storing|saving|remembering|noting|recording) (?:that|this|a memory)/i,
    /i want to (?:store|save|remember) (?:that|this|a memory|the fact)/i,
  ];

  for (const pattern of intentionPatterns) {
    const match = text.match(pattern);
    if (match?.[1] && text.length < 80) {
      return {
        detected: true,
        toolName: 'implied_tool_call',
        value: match[1],
        pattern: 'intention',
      };
    }
  }
  return null;
}

/** Check for "toolName paramName value" pattern */
function checkToolParamPattern(lowerText: string): LeakageDetection | null {
  for (const toolPattern of TOOL_NAME_PATTERNS) {
    const lowerPattern = toolPattern.toLowerCase();
    if (!lowerText.startsWith(lowerPattern)) continue;

    const remainder = lowerText.slice(lowerPattern.length).trim();
    for (const paramPattern of PARAM_PATTERNS) {
      if (remainder.startsWith(paramPattern.toLowerCase())) {
        const value = remainder.slice(paramPattern.length).trim();
        return {
          detected: true,
          toolName: toolPattern,
          parameter: paramPattern,
          value: value || undefined,
          pattern: 'tool_param',
        };
      }
    }
  }
  return null;
}

/** Check for tool names with "function" or "tool" suffix */
function checkToolMentionPattern(text: string): LeakageDetection | null {
  for (const toolPattern of TOOL_NAME_PATTERNS) {
    const regex = new RegExp(
      `\\b${toolPattern.replace(/\s+/g, '\\s*')}\\s*(?:function|tool)\\b`,
      'i'
    );
    if (regex.test(text)) {
      return { detected: true, toolName: toolPattern, pattern: 'tool_mention' };
    }
  }
  return null;
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Check if text looks like a malformed function call.
 *
 * Patterns we detect:
 * - "functionName paramName value" (e.g., "playMusic query jazz")
 * - "I'll call the X function" announcements
 * - "Transferring you to Maya" handoff announcements
 * - Function call syntax like functionName() or JSON-like patterns
 * - [INTERNAL: ...] tool response markers that shouldn't be spoken
 */
export function detectsFunctionCallLeakage(text: string): LeakageDetection {
  const trimmed = text.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // 0. CRITICAL: Check for behavioral instruction markers - these should NEVER be spoken
  // Patterns: [INTERNAL ...], [SITUATION: ...], [DO: ...], [TOOL RESULT: ...], [DATA: ...]
  const behavioralMarkerPatterns = [
    /\[INTERNAL[:\s][^\]]*\]/i, // [INTERNAL GUIDANCE]
    /\[SITUATION:\s[^\]]*\]/i, // [SITUATION: ...]
    /\[DO:\s[^\]]*\]/i, // [DO: ...]
    /\[TOOL RESULT:\s[^\]]*\]/i, // [TOOL RESULT: ...]
    /\[DATA:\s/i, // [DATA: ...]
  ];

  for (const pattern of behavioralMarkerPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      log.warn({ text: trimmed }, '🚨 BEHAVIORAL MARKER DETECTED - Guidance leaked to output');
      return {
        detected: true,
        toolName: 'behavioral_marker',
        value: match[0],
        pattern: 'behavioral_marker',
      };
    }
  }

  // 0b. Check for "do NOT read this" patterns that tools sometimes add
  if (
    lowerTrimmed.includes('do not read this') ||
    lowerTrimmed.includes("don't read this") ||
    lowerTrimmed.includes('do not speak this') ||
    lowerTrimmed.includes("don't speak this") ||
    lowerTrimmed.includes('respond naturally') ||
    lowerTrimmed.includes('for internal use only')
  ) {
    log.warn(
      { text: trimmed },
      '🚨 INTERNAL INSTRUCTION DETECTED - Tool response with speak instruction'
    );
    return {
      detected: true,
      toolName: 'internal_instruction',
      pattern: 'internal_instruction',
    };
  }

  // 0c. CRITICAL: Check for instruction prompt leakage
  // When generateReply() is called, the SDK puts instructions as role:'model' which
  // causes Gemini to sometimes echo them back. Detect and suppress these patterns.
  // Patterns: "You are Ferni", "CRITICAL RULES:", "Style: warm", "Context:", etc.
  const instructionLeakagePatterns = [
    /^you are \w+\./i, // "You are Ferni."
    /^style:\s/i, // "Style: warm, curious..."
    /critical rules:/i, // "CRITICAL RULES:"
    /^context:/i, // "Context:"
    /^rules:/i, // "RULES:"
    /the user has been silent for \d+ seconds/i, // Silence instruction leak
    /respond briefly to the user's silence/i, // New silence instruction format
    /don't read this out/i, // Context instruction leak
    /maximum \d+-\d+ sentences/i, // Rules leak
    /no ssml tags/i, // Rules leak
    /just speak naturally/i, // Rules leak
    /say only your response/i, // Rules leak
    // Bracketed guidance markers - CRITICAL: these must NEVER be spoken
    // === Specific patterns (highest priority) ===
    /\[TOPIC SHIFT:/i,
    /\[TASK GUIDANCE\]/i,
    /\[AGENT EXTENSIBILITY/i,
    /\[MAGIC MOMENT/i,
    /\[RELATIONSHIP/i,
    /\[SESSION CONTEXT\]/i,
    /\[RESPONSE GUIDANCE\]/i,
    /\[EMOTIONAL ARC/i,
    /\[SILENCE HANDLING\]/i,
    /\[LENGTH GUIDANCE/i,
    /\[HUMOR GUIDANCE/i,
    /\[STORY OPPORTUNITY/i,
    /\[TRUST CONTEXT/i,
    /\[CRISIS/i,
    /\[PRE-SESSION/i,
    /\[POST-HANDOFF/i,
    // === Additional guidance patterns found in turn-processor ===
    /\[PACING GUIDANCE\]/i,
    /\[EMOTIONAL SHIFT/i,
    /\[EMOTIONAL DEPTH\]/i,
    /\[MODE SHIFT:/i,
    /\[SENSITIVE MOMENT:/i,
    /\[USER PUSHBACK/i,
    /\[RESPONSE STYLE\]/i,
    /\[CATCHPHRASE MOMENT\]/i,
    /\[CONVERSATION STATE\]/i,
    /\[CONSIDER WRAPPING/i,
    /\[CONTACT SAVED\]/i,
    /\[CRISIS SUPPORT\]/i,
    /\[HUMOR OK\]/i,
    /\[STORY PREFERENCE\]/i,
    /\[CELEBRATION/i,
    /\[SPECIAL MOMENT:/i,
    /\[SCIENTIFIC/i,
    /\[COACHING/i,
    // === Humanizer guidance patterns ===
    /\[EMOTIONAL GUIDANCE\]/i,
    /\[CONVERSATION CALLBACK\]/i,
    /\[OPEN THREADS\]/i,
    /\[QUESTION SUGGESTION\]/i,
    /\[THINKING CUE\]/i,
    /\[EMPATHETIC ECHO\]/i,
    /\[POSSIBLE CONTRADICTION\]/i,
    /\[CONCERN DETECTED/i,
    /\[PREDICTED NEED:/i,
    /\[VOICE STATE:/i,
    /\[PROACTIVE MEMORY\]/i,
    /\[APPROACH:/i,
    /\[RHYTHM MATCH\]/i,
    /\[MEANINGFUL SILENCE:/i,
    /\[TOPICS TO AVOID\]/i,
    /\[UNSAID SIGNAL:/i,
    /\[GROWTH REFLECTION/i,
    /\[CALLBACK OPPORTUNITY\]/i,
    // === Awareness & personality guidance patterns ===
    /\[TIME VIBE:/i,
    /\[TIME CONTEXT/i,
    /\[TIME AWARENESS:/i,
    /\[TIME-BASED INSIGHT:/i,
    /\[SELF-AWARENESS/i,
    /\[PROBING PREFERENCE/i,
    /\[MOMENT OPPORTUNITY:/i,
    /\[PHYSICAL AWARENESS/i,
    /\[PHYSICAL:/i,
    /\[GROUNDING:/i,
    /\[GENUINE CURIOSITY:/i,
    // === Emoji-prefixed guidance (Better Than Human features) ===
    /\[🤝/i, // Relationship context
    /\[🌟/i, // Better than human
    /\[⚡/i, // Energy/performance
    /\[🎯/i, // Target/goal
    /\[💡/i, // Insight
    /\[🔄/i, // Cycle/repeat
    /\[⛔/i, // Warning/stop
    /\[✨/i, // Personal moment
    /\[🎉/i, // Celebration
    /\[🌱/i, // Growth
    /\[💭/i, // Thinking/callback
    /\[🎧/i, // Unsaid/listening
    /\[⚠️/i, // Warning/concern
    // === Context injection header patterns (common leakage!) ===
    /={2,}\s*GUIDANCE\s*={2,}/i, // === GUIDANCE ===
    /={2,}\s*IMPORTANT\s*={2,}/i, // === IMPORTANT ===
    /={2,}\s*OPTIONAL\s*={2,}/i, // === OPTIONAL ===
    /={2,}\s*CONTEXT\s*={2,}/i, // === CONTEXT ===
    /={2,}\s*REMEMBER\s*={2,}/i, // === REMEMBER ===
    /={2,}\s*[\w\s]+\s*={2,}/i, // Any === HEADER === format
    /QUICK GUIDANCE:/i, // QUICK GUIDANCE:
    /\bGUIDANCE:/i, // GUIDANCE:
    /\bREMEMBER:/i, // REMEMBER:
    /\bAPPROACH:/i, // APPROACH:
    // "guidance" as standalone word in instruction-like contexts
    /\[GUIDANCE\]/i, // [GUIDANCE] header
    /coaching guidance/i, // coaching guidance
    /response guidance/i, // response guidance
    /behavioral guidance/i, // behavioral guidance
    // === Catch-all patterns (last resort) ===
    /^\[[\w\s-]+\]:/i, // Any "[LABEL]:" at start
    /^\[[\w\s-]+\]\s/i, // Any "[LABEL] " at start
    // NOTE: No /i flag here - only match actual ALL_CAPS to avoid matching valid
    // SSML expressions like [laughter], [sigh], [chuckle], [whisper], etc.
    /\[[A-Z][A-Z\s_-]+[A-Z]\]/, // Any [ALL_CAPS_LABEL] anywhere (case-sensitive!)
    /\[[A-Z][A-Z\s_-]+:/, // Any [CAPS_LABEL: anywhere (case-sensitive!)
  ];

  for (const pattern of instructionLeakagePatterns) {
    if (pattern.test(trimmed)) {
      log.warn(
        { text: trimmed.slice(0, 80), pattern: pattern.source },
        '🚨 INSTRUCTION PROMPT LEAKAGE - Gemini echoed generateReply instructions'
      );
      return {
        detected: true,
        toolName: 'instruction_leakage',
        pattern: 'instruction_leakage',
      };
    }
  }

  // 0d. CRITICAL: Check for malformed "fn:" prefix format
  // Gemini sometimes outputs "fn:speak everything ok" instead of JSON {"fn":"speak",...}
  // This is a different malformed format that leaks to TTS
  const fnPrefixMatch = trimmed.match(/^fn:\s*(\w+)\s*(.*)/i);
  if (fnPrefixMatch) {
    log.warn(
      { text: trimmed, toolName: fnPrefixMatch[1], rest: fnPrefixMatch[2] },
      '🚨 MALFORMED fn: PREFIX DETECTED - Gemini used wrong function call format'
    );
    return {
      detected: true,
      toolName: fnPrefixMatch[1],
      value: fnPrefixMatch[2],
      pattern: 'fn_prefix_malformed',
    };
  }

  // 1. Announcement patterns: "I'll call the playMusic function"
  const announcement = checkAnnouncementPatterns(trimmed);
  if (announcement) {
    log.warn({ text: trimmed, ...announcement }, '🚨 TOOL CALL ANNOUNCEMENT DETECTED');
    return announcement;
  }

  // 2. Intention patterns: "I'll play jazz for you"
  const intention = checkIntentionPatterns(trimmed);
  if (intention) return intention;

  // 3. Tool + param pattern: "playMusic query jazz"
  const toolParam = checkToolParamPattern(lowerTrimmed);
  if (toolParam) return toolParam;

  // 4. Tool mention: "the playMusic function"
  const toolMention = checkToolMentionPattern(trimmed);
  if (toolMention) return toolMention;

  // 5. Multi-word pattern: "Play music query christmas"
  const words = lowerTrimmed.split(/\s+/);
  if (words.length >= 3) {
    const possibleTool = words.slice(0, 2).join(' ');
    const possibleParam = words[2];

    const matchedTool = TOOL_NAME_PATTERNS.find((t) => t.toLowerCase() === possibleTool);
    if (matchedTool && PARAM_PATTERNS.some((p) => p.toLowerCase() === possibleParam)) {
      return {
        detected: true,
        toolName: matchedTool,
        parameter: possibleParam,
        value: words.slice(3).join(' ') || undefined,
        pattern: 'multi_word',
      };
    }
  }

  return { detected: false };
}

/** Helper to check if tool name matches a category */
function toolMatches(toolName: string, ...keywords: string[]): boolean {
  const lower = toolName.toLowerCase();
  return keywords.some((k) => lower.includes(k)) || TEAM_MEMBER_NAMES.includes(lower);
}

/** Get replacement text for a detected tool call leak */
function getReplacementText(detection: LeakageDetection): string {
  const toolNameLower = detection.toolName?.toLowerCase() || '';

  // CRITICAL: Internal markers, instructions, and instruction leakage - ALWAYS suppress silently
  // These are tool responses, generateReply prompts, or guidance blocks that should never be spoken
  if (
    detection.pattern === 'internal_marker' ||
    detection.pattern === 'internal_instruction' ||
    detection.pattern === 'instruction_leakage' ||
    detection.pattern === 'behavioral_marker' // [INTERNAL GUIDANCE], [DO:...], etc.
  ) {
    return '';
  }

  // Handoffs - suppress (tool handles transition)
  if (
    toolMatches(toolNameLower, 'handoff', 'transfer') ||
    TEAM_MEMBER_NAMES.includes(toolNameLower)
  ) {
    return '';
  }

  // Music - natural acknowledgment
  if (toolMatches(toolNameLower, 'music', 'play')) {
    return detection.value
      ? `Let me find ${detection.value} for you.`
      : 'Let me find that for you.';
  }

  // Information tools - acknowledgment
  if (toolMatches(toolNameLower, 'weather', 'search', 'news', 'time')) {
    return 'Let me check on that.';
  }

  // Memory tools - silent
  if (toolMatches(toolNameLower, 'remember', 'recall', 'memory', 'note')) {
    return '';
  }

  // Crisis/wellness tools - CRITICAL: suppress silently, don't draw attention
  if (toolMatches(toolNameLower, 'crisis', 'emergency', 'grounding', 'breathing', 'mood')) {
    return '';
  }

  // Habit/productivity tools - silent
  if (toolMatches(toolNameLower, 'habit', 'timer', 'task', 'goal')) {
    return '';
  }

  // Conversation management tools - silent
  if (toolMatches(toolNameLower, 'emotional', 'story', 'exit', 'conversation')) {
    return '';
  }

  // Intention patterns
  if (detection.pattern === 'intention' && detection.value) {
    return `Let me find ${detection.value} for you.`;
  }

  // Default: suppress to let tool result speak
  return '';
}

/**
 * Sanitize text by removing function-call-like content.
 *
 * @param text - Raw text from LLM
 * @returns Sanitized text safe for TTS
 */
export function sanitizeToolCallLeakage(text: string): string {
  const detection = detectsFunctionCallLeakage(text);

  if (detection.detected) {
    log.warn(
      {
        originalText: text,
        toolName: detection.toolName,
        parameter: detection.parameter,
        value: detection.value,
        pattern: detection.pattern,
      },
      '🚨 TOOL CALL LEAKAGE DETECTED - Gemini output function call text instead of calling function'
    );

    return getReplacementText(detection);
  }

  return text;
}

/**
 * Patterns that might be the start of a tool call (for partial matching)
 */
const PARTIAL_TOOL_PREFIXES = [
  'play',
  'remember',
  'recall',
  'hand',
  'get',
  'set',
  'add',
  'update',
  'create',
  'search',
  'send',
  'schedule',
  'cancel',
  'delete',
  'track',
  'log',
  'stop',
  'pause',
  'resume',
  'crisis',
  'grounding',
  'breathing',
  'invoke',
  '[INTERNAL',
  '[internal',
  'Transferring',
  "I'll call",
  'Let me use',
  'rememberName',
  'noteEmotional',
  'gracefulExit',
  'endConversation',
  // Memory-related prefixes (catch "store a memory", "save this")
  'store',
  'save',
  'I want to store',
  'I want to save',
  'I want to remember',
  "I'll store",
  "I'll save",
  // Bracketed guidance markers - catch early to prevent speaking
  '[TOPIC',
  '[TASK',
  '[AGENT',
  '[MAGIC',
  '[RELATIONSHIP',
  '[SESSION',
  '[RESPONSE',
  '[EMOTIONAL',
  '[SILENCE',
  '[LENGTH',
  '[HUMOR',
  '[STORY',
  '[TRUST',
  '[CRISIS',
  '[PRE-SESSION',
  '[POST-HANDOFF',
  '[PACING',
  '[MODE',
  '[SENSITIVE',
  '[USER PUSH',
  '[CATCHPHRASE',
  '[CONVERSATION',
  '[CONSIDER',
  '[CONTACT',
  '[CELEBRATION',
  '[SPECIAL',
  '[SCIENTIFIC',
  '[COACHING',
  // Humanizer prefixes
  '[EMOTIONAL',
  '[OPEN THREAD',
  '[QUESTION',
  '[THINKING',
  '[EMPATHETIC',
  '[POSSIBLE',
  '[CONCERN',
  '[PREDICTED',
  '[VOICE STATE',
  '[PROACTIVE',
  '[APPROACH',
  '[RHYTHM',
  '[MEANINGFUL',
  '[TOPICS TO',
  '[UNSAID',
  '[GROWTH',
  '[CALLBACK',
  // Awareness prefixes
  '[TIME',
  '[SELF-AWARE',
  '[PROBING',
  '[MOMENT',
  '[PHYSICAL',
  '[GROUNDING',
  '[GENUINE',
  // Emoji prefixes
  '[🤝',
  '[🌟',
  '[⚡',
  '[🎯',
  '[💡',
  '[🔄',
  '[⛔',
  '[✨',
  '[🎉',
  '[🌱',
  '[💭',
  '[🎧',
  '[⚠️',
  // Concierge prefixes
  'request hotel',
  'Request hotel',
  'requestHotel',
  'make restaurant',
  'Make restaurant',
  'makeRestaurant',
  'book a table',
  'Book a table',
  'schedule healthcare',
  'Schedule healthcare',
  'scheduleHealthcare',
  'schedule dentist',
  'Schedule dentist',
  'find a doctor',
  'Find a doctor',
  'find a dentist',
  'Find a dentist',
  'get service',
  'Get service',
  'getService',
  'find a plumber',
  'Find a plumber',
  'find an electrician',
  'Find an electrician',
  'check concierge',
  'Check concierge',
  'checkConcierge',
];

/**
 * Check if buffer might be the start of a tool call pattern
 */
function mightBePartialToolCall(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return PARTIAL_TOOL_PREFIXES.some(
    (prefix) => trimmed.startsWith(prefix.toLowerCase()) || prefix.toLowerCase().startsWith(trimmed)
  );
}

/**
 * Create a transform stream that filters function-call-like text.
 *
 * This can be used in the transcriptionNode to sanitize output before TTS.
 *
 * EDGE CASE FIX: The buffer now properly handles:
 * - Tool patterns that span chunks (e.g., "playMu" + "sic query jazz")
 * - Partial matches that need more context before deciding
 */
export function createSanitizerTransformStream(): AnyTransformStream {
  let buffer = '';
  let suppressMode = false;
  let waitForMoreContext = false;

  /** Check for sentence boundary to reset suppression */
  const isSentenceBoundary = (text: string): boolean =>
    text.includes('.') || text.includes('!') || text.includes('?');

  /** Check if we have a natural word boundary (space, punctuation) */
  const hasWordBoundary = (text: string): boolean => /\s|[.,!?;:]/.test(text);

  return new TransformStream({
    transform(chunk: string, controller: TransformStreamDefaultController<string>) {
      buffer += chunk;

      // If in suppress mode, wait for sentence boundary then reset
      if (suppressMode) {
        if (isSentenceBoundary(chunk)) {
          suppressMode = false;
          buffer = '';
          waitForMoreContext = false;
        }
        return;
      }

      // Check for leakage in current buffer
      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        log.warn(
          { buffer, ...detection },
          '🚨 STREAMING TOOL CALL LEAKAGE - Filtering malformed output'
        );

        // Get and emit replacement text (may be empty)
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(`${replacement} `);
        }

        suppressMode = true;
        buffer = '';
        waitForMoreContext = false;
        return;
      }

      // EDGE CASE: Check if buffer might be partial tool call
      // If buffer is short and looks like it could become a tool call, wait for more
      if (buffer.length < 50 && mightBePartialToolCall(buffer)) {
        waitForMoreContext = true;
        return; // Don't emit yet, need more context
      }

      // If we were waiting but now have a word boundary, we can safely emit
      // the safe prefix and continue checking the rest
      if (waitForMoreContext && hasWordBoundary(chunk) && buffer.length > 30) {
        // Recheck with more context
        const recheckDetection = detectsFunctionCallLeakage(buffer);
        if (recheckDetection.detected) {
          const replacement = getReplacementText(recheckDetection);
          if (replacement) {
            controller.enqueue(`${replacement} `);
          }
          suppressMode = true;
          buffer = '';
          waitForMoreContext = false;
          return;
        }
        waitForMoreContext = false;
      }

      // Pass through if buffer is long enough and no pattern detected
      // Increased threshold to give more context for detection
      // 🛡️ LOOK-AHEAD: Also wait if guidance block might be coming (buffer ends with newline, etc.)
      const guidanceMightFollow = mightHaveGuidanceComing(buffer) && buffer.length < 400;
      if (buffer.length > 150 && !waitForMoreContext && !guidanceMightFollow) {
        // 🔍 DIAGNOSTIC: Check for suspicious patterns before passing through (basic sanitizer)
        if (buffer.includes('{"fn"') || buffer.includes('"fn":') || buffer.includes('"args":')) {
          log.warn(
            { buffer: buffer.slice(0, 200), length: buffer.length },
            '🚨 POTENTIAL JSON LEAKAGE (basic sanitizer): Buffer contains fn/args patterns!'
          );
        }

        // 🛡️ CRITICAL FIX: Strip guidance blocks before sending to TTS
        const cleanedBuffer = stripGuidanceBlocks(buffer);
        if (cleanedBuffer) {
          controller.enqueue(cleanedBuffer);
        }
        buffer = '';
      }
    },

    flush(controller: { enqueue: (s: string) => void }) {
      // Final check on remaining buffer
      if (buffer && !suppressMode) {
        const finalCheck = detectsFunctionCallLeakage(buffer);
        if (finalCheck.detected) {
          const replacement = getReplacementText(finalCheck);
          if (replacement) {
            controller.enqueue(replacement);
          }
        } else {
          // 🛡️ CRITICAL FIX: Strip guidance blocks before sending to TTS
          const cleanedBuffer = stripGuidanceBlocks(buffer);
          if (cleanedBuffer) {
            controller.enqueue(cleanedBuffer);
          }
        }
      }
    },
  });
}

/**
 * Quick check for function call leakage in a complete string.
 * Use this for non-streaming contexts.
 */
export function containsToolCallLeakage(text: string): boolean {
  return detectsFunctionCallLeakage(text).detected;
}

/**
 * Get a natural, warm acknowledgment for slow tools.
 *
 * NEW: Uses persona-aware acknowledgment system from speech/coordination.
 * Falls back to Ferni defaults if coordination system unavailable.
 *
 * @param fn - Tool function name
 * @param personaId - Active persona ID (optional, defaults to 'ferni')
 * @param userId - User ID for preference learning (optional)
 */
function getSlowToolAcknowledgment(fn: string, personaId?: string, userId?: string): string {
  // Try to use the new persona-aware system
  try {
    // Dynamic import to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateAcknowledgment, getToolCategory } =
      require('../../speech/coordination/index.js') as {
        generateAcknowledgment: (ctx: {
          personaId: string;
          userId?: string;
          toolId: string;
          toolCategory?: string;
        }) => string;
        getToolCategory: (toolId: string) => string;
      };

    return generateAcknowledgment({
      personaId: personaId || 'ferni',
      userId,
      toolId: fn,
      toolCategory: getToolCategory(fn),
    });
  } catch {
    // Fall back to legacy behavior if coordination module unavailable
  }

  // LEGACY FALLBACK: Hardcoded acknowledgments (kept for backwards compatibility)
  const fnLower = fn.toLowerCase();

  if (fnLower.includes('news')) {
    const newsAcks = [
      'Hold on, let me grab that for you.',
      'One sec, pulling up the latest.',
      "Let me check what's happening out there.",
      'Hang on, grabbing some headlines.',
      'Give me just a moment to look that up.',
    ];
    return newsAcks[Math.floor(Math.random() * newsAcks.length)];
  }

  if (fnLower.includes('weather')) {
    const weatherAcks = [
      'Let me check the forecast real quick.',
      'One moment, looking at the weather.',
      'Hold on, checking conditions.',
      'Give me a sec to pull that up.',
    ];
    return weatherAcks[Math.floor(Math.random() * weatherAcks.length)];
  }

  if (fnLower.includes('stock') || fnLower.includes('market')) {
    const stockAcks = [
      'Let me pull up the numbers.',
      'One moment, checking the markets.',
      'Hold on, grabbing those figures.',
      'Give me a sec to look at that.',
    ];
    return stockAcks[Math.floor(Math.random() * stockAcks.length)];
  }

  const genericAcks = [
    'Hold on, let me grab that for you.',
    'One moment while I look that up.',
    'Give me just a sec.',
    'Let me check on that real quick.',
    'Hang on, pulling that up now.',
  ];
  return genericAcks[Math.floor(Math.random() * genericAcks.length)];
}

/**
 * Extract music query from narrated tool call text.
 *
 * Examples:
 * - "silently calls playMusic with query jazz" -> "jazz"
 * - "Play music query christmas music" -> "christmas music"
 * - "playMusic query relaxing piano" -> "relaxing piano"
 */
function extractMusicQuery(text: string): string | null {
  const lowerText = text.toLowerCase();

  // Pattern: "query <value>" or "query: <value>" or "with query <value>"
  const queryPatterns = [
    /(?:with\s+)?query[:\s]+["']?([^"'\]]+?)["']?(?:\s*\]|\s*$)/i,
    /play(?:ing)?\s+music\s+query\s+(.+)/i,
    /playmusic\s+query\s+(.+)/i,
    /silently\s+calls?\s+playmusic\s+with\s+query\s+["']?(.+?)["']?/i,
    /calls?\s+playmusic\s+with\s+["']?(.+?)["']?/i,
  ];

  for (const pattern of queryPatterns) {
    const match = lowerText.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Create a transform stream that:
 * 1. Sanitizes tool call leakage (replaces with natural text)
 * 2. Executes music tool as fallback when Gemini narrates instead of calls
 *
 * WORKAROUND: Gemini Live API has a known bug (Dec 2024) where it sometimes
 * outputs text like "silently calls playMusic with query jazz" instead of
 * making an actual function call. This detects those patterns and invokes
 * the tool directly.
 *
 * ENHANCEMENT (Dec 2024): Now integrates with StreamStateMachine for
 * coordinated state management when sessionId is provided.
 *
 * @param toolContext - Tools available for execution
 * @param session - Voice session for speaking tool results via safeGenerateReply
 * @param sessionId - Session ID for coordinated speech (optional, will fallback to direct speech)
 */
export function createSanitizerWithMusicFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolContext?: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session?: any, // voice.AgentSession - avoiding import cycle
  sessionId?: string
): AnyTransformStream {
  let buffer = '';
  let suppressMode = false;
  let waitForMoreContext = false;
  let musicFallbackInFlight = false;

  // 🔒 RACE CONDITION FIX: Unified tool execution tracking
  // Prevents music fallback from racing with JSON tool execution
  let toolExecutionInProgress = false;
  let activeToolId: string | null = null;

  // 🔒 PER-STREAM DEDUPLICATION: Prevent same tool+args from being called twice
  // This catches cases where JSON is detected in multiple code paths
  const executedToolsThisStream = new Set<string>();
  const makeToolKey = (fn: string, args: Record<string, unknown>): string => {
    return `${fn.toLowerCase()}:${JSON.stringify(args)}`;
  };

  // 🎯 POST-LLM SEMANTIC ROUTING FALLBACK (Dec 2024)
  // Track whether we intercepted any JSON tool calls during this stream.
  // If not, run semantic routing on the final text as a safety net.
  let jsonToolExecuted = false;
  let accumulatedTextForSemanticFallback = '';

  // 🔒 RACE CONDITION FIX: Speech coordination mutex
  // Prevents dual speaking (session.say() vs safeGenerateReply())
  // NOTE: This is a LOCAL mutex for the sanitizer. The global coordination
  // happens via coordinatedSay() from speech/coordination which uses a queue.
  let speechInProgress = false;
  let speechMutexReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  const SPEECH_MUTEX_TIMEOUT_MS = 10000; // Safety timeout

  const acquireSpeechMutex = (context: string): boolean => {
    if (speechInProgress) {
      log.debug({ context, speechInProgress }, '🔒 Speech mutex blocked - already speaking');
      return false;
    }
    speechInProgress = true;
    // Safety timeout in case release is never called
    speechMutexReleaseTimer = setTimeout(() => {
      if (speechInProgress) {
        log.warn({ context }, '🔒 Speech mutex timeout - force releasing');
        speechInProgress = false;
      }
    }, SPEECH_MUTEX_TIMEOUT_MS);
    log.debug({ context }, '🔒 Speech mutex acquired');
    return true;
  };

  const releaseSpeechMutex = (context: string): void => {
    if (speechMutexReleaseTimer) {
      clearTimeout(speechMutexReleaseTimer);
      speechMutexReleaseTimer = null;
    }
    speechInProgress = false;
    log.debug({ context }, '🔒 Speech mutex released');
  };

  // Optional: Initialize state machine integration for coordinated state tracking
  // This is lazy-loaded to avoid import cycles and only activates if sessionId provided
  let stateIntegration: typeof import('../../speech/coordination/sanitizer-integration.js') | null =
    null;
  if (sessionId) {
    import('../../speech/coordination/sanitizer-integration.js')
      .then((mod) => {
        stateIntegration = mod;
        mod.initializeSanitizerIntegration(sessionId);
        log.debug({ sessionId }, '🔗 State machine integration initialized');
      })
      .catch((err) => {
        log.debug({ sessionId, error: String(err) }, 'State machine integration not available');
      });
  }

  const isSentenceBoundary = (text: string): boolean =>
    text.includes('.') || text.includes('!') || text.includes('?');

  const hasWordBoundary = (text: string): boolean => /\s|[.,!?;:]/.test(text);

  /**
   * Try to execute playMusic as a fallback when we detect narrated music request.
   *
   * 🔒 RACE CONDITION FIX: Now properly coordinates with JSON tool execution.
   * Will NOT execute if another tool is already in progress.
   */
  const tryMusicFallback = async (query: string): Promise<void> => {
    // 🔒 FIX: Check if any tool execution is in progress (JSON tools or other fallbacks)
    if (toolExecutionInProgress) {
      log.debug(
        { query, activeToolId },
        '🎵 MUSIC FALLBACK: Skipping - tool execution already in progress'
      );
      return;
    }

    if (musicFallbackInFlight) {
      log.debug({ query }, 'Music fallback already in flight, skipping');
      return;
    }

    try {
      musicFallbackInFlight = true;
      toolExecutionInProgress = true;
      activeToolId = 'playMusic_fallback';

      log.info(
        { query },
        '🎵 MUSIC FALLBACK: Executing playMusic because Gemini narrated instead of called'
      );

      // Try to get playMusic from tool context

      const playMusic = toolContext?.playMusic as
        | { execute?: (args: { query: string }) => Promise<unknown> }
        | undefined;

      if (playMusic?.execute) {
        // Execute the tool directly
        await playMusic.execute({ query });
        log.info({ query }, '🎵 MUSIC FALLBACK: playMusic executed successfully');
      } else {
        // Fallback: try to import and call the music tool directly
        try {
          const { playMusicUnified } = await import('../../tools/domains/entertainment/music.js');
          await playMusicUnified(query);
          log.info({ query }, '🎵 MUSIC FALLBACK: playMusicUnified executed via direct import');
        } catch (importErr) {
          log.warn(
            { query, error: String(importErr) },
            '🎵 MUSIC FALLBACK: Could not import music tool'
          );
        }
      }
    } catch (err) {
      log.error({ query, error: String(err) }, '🎵 MUSIC FALLBACK: Error executing playMusic');
    } finally {
      musicFallbackInFlight = false;
      toolExecutionInProgress = false;
      activeToolId = null;
    }
  };

  // Track how many chunks to suppress after catching JSON
  // 🔒 RACE CONDITION FIX: This is a fallback - primary suppression uses state machine
  let suppressChunksRemaining = 0;
  const SUPPRESS_CHUNKS_AFTER_JSON = 5; // Suppress 5 chunks after JSON to catch "Ok so..."

  // Helper to check if output should be suppressed (uses state machine if available)
  const shouldSuppressChunk = (): boolean => {
    // Primary: Use state machine if available
    if (stateIntegration && sessionId) {
      const shouldSuppress = stateIntegration.shouldSuppressOutput(sessionId);
      if (shouldSuppress) {
        return true;
      }
    }
    // Fallback: Use chunk counting (less reliable but backwards-compatible)
    return suppressChunksRemaining > 0;
  };

  // JSON fragment accumulator - for handling split JSON like {"  then fn":"playMusic"...
  let jsonAccumulator = '';
  let jsonAccumulatorActive = false;
  const MAX_JSON_ACCUMULATOR_SIZE = 500;

  // 🐛 FIX: Track if stream is closed to prevent race condition errors
  // When async tool execution completes after stream closes, enqueue() fails
  let streamClosed = false;

  return new TransformStream({
    transform(chunk: string, controller: TransformStreamDefaultController<string>) {
      buffer += chunk;

      // After catching JSON, suppress several chunks to catch trailing "Ok so..." type text
      // 🔒 RACE CONDITION FIX: Use state machine for primary suppression, fallback to counting
      if (shouldSuppressChunk()) {
        // Only decrement the fallback counter if it's active
        if (suppressChunksRemaining > 0) {
          suppressChunksRemaining--;
        }
        log.debug(
          {
            chunk: chunk.slice(0, 30),
            remaining: suppressChunksRemaining,
            toolInProgress: toolExecutionInProgress,
          },
          '🗑️ Suppressing post-JSON chunk (state machine or fallback)'
        );
        buffer = '';
        return;
      }

      if (suppressMode) {
        if (isSentenceBoundary(chunk)) {
          suppressMode = false;
          buffer = '';
          waitForMoreContext = false;
          jsonAccumulator = '';
          jsonAccumulatorActive = false;
        }
        return;
      }

      // FRAGMENTED JSON DETECTION
      // Gemini sometimes splits JSON across chunks like:
      // Chunk 1: {"
      // Chunk 2: fn":"playMusic","args":{"query":"jazz"}}
      // We need to accumulate these

      const trimmed = buffer.trim();

      // Detect if this chunk looks like the START of JSON
      const looksLikeJsonStart =
        /^\s*\{?\s*["']?\s*$/.test(trimmed) ||
        trimmed === '{' ||
        trimmed === '{"' ||
        trimmed === '{ "' ||
        /^\s*```json?\s*$/i.test(trimmed) ||
        /^\s*```json?\s*\{?\s*$/i.test(trimmed);

      // If we see JSON start marker, start accumulating
      if (looksLikeJsonStart && !jsonAccumulatorActive) {
        jsonAccumulatorActive = true;
        jsonAccumulator = trimmed;
        log.debug({ chunk: trimmed }, '🔧 JSON fragment detected - starting accumulation');
        buffer = '';
        return;
      }

      // If we're accumulating JSON, add to accumulator
      if (jsonAccumulatorActive) {
        jsonAccumulator += chunk;

        // Check if we have a complete JSON now
        const jsonCall = detectJsonFunctionCall(jsonAccumulator);
        if (jsonCall) {
          // 🔒 PER-STREAM DEDUPLICATION: Check if we already executed this exact tool+args
          const toolKey = makeToolKey(jsonCall.fn, jsonCall.args);
          if (executedToolsThisStream.has(toolKey)) {
            log.warn(
              { fn: jsonCall.fn, args: jsonCall.args },
              '🚫 DEDUP: Skipping accumulated JSON - exact tool+args already executed'
            );
            jsonAccumulator = '';
            jsonAccumulatorActive = false;
            buffer = '';
            return;
          }

          log.info(
            { fn: jsonCall.fn, args: jsonCall.args, accumulated: jsonAccumulator.length },
            '🎯 Accumulated JSON function call - executing'
          );

          // 🔒 Mark this tool+args as executed
          executedToolsThisStream.add(toolKey);

          // 🔒 RACE CONDITION FIX: Set tool execution flag before starting
          // This prevents music fallback from racing with JSON tool execution
          toolExecutionInProgress = true;
          activeToolId = jsonCall.fn;

          // Notify state machine of JSON completion and tool start
          if (stateIntegration && sessionId) {
            stateIntegration.notifyJsonComplete(sessionId, jsonCall.fn);
            stateIntegration.notifyToolStarted(sessionId, jsonCall.fn);
          }

          // For slow tools (news, weather, etc.), inject a natural acknowledgment to keep stream open
          const slowTools = [
            'searchnews',
            'getnews',
            'getweather',
            'getfinancialsnews',
            'getstocknews',
            'gettechnews',
            'getmarketsummary',
          ];
          const isSlowTool = slowTools.includes(jsonCall.fn.toLowerCase());
          if (isSlowTool) {
            // Use persona-aware acknowledgments (passes through to generateAcknowledgment)
            const ack = getSlowToolAcknowledgment(jsonCall.fn, toolContext?.personaId, toolContext?.userId);
            log.info({ fn: jsonCall.fn, ack, personaId: toolContext?.personaId }, '⏳ Injecting persona-aware acknowledgment for slow tool');
            controller.enqueue(`${ack} `);
          }

          // Execute the tool and speak the result via safeGenerateReply
          // This is the proper way to inject async tool results - not stream injection
          // Pass sessionId/userId/personaId for observability tracking (Option C: semantic router primary)
          jsonToolExecuted = true; // 🎯 Mark that we handled JSON - skip semantic fallback
          executeJsonFunctionCall(jsonCall, sessionId, toolContext?.userId, toolContext?.personaId)
            .then(async (execResult) => {
              // ========================================
              // HANDOFF TOOLS: Special handling
              // Handoffs are handled by the executor which emits voiceSwitch events.
              // The greeting is spoken by the handoff handler, not here.
              // ========================================
              const isHandoffTool = jsonCall.fn.toLowerCase().startsWith('handoffto');
              const handoffResult = execResult as { handoffComplete?: boolean; action?: string; error?: string } | null;
              
              if (isHandoffTool) {
                if (handoffResult?.handoffComplete) {
                  log.info(
                    { fn: jsonCall.fn, target: (execResult as { target?: string })?.target },
                    '🎭 Handoff complete - greeting spoken by handler, skipping sanitizer speech'
                  );
                  return; // Don't speak - handoff handler already spoke the greeting
                }
                
                // Handoff failed - speak error message if available
                if (!execResult?.success && handoffResult?.error) {
                  log.warn(
                    { fn: jsonCall.fn, error: handoffResult.error },
                    '⚠️ Handoff failed - speaking error message'
                  );
                  if (session) {
                    try {
                      session.say(handoffResult.error, { allowInterruptions: true });
                    } catch {
                      /* ignore speech errors */
                    }
                  }
                  return;
                }
                
                // Handoff in progress or unknown state - don't interfere
                log.debug({ fn: jsonCall.fn, execResult }, '🔄 Handoff result (no additional action needed)');
                return;
              }
              
              if (execResult?.success && execResult.result) {
                const resultText =
                  typeof execResult.result === 'string'
                    ? execResult.result
                    : JSON.stringify(execResult.result);

                // ========================================
                // SPEAK DIRECTLY: For pseudo-tools like "speak" that generate
                // dynamic content, bypass safeGenerateReply and use session.say()
                // directly. This avoids the role:'model' echoing problem.
                // 🔒 RACE CONDITION FIX: Use speech mutex to prevent dual speaking
                // ========================================
                if (execResult.speakDirectly) {
                  log.info(
                    {
                      fn: jsonCall.fn,
                      textLength: resultText.length,
                      preview: resultText.slice(0, 50),
                    },
                    '🎤 Speaking directly via coordinated speech (speakDirectly flag)'
                  );

                  // 🔒 Acquire speech mutex before speaking
                  if (!acquireSpeechMutex(`speakDirectly-${jsonCall.fn}`)) {
                    log.warn({ fn: jsonCall.fn }, '🔒 Speech blocked - another speech in progress');
                    return; // Skip - another path is already speaking
                  }

                  try {
                    if (session && sessionId) {
                      try {
                        // Use coordinated speech for direct tool results
                        coordinatedSay(sessionId, resultText, { allowInterruptions: true });
                        log.info({ fn: jsonCall.fn }, '✅ Coordinated speech complete');
                      } catch (sayErr) {
                        log.warn(
                          { fn: jsonCall.fn, error: String(sayErr) },
                          '⚠️ Coordinated speech failed, falling back to direct'
                        );
                        // Fallback to direct session.say if coordinated fails
                        try {
                          session.say(resultText, { allowInterruptions: true });
                        } catch {
                          /* ignore fallback errors */
                        }
                      }
                    } else if (session) {
                      // No sessionId - use direct speech
                      try {
                        session.say(resultText, { allowInterruptions: true });
                        log.info({ fn: jsonCall.fn }, '✅ Direct speech complete (no sessionId)');
                      } catch (sayErr) {
                        log.warn(
                          { fn: jsonCall.fn, error: String(sayErr) },
                          '⚠️ Direct speech failed'
                        );
                      }
                    }
                  } finally {
                    releaseSpeechMutex(`speakDirectly-${jsonCall.fn}`);
                  }
                  return; // Don't proceed to safeGenerateReply
                }

                log.info(
                  { fn: jsonCall.fn, resultPreview: resultText.slice(0, 80) },
                  '🎤 Tool result ready - triggering LLM response'
                );

                // 🔒 RACE CONDITION FIX: Acquire speech mutex for safeGenerateReply path
                if (!acquireSpeechMutex(`safeGenerateReply-${jsonCall.fn}`)) {
                  log.warn({ fn: jsonCall.fn }, '🔒 Speech blocked - another speech in progress');
                  return; // Skip - another path is already speaking
                }

                // Use safeGenerateReply to speak the result properly
                if (session) {
                  try {
                    const { safeGenerateReply, formatToolResult } =
                      await import('./safe-generate-reply.js');

                    // Music tools need special handling - TTS + music coordination can take >3.5s
                    const isMusicTool = jsonCall.fn.toLowerCase().includes('music');

                    // Format tool result with behavioral instructions (no <context> leakage risk)
                    const instructions = formatToolResult(jsonCall.fn, resultText);

                    await safeGenerateReply(session, {
                      instructions,
                      allowInterruptions: true,
                      context: `tool-result-${jsonCall.fn}`,
                      // For music tools: don't wait for playout (TTS + music coordination can be slow)
                      // For other tools: wait for playout to ensure user hears the result
                      waitForPlayout: !isMusicTool,
                      // Increased timeout to give LLM time to respond naturally
                      timeoutMs: isMusicTool ? 6000 : 5000,
                      // Fallback message if LLM response times out - keep it natural, not robotic
                      fallbackMessage: isMusicTool ? "Here's some music for you." : 'Got it!',
                      // FIX: Pass sessionId so safeGenerateReply can skip if session is closing
                      sessionId,
                    });
                    log.info(
                      { fn: jsonCall.fn, isMusicTool },
                      '✅ Tool result spoken via safeGenerateReply'
                    );
                  } catch (speakErr) {
                    log.warn(
                      { fn: jsonCall.fn, error: String(speakErr) },
                      '⚠️ Could not speak tool result via safeGenerateReply'
                    );
                  } finally {
                    releaseSpeechMutex(`safeGenerateReply-${jsonCall.fn}`);
                  }
                } else {
                  releaseSpeechMutex(`safeGenerateReply-${jsonCall.fn}`);
                  // Fallback: try to enqueue if no session (shouldn't happen in normal flow)
                  log.warn(
                    { fn: jsonCall.fn },
                    '⚠️ No session available - attempting stream injection'
                  );
                  if (!streamClosed) {
                    try {
                      controller.enqueue(`${resultText} `);
                    } catch (enqueueErr) {
                      log.warn(
                        { fn: jsonCall.fn, error: String(enqueueErr) },
                        '⚠️ Stream injection failed'
                      );
                    }
                  }
                }
              }

              // Notify state machine that tool completed successfully
              if (stateIntegration && sessionId) {
                stateIntegration.notifyToolCompleted(sessionId, jsonCall.fn, true);
              }
            })
            .catch((err) => {
              log.error({ fn: jsonCall.fn, error: String(err) }, '❌ Tool execution failed');

              // Notify state machine that tool failed
              if (stateIntegration && sessionId) {
                stateIntegration.notifyToolCompleted(sessionId, jsonCall.fn, false);
              }
            })
            .finally(() => {
              // 🔒 RACE CONDITION FIX: Always clear tool execution flag
              toolExecutionInProgress = false;
              activeToolId = null;
              log.debug({ fn: jsonCall.fn }, '🔒 Tool execution flag cleared');
            });

          suppressMode = true;
          suppressChunksRemaining = SUPPRESS_CHUNKS_AFTER_JSON;
          buffer = '';
          jsonAccumulator = '';
          jsonAccumulatorActive = false;
          return;
        }

        // Safety: if accumulator gets too big without completing, it's probably not JSON
        if (jsonAccumulator.length > MAX_JSON_ACCUMULATOR_SIZE) {
          log.debug(
            { accumulated: jsonAccumulator.slice(0, 100) },
            '🔧 JSON accumulator timeout - not valid JSON'
          );
          // Emit what we accumulated (it wasn't JSON after all)
          controller.enqueue(jsonAccumulator);
          jsonAccumulator = '';
          jsonAccumulatorActive = false;
          buffer = '';
          return;
        }

        // Keep accumulating - don't emit anything yet
        buffer = '';
        return;
      }

      // FIRST: Check for JSON function call patterns
      // Gemini outputs JSON in markdown code blocks like:
      // ```json
      // {"fn":"playMusic","args":{"query":"jazz"}}
      // ```
      // OR sometimes inline: {"fn":"playMusic","args":{"query":"jazz"}}

      // Check for markdown code fence start - buffer until we see the closing fence
      const hasCodeFenceStart = buffer.includes('```json') || buffer.includes('```\n{');
      const hasCodeFenceEnd = hasCodeFenceStart && buffer.match(/```json[\s\S]*```/);

      // Check for inline JSON start
      const hasInlineJsonStart = trimmed.includes('{"fn"') || trimmed.includes('{ "fn"');
      const hasInlineJsonEnd = hasInlineJsonStart && trimmed.includes('}}');

      // If we see a code fence or JSON start, buffer until complete
      if (hasCodeFenceStart && !hasCodeFenceEnd && buffer.length < 300) {
        log.debug(
          { bufferLen: buffer.length, preview: buffer.slice(0, 50) },
          '⏳ Buffering markdown JSON block'
        );
        return;
      }

      if (hasInlineJsonStart && !hasInlineJsonEnd && buffer.length < 200) {
        log.debug(
          { bufferLen: buffer.length, preview: buffer.slice(0, 50) },
          '⏳ Buffering inline JSON'
        );
        return;
      }

      // Check if buffer contains a complete JSON function call (in markdown or inline)
      const jsonCall = detectJsonFunctionCall(buffer);
      if (jsonCall) {
        // 🔒 PER-STREAM DEDUPLICATION: Check if we already executed this exact tool+args
        const toolKey = makeToolKey(jsonCall.fn, jsonCall.args);
        if (executedToolsThisStream.has(toolKey)) {
          log.warn(
            { fn: jsonCall.fn, args: jsonCall.args },
            '🚫 DEDUP: Skipping - exact tool+args already executed this stream'
          );
          buffer = '';
          return;
        }

        // 🔒 RACE CONDITION FIX: Check if tool already executing to prevent duplicates
        if (toolExecutionInProgress) {
          log.warn(
            { fn: jsonCall.fn, activeTool: activeToolId },
            '🚫 DEDUP: Skipping JSON execution - another tool already in progress'
          );
          buffer = '';
          return;
        }

        log.info(
          { fn: jsonCall.fn, args: jsonCall.args, bufferLen: buffer.length },
          '🎯 JSON function call intercepted - executing'
        );

        // 🔒 Mark this tool+args as executed
        executedToolsThisStream.add(toolKey);

        // 🔒 RACE CONDITION FIX: Set tool execution flag BEFORE async execution
        // This prevents duplicate calls if JSON is detected in multiple paths
        toolExecutionInProgress = true;
        activeToolId = jsonCall.fn;

        // Notify state machine of JSON completion and tool start
        if (stateIntegration && sessionId) {
          stateIntegration.notifyJsonComplete(sessionId, jsonCall.fn);
          stateIntegration.notifyToolStarted(sessionId, jsonCall.fn);
        }

        // For slow tools (news, weather, etc.), inject a natural acknowledgment to keep stream open
        const slowTools = [
          'searchnews',
          'getnews',
          'getweather',
          'getfinancialsnews',
          'getstocknews',
          'gettechnews',
          'getmarketsummary',
        ];
        const isSlowTool = slowTools.includes(jsonCall.fn.toLowerCase());
        if (isSlowTool) {
          // Use persona-aware acknowledgments (passes through to generateAcknowledgment)
          const ack = getSlowToolAcknowledgment(jsonCall.fn, toolContext?.personaId, toolContext?.userId);
          log.info({ fn: jsonCall.fn, ack, personaId: toolContext?.personaId }, '⏳ Injecting persona-aware acknowledgment for slow tool');
          controller.enqueue(`${ack} `);
        }

        // Execute the tool and speak the result via safeGenerateReply
        // Pass sessionId/userId/personaId for observability tracking (Option C: semantic router primary)
        jsonToolExecuted = true; // 🎯 Mark that we handled JSON - skip semantic fallback
        executeJsonFunctionCall(jsonCall, sessionId, toolContext?.userId, toolContext?.personaId)
          .then(async (execResult) => {
            if (execResult?.success && execResult.result) {
              const resultText =
                typeof execResult.result === 'string'
                  ? execResult.result
                  : JSON.stringify(execResult.result);

              log.info(
                { fn: jsonCall.fn, resultPreview: resultText.slice(0, 80) },
                '🎤 Tool result ready - triggering LLM response'
              );

              // Use safeGenerateReply to speak the result properly
              if (session) {
                try {
                  const { safeGenerateReply, formatToolResult } =
                    await import('./safe-generate-reply.js');

                  // Music tools need special handling - TTS + music coordination can take >3.5s
                  const isMusicTool = jsonCall.fn.toLowerCase().includes('music');

                  // Format tool result with behavioral instructions (no <context> leakage risk)
                  const instructions = formatToolResult(jsonCall.fn, resultText);

                  await safeGenerateReply(session, {
                    instructions,
                    allowInterruptions: true,
                    context: `tool-result-${jsonCall.fn}`,
                    // For music tools: don't wait for playout (TTS + music coordination can be slow)
                    // For other tools: wait for playout to ensure user hears the result
                    waitForPlayout: !isMusicTool,
                    // Increased timeout to give LLM time to respond naturally
                    timeoutMs: isMusicTool ? 6000 : 5000,
                    // Fallback message if LLM response times out - keep it natural, not robotic
                    fallbackMessage: isMusicTool ? "Here's some music for you." : 'Got it!',
                    // FIX: Pass sessionId so safeGenerateReply can skip if session is closing
                    sessionId,
                  });
                  log.info(
                    { fn: jsonCall.fn, isMusicTool },
                    '✅ Tool result spoken via safeGenerateReply'
                  );
                } catch (speakErr) {
                  log.warn(
                    { fn: jsonCall.fn, error: String(speakErr) },
                    '⚠️ Could not speak tool result via safeGenerateReply'
                  );
                }
              } else {
                // Fallback: try to enqueue if no session
                log.warn(
                  { fn: jsonCall.fn },
                  '⚠️ No session available - attempting stream injection'
                );
                if (!streamClosed) {
                  try {
                    controller.enqueue(`${resultText} `);
                  } catch (enqueueErr) {
                    log.warn(
                      { fn: jsonCall.fn, error: String(enqueueErr) },
                      '⚠️ Stream injection failed'
                    );
                  }
                }
              }
            }

            // Notify state machine that tool completed successfully
            if (stateIntegration && sessionId) {
              stateIntegration.notifyToolCompleted(sessionId, jsonCall.fn, true);
            }
          })
          .catch((err) => {
            log.error({ fn: jsonCall.fn, error: String(err) }, '❌ Tool execution failed');

            // Notify state machine that tool failed
            if (stateIntegration && sessionId) {
              stateIntegration.notifyToolCompleted(sessionId, jsonCall.fn, false);
            }
          })
          .finally(() => {
            // 🔒 RACE CONDITION FIX: Always clear tool execution flag
            toolExecutionInProgress = false;
            activeToolId = null;
            log.debug({ fn: jsonCall.fn }, '🔒 Main JSON tool execution flag cleared');
          });

        // Suppress the JSON text and trailing conversational text
        suppressMode = true;
        suppressChunksRemaining = SUPPRESS_CHUNKS_AFTER_JSON;
        buffer = '';
        waitForMoreContext = false;
        return;
      }

      // Check if this looks like a continuation of JSON/markdown (contains fn, args, query patterns)
      // 🐛 FIX: Original regex /^[a-zA-Z]*["']?[:,}\]{"'`]/ incorrectly matched contractions
      // like "I'm", "What's", "I've" because the apostrophe was in the final char class.
      // Now we only match actual JSON-like patterns (key": or key':)
      const looksLikeJsonContinuation =
        /^[a-zA-Z]+["']\s*:/.test(trimmed) || // key": or key':
        /^[:,}\]{"`:}]/.test(trimmed) || // starts with JSON punctuation
        trimmed.includes('"args"') ||
        trimmed.includes('"query"') ||
        trimmed.includes('"fn"') ||
        trimmed.includes('```') ||
        trimmed.includes('}}');

      // Catch JSON/markdown continuation chunks - but not normal speech with contractions
      const hasContraction = /\b(I'm|I've|I'll|I'd|you're|you've|you'll|we're|we've|they're|it's|that's|what's|there's|here's|let's|won't|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't)\b/i.test(trimmed);
      
      if (looksLikeJsonContinuation && buffer.length < 80 && !hasContraction) {
        log.debug(
          { preview: buffer.slice(0, 40) },
          '🗑️ Suppressing JSON/markdown continuation chunk'
        );
        buffer = '';
        return;
      }

      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        log.warn(
          { buffer, ...detection },
          '🚨 STREAMING TOOL CALL LEAKAGE - Filtering malformed output'
        );

        // Check if this is a music request that needs fallback execution
        const musicQuery = extractMusicQuery(buffer);
        if (musicQuery && detection.toolName?.toLowerCase().includes('music')) {
          // Fire off the music fallback (don't await - it runs in background)
          // 🐛 FIX: Add catch to prevent silent failures
          void tryMusicFallback(musicQuery).catch((e) => {
            log.debug({ error: String(e), musicQuery }, '🎵 Music fallback failed (non-critical)');
          });
        }

        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(`${replacement} `);
        }

        suppressMode = true;
        buffer = '';
        waitForMoreContext = false;
        return;
      }

      if (buffer.length < 50 && mightBePartialToolCall(buffer)) {
        waitForMoreContext = true;
        return;
      }

      if (waitForMoreContext && hasWordBoundary(chunk) && buffer.length > 30) {
        const recheckDetection = detectsFunctionCallLeakage(buffer);
        if (recheckDetection.detected) {
          // Check for music fallback
          const musicQuery = extractMusicQuery(buffer);
          if (musicQuery && recheckDetection.toolName?.toLowerCase().includes('music')) {
            // 🐛 FIX: Add catch to prevent silent failures
            void tryMusicFallback(musicQuery).catch((e) => {
              log.debug(
                { error: String(e), musicQuery },
                '🎵 Music fallback failed (non-critical)'
              );
            });
          }

          const replacement = getReplacementText(recheckDetection);
          if (replacement) {
            controller.enqueue(`${replacement} `);
          }
          suppressMode = true;
          buffer = '';
          waitForMoreContext = false;
          return;
        }
        waitForMoreContext = false;
      }

      // 🛡️ LOOK-AHEAD: Also wait if guidance block might be coming (buffer ends with newline, etc.)
      // This prevents emitting speech before [INTERNAL GUIDANCE] block arrives
      const guidanceMightFollow = mightHaveGuidanceComing(buffer) && buffer.length < 400;
      if (buffer.length > 150 && !waitForMoreContext && !guidanceMightFollow) {
        // 🔍 DIAGNOSTIC: Last-chance check for JSON before passing to TTS
        if (buffer.includes('{"fn"') || buffer.includes('"fn":') || buffer.includes('"args":')) {
          log.warn(
            { buffer: buffer.slice(0, 200), length: buffer.length },
            '🚨 POTENTIAL JSON LEAKAGE: Buffer contains fn/args patterns but about to pass to TTS!'
          );
          // Try one more time to detect JSON before passing through
          const lastChanceJson = detectJsonFunctionCall(buffer);
          if (lastChanceJson) {
            // 🔒 PER-STREAM DEDUPLICATION: Check if we already executed this exact tool+args
            const toolKey = makeToolKey(lastChanceJson.fn, lastChanceJson.args);
            if (executedToolsThisStream.has(toolKey)) {
              log.warn(
                { fn: lastChanceJson.fn, args: lastChanceJson.args },
                '🚫 DEDUP: Skipping last-chance - exact tool+args already executed'
              );
              buffer = '';
              return;
            }

            // 🔒 RACE CONDITION FIX: Check if tool already executing to prevent duplicates
            if (toolExecutionInProgress) {
              log.warn(
                { fn: lastChanceJson.fn, activeTool: activeToolId },
                '🚫 DEDUP: Skipping last-chance execution - tool already in progress'
              );
              buffer = '';
              return;
            }

            log.info(
              { fn: lastChanceJson.fn },
              '🎯 LAST-CHANCE SAVE: Detected JSON that earlier checks missed!'
            );

            // 🔒 Mark this tool+args as executed
            executedToolsThisStream.add(toolKey);
            
            // 🔒 RACE CONDITION FIX: Set tool execution flag BEFORE async execution
            toolExecutionInProgress = true;
            activeToolId = lastChanceJson.fn;
            
            // Execute the tool
            // Pass sessionId/userId/personaId for observability tracking (Option C: semantic router primary)
            jsonToolExecuted = true; // 🎯 Mark that we handled JSON - skip semantic fallback
            executeJsonFunctionCall(lastChanceJson, sessionId, toolContext?.userId, toolContext?.personaId)
              .then(async (result) => {
                log.info(
                  { fn: lastChanceJson.fn, success: result?.success },
                  '✅ Last-chance tool executed'
                );
                // Speak the result if we have a session
                if (result?.success && result.result && session) {
                  try {
                    const { safeGenerateReply, formatToolResult } =
                      await import('./safe-generate-reply.js');
                    const resultText =
                      typeof result.result === 'string'
                        ? result.result
                        : JSON.stringify(result.result);
                    const instructions = formatToolResult(lastChanceJson.fn, resultText);
                    await safeGenerateReply(session, {
                      instructions,
                      allowInterruptions: true,
                      context: `last-chance-tool-${lastChanceJson.fn}`,
                      // FIX: Pass sessionId so safeGenerateReply can skip if session is closing
                      sessionId,
                    });
                  } catch (speakErr) {
                    log.warn({ error: String(speakErr) }, 'Last-chance tool result speak failed');
                  }
                }
              })
              .catch((err) => {
                log.error(
                  { fn: lastChanceJson.fn, error: String(err) },
                  '❌ Last-chance tool failed'
                );
              })
              .finally(() => {
                // 🔒 RACE CONDITION FIX: Always clear tool execution flag
                toolExecutionInProgress = false;
                activeToolId = null;
                log.debug({ fn: lastChanceJson.fn }, '🔒 Last-chance tool execution flag cleared');
              });
            suppressMode = true;
            suppressChunksRemaining = SUPPRESS_CHUNKS_AFTER_JSON;
            buffer = '';
            return;
          }
        }

        // 🛡️ CRITICAL FIX: Strip guidance blocks before sending to TTS
        // This catches [INTERNAL GUIDANCE]... blocks that the LLM echoes back
        const cleanedBuffer = stripGuidanceBlocks(buffer);
        if (cleanedBuffer) {
          // 🎯 Accumulate text for post-LLM semantic routing fallback
          accumulatedTextForSemanticFallback += cleanedBuffer + ' ';
          controller.enqueue(cleanedBuffer);
        }
        buffer = '';
      }
    },

    flush(controller: { enqueue: (s: string) => void }) {
      // 🐛 FIX: Mark stream as closed FIRST to prevent race conditions
      // Any pending async tool executions will see this flag and skip enqueue
      streamClosed = true;

      // Clean up state integration
      if (stateIntegration && sessionId) {
        stateIntegration.cleanupSanitizerIntegration(sessionId);
      }

      // 🔧 FIX: Handle partial JSON in accumulator (user interrupted mid-JSON)
      // If jsonAccumulator has partial JSON, suppress it - don't speak raw JSON!
      if (jsonAccumulatorActive && jsonAccumulator) {
        log.warn(
          { accumulated: jsonAccumulator.slice(0, 100), length: jsonAccumulator.length },
          '🔧 PARTIAL JSON SUPPRESSED: User interrupted mid-JSON output'
        );
        // Don't emit partial JSON - it would be spoken as "fn colon speak args colon..."
        jsonAccumulator = '';
        jsonAccumulatorActive = false;
      }

      if (buffer && !suppressMode) {
        const finalCheck = detectsFunctionCallLeakage(buffer);
        if (finalCheck.detected) {
          // Check for music fallback
          const musicQuery = extractMusicQuery(buffer);
          if (musicQuery && finalCheck.toolName?.toLowerCase().includes('music')) {
            // 🐛 FIX: Add catch to prevent silent failures
            void tryMusicFallback(musicQuery).catch((e) => {
              log.debug(
                { error: String(e), musicQuery },
                '🎵 Music fallback failed (non-critical)'
              );
            });
          }

          const replacement = getReplacementText(finalCheck);
          if (replacement) {
            controller.enqueue(replacement);
          }
        } else {
          // 🛡️ CRITICAL FIX: Strip guidance blocks before sending to TTS
          const cleanedBuffer = stripGuidanceBlocks(buffer);
          if (cleanedBuffer) {
            // 🎯 Accumulate final text for semantic fallback
            accumulatedTextForSemanticFallback += cleanedBuffer;
            controller.enqueue(cleanedBuffer);
          }
        }
      }

      // 🎯 POST-LLM SEMANTIC ROUTING FALLBACK (Dec 2024)
      // If no JSON tool was executed during this stream, run semantic routing
      // on the accumulated text as a safety net for when Gemini forgets JSON format.
      // 
      // ⚠️ DISABLED (Dec 25, 2024): This was routing LLM OUTPUT text (not user input),
      // causing false tool executions when LLM says things like "the call is in progress".
      // The fallback was triggering telephony_call, learning_explain etc on conversational text.
      // 
      // To re-enable, we need to:
      // 1. Only route on actual user INTENT, not LLM response text
      // 2. Add anti-patterns for conversational phrases like "call is", "is in progress"
      // 3. Or use the accumulatedText from USER input, not LLM output
      const ENABLE_POST_LLM_FALLBACK = false;
      
      if (ENABLE_POST_LLM_FALLBACK && !jsonToolExecuted && accumulatedTextForSemanticFallback.trim().length > 10) {
        const textToRoute = accumulatedTextForSemanticFallback.trim();
        log.info(
          { textLength: textToRoute.length, preview: textToRoute.slice(0, 100) },
          '🎯 POST-LLM SEMANTIC FALLBACK: No JSON executed, checking accumulated text'
        );

        // Run semantic routing asynchronously (don't block the stream close)
        void (async () => {
          try {
            const { routeUserInput } = await import('../../tools/semantic-router/router.js');
            const routingResult = await routeUserInput(textToRoute, {
              sessionId,
              personaId: toolContext?.personaId,
              userId: toolContext?.userId,
            });

            // Only execute for VERY high-confidence matches (0.95+ for post-LLM fallback)
            // Raised from 0.85 because it was misfiring on conversational text
            // TODO: Fix semantic router confidence scoring before lowering this
            const topMatch = routingResult.matches?.[0];
            if (
              routingResult.action?.type === 'execute' &&
              topMatch &&
              topMatch.confidence >= 0.95
            ) {
              log.info(
                {
                  toolId: topMatch.toolId,
                  confidence: topMatch.confidence,
                  text: textToRoute.slice(0, 50),
                },
                '🎯 POST-LLM SEMANTIC FALLBACK: High-confidence tool match! Executing...'
              );

              // Execute via domain bridge
              const { hasDomainMapping, executeDomainTool } = await import(
                '../../tools/semantic-router/domain-bridge.js'
              );

              if (hasDomainMapping(topMatch.toolId)) {
                const execResult = await executeDomainTool(topMatch.toolId, routingResult.extractedArgs || {}, {
                  userId: toolContext?.userId || 'unknown',
                  sessionId: sessionId || 'unknown',
                  personaId: toolContext?.personaId || 'ferni',
                  conversationHistory: toolContext?.conversationHistory || [],
                  services: toolContext?.services || undefined,
                });

                if (execResult.success) {
                  const resultData = execResult.naturalResponse || execResult.data;
                  log.info(
                    { toolId: topMatch.toolId, result: String(resultData).slice(0, 100) },
                    '✅ POST-LLM SEMANTIC FALLBACK: Tool executed successfully'
                  );

                  // Speak the result if we have a session
                  if (session?.generateReply && resultData) {
                    const resultText = typeof resultData === 'string'
                      ? resultData
                      : JSON.stringify(resultData);
                    
                    session.generateReply({
                      instructions: `I just executed ${topMatch.toolId} for the user. Briefly acknowledge: "${resultText.slice(0, 200)}"`,
                      allowInterruptions: true,
                    });
                  }
                } else {
                  log.warn(
                    { toolId: topMatch.toolId, error: execResult.error },
                    '⚠️ POST-LLM SEMANTIC FALLBACK: Tool execution failed'
                  );
                }
              } else {
                log.debug(
                  { toolId: topMatch.toolId },
                  '🎯 POST-LLM SEMANTIC FALLBACK: No domain mapping for tool'
                );
              }
            } else {
              log.debug(
                {
                  action: routingResult.action?.type,
                  confidence: topMatch?.confidence,
                  threshold: 0.85,
                },
                '🎯 POST-LLM SEMANTIC FALLBACK: No high-confidence tool match'
              );
            }
          } catch (err) {
            log.debug(
              { error: String(err) },
              '🎯 POST-LLM SEMANTIC FALLBACK: Error during routing (non-critical)'
            );
          }
        })();
      }
    },
  });
}
