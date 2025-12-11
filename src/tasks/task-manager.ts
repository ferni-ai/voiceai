/**
 * Task Manager - Non-blocking task orchestration
 *
 * Instead of blocking the conversation with awaited tasks,
 * this manager:
 * 1. Detects when tasks should be activated based on conversation context
 * 2. Injects task wisdom/instructions into the LLM prompt
 * 3. Tracks task completion based on conversation analysis
 * 4. Manages task priority and transitions
 */

import { getLogger } from '../utils/safe-logger.js';
// Import directly from types to avoid circular dependency through services/index
import type { ConversationAnalysis } from '../services/types.js';
import {
  getContextualTransition,
  getTransition,
  TASK_TRANSITIONS,
  type TransitionKey,
} from './transitions.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskWisdom {
  id: string;
  name: string;
  category: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event';
  priority: number; // 1-10, higher = more important

  // Trigger conditions
  triggers: {
    emotions?: string[]; // Trigger on these emotions
    distressThreshold?: number; // Trigger if distress > threshold
    intents?: string[]; // Trigger on these intents
    keywords?: RegExp; // Trigger on keyword match
    phases?: string[]; // Trigger in these conversation phases
    custom?: (analysis: ConversationAnalysis, userText: string) => boolean;
  };

  // Instructions to inject
  instructions: {
    base: string;
    ifDistressed?: string;
    ifPositive?: string;
    ifReturning?: string;
  };

  // Completion detection
  completion?: {
    afterTurns?: number; // Complete after N turns
    onEmotionChange?: boolean; // Complete when emotion improves
    onKeywords?: RegExp; // Complete when user says these things
    custom?: (analysis: ConversationAnalysis, userText: string) => boolean;
  };

  // Transition guidance
  transitions?: {
    entry?: string[]; // Phrases to start
    exit?: string[]; // Phrases to end
    toTask?: string; // ID of next task
  };
}

export interface ActiveTask {
  wisdom: TaskWisdom;
  startedAt: Date;
  turnCount: number;
  initialDistress: number;
}

// ============================================================================
// TASK WISDOM DATABASE
// ============================================================================

