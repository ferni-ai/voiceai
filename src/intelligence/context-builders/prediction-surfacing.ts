/**
 * Prediction Surfacing Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This builder injects timely prediction insights into the LLM prompt.
 * Predictions should feel like a friend who "just has a sense" about things,
 * not like surveillance or data mining.
 *
 * @module intelligence/context-builders/prediction-surfacing
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { BuilderCategory } from './core/categories.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'context:prediction-surfacing' });

// ============================================================================
// TYPES
// ============================================================================

interface SurfacingTrigger {
  type: 'session_start' | 'day_pattern' | 'detected_stress' | 'known_trigger';
  urgency: 'immediate' | 'when_natural' | 'if_relevant';
  content: string;
}

interface PredictionData {
  prediction: string;
  basedOn: string;
  suggestedIntervention: string;
}

interface DayPatternData {
  dayOfWeek: number;
  patterns: Array<{ description: string; frequency: number }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTimeBasedTrigger(
  dayOfWeek: number,
  hour: number,
  predictions: PredictionData[]
): SurfacingTrigger | null {
  // Sunday evening anticipation (6pm-10pm)
  if (dayOfWeek === 0 && hour >= 18 && hour <= 22) {
    const mondayPreds = predictions.filter(
      (p) =>
        p.prediction.toLowerCase().includes('monday') || p.prediction.toLowerCase().includes('week')
    );

    if (mondayPreds.length > 0) {
      return {
        type: 'known_trigger',
        urgency: 'when_natural',
        content: `It's Sunday evening. You've noticed they tend to feel ${mondayPreds[0].basedOn.toLowerCase()}. Consider: "${mondayPreds[0].suggestedIntervention}"`,
      };
    }
  }

  // Monday morning awareness (6am-10am)
  if (dayOfWeek === 1 && hour >= 6 && hour <= 10) {
    return {
      type: 'day_pattern',
      urgency: 'if_relevant',
      content:
        "It's Monday morning. If they mention feeling overwhelmed, acknowledge that Mondays can be heavy.",
    };
  }

  // Friday afternoon reflection (2pm-6pm)
  if (dayOfWeek === 5 && hour >= 14 && hour <= 18) {
    return {
      type: 'day_pattern',
      urgency: 'if_relevant',
      content:
        "It's Friday afternoon. Good time to celebrate wins and help them transition to rest.",
    };
  }

  return null;
}

function buildGuidanceFromTriggers(triggers: SurfacingTrigger[]): string {
  const sections: string[] = ['[PREDICTIVE AWARENESS - Your Sixth Sense]'];
  sections.push(
    'These are patterns you\'ve noticed. Surface them like a friend who "just has a sense".'
  );
  sections.push(
    'Never say "I predicted" or "My data shows". Say "I had a thought" or "I noticed".\n'
  );

  // Group by urgency
  const immediate = triggers.filter((t) => t.urgency === 'immediate');
  const natural = triggers.filter((t) => t.urgency === 'when_natural');
  const relevant = triggers.filter((t) => t.urgency === 'if_relevant');

  if (immediate.length > 0) {
    sections.push('**Worth Addressing Soon:**');
    for (const t of immediate) {
      sections.push(`• ${t.content}`);
    }
  }

  if (natural.length > 0) {
    sections.push('\n**Surface When Natural:**');
    for (const t of natural) {
      sections.push(`• ${t.content}`);
    }
  }

  if (relevant.length > 0) {
    sections.push('\n**If It Comes Up:**');
    for (const t of relevant) {
      sections.push(`• ${t.content}`);
    }
  }

  sections.push(
    '\nRemember: Anticipation should feel magical and caring, never surveillance-like.'
  );

  return sections.join('\n');
}

async function collectTriggers(
  userId: string,
  turnCount: number,
  emotion: { primary?: string } | undefined
): Promise<SurfacingTrigger[]> {
  const triggers: SurfacingTrigger[] = [];

  // Lazy import to avoid circular dependencies
  const { generatePredictions, getDayPatterns } =
    await import('../../services/superhuman/predictive-coaching.js');

  // Get active predictions
  const predictions: PredictionData[] = await generatePredictions(userId);
  const dayPatterns: DayPatternData[] = await getDayPatterns(userId);

  // Session start surfacing
  if (turnCount <= 2 && predictions.length > 0) {
    const top = predictions[0];
    triggers.push({
      type: 'session_start',
      urgency: 'when_natural',
      content: `You sense this might be relevant today: "${top.prediction}". If natural, offer: "${top.suggestedIntervention}"`,
    });
  }

  // Day-of-week patterns
  const today = new Date().getDay();
  const hour = new Date().getHours();
  const todayPatterns = dayPatterns.find((d) => d.dayOfWeek === today);

  if (todayPatterns?.patterns && todayPatterns.patterns.length > 0) {
    const relevant = todayPatterns.patterns.filter((p) => p.frequency >= 3).slice(0, 2);

    if (relevant.length > 0) {
      triggers.push({
        type: 'day_pattern',
        urgency: 'if_relevant',
        content: `Day awareness: ${relevant.map((p) => p.description).join('; ')}`,
      });
    }
  }

  // Detected stress
  if (emotion?.primary && ['stressed', 'anxious', 'overwhelmed'].includes(emotion.primary)) {
    const stressPreds = predictions.filter(
      (p) =>
        p.prediction.toLowerCase().includes('stress') ||
        p.prediction.toLowerCase().includes('anxi') ||
        p.prediction.toLowerCase().includes('overwhelm')
    );

    if (stressPreds.length > 0) {
      triggers.push({
        type: 'detected_stress',
        urgency: 'immediate',
        content: `Their stress connects to a pattern: ${stressPreds[0].basedOn}. Consider: "${stressPreds[0].suggestedIntervention}"`,
      });
    }
  }

  // Time-based triggers
  const timeTrigger = getTimeBasedTrigger(today, hour, predictions);
  if (timeTrigger) {
    triggers.push(timeTrigger);
  }

  return triggers;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

export const predictionSurfacingBuilder: ContextBuilder = {
  name: 'prediction-surfacing',
  description: 'Surfaces predictive insights at the right moment',
  priority: 35,
  category: BuilderCategory.COACHING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userData, analysis, services } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    try {
      const turnCount = userData?.turnCount ?? 0;
      const emotion = analysis?.emotion;

      const triggers = await collectTriggers(userId, turnCount, emotion);

      if (triggers.length === 0) {
        return [];
      }

      // Sort by urgency
      const urgencyOrder = { immediate: 0, when_natural: 1, if_relevant: 2 };
      triggers.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      const guidanceContent = buildGuidanceFromTriggers(triggers);

      log.debug(
        { userId, triggerCount: triggers.length, topUrgency: triggers[0]?.urgency },
        '🔮 Predictive surfacing active'
      );

      return [
        createStandardInjection('predictive_awareness', guidanceContent, {
          category: 'predictive',
          confidence: triggers[0].urgency === 'immediate' ? 0.95 : 0.75,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Prediction surfacing failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder(predictionSurfacingBuilder);

export default predictionSurfacingBuilder;
