/**
 * Alive Awareness Context Builder
 *
 * Integrates all the systems that make personas feel alive and aware:
 * - Cross-agent memory sharing
 * - Physical state continuity
 * - Metacognitive moments
 * - Mood drift
 * - Temporal anchoring
 * - Genuine curiosity
 * - World awareness
 *
 * This builder runs on each turn and injects relevant context into the prompt.
 */

import type { ContextBuilderInput, ContextInjection } from './types.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getTeamContext,
  formatCrossAgentContextForPrompt,
} from '../../services/cross-agent-awareness.js';
import {
  updateSessionState,
  getPhysicalStateComment,
  getMetacognitiveComment,
  getTemporalAnchor,
} from '../../services/embodied-awareness.js';
import { processMoodDrift, getMoodExpression, getMoodState } from '../../services/mood-drift.js';

// ============================================================================
// TYPES
// ============================================================================

interface AliveAwarenessInput extends ContextBuilderInput {
  sessionId: string;
  personaId: string;
  turnCount: number;
  currentTopics?: string[];
  userEmotion?: string;
  userEmotionIntensity?: number;
  wasPersonalSharing?: boolean;
  gaveAdvice?: boolean;
  askedQuestion?: boolean;
  toldStory?: boolean;
  lastConversationDate?: Date;
}

interface AliveAwarenessResult {
  injections: ContextInjection[];
  physicalComment?: string;
  metacognitiveComment?: string;
  moodExpression?: string;
  temporalAnchor?: string;
  teamContext?: string;
  curiosityQuestion?: string;
  summary: string;
}

// ============================================================================
// WORLD AWARENESS (Weather, Time, Calendar)
// ============================================================================

interface WorldContext {
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  specialDay?: string;
}

function getWorldContext(): WorldContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const month = now.getMonth();
  const date = now.getDate();

  // Time of day
  let timeOfDay: WorldContext['timeOfDay'];
  if (hour >= 5 && hour < 9) timeOfDay = 'early_morning';
  else if (hour >= 9 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'late_night';

  // Day of week
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[day];
  const isWeekend = day === 0 || day === 6;

  // Season (Northern Hemisphere)
  let season: WorldContext['season'];
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  // Special days
  let specialDay: string | undefined;
  if (month === 11 && date >= 20 && date <= 25) specialDay = 'holiday_season';
  if (month === 0 && date === 1) specialDay = 'new_years';
  if (month === 1 && date === 14) specialDay = 'valentines';
  // Add more as needed

  return { timeOfDay, dayOfWeek, isWeekend, season, specialDay };
}

function formatWorldContextForPrompt(world: WorldContext): string {
  const parts: string[] = [];

  parts.push(`[AWARENESS: ${world.dayOfWeek} ${world.timeOfDay.replace('_', ' ')}]`);

  if (world.isWeekend) {
    parts.push('[It\'s the weekend - people often have different energy and availability]');
  }

  if (world.specialDay) {
    const specialDayNotes: Record<string, string> = {
      holiday_season:
        "[Holiday season - be mindful that this can be both joyful and stressful for people]",
      new_years: "[New Year's Day - people often reflect on fresh starts and resolutions]",
      valentines:
        "[Valentine's Day - be sensitive to relationship status and feelings of loneliness]",
    };
    const note = specialDayNotes[world.specialDay];
    if (note) parts.push(note);
  }

  // Seasonal notes
  const seasonalNotes: Record<string, string> = {
    winter: 'Winter can affect mood - less daylight impacts some people',
    spring: 'Spring brings renewal energy for many',
    summer: 'Summer often means vacation plans and lighter schedules',
    fall: 'Fall is transition season - back to routines, planning ahead',
  };
  if (Math.random() < 0.1) {
    // Only inject 10% of time
    parts.push(`[Seasonal note: ${seasonalNotes[world.season]}]`);
  }

  return parts.join('\n');
}

// ============================================================================
// CURIOSITY QUESTION SELECTION
// ============================================================================

const CURIOSITY_QUESTIONS: Record<string, string[]> = {
  ferni: [
    "Can I ask you something I'm curious about? What's a belief you used to hold strongly that you've changed your mind about?",
    "I'm curious— what does a 'good day' actually look like for you?",
    "What's something you know now that you wish you'd known ten years ago?",
    "What gives your life meaning right now? Not what should, but what actually does.",
    "What's something small that made you happy recently?",
  ],
  'nayan-patel': [
    "What is it that you really want? Not what you're supposed to want.",
    "When do you feel most alive? Most present?",
    "What is the question you're avoiding?",
    "If you knew you couldn't fail, what would you attempt?",
  ],
  'alex-chen': [
    "What's the most efficient thing you've ever done? I love a good optimization story.",
    "How do you decide what deserves your time?",
    "What's a system you've created that actually works for you?",
  ],
};