export const TASK_WISDOM: TaskWisdom[] = [
  // ========== MICRO TASKS ==========
  {
    id: 'quick_acknowledge',
    name: 'Quick Acknowledgment',
    category: 'micro',
    priority: 9,
    triggers: {
      intents: ['confiding', 'venting', 'sharing_news'],
      custom: (a) => a.intent.requiresEmpathy && a.emotion.distressLevel < 0.6,
    },
    instructions: {
      base: `Simply ACKNOWLEDGE what they said. Nothing more.
      
      Good: "I hear you." "That's a lot to carry." "Thank you for sharing that."
      
      DO NOT: Offer advice, try to fix it, change subject, add "but..."`,
      ifDistressed: `Extra gentle. Extra brief. "I'm here." is enough.`,
    },
    completion: {
      afterTurns: 1,
    },
  },

  {
    id: 'quick_celebrate',
    name: 'Quick Celebration',
    category: 'micro',
    priority: 8,
    triggers: {
      emotions: ['joy', 'excitement', 'pride'],
      intents: ['sharing_news'],
      custom: (a) => a.emotion.valence === 'positive' && a.emotion.intensity > 0.6,
    },
    instructions: {
      base: `They shared something wonderful! CELEBRATE with them!
      
      Match their energy. Be genuinely happy for them.
      "That's wonderful!" "I'm so happy for you!" "What an achievement!"
      
      DO NOT: Downplay it. Rush to next topic. Add caveats.
      Let them enjoy this moment.`,
    },
    completion: {
      afterTurns: 1,
    },
  },

  {
    id: 'quick_validate',
    name: 'Quick Validation',
    category: 'micro',
    priority: 8,
    triggers: {
      keywords:
        /\b(am i crazy|is it wrong|should i feel|normal to|stupid for|bad for|wrong to want)\b/i,
      custom: (a) => a.emotion.primary === 'fear' && a.emotion.distressLevel < 0.6,
    },
    instructions: {
      base: `They need validation, not advice.
      
      "That makes complete sense." "Of course you feel that way."
      "There's nothing wrong with that." "You're not crazy for thinking that."
      
      DO NOT: Add "but..." or immediately pivot to solutions.`,
    },
    completion: {
      afterTurns: 1,
    },
  },

  // ========== SUPPORT TASKS ==========
  {
    id: 'emotional_support',
    name: 'Emotional Support',
    category: 'support',
    priority: 10, // Highest priority
    triggers: {
      distressThreshold: 0.7,
      custom: (a) => a.emotion.distressLevel > 0.7,
    },
    instructions: {
      base: `[EMOTIONAL CRISIS DETECTED]
      
      STOP everything. This person needs you to be PRESENT, not helpful.
      
      DO: 
      - "I can hear this is really hard."
      - "I'm here."
      - "Take your time."
      - Let silence be okay.
      
      DO NOT: 
      - Offer advice or solutions
      - Look for silver linings
      - Change the subject
      - Rush them
      
      VOICE: Soft, slow, gentle. Long pauses are okay.`,
      ifDistressed: `Be extra present. Don't say much. Just be there.`,
    },
    completion: {
      onEmotionChange: true,
      custom: (a) => a.emotion.distressLevel < 0.5,
    },
    transitions: {
      exit: ["Whenever you're ready...", 'No rush at all...', "I'm here as long as you need."],
    },
  },

  {
    id: 'check_in',
    name: 'Emotional Check-In',
    category: 'support',
    priority: 6,
    triggers: {
      custom: (a) => {
        // After heavy topics, check in
        return a.emotion.valence === 'negative' && a.emotion.distressLevel > 0.3;
      },
    },
    instructions: {
      base: `Gently check in on how they're feeling.
      
      "How are you doing with all this?"
      "That's a lot. How are you holding up?"
      "I want to make sure you're okay."
      
      Listen to their answer. Don't rush past it.`,
    },
    completion: {
      afterTurns: 2,
    },
  },

  // ========== LIFE EVENT TASKS ==========
  {
    id: 'panic_prevention',
    name: 'Panic Prevention',
    category: 'life_event',
    priority: 10,
    triggers: {
      keywords:
        /\b(panic|freaking out|losing it|can't handle|too much|overwhelmed|should i quit|want to give up|need to escape)\b/i,
      custom: (a) => a.emotion.primary === 'fear' && a.emotion.distressLevel > 0.4,
    },
    instructions: {
      base: `[PANIC DETECTED - CRITICAL INTERVENTION]
      
      DO NOT dismiss their fear. The fear is REAL.
      
      STEP 1 - VALIDATE: "I hear the fear in your voice. Let's slow down."
      STEP 2 - DON'T LET THEM ACT RASHLY: "Before you do anything, let's just talk."
      STEP 3 - PERSPECTIVE: Help them see the bigger picture
      STEP 4 - PRACTICAL: "Let's look at what you actually need right now."
      
      VOICE: Calm, steady, grounding. Like a calm presence in a storm.
      
      Remember: Panic-driven decisions often make things worse. Your job is to help them pause.`,
    },
    completion: {
      custom: (a) => a.emotion.distressLevel < 0.4 && a.emotion.primary !== 'fear',
    },
    transitions: {
      entry: ['Let me share something that might help...'],
      exit: ['Remember: You have more time than you think.'],
    },
  },

  {
    id: 'grief_support',
    name: 'Grief Support',
    category: 'life_event',
    priority: 10,
    triggers: {
      keywords:
        /\b(passed away|died|lost my|funeral|grieving|mourning|miss (him|her|them)|death|widow|widower)\b/i,
      custom: (a) => a.emotion.distressLevel > 0.5,
    },
    instructions: {
      base: `[GRIEF DETECTED]
      
      Grief is not a problem to solve. It's an experience to WITNESS.
      
      YOUR ONLY JOB:
      1. BE PRESENT - "I'm here."
      2. VALIDATE - "There are no words for this kind of loss."
      3. REMEMBER WITH THEM - If they want to talk about the person, listen.
      4. NO TIMELINE - Don't suggest they should be "over it" or "moving on"
      
      DO NOT:
      - Rush to practical matters
      - Offer platitudes ("They're in a better place")
      - Try to fix their grief
      
      If they bring up logistics: "We can talk about that whenever you're ready. No rush."`,
    },
    completion: {
      custom: (a, text) => /thank you|that helps|i appreciate/i.test(text),
    },
  },

  {
    id: 'life_change',
    name: 'Major Life Change Support',
    category: 'life_event',
    priority: 9,
    triggers: {
      keywords:
        /\b(lost my job|got fired|laid off|divorced|getting divorced|new baby|having a baby|retiring|just retired|inheritance|selling (house|business)|moving)\b/i,
    },
    instructions: {
      base: `[MAJOR LIFE CHANGE DETECTED]
      
      EMPATHY FIRST: "That's a big transition. How are you handling it?"
      
      DO NOT: Jump to advice immediately.
      
      LISTEN: Understand the emotional impact first.
      - Job loss: Fear, shame, identity crisis
      - Divorce: Grief, anger, uncertainty
      - Baby: Joy mixed with anxiety
      - Retirement: Freedom mixed with loss of identity
      
      AFTER they share: "When you're ready, we can talk about next steps. No rush."`,
    },
    completion: {
      afterTurns: 3,
      custom: (a) => a.intent.primary === 'seeking_advice',
    },
  },

  {
    id: 'milestone_celebration',
    name: 'Milestone Celebration',
    category: 'life_event',
    priority: 7,
    triggers: {
      keywords: /\b(paid off|debt free|reached|hit|milestone|goal|saved|first|finally)\b/i,
      custom: (a) => a.emotion.valence === 'positive',
    },
    instructions: {
      base: `[MILESTONE ACHIEVED - CELEBRATE!]
      
      This is a BIG DEAL. Don't minimize it.
      
      "That's incredible! How does it feel?"
      "You should be proud. That takes real discipline."
      "Let's savor this moment."
      
      Ask them to tell you more. Let them enjoy the victory.
      
      THEN (and only then): "What's next for you?"`,
    },
    completion: {
      afterTurns: 2,
    },
  },

  // ========== ADVICE TASKS ==========
  {
    id: 'wisdom_sharing',
    name: 'Share Wisdom',
    category: 'advice',
    priority: 5,
    triggers: {
      intents: ['seeking_advice', 'asking_question', 'requesting_info'],
      phases: ['advising'],
    },
    instructions: {
      base: `Share wisdom through STORIES and EXPERIENCE, not lectures.
      
      Good: "Let me share something I've learned..."
      Bad: "The principle of X states that..."
      
      Connect your experience to their situation.
      Ask questions to make it a conversation.
      
      Key approach:
      1. Understand what they're trying to achieve
      2. Meet them where they are
      3. Share relevant experience
      4. Help them find their own answer`,
    },
    completion: {
      afterTurns: 4,
      custom: (a) => a.intent.primary !== 'seeking_advice',
    },
  },

  {
    id: 'fear_addressing',
    name: 'Address Fears',
    category: 'advice',
    priority: 7,
    triggers: {
      emotions: ['fear', 'anxiety'],
      keywords: /\b(afraid|scared|worried|nervous|concerned|fear|what if)\b/i,
      custom: (a) => a.emotion.primary === 'fear' && a.emotion.distressLevel < 0.7,
    },
    instructions: {
      base: `They're scared. Validate first, then reassure with perspective.
      
      1. VALIDATE: "That's a reasonable worry."
      2. NORMALIZE: "Everyone feels this way sometimes."
      3. PERSPECTIVE: Share relevant experience or reframe
      4. PRACTICAL: Simple, concrete next step (if they want one)
      
      DO NOT: Dismiss their fear as irrational.`,
    },
    completion: {
      onEmotionChange: true,
      custom: (a) => a.emotion.distressLevel < 0.3,
    },
  },

  // ========== RELATIONSHIP TASKS ==========
  {
    id: 'follow_up',
    name: 'Follow Up on Previous Conversation',
    category: 'relationship',
    priority: 8,
    triggers: {
      // This task is manually triggered for returning users
      custom: () => false, // Will be manually triggered based on user data
    },
    instructions: {
      base: `[RETURNING USER - FOLLOW UP]
      
      They're back! Show you remember.
      
      "Last time we talked about [topic]. How did that go?"
      "I've been thinking about what you shared..."
      "Did you end up [action they mentioned]?"
      
      This shows you CARE and REMEMBER.`,
    },
    completion: {
      afterTurns: 2,
    },
  },

  {
    id: 'goodbye',
    name: 'Warm Goodbye',
    category: 'relationship',
    priority: 6,
    triggers: {
      keywords:
        /\b(goodbye|bye|gotta go|have to go|talk later|thanks for|nice talking|need to run)\b/i,
      custom: (a) => a.intent.primary === 'ending_conversation',
    },
    instructions: {
      base: `They're leaving. Make them feel valued.
      
      "It was wonderful talking with you."
      "Take care of yourself."
      "I'll be here whenever you want to chat."
      
      If appropriate: "Remember what we talked about - [key takeaway]."
      
      DO NOT: Rush them out or add new topics.`,
    },
    completion: {
      afterTurns: 1,
    },
  },

  // ========== FINANCE DOMAIN TASKS (Nayan/Jack Bogle) ==========
  {
    id: 'market_panic',
    name: 'Market Panic Prevention',
    category: 'life_event',
    priority: 10,
    triggers: {
      keywords:
        /\b(market crash|sell everything|portfolio down|stocks tanking|recession|bear market|lost half|market collapse|panic sell)\b/i,
      custom: (a) => a.emotion.primary === 'fear' && a.emotion.distressLevel > 0.5,
    },
    instructions: {
      base: `[MARKET PANIC DETECTED - CRITICAL INTERVENTION]
      
      Time is your friend; impulse is your enemy.
      
      DO:
      - "I can hear the fear. Let's slow down before doing anything."
      - "Markets go down. They also go back up. Always have."
      - "What would you tell a friend in this situation?"
      - "Let's look at the big picture here."
      
      DO NOT:
      - Let them sell in panic
      - Promise market recovery timing
      - Minimize their fear (it's real)
      
      Key wisdom: "Stay the course. The market rewards patience, punishes panic."`,
      ifDistressed: `This is pure fear talking. Your only job is to prevent a rash decision.
      "Before you do ANYTHING, let's talk this through. No rush."`,
    },
    completion: {
      custom: (a) => a.emotion.distressLevel < 0.4 && a.emotion.primary !== 'fear',
    },
    transitions: {
      entry: ['Let me share something about times like this...'],
      exit: ['Remember: You have more time than you think.'],
    },
  },

  {
    id: 'investment_wisdom',
    name: 'Investment Wisdom Sharing',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords:
        /\b(invest|portfolio|stocks|bonds|index fund|401k|retirement|compound|dividends|allocation)\b/i,
      intents: ['seeking_advice', 'asking_question'],
      phases: ['advising'],
    },
    instructions: {
      base: `Share investment wisdom through PRINCIPLES, not predictions.
      
      Core tenets:
      - "Don't look for the needle, buy the haystack" (index funds)
      - "Time in the market beats timing the market"
      - "Costs matter. Keep them low."
      - "Simple beats complex every time."
      
      Personalize to their situation. Ask about their timeline.
      Connect investing to their life goals, not just returns.`,
    },
    completion: {
      afterTurns: 4,
      custom: (a) => a.intent.primary !== 'seeking_advice',
    },
  },

  {
    id: 'rebalancing_guidance',
    name: 'Portfolio Rebalancing',
    category: 'advice',
    priority: 6,
    triggers: {
      keywords: /\b(rebalance|allocation|too much in|percentage|mix|diversif)\b/i,
    },
    instructions: {
      base: `They're asking about portfolio balance.
      
      Guidance:
      - Rebalancing is about maintaining your plan, not chasing returns
      - Once a year is usually enough
      - Use contributions to rebalance when possible (avoids taxes)
      - Your allocation should match your timeline and risk tolerance
      
      "What matters is the plan you can stick with through thick and thin."`,
    },
    completion: {
      afterTurns: 3,
    },
  },

  // ========== HABITS DOMAIN TASKS (Maya Santos) ==========
  {
    id: 'habit_struggle',
    name: 'Habit Struggle Support',
    category: 'support',
    priority: 7,
    triggers: {
      keywords:
        /\b(can't stick|keep failing|no discipline|broke my streak|fell off|habit broken|stopped doing|gave up on)\b/i,
    },
    instructions: {
      base: `[HABIT STRUGGLE DETECTED]
      
      DO NOT shame them. Habits are hard. Setbacks are NORMAL.
      
      Approach:
      1. VALIDATE: "Habits are genuinely hard. You're not failing."
      2. CURIOSITY: "What got in the way? Let's understand, not judge."
      3. REFRAME: "Every restart is a chance to learn what doesn't work."
      4. SIMPLIFY: "Maybe we made it too hard. What's the tiniest version?"
      
      The goal isn't perfection. It's getting back on track.`,
      ifDistressed: `They feel like a failure. Counter that:
      "You haven't failed. You've learned something. That's progress."`,
    },
    completion: {
      afterTurns: 3,
      onEmotionChange: true,
    },
  },

  {
    id: 'habit_building',
    name: 'Habit Building Support',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords:
        /\b(start a habit|build a habit|new routine|want to start|trying to make|habit stack)\b/i,
      intents: ['seeking_advice'],
    },
    instructions: {
      base: `They want to build a new habit. Help them set up for success.
      
      The habit loop:
      - CUE: What triggers the habit? (time, location, action)
      - ROUTINE: What's the SMALLEST version? (2 minutes or less)
      - REWARD: How will you celebrate? (essential!)
      
      Questions to ask:
      - "When and where will you do this?"
      - "What's the smallest version that still counts?"
      - "What existing habit can this attach to?"
      
      Make it obvious, attractive, easy, and satisfying.`,
    },
    completion: {
      afterTurns: 4,
    },
  },

  {
    id: 'routine_design',
    name: 'Routine Design',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords: /\b(morning routine|evening routine|daily routine|schedule|structure my day)\b/i,
    },
    instructions: {
      base: `They want help with their routine.
      
      Good routines:
      - Start with how you want to FEEL, not what you want to DO
      - Anchor to existing habits (coffee → journaling)
      - Build in transition rituals
      - Leave buffer time
      - Include both energy and recovery
      
      Ask: "What does your ideal morning/evening FEEL like?"
      Start there, then work backward to the activities.`,
    },
    completion: {
      afterTurns: 4,
    },
  },

  // ========== RESEARCH DOMAIN TASKS (Peter John) ==========
  {
    id: 'curiosity_exploration',
    name: 'Curiosity Exploration',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords:
        /\b(wondering about|curious about|want to learn|interested in|how does|why does|what is)\b/i,
      custom: (a) => a.emotion.primary === 'anticipation' && a.intent.primary === 'asking_question',
    },
    instructions: {
      base: `They're curious! Fan that flame.
      
      DO:
      - Match their excitement
      - Ask what sparked the curiosity
      - Offer multiple paths to explore
      - Share resources if appropriate
      
      "I love that you're curious about this. What specifically caught your attention?"
      
      Curiosity is the seed of all learning. Water it.`,
    },
    completion: {
      afterTurns: 3,
    },
  },

  {
    id: 'learning_project',
    name: 'Learning Project Planning',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords: /\b(want to learn|teach myself|study|take a course|get better at|skill|master)\b/i,
    },
    instructions: {
      base: `They want to learn something new. Help them plan.
      
      Good learning approach:
      1. WHY: Why do they want to learn this? (intrinsic motivation)
      2. WHAT: What's the specific outcome they want?
      3. HOW: What's their learning style? (reading, doing, watching)
      4. WHEN: How will they make time for it?
      
      "What would it look like if you mastered this? Paint me a picture."
      
      Connect learning to their values, not just utility.`,
    },
    completion: {
      afterTurns: 4,
    },
  },

  {
    id: 'deep_research',
    name: 'Deep Research Guidance',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords: /\b(research|investigate|deep dive|thorough|comprehensive|all the facts)\b/i,
    },
    instructions: {
      base: `They want to research something thoroughly.
      
      Good research approach:
      - Start with the question you're trying to answer
      - Look for primary sources when possible
      - Consider multiple perspectives
      - Note what you don't know
      - Set a time limit (avoid rabbit holes)
      
      "What's the core question you're trying to answer?"
      Help them focus before they dive deep.`,
    },
    completion: {
      afterTurns: 3,
    },
  },

  // ========== COMMUNICATIONS DOMAIN TASKS (Alex Chen) ==========
  {
    id: 'difficult_conversation',
    name: 'Difficult Conversation Prep',
    category: 'advice',
    priority: 7,
    triggers: {
      keywords:
        /\b(need to tell|have to say|hard conversation|awkward talk|confront|bring up|address the|break the news)\b/i,
      custom: (a) => a.emotion.primary === 'fear' && a.emotion.distressLevel < 0.6,
    },
    instructions: {
      base: `They need to have a difficult conversation.
      
      Help them prepare:
      1. INTENT: "What outcome do you actually want?"
      2. FACTS: "What happened vs what you interpreted?"
      3. FEELINGS: "How will you express your feelings without blame?"
      4. REQUEST: "What's your specific ask?"
      
      Framework: "When [fact], I felt [feeling]. What I need is [request]."
      
      Role-play if it helps. Validate the difficulty.`,
      ifDistressed: `The anticipation is worse than the conversation.
      "Let's slow down and think this through together."`,
    },
    completion: {
      afterTurns: 4,
    },
    transitions: {
      entry: ['Difficult conversations are hard. Let me help you prepare...'],
    },
  },

  {
    id: 'boundary_setting',
    name: 'Boundary Setting Support',
    category: 'advice',
    priority: 7,
    triggers: {
      keywords:
        /\b(set a boundary|say no|too much|taking advantage|can't keep|need to stop|overcommit|people pleaser)\b/i,
    },
    instructions: {
      base: `They need help setting boundaries.
      
      Boundary setting is a skill:
      - Boundaries are about YOUR behavior, not theirs
      - "No" is a complete sentence (but kindness helps)
      - Expect discomfort - it doesn't mean you're wrong
      - Start small and build up
      
      Help them craft the language:
      "I'm not able to [thing]. What I can do is [alternative]."
      
      Validate that it's hard. Boundaries are self-care.`,
    },
    completion: {
      afterTurns: 3,
    },
  },

  {
    id: 'message_crafting',
    name: 'Message Crafting',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords: /\b(write a message|help me say|how do I word|text them|email them|reply to)\b/i,
    },
    instructions: {
      base: `They need help crafting a message.
      
      Good messages:
      - Start with the relationship, not the task
      - Be clear and direct (kind, not vague)
      - One message, one topic
      - End with a clear next step
      
      Ask: "What do you want them to feel after reading this?"
      Help them find their authentic voice, don't write for them.`,
    },
    completion: {
      afterTurns: 3,
    },
  },

  // ========== EVENTS DOMAIN TASKS (Jordan Taylor) ==========
  {
    id: 'event_planning',
    name: 'Event Planning Support',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords:
        /\b(planning a|organize a|throw a|host a|party|celebration|gathering|event|wedding|birthday|shower)\b/i,
    },
    instructions: {
      base: `They're planning an event!
      
      Key questions:
      - Who is this for? (guest of honor, attendees)
      - What's the vibe? (formal, casual, surprise)
      - What's the budget? (be realistic)
      - What's non-negotiable? (one thing that MUST happen)
      
      Help them think through:
      - Guest list → venue → date → food → activities
      
      "What do you want people to remember about this event?"`,
    },
    completion: {
      afterTurns: 4,
    },
  },

  {
    id: 'special_date_reminder',
    name: 'Special Date Support',
    category: 'relationship',
    priority: 6,
    triggers: {
      keywords:
        /\b(anniversary|birthday coming|her birthday|his birthday|forget the date|special day|valentine|mother's day|father's day)\b/i,
    },
    instructions: {
      base: `A special date is coming up or being discussed.
      
      Help them:
      - Remember what made past celebrations meaningful
      - Think about what the person would ACTUALLY want
      - Balance effort with budget
      - Plan ahead to reduce stress
      
      "What would make this person feel truly celebrated?"
      It's about the thought, not the expense.`,
    },
    completion: {
      afterTurns: 3,
    },
  },

  {
    id: 'travel_planning',
    name: 'Travel Planning',
    category: 'advice',
    priority: 5,
    triggers: {
      keywords: /\b(trip to|vacation|travel|going to|visit|flight|hotel|itinerary)\b/i,
    },
    instructions: {
      base: `They're planning travel!
      
      Key questions:
      - What kind of trip? (adventure, relaxation, culture)
      - Who's going? (solo, couple, family, friends)
      - Budget reality check
      - Must-dos vs nice-to-haves
      
      Travel tips:
      - Leave buffer in the schedule
      - Book the non-negotiables first
      - Research one "local secret"
      - Have a Plan B for weather
      
      "What would make this trip unforgettable?"`,
    },
    completion: {
      afterTurns: 4,
    },
  },
];

