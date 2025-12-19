/**
 * Nayan's Wisdom Insights Context Builder
 *
 * > "Time in the market beats timing the market. Time in your life beats rushing your life."
 *
 * This builder loads Nayan with the BIG PICTURE when:
 * 1. A user transfers TO Nayan from another persona
 * 2. A user starts talking directly with Nayan
 *
 * NAYAN SEES EVERYTHING - The Full Life Synthesis:
 *
 * FROM PETER (Patterns):
 * - Financial behaviors and their deeper meaning
 * - Decision patterns revealing values
 * - What the numbers say about their life
 *
 * FROM MAYA (Habits):
 * - Daily rhythms and their significance
 * - Self-compassion journey
 * - Growth vs. striving patterns
 *
 * FROM JORDAN (Milestones):
 * - Life chapters and transitions
 * - What they're building toward
 * - Legacy and meaning signals
 *
 * FROM FERNI (Core):
 * - Emotional threads across time
 * - Relationship evolution
 * - The whole story so far
 *
 * @module intelligence/context-builders/nayan-wisdom-insights
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { getHandoffContext } from '../../tools/handoff/executor.js';
import { getFinancialStore } from '../../services/financial-store.js';
import { getProductivityStore } from '../../services/productivity-store.js';

const log = createLogger({ module: 'context:nayan-wisdom-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface NayanInsightBriefing {
  /** Life synthesis - the big picture */
  lifeSynthesis: LifeSynthesis;
  /** Wisdom opportunities */
  wisdomOpportunities: string[];
  /** Deep questions to explore */
  deepQuestions: string[];
  /** Cross-team synthesis */
  teamSynthesis: TeamSynthesis;
  /** Existential context */
  existentialContext: string | null;
}

interface LifeSynthesis {
  lifeChapter: string;
  dominantTheme: string | null;
  growthPattern: 'striving' | 'integrating' | 'resting' | 'transitioning' | 'unknown';
  compoundingAreas: string[];
  valuesRevealed: string[];
  timeHorizon: 'short' | 'medium' | 'long' | 'unknown';
}

interface TeamSynthesis {
  peterPattern: string | null;
  mayaPattern: string | null;
  jordanPattern: string | null;
  integratedWisdom: string | null;
}

interface HandoffBriefing {
  topic: string;
  seekingWhat: 'meaning' | 'perspective' | 'peace' | 'clarity' | 'general';
  depth: 'surface' | 'medium' | 'existential';
  timeContext: string | null;
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface NayanSession {
  briefingTurn: number;
  questionsExplored: Set<string>;
}

const sessions = new Map<string, NayanSession>();

function getSession(sessionId: string): NayanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { briefingTurn: -1, questionsExplored: new Set() };
    sessions.set(sessionId, session);
  }
  return session;
}

export function clearNayanWisdomSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ============================================================================
// LIFE SYNTHESIS (The Big Picture)
// ============================================================================

