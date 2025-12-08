/**
 * ACT Defusion Techniques
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Cognitive defusion helps people step back from thoughts and see them
 * as just thoughts—not facts, not commands, not reality.
 *
 * PHILOSOPHY:
 * The goal isn't to change the thought or argue with it.
 * It's to change your relationship to the thought.
 * "I'm a failure" → "I'm having the thought that I'm a failure."
 *
 * @module TherapeuticFrameworks/ACTDefusion
 */

import type { DefusionTechnique } from './types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ACTDefusion' });

// ============================================================================
// DEFUSION TECHNIQUES LIBRARY
// ============================================================================

export const DEFUSION_TECHNIQUES: Record<string, DefusionTechnique> = {
  naming: {
    id: 'naming',
    name: 'Naming the Story',
    description: 'Give your unhelpful thought pattern a name, like "The Not Good Enough Story"',
    guidance: `Notice that thought? Let's give it a name. Maybe it's "The Not Good Enough Story" or "The What If Disaster Movie." When it shows up again, you can say "Oh, there's that story again" instead of getting caught in it.`,
    bestFor: ['recurring thoughts', 'self-criticism', 'worry patterns'],
    exampleThought: "I'm not good enough for this job.",
    exampleDefusion: 'Oh, there\'s the "Not Good Enough Story" again. Hi there, story. I see you.',
  },

  im_having_the_thought: {
    id: 'im_having_the_thought',
    name: '"I\'m Having the Thought That..."',
    description: 'Add "I\'m having the thought that..." before the thought to create distance',
    guidance: `Try this: Instead of "I'm a failure," say "I'm having the thought that I'm a failure." Notice how that changes things? The thought is still there, but now there's space between you and it.`,
    bestFor: ['strong negative self-judgments', 'fusion with thoughts', 'new to defusion'],
    exampleThought: "I'll never figure this out.",
    exampleDefusion: "I'm having the thought that I'll never figure this out.",
  },

  thanking_mind: {
    id: 'thanking_mind',
    name: 'Thanking Your Mind',
    description: 'Thank your mind for trying to protect you, even when its methods are unhelpful',
    guidance: `Your mind is trying to protect you—it's just not very good at it sometimes. Try saying "Thanks, mind. I know you're trying to help. But I've got this." It sounds silly, but it works.`,
    bestFor: ['anxiety', 'catastrophizing', 'protective thoughts'],
    exampleThought: 'Something terrible is going to happen.',
    exampleDefusion:
      "Thanks for the warning, mind. I appreciate you trying to keep me safe. I've got this.",
  },

  singing: {
    id: 'singing',
    name: 'Singing the Thought',
    description: 'Sing the unhelpful thought to a silly tune',
    guidance: `This one's weird but effective: Try singing that thought to "Happy Birthday" or a nursery rhyme. Hard to take "I'm such an idiot" seriously when you're singing it.`,
    bestFor: ['self-critical thoughts', 'repetitive thoughts', 'mild distress'],
    exampleThought: "I'm such an idiot.",
    exampleDefusion: '🎵 "I\'m such an id-i-ot, I\'m such an id-i-ot..." 🎵',
  },

  silly_voice: {
    id: 'silly_voice',
    name: 'Silly Voice',
    description: 'Repeat the thought in a silly voice (cartoon character, movie villain, etc.)',
    guidance: `Say that thought in a really silly voice. Like a cartoon character. Or a movie villain. It's hard to be consumed by a thought when a cartoon duck is saying it.`,
    bestFor: ['dark thoughts', 'self-criticism', 'rumination'],
    exampleThought: 'Nobody likes me.',
    exampleDefusion: '[In Donald Duck voice] "Nobody likes me." See? Different vibe.',
  },

  thoughts_on_leaves: {
    id: 'thoughts_on_leaves',
    name: 'Thoughts on Leaves',
    description: 'Visualize placing each thought on a leaf floating down a stream',
    guidance: `Close your eyes for a moment. Imagine you're sitting by a gentle stream. As each thought comes, place it on a leaf and watch it float away. You don't have to push the thoughts away—just notice them, put them on leaves, and let the stream carry them.`,
    bestFor: ['overwhelm', 'racing thoughts', 'meditation-friendly'],
    exampleThought: '[Any thought]',
    exampleDefusion: "There's that thought. Let me put it on a leaf. And there it goes...",
  },

  observing_self: {
    id: 'observing_self',
    name: 'The Observing Self',
    description: "Notice that there's a part of you that can observe the thought",
    guidance: `Here's something interesting: There's you having the thought, and there's a part of you that can observe you having the thought. That observing part—that's the real you. The thought is just something passing through.`,
    bestFor: ['identity-based thoughts', 'deep suffering', 'philosophical users'],
    exampleThought: 'I am broken.',
    exampleDefusion:
      'I notice a thought that says "I am broken." The part of me noticing this thought is not broken.',
  },

  radio_metaphor: {
    id: 'radio_metaphor',
    name: 'Radio Doom',
    description: 'Imagine your negative thoughts as a radio station you can turn down',
    guidance: `Think of your negative thoughts as a radio station—let's call it Radio Doom. It's always broadcasting. You can't turn it off, but you don't have to turn up the volume and listen intently. You can let it play in the background while you do what matters.`,
    bestFor: ['chronic negativity', 'background anxiety', 'acceptance-focused'],
    exampleThought: 'Constant low-level worry',
    exampleDefusion: "Oh, Radio Doom is on again. That's fine. I don't have to turn it up.",
  },

  passengers_on_bus: {
    id: 'passengers_on_bus',
    name: 'Passengers on the Bus',
    description: "You're driving the bus of your life—thoughts are just passengers",
    guidance: `Imagine you're driving a bus—the bus of your life. Your thoughts are passengers. Some are loud, some are mean, some try to tell you where to drive. But you're the driver. You can acknowledge them without letting them steer.`,
    bestFor: ['life direction', 'overwhelming thoughts', 'choice-focused'],
    exampleThought: '"You should give up" thoughts',
    exampleDefusion:
      "Okay, I hear you back there. You can stay on the bus. But I'm still driving where I want to go.",
  },

  cloud_watching: {
    id: 'cloud_watching',
    name: 'Cloud Watching',
    description: 'Watch thoughts like clouds passing through the sky of your mind',
    guidance: `Your mind is like the sky. Thoughts are like clouds—some light and fluffy, some dark and stormy. But they all pass. The sky is always there. You can watch them without becoming them.`,
    bestFor: ['meditation-friendly', 'visual thinkers', 'general mindfulness'],
    exampleThought: '[Any thought]',
    exampleDefusion:
      "There's a thought-cloud. It's a dark one. But it's moving. The sky is still the sky.",
  },
};