// ============================================================================
// TASK MANAGER
// ============================================================================

export class TaskManager {
  private activeTasks = new Map<string, ActiveTask>();
  private completedTasks = new Set<string>();
  private logger = getLogger();

  // Callback for feeding task insights to the learning engine
  private insightCallback:
    | ((type: string, key: string, value: unknown, confidence: number) => void)
    | null = null;

  /**
   * Set the callback for capturing task insights
   */
  setInsightCallback(
    callback: (type: string, key: string, value: unknown, confidence: number) => void
  ): void {
    this.insightCallback = callback;
  }

  private captureInsight(type: string, key: string, value: unknown, confidence: number): void {
    if (this.insightCallback) {
      this.insightCallback(type, key, value, confidence);
    }
  }

  /**
   * Process a turn and return context to inject
   */
  processUserTurn(
    analysis: ConversationAnalysis,
    userText: string,
    context?: { isReturningUser?: boolean; lastSummary?: string }
  ): string[] {
    const contextParts: string[] = [];

    // 1. Check for task triggers
    for (const wisdom of TASK_WISDOM) {
      if (this.activeTasks.has(wisdom.id) || this.completedTasks.has(wisdom.id)) {
        continue;
      }

      if (this.shouldTrigger(wisdom, analysis, userText)) {
        this.activateTask(wisdom, analysis.emotion.distressLevel);
        this.logger.info({ taskId: wisdom.id }, `Task activated: ${wisdom.name}`);
      }
    }

    // 2. Check for task completions
    for (const [taskId, activeTask] of this.activeTasks) {
      activeTask.turnCount++;

      if (this.isTaskComplete(activeTask, analysis, userText)) {
        this.completedTasks.add(taskId);
        this.activeTasks.delete(taskId);
        this.logger.info({ taskId }, `Task completed: ${activeTask.wisdom.name}`);

        // Capture task completion as an insight for learning
        const distressImprovement = activeTask.initialDistress - analysis.emotion.distressLevel;
        this.captureInsight(
          'emotional_pattern',
          `task_${taskId}_completed`,
          {
            taskName: activeTask.wisdom.name,
            category: activeTask.wisdom.category,
            turnsToComplete: activeTask.turnCount,
            distressImprovement: distressImprovement > 0 ? distressImprovement : 0,
            wasEffective: distressImprovement > 0.1,
          },
          0.8
        );

        // Add exit transition if available
        if (activeTask.wisdom.transitions?.exit) {
          const exitPhrase =
            activeTask.wisdom.transitions.exit[
              Math.floor(Math.random() * activeTask.wisdom.transitions.exit.length)
            ];
          contextParts.push(`[TRANSITION] Consider saying: "${exitPhrase}"`);
        }
      }
    }

    // 3. Build context from active tasks (sorted by priority)
    const sortedTasks = Array.from(this.activeTasks.values()).sort(
      (a, b) => b.wisdom.priority - a.wisdom.priority
    );

    for (const activeTask of sortedTasks) {
      const { wisdom } = activeTask;
      let instructions = wisdom.instructions.base;

      // Add conditional instructions
      if (analysis.emotion.distressLevel > 0.5 && wisdom.instructions.ifDistressed) {
        instructions += `\n\n${wisdom.instructions.ifDistressed}`;
      } else if (analysis.emotion.valence === 'positive' && wisdom.instructions.ifPositive) {
        instructions += `\n\n${wisdom.instructions.ifPositive}`;
      }
      if (context?.isReturningUser && wisdom.instructions.ifReturning) {
        instructions += `\n\n${wisdom.instructions.ifReturning}`;
      }

      // Add entry transition on first turn
      if (activeTask.turnCount === 1) {
        const entryPhrase = this.getSmartEntryTransition(wisdom, analysis);
        instructions = `[TRANSITION] Start with: "${entryPhrase}"\n\n${instructions}`;
      }

      contextParts.push(instructions);
    }

    return contextParts;
  }

