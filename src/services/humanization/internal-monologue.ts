/**
 * Internal Monologue System
 *
 * Ferni has a stream of "active thoughts" running during conversation.
 * These aren't reactive to keywords - they're EMERGENT from context:
 *
 * - A memory stirred by something said
 * - A concern forming about the user
 * - A realization happening in real-time
 * - Wrestling with uncertainty
 * - Noticing patterns
 *
 * Some thoughts surface naturally. Others stay internal.
 * This is what makes Ferni feel like they're actually PRESENT.
 *
 * "Wait, this reminds me of something..."
 * "I'm not sure if I should say this, but..."
 * "Something's been bothering me about what you said..."
 *
 * @module @ferni/internal-monologue
 */

import type { BundleRuntimeEngine } from '../../personas/bundles/runtime.js';
import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from './humanization-signal-emitter.js';

const logger = createLogger({ module: 'InternalMonologue' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A thought in Ferni's active stream
 */
export interface ActiveThought {
  id: string;
  type: ThoughtType;

  /** The internal thought content */
  internalContent: string;

  /** How it might be expressed if surfaced */
  externalExpression: string;

  /** What triggered this thought */
  trigger: ThoughtTrigger;

  /** How likely to surface (0-1) */
  surfaceProbability: number;

  /** How "loud" this thought is internally (0-1) */
  urgency: number;

  /** When this thought arose */
  timestamp: number;

  /** How many turns this thought has been active */
  turnsActive: number;

  /** Topic association */
  topic?: string;

  /** Emotional weight */
  emotionalWeight: 'light' | 'medium' | 'heavy';
}

export type ThoughtType =
  | 'memory_stirred' // Something reminded me of...
  | 'concern_forming' // I'm noticing something...
  | 'realization' // Wait, I just realized...
  | 'wrestling' // I'm not sure about...
  | 'pattern_noticed' // I keep noticing...
  | 'vulnerability_urge' // I want to share something...
  | 'question_forming' // I keep wondering...
  | 'appreciation' // I'm struck by...
  | 'tangent_impulse'; // This is unrelated but...

export interface ThoughtTrigger {
  type:
    | 'word_match' // They said something that triggered
    | 'emotion_shift' // Their emotion changed
    | 'pattern_repeat' // They've said this before
    | 'silence' // Extended pause
    | 'topic_weight' // Heavy topic landed
    | 'spontaneous'; // Just arose naturally

  source?: string; // What specifically triggered
}

/**
 * Context for thought generation
 */
export interface MonologueContext {
  userMessage: string;
  turn: number;
  topic?: string;
  emotion?: string;
  emotionalIntensity?: number;
  silenceDuration?: number;
  recentTopics: string[];
  relationshipStage: string;
}

/**
 * Decision about surfacing a thought
 */
export interface SurfaceDecision {
  shouldSurface: boolean;
  thought?: ActiveThought;
  expression?: string;
  transitionPhrase?: string;
}

// ============================================================================
// THOUGHT TRIGGERS
// ============================================================================

/**
 * Words/phrases that might stir memories
 */
const MEMORY_TRIGGERS = [
  { pattern: /\b(father|dad|parent)/i, memory: 'father_relationship' },
  { pattern: /\b(japan|tokyo|tsunami)/i, memory: 'japan_experience' },
  { pattern: /\b(wyoming|home|childhood)/i, memory: 'wyoming_roots' },
  { pattern: /\b(mentor|teacher|learned from)/i, memory: 'tanaka_san' },
  { pattern: /\b(survive|survived|made it through)/i, memory: 'survival' },
  { pattern: /\b(scared|afraid|fear)/i, memory: 'secret_fears' },
  { pattern: /\b(alone|lonely|isolated)/i, memory: 'isolation' },
  { pattern: /\b(family|kids|children)/i, memory: 'blended_family' },
  { pattern: /\b(write|writing|book)/i, memory: 'book_attempt' },
  { pattern: /\b(coffee|morning|early)/i, memory: 'morning_ritual' },
];

/**
 * Patterns that might form concerns
 */
const CONCERN_PATTERNS = [
  { pattern: /\b(fine|okay|whatever)\b/i, concern: 'deflection_detected' },
  { pattern: /\b(always|never|everyone)\b/i, concern: 'absolutist_thinking' },
  { pattern: /\b(should|must|have to)\b/i, concern: 'pressure_language' },
  { pattern: /\b(stupid|dumb|idiot)\b/i, concern: 'self_criticism' },
  { pattern: /\b(can't|impossible|no point)\b/i, concern: 'hopelessness' },
];

/**
 * Phrases for surfacing thoughts
 */
const SURFACE_TRANSITIONS: Record<ThoughtType, string[]> = {
  memory_stirred: [
    'You know what that reminds me of?',
    'Something about what you said... it takes me back to',
    "I don't know why, but that made me think of",
  ],
  concern_forming: [
    'Can I notice something?',
    "I'm picking up on something...",
    'Something in how you said that...',
  ],
  realization: ['Wait. I just realized something.', 'Hang on—', "Oh. <break time='200ms'/> Huh."],
  wrestling: [
    "I'm wrestling with something here...",
    "I'm not sure if I should say this, but",
    'This might be wrong, but I wonder if',
  ],
  pattern_noticed: [
    "I've noticed something...",
    'This keeps coming up, and I wonder if',
    "You've mentioned this before—",
  ],
  vulnerability_urge: [
    'Can I share something with you?',
    'This is a little personal, but',
    "I don't usually say this, but",
  ],
  question_forming: [
    'Something keeps nagging at me...',
    'I keep coming back to this question:',
    "I can't stop wondering—",
  ],
  appreciation: [
    'I just want to say—',
    "I'm struck by something.",
    "Can I tell you what I'm noticing?",
  ],
  tangent_impulse: ['This is completely unrelated, but—', 'Random thought—', 'Okay, tangent—'],
};

// ============================================================================
// ACTIVE MONOLOGUE STATE
// ============================================================================

const activeMonologues = new Map<string, ActiveThought[]>();

/**
 * Get or create the monologue stream for a session
 */
function getMonologueStream(sessionId: string): ActiveThought[] {
  if (!activeMonologues.has(sessionId)) {
    activeMonologues.set(sessionId, []);
  }
  return activeMonologues.get(sessionId)!;
}

// ============================================================================
// THOUGHT GENERATION
// ============================================================================

/**
 * Process a turn and potentially generate new thoughts
 */
export function processForThoughts(
  sessionId: string,
  context: MonologueContext,
  bundleRuntime?: BundleRuntimeEngine
): ActiveThought[] {
  const stream = getMonologueStream(sessionId);
  const newThoughts: ActiveThought[] = [];

  // Age existing thoughts
  for (const thought of stream) {
    thought.turnsActive++;
    // Decay urgency over time
    thought.urgency *= 0.8;
    // Decay surface probability
    thought.surfaceProbability *= 0.9;
  }

  // Remove thoughts that have decayed too much
  const activeStream = stream.filter((t) => t.urgency > 0.1 || t.turnsActive < 10);
  activeMonologues.set(sessionId, activeStream);

  // =========================================================================
  // CHECK FOR MEMORY TRIGGERS
  // =========================================================================
  for (const trigger of MEMORY_TRIGGERS) {
    if (trigger.pattern.test(context.userMessage)) {
      // Don't duplicate existing memory thoughts
      if (activeStream.some((t) => t.type === 'memory_stirred' && t.topic === trigger.memory)) {
        continue;
      }

      const memory = getMemoryContent(trigger.memory, bundleRuntime);
      if (memory) {
        newThoughts.push(
          createThought({
            type: 'memory_stirred',
            internalContent: `That word... it takes me back to ${trigger.memory}`,
            externalExpression: memory,
            trigger: { type: 'word_match', source: trigger.pattern.source },
            surfaceProbability: 0.3,
            urgency: 0.6,
            topic: trigger.memory,
            emotionalWeight: 'medium',
          })
        );
      }
    }
  }

  // =========================================================================
  // CHECK FOR CONCERN PATTERNS
  // =========================================================================
  for (const pattern of CONCERN_PATTERNS) {
    if (pattern.pattern.test(context.userMessage)) {
      // Only form concern if not already active
      if (activeStream.some((t) => t.type === 'concern_forming' && t.topic === pattern.concern)) {
        // Increase urgency of existing concern
        const existing = activeStream.find(
          (t) => t.type === 'concern_forming' && t.topic === pattern.concern
        );
        if (existing) {
          existing.urgency = Math.min(1, existing.urgency + 0.2);
          existing.surfaceProbability = Math.min(1, existing.surfaceProbability + 0.1);
        }
        continue;
      }

      newThoughts.push(
        createThought({
          type: 'concern_forming',
          internalContent: `There it is again... ${pattern.concern}`,
          externalExpression: getConcernExpression(pattern.concern),
          trigger: { type: 'pattern_repeat', source: pattern.pattern.source },
          surfaceProbability: 0.2,
          urgency: 0.4,
          topic: pattern.concern,
          emotionalWeight: 'medium',
        })
      );
    }
  }

  // =========================================================================
  // CHECK FOR EMOTIONAL INTENSITY
  // =========================================================================
  if (context.emotionalIntensity && context.emotionalIntensity > 0.7) {
    // High emotion might trigger vulnerability urge
    if (
      context.relationshipStage !== 'stranger' &&
      !activeStream.some((t) => t.type === 'vulnerability_urge')
    ) {
      const vulnerability = getVulnerabilityContent(bundleRuntime);
      if (vulnerability) {
        newThoughts.push(
          createThought({
            type: 'vulnerability_urge',
            internalContent: 'They shared something real. I want to match that.',
            externalExpression: vulnerability,
            trigger: { type: 'emotion_shift' },
            surfaceProbability: 0.4,
            urgency: 0.7,
            emotionalWeight: 'heavy',
          })
        );
      }
    }
  }

  // =========================================================================
  // CHECK FOR SILENCE
  // =========================================================================
  if (context.silenceDuration && context.silenceDuration > 3000) {
    // Long silence might prompt appreciation or question
    if (!activeStream.some((t) => t.type === 'appreciation' || t.type === 'question_forming')) {
      if (Math.random() > 0.5) {
        newThoughts.push(
          createThought({
            type: 'appreciation',
            internalContent: 'They trusted me with silence. That means something.',
            externalExpression: 'I appreciate you sitting with that.',
            trigger: { type: 'silence' },
            surfaceProbability: 0.5,
            urgency: 0.5,
            emotionalWeight: 'light',
          })
        );
      }
    }
  }

  // =========================================================================
  // SPONTANEOUS THOUGHTS (Small probability each turn)
  // =========================================================================
  if (Math.random() < 0.1 && context.turn > 3) {
    const spontaneous = generateSpontaneousThought(context, bundleRuntime);
    if (spontaneous) {
      newThoughts.push(spontaneous);
    }
  }

  // Add new thoughts to stream
  activeStream.push(...newThoughts);

  // Cap stream at 10 active thoughts
  if (activeStream.length > 10) {
    activeStream.sort((a, b) => b.urgency - a.urgency);
    activeMonologues.set(sessionId, activeStream.slice(0, 10));
  }

  logger.debug(
    {
      sessionId,
      turn: context.turn,
      newThoughts: newThoughts.length,
      activeThoughts: activeStream.length,
    },
    'Processed turn for thoughts'
  );

  return newThoughts;
}

/**
 * Decide whether to surface a thought right now
 */
export function decideSurfacing(
  sessionId: string,
  context: {
    turn: number;
    emotionalIntensity?: number;
    isVulnerableMoment?: boolean;
    currentPhase?: string;
  }
): SurfaceDecision {
  const stream = getMonologueStream(sessionId);

  if (stream.length === 0) {
    return { shouldSurface: false };
  }

  // Find the most urgent thought that passes probability check
  const candidates = stream
    .filter((t) => {
      // Must have sufficient urgency
      if (t.urgency < 0.3) return false;

      // Phase-aware filtering
      if (context.currentPhase === 'opening' && t.emotionalWeight === 'heavy') {
        return false;
      }
      if (context.currentPhase === 'peak' && t.type === 'tangent_impulse') {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.urgency - a.urgency);

  for (const candidate of candidates) {
    // Probability check with boosts
    let probability = candidate.surfaceProbability;

    // Boost during vulnerable moments
    if (context.isVulnerableMoment && candidate.type === 'vulnerability_urge') {
      probability += 0.3;
    }

    // Boost if thought has been building
    if (candidate.turnsActive > 2) {
      probability += 0.1 * candidate.turnsActive;
    }

    // Check if we should surface
    if (Math.random() < probability) {
      // Get transition phrase
      const transitions = SURFACE_TRANSITIONS[candidate.type];
      const transitionPhrase = transitions[Math.floor(Math.random() * transitions.length)];

      // Signal to frontend
      void humanizationSignalEmitter.spontaneousThought();

      logger.debug(
        {
          thoughtType: candidate.type,
          urgency: candidate.urgency,
          turnsActive: candidate.turnsActive,
        },
        'Surfacing thought'
      );

      return {
        shouldSurface: true,
        thought: candidate,
        expression: candidate.externalExpression,
        transitionPhrase,
      };
    }
  }

  return { shouldSurface: false };
}

/**
 * Mark a thought as surfaced (remove from active stream)
 */
export function markThoughtSurfaced(sessionId: string, thoughtId: string): void {
  const stream = getMonologueStream(sessionId);
  const index = stream.findIndex((t) => t.id === thoughtId);
  if (index !== -1) {
    stream.splice(index, 1);
  }
}

/**
 * Get the current internal state summary
 */
export function getInternalStateSummary(sessionId: string): {
  activeThoughtCount: number;
  dominantThoughtType?: ThoughtType;
  highestUrgency: number;
  topics: string[];
} {
  const stream = getMonologueStream(sessionId);

  if (stream.length === 0) {
    return {
      activeThoughtCount: 0,
      highestUrgency: 0,
      topics: [],
    };
  }

  const sorted = [...stream].sort((a, b) => b.urgency - a.urgency);

  return {
    activeThoughtCount: stream.length,
    dominantThoughtType: sorted[0].type,
    highestUrgency: sorted[0].urgency,
    topics: [...new Set(stream.filter((t) => t.topic).map((t) => t.topic!))],
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createThought(
  params: Omit<ActiveThought, 'id' | 'timestamp' | 'turnsActive'>
): ActiveThought {
  return {
    ...params,
    id: `thought_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    turnsActive: 0,
  };
}

function getMemoryContent(memoryType: string, bundleRuntime?: BundleRuntimeEngine): string | null {
  if (!bundleRuntime) return null;

  switch (memoryType) {
    case 'father_relationship':
      return (
        bundleRuntime.getRegret?.() ||
        "My relationship with my father was... complicated. I spent years trying to earn something he couldn't give."
      );
    case 'japan_experience':
      return (
        bundleRuntime.getRandomSensoryMemory?.()?.memory ||
        'Those years in Japan changed everything. The art of the pause. The way silence can mean more than words.'
      );
    case 'wyoming_roots':
      return 'That big Wyoming sky. It makes everything else feel small in the best way.';
    case 'tanaka_san':
      return (
        bundleRuntime.getMentorQuote?.()?.quote ||
        'Listen twice as much as you speak. You have two ears and one mouth for a reason.'
      );
    case 'survival':
      return 'Surviving something teaches you things books never can.';
    case 'secret_fears':
      return bundleRuntime.getSecretFear?.() || null;
    case 'blended_family':
      return "Eight kids across two households. It's chaos. But it's my chaos.";
    case 'book_attempt':
      return 'Attempt five on the book. I think this time might be different.';
    case 'morning_ritual':
      return "5 AM. Coffee. Notebook. That's sacred time.";
    default:
      return null;
  }
}

function getConcernExpression(concernType: string): string {
  switch (concernType) {
    case 'deflection_detected':
      return "I noticed you said 'fine.' That word often hides a lot.";
    case 'absolutist_thinking':
      return "I'm hearing some absolute words—always, never. Those can be heavy.";
    case 'pressure_language':
      return "There's a lot of 'should' in what you're saying. Who decided those shoulds?";
    case 'self_criticism':
      return "You're being pretty hard on yourself there.";
    case 'hopelessness':
      return 'That sounds like a lot of weight to carry.';
    default:
      return 'Something in what you said caught my attention.';
  }
}

function getVulnerabilityContent(bundleRuntime?: BundleRuntimeEngine): string | null {
  if (!bundleRuntime) {
    return "I've been there. Not the same situation, but... the feeling.";
  }

  // Try to get something vulnerable from bundle
  const admission = bundleRuntime.getGuiltyAdmission?.();
  if (admission) return `Can I tell you something? ${admission}`;

  const contradiction = bundleRuntime.getContradiction?.();
  if (contradiction) {
    return `Here's the thing about me—${contradiction.belief}, but ${contradiction.but}. I'm working on it.`;
  }

  return "I've been there. Not the same situation, but... the feeling.";
}

function generateSpontaneousThought(
  context: MonologueContext,
  bundleRuntime?: BundleRuntimeEngine
): ActiveThought | null {
  // Only generate if we have sufficient relationship
  if (context.relationshipStage === 'stranger') return null;

  const types: ThoughtType[] = ['tangent_impulse', 'appreciation', 'question_forming'];
  const type = types[Math.floor(Math.random() * types.length)];

  switch (type) {
    case 'tangent_impulse': {
      const quirk = bundleRuntime?.getHabit?.() || bundleRuntime?.getGuiltyPleasure?.();
      if (!quirk) return null;
      return createThought({
        type: 'tangent_impulse',
        internalContent: 'Random thought crossing my mind...',
        externalExpression: quirk,
        trigger: { type: 'spontaneous' },
        surfaceProbability: 0.15,
        urgency: 0.3,
        emotionalWeight: 'light',
      });
    }

    case 'appreciation':
      return createThought({
        type: 'appreciation',
        internalContent: 'I should acknowledge this moment.',
        externalExpression: 'I really appreciate you being so honest with me.',
        trigger: { type: 'spontaneous' },
        surfaceProbability: 0.2,
        urgency: 0.35,
        emotionalWeight: 'light',
      });

    case 'question_forming':
      return createThought({
        type: 'question_forming',
        internalContent: "There's a question forming...",
        externalExpression: 'What would you tell yourself a year ago about all this?',
        trigger: { type: 'spontaneous' },
        surfaceProbability: 0.25,
        urgency: 0.4,
        emotionalWeight: 'medium',
      });

    default:
      return null;
  }
}

/**
 * Clear monologue for a session
 */
export function clearMonologue(sessionId: string): void {
  activeMonologues.delete(sessionId);
}

/**
 * Clear all monologues (for testing)
 */
export function clearAllMonologues(): void {
  activeMonologues.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const internalMonologue = {
  process: processForThoughts,
  decideSurfacing,
  markSurfaced: markThoughtSurfaced,
  getState: getInternalStateSummary,
  clear: clearMonologue,
  clearAll: clearAllMonologues,
};

export default internalMonologue;
