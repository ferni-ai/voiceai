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

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { ConversationAnalysis } from '../services/index.js';

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
      custom: (a, text) => a.intent.requiresEmpathy && a.emotion.distressLevel < 0.6,
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
      custom: (a, text) => {
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
    name: 'Market Panic Prevention',
    category: 'life_event',
    priority: 10,
    triggers: {
      keywords:
        /\b(sell everything|get out|cash out|panic|crash|losing everything|should i sell|pull out|move to cash)\b/i,
      custom: (a) => a.emotion.primary === 'fear' && a.emotion.distressLevel > 0.4,
    },
    instructions: {
      base: `[MARKET PANIC DETECTED - CRITICAL INTERVENTION]
      
      DO NOT dismiss their fear. The fear is REAL.
      
      STEP 1 - VALIDATE: "I hear the fear in your voice. Let's slow down."
      STEP 2 - DON'T LET THEM ACT: "Before you do anything, let's just talk."
      STEP 3 - PERSPECTIVE: "I've seen 1973, 1987, 2000, 2008... and I'm still here."
      STEP 4 - PRACTICAL: "Let's look at what you actually need in the next 5 years."
      
      VOICE: Calm, steady, wise. Like a parent calming a scared child.
      
      Remember: Panic selling is the #1 wealth destroyer. Your job is to prevent it.`,
    },
    completion: {
      custom: (a) => a.emotion.distressLevel < 0.4 && a.emotion.primary !== 'fear',
    },
    transitions: {
      entry: ['Let me tell you a story about 2008...'],
      exit: ['Remember: Time in the market beats timing the market.'],
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
      - Rush to financial matters
      - Offer platitudes ("They're in a better place")
      - Try to fix their grief
      
      If they bring up finances: "We can talk about that whenever you're ready. No rush."`,
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
      
      DO NOT: Jump to financial advice immediately.
      
      LISTEN: Understand the emotional impact first.
      - Job loss: Fear, shame, identity crisis
      - Divorce: Grief, anger, uncertainty
      - Baby: Joy mixed with anxiety
      - Retirement: Freedom mixed with loss of identity
      
      AFTER they share: "When you're ready, we can talk practical steps. No rush."`,
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
    name: 'Share Investing Wisdom',
    category: 'advice',
    priority: 5,
    triggers: {
      intents: ['seeking_advice', 'asking_question', 'requesting_info'],
      phases: ['advising'],
    },
    instructions: {
      base: `Share wisdom through STORIES, not lectures.
      
      Good: "Let me tell you about 1974... I was just starting Vanguard..."
      Bad: "The principle of diversification states that..."
      
      Connect your experience to their situation.
      Ask questions to make it a conversation.
      
      Use the Four Principles:
      1. Goals - What are they trying to achieve?
      2. Balance - Stocks, bonds, based on timeline
      3. Cost - Fees eat returns
      4. Discipline - Stay the course`,
    },
    completion: {
      afterTurns: 4,
      custom: (a) => a.intent.primary !== 'seeking_advice',
    },
  },

  {
    id: 'fear_addressing',
    name: 'Address Financial Fears',
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
      3. PERSPECTIVE: Share relevant history or experience
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
];

// ============================================================================
// TASK MANAGER
// ============================================================================

export class TaskManager {
  private activeTasks: Map<string, ActiveTask> = new Map();
  private completedTasks: Set<string> = new Set();
  private logger = getLogger();

  // Callback for feeding task insights to the learning engine
  private insightCallback:
    | ((type: string, key: string, value: unknown, confidence: number) => void)
    | null = null;

  /**
   * Set the callback for capturing task insights
   * Called by bogle-agent.ts to wire learning
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
      const wisdom = activeTask.wisdom;
      let instructions = wisdom.instructions.base;

      // Add conditional instructions
      if (analysis.emotion.distressLevel > 0.5 && wisdom.instructions.ifDistressed) {
        instructions += '\n\n' + wisdom.instructions.ifDistressed;
      } else if (analysis.emotion.valence === 'positive' && wisdom.instructions.ifPositive) {
        instructions += '\n\n' + wisdom.instructions.ifPositive;
      }
      if (context?.isReturningUser && wisdom.instructions.ifReturning) {
        instructions += '\n\n' + wisdom.instructions.ifReturning;
      }

      // Add entry transition on first turn
      if (activeTask.turnCount === 1 && wisdom.transitions?.entry) {
        const entryPhrase =
          wisdom.transitions.entry[Math.floor(Math.random() * wisdom.transitions.entry.length)];
        instructions = `[TRANSITION] Start with: "${entryPhrase}"\n\n${instructions}`;
      }

      contextParts.push(instructions);
    }

    return contextParts;
  }

  /**
   * Check if a task should be triggered
   */
  private shouldTrigger(
    wisdom: TaskWisdom,
    analysis: ConversationAnalysis,
    userText: string
  ): boolean {
    const triggers = wisdom.triggers;

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
    const completion = activeTask.wisdom.completion;
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