  /**
   * Get a contextually-appropriate entry transition for a task
   */
  private getSmartEntryTransition(wisdom: TaskWisdom, analysis: ConversationAnalysis): string {
    // If task has specific entry transitions, use those first
    if (wisdom.transitions?.entry && wisdom.transitions.entry.length > 0) {
      return wisdom.transitions.entry[Math.floor(Math.random() * wisdom.transitions.entry.length)];
    }

    // Otherwise, use contextual transitions based on task category and emotional state
    const taskToTransitionMap: Record<string, string> = {
      goals: 'toGoals',
      wisdom_sharing: 'toWisdom',
      investment_wisdom: 'toWisdom',
      fear_addressing: 'toFear',
      panic_prevention: 'toFear',
      market_panic: 'toFear',
      milestone_celebration: 'toCelebration',
      quick_celebrate: 'toCelebration',
      goodbye: 'toGoodbye',
    };

    // Check for task-specific transition
    const transitionKey = taskToTransitionMap[wisdom.id];
    if (transitionKey && transitionKey in TASK_TRANSITIONS) {
      return getTransition(transitionKey as TransitionKey);
    }

    // Use contextual transition based on emotional state
    const currentMood = this.getMoodFromAnalysis(analysis);
    const targetMood = this.getTargetMoodForCategory(wisdom.category);

    if (currentMood !== targetMood) {
      return getContextualTransition({
        fromMood: currentMood,
        toMood: targetMood,
      });
    }

    // Default to gentle entry
    return getTransition('gentle');
  }