// ============================================================================
// TECHNIQUE SELECTION
// ============================================================================

/**
 * Select the best defusion technique for the situation.
 */
export function selectDefusionTechnique(context: {
  thought?: string;
  thoughtType?: string;
  emotionIntensity?: number;
  userPreferences?: string[];
  previousTechniques?: string[];
}): DefusionTechnique {
  const { thought, thoughtType, emotionIntensity = 0.5, previousTechniques = [] } = context;

  // For high distress, start simple
  if (emotionIntensity > 0.8) {
    return DEFUSION_TECHNIQUES.im_having_the_thought;
  }

  // Match by thought type
  if (thoughtType) {
    const typeMatches: Record<string, string> = {
      self_criticism: 'naming',
      catastrophizing: 'thanking_mind',
      rumination: 'thoughts_on_leaves',
      identity_fusion: 'observing_self',
      worry: 'radio_metaphor',
    };

    if (typeMatches[thoughtType]) {
      return DEFUSION_TECHNIQUES[typeMatches[thoughtType]];
    }
  }

  // Avoid recently used techniques
  const available = Object.values(DEFUSION_TECHNIQUES).filter(
    (t) => !previousTechniques.includes(t.id)
  );

  if (available.length === 0) {
    // All used, reset
    return DEFUSION_TECHNIQUES.im_having_the_thought;
  }

  // For lower distress, can use more playful techniques
  if (emotionIntensity < 0.4) {
    const playful = available.filter((t) => ['singing', 'silly_voice'].includes(t.id));
    if (playful.length > 0) {
      return playful[Math.floor(Math.random() * playful.length)];
    }
  }

  // Default: random from available
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get all defusion techniques.
 */
export function getAllDefusionTechniques(): DefusionTechnique[] {
  return Object.values(DEFUSION_TECHNIQUES);
}

/**
 * Get a defusion technique by ID.
 */
export function getDefusionTechnique(id: string): DefusionTechnique | null {
  return DEFUSION_TECHNIQUES[id] || null;
}

// ============================================================================
// DEFUSION TRACKING
// ============================================================================

/** Track which techniques work for each user */
const userDefusionHistory = new Map<string, DefusionUse[]>();

interface DefusionUse {
  techniqueId: string;
  timestamp: Date;
  helpfulnessRating?: number;
  thoughtType?: string;
}

/**
 * Record a defusion technique use.
 */
export function recordDefusionUse(
  userId: string,
  techniqueId: string,
  options?: {
    helpfulnessRating?: number;
    thoughtType?: string;
  }
): void {
  const history = userDefusionHistory.get(userId) || [];
  history.push({
    techniqueId,
    timestamp: new Date(),
    ...options,
  });
  userDefusionHistory.set(userId, history);

  log.debug({ userId, techniqueId, rating: options?.helpfulnessRating }, '🌿 Defusion recorded');
}

/**
 * Get most effective techniques for a user.
 */
export function getMostEffectiveDefusion(userId: string): string[] {
  const history = userDefusionHistory.get(userId) || [];

  // Calculate average rating per technique
  const ratings: Record<string, { sum: number; count: number }> = {};

  for (const use of history) {
    if (use.helpfulnessRating !== undefined) {
      if (!ratings[use.techniqueId]) {
        ratings[use.techniqueId] = { sum: 0, count: 0 };
      }
      ratings[use.techniqueId].sum += use.helpfulnessRating;
      ratings[use.techniqueId].count++;
    }
  }

  return Object.entries(ratings)
    .map(([id, { sum, count }]) => ({ id, avg: sum / count }))
    .sort((a, b) => b.avg - a.avg)
    .map((e) => e.id);
}

/**
 * Get recently used techniques.
 */
export function getRecentDefusionTechniques(userId: string, limit = 5): string[] {
  const history = userDefusionHistory.get(userId) || [];
  return history
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
    .map((h) => h.techniqueId);
}

// ============================================================================
// CONTEXT FOR LLM
// ============================================================================

/**
 * Build defusion context for the LLM.
 */
export function buildDefusionContext(userId: string, detectedThought?: string): string | null {
  if (!detectedThought) {
    return null;
  }

  const recentTechniques = getRecentDefusionTechniques(userId);
  const effectiveTechniques = getMostEffectiveDefusion(userId);
  const technique = selectDefusionTechnique({
    thought: detectedThought,
    previousTechniques: recentTechniques,
  });

  const lines: string[] = [
    '[🌿 DEFUSION OPPORTUNITY]',
    '',
    `They seem fused with this thought: "${detectedThought}"`,
    '',
    `Consider: ${technique.name}`,
    technique.guidance,
    '',
  ];

  if (technique.exampleDefusion) {
    lines.push(`Example: ${technique.exampleDefusion}`);
    lines.push('');
  }

  if (effectiveTechniques.length > 0) {
    const top = DEFUSION_TECHNIQUES[effectiveTechniques[0]];
    if (top && top.id !== technique.id) {
      lines.push(`(Note: "${top.name}" has worked well for them before.)`);
    }
  }

  lines.push('Remember: The goal is distance from the thought, not changing it.');

  return lines.join('\n');
}

// All constants are exported at their definitions above