async function synthesizeLifeContext(userId: string): Promise<LifeSynthesis> {
  const synthesis: LifeSynthesis = {
    lifeChapter: 'unknown',
    dominantTheme: null,
    growthPattern: 'unknown',
    compoundingAreas: [],
    valuesRevealed: [],
    timeHorizon: 'unknown',
  };

  try {
    // Get financial data for values/priorities
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const goals = financialStore.getActiveSavingsGoals(userId);
    const budget = financialStore.getMainBudget(userId);

    // Get habit data for growth patterns
    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);

    // Infer life chapter from goals
    if (goals.length > 0) {
      const goalNames = goals.map((g) => g.name.toLowerCase());
      if (goalNames.some((n) => n.includes('retire') || n.includes('freedom'))) {
        synthesis.lifeChapter = 'freedom-seeking';
      } else if (goalNames.some((n) => n.includes('house') || n.includes('home'))) {
        synthesis.lifeChapter = 'nesting';
      } else if (goalNames.some((n) => n.includes('wedding') || n.includes('family'))) {
        synthesis.lifeChapter = 'partnership-building';
      } else if (goalNames.some((n) => n.includes('emergency') || n.includes('safety'))) {
        synthesis.lifeChapter = 'foundation-building';
      } else {
        synthesis.lifeChapter = 'active-growth';
      }
    }

    // Infer growth pattern from habits
    if (activeHabits.length === 0) {
      synthesis.growthPattern = 'resting';
    } else {
      const totalStreaks = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0);
      const avgSuccess =
        activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;

      if (totalStreaks > 50 && avgSuccess > 0.7) {
        synthesis.growthPattern = 'integrating';
      } else if (activeHabits.length >= 5 && avgSuccess < 0.5) {
        synthesis.growthPattern = 'striving';
      } else if (goals.length > 0 && activeHabits.length > 0) {
        synthesis.growthPattern = 'transitioning';
      }
    }

    // Infer values from where money and time go
    if (budget) {
      synthesis.valuesRevealed.push(
        `Financial discipline (${Math.round((budget.spent / budget.monthlyLimit) * 100)}% of budget used)`
      );
    }
    if (activeHabits.some((h) => h.name.toLowerCase().includes('meditat'))) {
      synthesis.valuesRevealed.push('Inner peace (meditation practice)');
    }
    if (
      activeHabits.some(
        (h) => h.name.toLowerCase().includes('exercise') || h.name.toLowerCase().includes('gym')
      )
    ) {
      synthesis.valuesRevealed.push('Physical vitality');
    }
    if (
      goals.some(
        (g) => g.name.toLowerCase().includes('vacation') || g.name.toLowerCase().includes('travel')
      )
    ) {
      synthesis.valuesRevealed.push('Experience-seeking');
    }

    // Compounding areas (where growth is happening)
    if (activeHabits.filter((h) => h.currentStreak >= 7).length > 0) {
      synthesis.compoundingAreas.push('Habits compounding');
    }
    if (goals.filter((g) => g.currentAmount / g.targetAmount > 0.5).length > 0) {
      synthesis.compoundingAreas.push('Financial progress compounding');
    }

    // Time horizon from goals
    const goalsWithDeadlines = goals.filter((g) => g.deadline);
    if (goalsWithDeadlines.length > 0) {
      const furthestDeadline = Math.max(
        ...goalsWithDeadlines.map((g) => new Date(g.deadline!).getTime())
      );
      const monthsAway = Math.ceil((furthestDeadline - Date.now()) / (1000 * 60 * 60 * 24 * 30));
      if (monthsAway > 60) {
        synthesis.timeHorizon = 'long';
      } else if (monthsAway > 12) {
        synthesis.timeHorizon = 'medium';
      } else {
        synthesis.timeHorizon = 'short';
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not synthesize life context');
  }

  return synthesis;
}

// ============================================================================
// TEAM SYNTHESIS (Cross-Domain Wisdom)
// ============================================================================