  /**
   * Determine mood from analysis
   */
  private getMoodFromAnalysis(
    analysis: ConversationAnalysis
  ): 'light' | 'serious' | 'support' | 'practical' {
    if (analysis.emotion.distressLevel > 0.6) {
      return 'support';
    }
    if (analysis.emotion.valence === 'positive') {
      return 'light';
    }
    if (
      analysis.intent.primary === 'seeking_advice' ||
      analysis.intent.primary === 'asking_question'
    ) {
      return 'practical';
    }
    return 'serious';
  }

  /**
   * Determine target mood for a task category
   */
  private getTargetMoodForCategory(
    category: TaskWisdom['category']
  ): 'light' | 'serious' | 'support' | 'practical' {
    switch (category) {
      case 'support':
        return 'support';
      case 'micro':
        return 'light';
      case 'life_event':
        return 'support';
      case 'advice':
        return 'practical';
      case 'relationship':
        return 'light';
      default:
        return 'practical';
    }
  }

  /**
   * Check if a task should be triggered
   */
  private shouldTrigger(
    wisdom: TaskWisdom,
    analysis: ConversationAnalysis,
    userText: string
  ): boolean {
    const { triggers } = wisdom;

    // Check distress threshold
    if (triggers.distressThreshold !== undefined) {
      if (analysis.emotion.distressLevel > triggers.distressThreshold) {
        return true;
      }
    }

    // Check emotions
    if (triggers.emotions?.includes(analysis.emotion.primary)) {
      return true;
    }

    // Check intents
    if (triggers.intents?.includes(analysis.intent.primary)) {
      return true;
    }

    // Check keywords
    if (triggers.keywords?.test(userText)) {
      return true;
    }

    // Check phases
    if (triggers.phases?.includes(analysis.state.phase)) {
      return true;
    }

    // Check custom function
    if (triggers.custom?.(analysis, userText)) {
      return true;
    }

    return false;
  }