function selectCuriosityQuestion(
  personaId: string,
  turnCount: number,
  relationshipStage: string
): string | null {
  // Only ask curiosity questions occasionally
  if (turnCount < 5 || Math.random() > 0.08) return null;

  // Only for established relationships
  if (relationshipStage === 'stranger') return null;

  const questions = CURIOSITY_QUESTIONS[personaId] || CURIOSITY_QUESTIONS['ferni'];
  return questions[Math.floor(Math.random() * questions.length)];
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

export async function buildAliveAwarenessContext(
  input: AliveAwarenessInput
): Promise<AliveAwarenessResult> {
  const log = getLogger();
  const injections: ContextInjection[] = [];
  const summaryParts: string[] = [];

  const { sessionId, personaId, turnCount, userProfile } = input;
  const userId = userProfile?.id || 'anonymous';
  const relationshipStage = userProfile?.relationshipStage || 'stranger';

  // 1. Update session state
  updateSessionState(sessionId, {
    gaveAdvice: input.gaveAdvice,
    askedQuestion: input.askedQuestion,
    toldStory: input.toldStory,
    providedEmotionalSupport: input.wasPersonalSharing,
  });

  // 2. Process mood drift
  const moodState = processMoodDrift(sessionId, personaId, {
    topics: input.currentTopics || [],
    userEmotion: input.userEmotion,
    userEmotionIntensity: input.userEmotionIntensity,
    wasPersonalSharing: input.wasPersonalSharing,
    turnCount,
  });

  // 3. Get world context
  const worldContext = getWorldContext();
  if (turnCount === 0 || turnCount % 20 === 0) {
    injections.push({
      id: `world_awareness_${turnCount}`,
      content: formatWorldContextForPrompt(worldContext),
      priority: 'hint',
      source: 'world_awareness',
    });
  }

  // 4. Cross-agent context
  let teamContextStr: string | undefined;
  if (turnCount > 2 && userId !== 'anonymous') {
    try {
      const teamContext = await getTeamContext(userId, personaId);
      teamContextStr = formatCrossAgentContextForPrompt(teamContext, personaId);
      if (teamContextStr) {
        injections.push({
          id: `cross_agent_${turnCount}`,
          content: teamContextStr,
          priority: 'standard',
          source: 'cross_agent_awareness',
        });
        summaryParts.push('Team context available');
      }
    } catch (err) {
      log.debug({ err }, 'Failed to get cross-agent context');
    }
  }

  // 5. Physical state comment
  const physicalComment = getPhysicalStateComment(sessionId, personaId);
  if (physicalComment) {
    injections.push({
      id: `physical_${turnCount}`,
      content: `[PHYSICAL AWARENESS - You might naturally say: "${physicalComment}"]`,
      priority: 'hint',
      source: 'embodied_awareness',
    });
    summaryParts.push('Physical moment');
  }

  // 6. Metacognitive comment
  const metacognitiveComment = getMetacognitiveComment(sessionId, personaId);
  if (metacognitiveComment) {
    injections.push({
      id: `metacognitive_${turnCount}`,
      content: `[SELF-AWARENESS: Consider saying: "${metacognitiveComment}"]`,
      priority: 'standard',
      source: 'metacognitive',
    });
    summaryParts.push('Metacognitive reflection');
  }

  // 7. Mood expression
  const moodExpression = getMoodExpression(sessionId, personaId, turnCount);
  let moodExpressionStr: string | undefined;
  if (moodExpression?.canExpress && moodExpression.phrase) {
    moodExpressionStr = moodExpression.phrase;
    injections.push({
      id: `mood_${turnCount}`,
      content: `[EMOTIONAL STATE: Your mood has shifted to "${moodExpression.moodType}". You might express: "${moodExpression.phrase}"]`,
      priority: 'standard',
      source: 'mood_drift',
    });
    summaryParts.push(`Mood: ${moodExpression.moodType}`);
  }

  // 8. Temporal anchor
  const temporalAnchor = getTemporalAnchor(sessionId, input.lastConversationDate, personaId);
  if (temporalAnchor) {
    injections.push({
      id: `temporal_${turnCount}`,
      content: `[TIME AWARENESS: "${temporalAnchor}"]`,
      priority: 'hint',
      source: 'temporal_anchor',
    });
    summaryParts.push('Temporal awareness');
  }

  // 9. Curiosity question
  const curiosityQuestion = selectCuriosityQuestion(personaId, turnCount, relationshipStage);
  if (curiosityQuestion) {
    injections.push({
      id: `curiosity_${turnCount}`,
      content: `[GENUINE CURIOSITY: If conversation allows, you might ask from genuine interest: "${curiosityQuestion}"]`,
      priority: 'hint',
      source: 'genuine_curiosity',
    });
    summaryParts.push('Curiosity prompt');
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, standard: 2, hint: 3 };
  injections.sort((a, b) => {
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
    return aPriority - bPriority;
  });

  return {
    injections,
    physicalComment: physicalComment || undefined,
    metacognitiveComment: metacognitiveComment || undefined,
    moodExpression: moodExpressionStr,
    temporalAnchor: temporalAnchor || undefined,
    teamContext: teamContextStr,
    curiosityQuestion: curiosityQuestion || undefined,
    summary: summaryParts.length > 0 ? summaryParts.join(' | ') : 'No active awareness',
  };
}

/**
 * Format alive awareness for prompt injection
 */
export function formatAliveAwarenessForPrompt(result: AliveAwarenessResult): string {
  if (result.injections.length === 0) {
    return '';
  }

  const lines: string[] = ['', '=== ALIVE AWARENESS ==='];
  for (const injection of result.injections) {
    lines.push(injection.content);
  }
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS FOR CONTEXT BUILDER REGISTRY
// ============================================================================

export const aliveAwarenessBuilder = {
  name: 'alive_awareness',
  priority: 50, // Run after core context builders
  build: buildAliveAwarenessContext,
  format: formatAliveAwarenessForPrompt,
};