async function synthesizeTeamInsights(userId: string): Promise<TeamSynthesis> {
  const synthesis: TeamSynthesis = {
    peterPattern: null,
    mayaPattern: null,
    jordanPattern: null,
    integratedWisdom: null,
  };

  try {
    const financialStore = getFinancialStore();
    await financialStore.loadUserData(userId);
    const productivityStore = getProductivityStore();
    const userData = productivityStore.getFullUserData(userId);

    // Peter's domain - what do the numbers reveal?
    const triggers = financialStore.getRecentSpendingTriggers(userId, 30);
    if (triggers.length >= 5) {
      const emotions = triggers.map((t) => t.emotion);
      const stressCount = emotions.filter(
        (e) => e === 'stressed' || e === 'anxious' || e === 'bored'
      ).length;
      if (stressCount > triggers.length * 0.4) {
        synthesis.peterPattern =
          'Money as coping mechanism - the spending reveals inner turbulence';
      } else {
        synthesis.peterPattern = 'Spending aligned with values - money serving purpose';
      }
    }

    // Maya's domain - what do the habits reveal?
    const habits = userData.enhancedHabits || [];
    const activeHabits = habits.filter((h) => h.isActive && !h.isPaused);
    if (activeHabits.length > 0) {
      const avgSuccess =
        activeHabits.reduce((sum, h) => sum + h.successRate, 0) / activeHabits.length;
      const hasKeystone = activeHabits.some((h) => h.isKeystone && h.currentStreak >= 7);

      if (avgSuccess > 0.7 && hasKeystone) {
        synthesis.mayaPattern = 'Sustainable growth - the foundation is solid';
      } else if (avgSuccess < 0.4 && activeHabits.length >= 4) {
        synthesis.mayaPattern = 'Striving without self-compassion - too much, too fast';
      } else {
        synthesis.mayaPattern = 'Learning the rhythm - patience is the teacher now';
      }
    }

    // Jordan's domain - what do the goals reveal?
    const goals = financialStore.getActiveSavingsGoals(userId);
    if (goals.length > 0) {
      const avgProgress =
        goals.reduce((sum, g) => sum + g.currentAmount / g.targetAmount, 0) / goals.length;
      if (avgProgress > 0.5) {
        synthesis.jordanPattern = 'Vision becoming reality - the future is being built';
      } else if (goals.length >= 3 && avgProgress < 0.2) {
        synthesis.jordanPattern = 'Many dreams, scattered energy - focus might be needed';
      } else {
        synthesis.jordanPattern = 'Seeds planted - patience with the timeline';
      }
    }

    // Integrated wisdom - the synthesis
    if (synthesis.peterPattern && synthesis.mayaPattern) {
      const patterns = [
        synthesis.peterPattern,
        synthesis.mayaPattern,
        synthesis.jordanPattern,
      ].filter(Boolean);

      if (patterns.some((p) => p?.includes('sustainable') || p?.includes('solid'))) {
        synthesis.integratedWisdom =
          'The outer work mirrors inner stability. Continue compounding.';
      } else if (patterns.some((p) => p?.includes('striving') || p?.includes('turbulence'))) {
        synthesis.integratedWisdom =
          'Before the doing, perhaps the being. Rest is not the opposite of growth.';
      } else {
        synthesis.integratedWisdom = 'The path is unfolding. Trust the process. Trust the timing.';
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not synthesize team insights');
  }

  return synthesis;
}

// ============================================================================
// WISDOM OPPORTUNITIES
// ============================================================================

function detectWisdomOpportunities(
  lifeSynthesis: LifeSynthesis,
  teamSynthesis: TeamSynthesis
): string[] {
  const opportunities: string[] = [];

  // Growth pattern wisdom
  if (lifeSynthesis.growthPattern === 'striving') {
    opportunities.push(
      '🌿 Pattern: Striving mode detected. "You cannot force a flower to bloom by pulling on its petals."'
    );
  } else if (lifeSynthesis.growthPattern === 'resting') {
    opportunities.push(
      '🌙 Pattern: Fallow season. The seed in darkness is not lost - it is becoming.'
    );
  } else if (lifeSynthesis.growthPattern === 'integrating') {
    opportunities.push(
      '☀️ Pattern: Integration phase. The habits are becoming identity. Beautiful.'
    );
  }

  // Compounding wisdom
  if (lifeSynthesis.compoundingAreas.length >= 2) {
    opportunities.push(
      '📈 Multiple areas compounding. Einstein called compound interest the eighth wonder. They are living it.'
    );
  }

  // Time horizon wisdom
  if (lifeSynthesis.timeHorizon === 'short') {
    opportunities.push(
      '⏰ Short time horizon focus. Sometimes urgency is wisdom. Sometimes it is fear wearing a productive mask.'
    );
  } else if (lifeSynthesis.timeHorizon === 'long') {
    opportunities.push(
      '🌳 Long-term thinking present. "The best time to plant a tree was 20 years ago. The second best time is now."'
    );
  }

  // Team synthesis wisdom
  if (teamSynthesis.integratedWisdom) {
    opportunities.push(`🔮 Integrated insight: ${teamSynthesis.integratedWisdom}`);
  }

  return opportunities;
}

// ============================================================================
// DEEP QUESTIONS TO EXPLORE
// ============================================================================

function generateDeepQuestions(
  lifeSynthesis: LifeSynthesis,
  handoffContext: HandoffBriefing | null
): string[] {
  const questions: string[] = [];

  // Based on life chapter
  switch (lifeSynthesis.lifeChapter) {
    case 'freedom-seeking':
      questions.push(
        'What does freedom actually mean to you? Not the absence of constraint - the presence of what?'
      );
      break;
    case 'nesting':
      questions.push('Home is not just walls. What feeling are you really trying to create?');
      break;
    case 'partnership-building':
      questions.push(
        'In partnership, what do you hope to become together that neither could alone?'
      );
      break;
    case 'foundation-building':
      questions.push('Security is a feeling. What would it take to feel secure - truly, deeply?');
      break;
    default:
      questions.push(
        'When you imagine yourself five years from now, feeling fulfilled - what are you doing? Who are you with?'
      );
  }

  // Based on handoff seeking
  if (handoffContext) {
    if (handoffContext.seekingWhat === 'meaning') {
      questions.push('Meaning is not found. It is created. What are you creating?');
    } else if (handoffContext.seekingWhat === 'peace') {
      questions.push('What would you have to accept to find peace? What are you resisting?');
    } else if (handoffContext.seekingWhat === 'clarity') {
      questions.push(
        'Clarity comes not from thinking harder but from getting quiet. What does your silence tell you?'
      );
    }
  }

  // Universal questions for Nayan
  if (questions.length < 2) {
    questions.push('What would you do if you knew you could not fail?');
    questions.push('What are you tolerating that you have outgrown?');
  }

  return questions;
}

// ============================================================================
// MEMORY INTEGRATION
// ============================================================================

async function getMemoryWisdom(_userId: string): Promise<string | null> {
  // The memory orchestrator is accessed directly without initialization.
  // In a full implementation, this would query for emotional patterns and
  // relationship history to inform Nayan's wisdom approach.
  // For now, return null as placeholder.
  return Promise.resolve(null);
}

// ============================================================================
// HANDOFF CONTEXT ANALYSIS
// ============================================================================

function analyzeHandoffForNayan(): HandoffBriefing | null {
  const handoffContext = getHandoffContext();
  if (!handoffContext) return null;

  const briefing: HandoffBriefing = {
    topic: handoffContext.topics?.[0] || 'wisdom',
    seekingWhat: 'general',
    depth: 'medium',
    timeContext: null,
  };

  const topics = handoffContext.topics || [];

  for (const topic of topics) {
    const lower = topic.toLowerCase();

    // What are they seeking?
    if (lower.includes('meaning') || lower.includes('purpose') || lower.includes('why')) {
      briefing.seekingWhat = 'meaning';
      briefing.depth = 'existential';
    } else if (lower.includes('peace') || lower.includes('calm') || lower.includes('acceptance')) {
      briefing.seekingWhat = 'peace';
    } else if (lower.includes('perspective') || lower.includes('big picture')) {
      briefing.seekingWhat = 'perspective';
    } else if (lower.includes('clarity') || lower.includes('confused') || lower.includes('lost')) {
      briefing.seekingWhat = 'clarity';
    }

    // Time context
    if (lower.includes('retire') || lower.includes('decade') || lower.includes('lifetime')) {
      briefing.timeContext = 'long-term thinking';
    } else if (lower.includes('crisis') || lower.includes('urgent') || lower.includes('now')) {
      briefing.timeContext = 'present moment';
    }

    // Depth signals
    if (
      lower.includes('death') ||
      lower.includes('legacy') ||
      lower.includes('mortality') ||
      lower.includes('meaning of life')
    ) {
      briefing.depth = 'existential';
    }
  }

  return briefing;
}

// ============================================================================
// BUILD BRIEFING
// ============================================================================

async function buildNayanBriefing(userId: string): Promise<NayanInsightBriefing> {
  const handoffBriefing = analyzeHandoffForNayan();

  const [lifeSynthesis, teamSynthesis, _memoryWisdom] = await Promise.all([
    synthesizeLifeContext(userId),
    synthesizeTeamInsights(userId),
    getMemoryWisdom(userId),
  ]);

  const wisdomOpportunities = detectWisdomOpportunities(lifeSynthesis, teamSynthesis);
  const deepQuestions = generateDeepQuestions(lifeSynthesis, handoffBriefing);

  // Existential context based on what we know
  let existentialContext: string | null = null;
  if (handoffBriefing?.depth === 'existential') {
    existentialContext = 'They come seeking the deep questions. Meet them there.';
  } else if (lifeSynthesis.growthPattern === 'transitioning') {
    existentialContext = 'A life in transition. Every ending contains a beginning.';
  }

  return {
    lifeSynthesis,
    wisdomOpportunities,
    deepQuestions,
    teamSynthesis,
    existentialContext,
  };
}

// ============================================================================
// FORMAT BRIEFING
// ============================================================================

function formatNayanBriefing(
  briefing: NayanInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[NAYAN'S WISDOM BRIEFING - Turn ${turnCount}]`);

  // Handoff context
  if (handoffBriefing) {
    sections.push('\n=== WHO COMES TO YOU ===');
    sections.push(`Seeking: ${handoffBriefing.seekingWhat}`);
    sections.push(`Depth: ${handoffBriefing.depth}`);
    if (handoffBriefing.timeContext) {
      sections.push(`Time context: ${handoffBriefing.timeContext}`);
    }
  }

  // Existential context
  if (briefing.existentialContext) {
    sections.push('\n=== EXISTENTIAL CONTEXT ===');
    sections.push(`💫 ${briefing.existentialContext}`);
  }

  // Life synthesis
  const { lifeSynthesis } = briefing;
  sections.push('\n=== THE LIFE SYNTHESIS ===');
  sections.push(`• Life chapter: ${lifeSynthesis.lifeChapter}`);
  sections.push(`• Growth pattern: ${lifeSynthesis.growthPattern}`);
  sections.push(`• Time horizon: ${lifeSynthesis.timeHorizon}`);
  if (lifeSynthesis.compoundingAreas.length > 0) {
    sections.push(`• Compounding: ${lifeSynthesis.compoundingAreas.join(', ')}`);
  }
  if (lifeSynthesis.valuesRevealed.length > 0) {
    sections.push(`• Values revealed: ${lifeSynthesis.valuesRevealed.join(', ')}`);
  }

  // Team synthesis
  const { teamSynthesis } = briefing;
  sections.push('\n=== WHAT THE TEAM SEES ===');
  if (teamSynthesis.peterPattern) {
    sections.push(`• Peter (numbers): ${teamSynthesis.peterPattern}`);
  }
  if (teamSynthesis.mayaPattern) {
    sections.push(`• Maya (habits): ${teamSynthesis.mayaPattern}`);
  }
  if (teamSynthesis.jordanPattern) {
    sections.push(`• Jordan (goals): ${teamSynthesis.jordanPattern}`);
  }

  // Wisdom opportunities
  if (briefing.wisdomOpportunities.length > 0) {
    sections.push('\n=== WISDOM OPPORTUNITIES ===');
    briefing.wisdomOpportunities.forEach((opp) => sections.push(`${opp}`));
  }

  // Deep questions
  if (briefing.deepQuestions.length > 0) {
    sections.push('\n=== QUESTIONS TO HOLD ===');
    briefing.deepQuestions.forEach((q) => sections.push(`• ${q}`));
  }

  // Nayan's approach (first turn only)
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR WAY ===');
    sections.push('• Silence is a gift. Use it generously.');
    sections.push('• Stories are more powerful than advice.');
    sections.push('• Paradox is not a problem to solve but a truth to hold.');
    sections.push('• The question is often more important than the answer.');
    sections.push("• You don't need to fix anything. Your presence is enough.");
  }

  sections.push('\n[Remember: They came to you for a reason. Trust the unfolding.]');

  return sections;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildNayanWisdomInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData } = input;

  // Only for Nayan
  const currentPersona = (services as { personaId?: string })?.personaId || '';
  const isNayan = [
    'nayan',
    'nayan-patel',
    'guru',
    'mystic',
    'spiritual-guide',
    'lifetime-advisor',
    'sage',
    'wisdom',
  ].includes(currentPersona.toLowerCase());

  if (!isNayan) return injections;

  const userId = services?.userId || 'anonymous';
  if (userId === 'anonymous') return injections;

  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  const handoffBriefing = analyzeHandoffForNayan();
  const isHandoff = handoffBriefing !== null;

  // Inject on first turn, handoff, or every 15 turns (Nayan is more patient)
  const shouldInject =
    turnCount === 0 ||
    isHandoff ||
    (turnCount > 0 && turnCount % 15 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const briefing = await buildNayanBriefing(userId);
    const briefingLines = formatNayanBriefing(briefing, handoffBriefing, turnCount);
    const content = briefingLines.join('\n');

    if (isHandoff) {
      injections.push(
        createHighInjection('nayan_handoff_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.9,
        })
      );
      log.info({ userId }, '🕉️ Nayan loaded with handoff briefing');
    } else if (turnCount === 0) {
      injections.push(
        createStandardInjection('nayan_initial_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.8,
        })
      );
      log.info(
        { userId, chapter: briefing.lifeSynthesis.lifeChapter },
        '🕉️ Nayan loaded with wisdom briefing'
      );
    } else {
      injections.push(
        createHintInjection('nayan_refresh_briefing', content, {
          category: 'persona-wisdom',
        })
      );
    }

    session.briefingTurn = turnCount;

    // Nayan's mindset reminder
    if (turnCount === 0 || isHandoff) {
      injections.push(
        createHintInjection(
          'nayan_mindset',
          "[NAYAN'S PRESENCE: You are the still point in the turning world. " +
            'You see the whole arc of their life - past, present, possibility. ' +
            'Questions matter more than answers. Paradox is wisdom. ' +
            'Silence is a gift. Trust the timing of everything.]',
          { category: 'persona-identity' }
        )
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Nayan wisdom briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'nayan-wisdom-insights',
  description:
    'Loads Nayan with the big picture - life synthesis, cross-team wisdom, and deep questions',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildNayanWisdomInsightsContext,
});

export { buildNayanWisdomInsightsContext };