  /**
   * Activate a task
   */
  private activateTask(wisdom: TaskWisdom, initialDistress: number): void {
    // Deactivate lower priority tasks in same category if this is higher priority
    for (const [taskId, activeTask] of this.activeTasks) {
      if (
        activeTask.wisdom.category === wisdom.category &&
        activeTask.wisdom.priority < wisdom.priority
      ) {
        this.activeTasks.delete(taskId);
        this.logger.debug({ taskId }, 'Deactivated lower priority task');
      }
    }

    this.activeTasks.set(wisdom.id, {
      wisdom,
      startedAt: new Date(),
      turnCount: 0,
      initialDistress,
    });
  }

  /**
   * Check if a task is complete
   */
  private isTaskComplete(
    activeTask: ActiveTask,
    analysis: ConversationAnalysis,
    userText: string
  ): boolean {
    const { completion } = activeTask.wisdom;
    if (!completion) return false;

    // Check turn count
    if (completion.afterTurns && activeTask.turnCount >= completion.afterTurns) {
      return true;
    }

    // Check emotion change (distress improved significantly)
    if (completion.onEmotionChange) {
      if (analysis.emotion.distressLevel < activeTask.initialDistress - 0.2) {
        return true;
      }
    }

    // Check keywords
    if (completion.onKeywords?.test(userText)) {
      return true;
    }

    // Check custom function
    if (completion.custom?.(analysis, userText)) {
      return true;
    }

    return false;
  }

  /**
   * Manually trigger a specific task
   */
  triggerTask(taskId: string, analysis: ConversationAnalysis): boolean {
    const wisdom = TASK_WISDOM.find((w) => w.id === taskId);
    if (!wisdom) {
      this.logger.warn({ taskId }, 'Task not found');
      return false;
    }

    if (this.activeTasks.has(taskId) || this.completedTasks.has(taskId)) {
      return false;
    }

    this.activateTask(wisdom, analysis.emotion.distressLevel);
    return true;
  }

  /**
   * Get active task IDs
   */
  getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Reset the task manager (new session)
   */
  reset(): void {
    this.activeTasks.clear();
    this.completedTasks.clear();
    this.insightCallback = null;
  }
}

// Singleton instance
let taskManagerInstance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

export function resetTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.reset();
  }
  taskManagerInstance = null;
}

export default {
  TaskManager,
  getTaskManager,
  resetTaskManager,
  TASK_WISDOM,
};
