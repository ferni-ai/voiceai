/**
 * Inner World Injector
 *
 * Brings personas to life by injecting their inner world into conversations.
 * When the conversation touches on certain topics, the AI can naturally
 * reference sensory memories, personal contradictions, and embodied experiences.
 *
 * This is what makes a persona feel REAL - not just knowledgeable, but HUMAN.
 *
 * "The smell of sage after rain in Wyoming... that takes me right back."
 *
 * IMPORTANT: Uses thematic tracking to prevent repetition of major backstory
 * elements (Wyoming, Japan, book, etc.) - each theme should only be mentioned
 * ONCE per session unless the user specifically asks about it.
 */

import { extractPersonalThemes, type PersonalTheme } from '../../agents/session/session-state.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/runtime.js';

// ============================================================================
// TYPES
// ============================================================================

export interface InnerWorldInjection {
  type:
    | 'sensory_memory'
    | 'embodied_memory'
    | 'contradiction'
    | 'emotional_flashpoint'
    | 'unfinished_business'
    | 'secret_self'
    | 'dream_still_chasing'
    | 'mortality_awareness'
    | 'voice_fingerprint';

  /** The content to potentially share */
  content: string;

  /** What triggered this memory/share */
  trigger: string;

  /** How vulnerable/deep is this share? */
  depth: 'surface' | 'medium' | 'deep' | 'sacred';

  /** Minimum relationship stage required */
  requiredRelationship: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** How to introduce this naturally */
  transitionPhrases: string[];

  /** Probability this should be injected (0-1) */
  probability: number;
}

export interface InnerWorldContext {
  currentTopic?: string;
  recentTopics: string[];
  userMessage: string;
  emotionalIntensity: number;
  relationshipStage: string;
  turnCount: number;
  isVulnerableMoment: boolean;
  /** Themes already mentioned this session (prevents Wyoming/Japan/book repetition) */
  mentionedThemes?: Set<string>;
  /** Whether user explicitly asked about a topic (allows override of theme blocking) */
  userAskedAbout?: string;
}

// ============================================================================
// TOPIC TO INNER WORLD MAPPINGS
// ============================================================================

interface TopicTrigger {
  patterns: RegExp[];
  innerWorldPaths: string[];
  depth: InnerWorldInjection['depth'];
}

const TOPIC_TRIGGERS: TopicTrigger[] = [
  // Family triggers
  {
    patterns: [
      /\b(family|parent|father|mother|dad|mom|sibling|brother|sister|kid|child|son|daughter)\b/i,
      /\b(grew up|childhood|raised|upbringing)\b/i,
    ],
    innerWorldPaths: [
      'embodied_memories.sense_memories.family',
      'unfinished_business.regrets',
      'relationship_history.complicated_relationships',
      'sensory_preferences.sounds_that_fill_the_soul',
    ],
    depth: 'medium',
  },

  // Loss/grief triggers
  {
    patterns: [
      /\b(died|death|passed away|lost|grief|mourning|funeral|miss them|gone)\b/i,
      /\b(hard to talk about|difficult to say)\b/i,
    ],
    innerWorldPaths: [
      'embodied_memories.sense_memories.loss',
      'unfinished_business.conversations_never_had',
      'mortality_awareness',
      'emotional_flashpoints.instant_tears',
    ],
    depth: 'sacred',
  },

  // Work/career triggers
  {
    patterns: [
      /\b(job|career|work|profession|boss|colleague|office|retire|quit|fired|promoted)\b/i,
      /\b(what do you do|for a living)\b/i,
    ],
    innerWorldPaths: [
      'unfinished_business.unresolved_questions',
      'relationship_history.mentors_who_shaped_them',
      'daily_rhythms',
      'sensory_preferences.environments_that_drain',
    ],
    depth: 'medium',
  },

  // Stress/overwhelm triggers
  {
    patterns: [
      /\b(stressed|overwhelmed|exhausted|burned out|can't cope|too much|drowning)\b/i,
      /\b(anxiety|anxious|worried sick|panic)\b/i,
    ],
    innerWorldPaths: [
      'inner_voice.what_they_tell_themselves_when_struggling',
      'contradictions.public_vs_private',
      'secret_self.guilty_admissions',
      'growth_edges.feedback_they_keep_getting',
    ],
    depth: 'deep',
  },

  // Dreams/aspirations triggers
  {
    patterns: [
      /\b(dream|aspiration|goal|hope|want to be|one day|bucket list|always wanted)\b/i,
      /\b(what if|imagine if|wouldn't it be nice)\b/i,
    ],
    innerWorldPaths: [
      'dreams_still_chasing',
      'unfinished_business.unresolved_questions',
      'secret_self.hidden_talents',
    ],
    depth: 'medium',
  },

  // Silence/reflection triggers
  {
    patterns: [
      /\b(quiet|silence|peace|alone|solitude|thinking|reflecting)\b/i,
      /\b(early morning|late night|can't sleep)\b/i,
    ],
    innerWorldPaths: [
      'daily_rhythms.morning_ritual',
      'daily_rhythms.sacred_weekly_time',
      'sensory_preferences.environments_where_they_thrive',
      'secret_self.who_they_are_alone',
    ],
    depth: 'medium',
  },

  // Music/sound triggers
  {
    patterns: [/\b(music|song|listen|playlist|sound|hearing|noise|quiet)\b/i],
    innerWorldPaths: [
      'sensory_preferences.music_for_different_moods',
      'sensory_preferences.sounds_that_fill_the_soul',
      'sensory_preferences.sounds_that_grate',
    ],
    depth: 'surface',
  },

  // Food/comfort triggers
  {
    patterns: [/\b(food|eat|meal|cook|taste|hungry|restaurant|coffee|tea)\b/i],
    innerWorldPaths: [
      'sensory_preferences.comfort_foods',
      'embodied_memories.sense_memories',
      'daily_rhythms.morning_ritual',
    ],
    depth: 'surface',
  },

  // Travel/place triggers
  {
    patterns: [
      /\b(travel|trip|vacation|place|country|city|home|moved|live)\b/i,
      /\b(japan|wyoming|brazil|morocco|india|scotland)\b/i,
    ],
    innerWorldPaths: [
      'embodied_memories.sense_memories',
      'dreams_still_chasing.bucket_list',
      'sensory_preferences.environments_where_they_thrive',
    ],
    depth: 'medium',
  },

  // Self-doubt/imposter triggers
  {
    patterns: [
      /\b(imposter|fake|fraud|not good enough|don't deserve|who am i)\b/i,
      /\b(compare myself|everyone else seems|behind)\b/i,
    ],
    innerWorldPaths: [
      'secret_self.secret_fears',
      'inner_voice.inner_critic_voice',
      'contradictions.strengths_that_are_also_weaknesses',
      'growth_edges.where_they_know_they_fall_short',
    ],
    depth: 'deep',
  },

  // Gratitude/joy triggers
  {
    patterns: [
      /\b(grateful|thankful|appreciate|blessed|lucky|happy|joy|wonderful)\b/i,
      /\b(best (thing|part|day)|love (this|that|my))\b/i,
    ],
    innerWorldPaths: [
      'emotional_flashpoints.instant_joy',
      'sensory_preferences.sounds_that_fill_the_soul',
      'inner_voice.inner_champion_voice',
    ],
    depth: 'surface',
  },

  // Anger/frustration triggers
  {
    patterns: [
      /\b(angry|furious|mad|pissed|frustrated|annoying|hate)\b/i,
      /\b(can't stand|sick of|fed up)\b/i,
    ],
    innerWorldPaths: [
      'emotional_flashpoints.instant_anger',
      'emotional_flashpoints.instant_shutdown',
      'values_under_pressure.line_they_wont_cross',
    ],
    depth: 'medium',
  },

  // Vulnerability/trust triggers
  {
    patterns: [
      /\b(trust|vulnerable|open up|share|admit|confess|honest)\b/i,
      /\b(never told anyone|hard to say|between us)\b/i,
    ],
    innerWorldPaths: [
      'secret_self.guilty_admissions',
      'contradictions.belief_vs_behavior',
      'inner_voice.self_talk_patterns',
    ],
    depth: 'deep',
  },

  // Values/ethics triggers
  {
    patterns: [
      /\b(values|believe|principle|right thing|wrong|moral|ethical|integrity)\b/i,
      /\b(sacrifice|give up|choose|decision)\b/i,
    ],
    innerWorldPaths: [
      'values_under_pressure',
      'inner_voice.mantra',
      'growth_edges.actively_working_on',
    ],
    depth: 'deep',
  },
];

// ============================================================================
// TRANSITION PHRASES BY DEPTH
// ============================================================================

const TRANSITION_PHRASES: Record<InnerWorldInjection['depth'], string[]> = {
  surface: [
    'You know what that reminds me of?',
    'That makes me think of...',
    'I was just thinking about...',
    'Speaking of which...',
  ],
  medium: [
    'You know, that brings up something...',
    'Can I share something?',
    'That takes me back to...',
    "I've been thinking about this lately...",
    "Here's something I don't talk about often...",
  ],
  deep: [
    "I'm going to share something personal here...",
    "This is something I've been wrestling with...",
    'Can I be honest about something?',
    "I don't usually say this, but...",
    'You know what keeps me up at night?',
  ],
  sacred: [
    "<break time='300ms'/>",
    'I want to share something with you...',
    'This is hard to talk about, but...',
    "<volume level='soft'/>You know what I've never really processed?</volume>",
    "There's something I carry...",
  ],
};

// ============================================================================
// INNER WORLD INJECTOR
// ============================================================================

/**
 * Check if user explicitly asked about a theme
 * This allows overriding the theme-blocking for direct questions
 */
function userAskedAboutTheme(userMessage: string, theme: PersonalTheme): boolean {
  const askPatterns: Record<PersonalTheme, RegExp[]> = {
    wyoming: [/tell me about wyoming/i, /where.*from/i, /your childhood/i],
    japan: [/tell me about japan/i, /the tsunami/i, /what happened in japan/i],
    book: [/your book/i, /writing/i, /how's the book/i, /attempt five/i],
    childhood: [/growing up/i, /when you were.*kid/i, /your childhood/i],
    family: [/your wife/i, /your kids/i, /your family/i],
    notebook: [/your notebook/i, /write everything down/i],
    mortality: [/death/i, /dying/i, /what keeps you up/i],
    regret: [/any regrets/i, /what do you regret/i],
    fear: [/what scares you/i, /what are you afraid of/i],
  };

  const patterns = askPatterns[theme] || [];
  return patterns.some((p) => p.test(userMessage));
}

/**
 * Analyze context and find relevant inner world content to inject
 *
 * IMPORTANT: Filters out content containing themes that have already been
 * mentioned this session to prevent the "always talks about Wyoming" problem.
 */
export function findInnerWorldInjections(
  context: InnerWorldContext,
  bundleRuntime: BundleRuntimeEngine | undefined
): InnerWorldInjection[] {
  if (!bundleRuntime) {
    return [];
  }

  const injections: InnerWorldInjection[] = [];
  const combinedText = `${context.userMessage} ${context.recentTopics.join(' ')}`;
  const mentionedThemes = context.mentionedThemes || new Set<string>();

  // Check each trigger pattern
  for (const trigger of TOPIC_TRIGGERS) {
    const matched = trigger.patterns.some((pattern) => pattern.test(combinedText));

    if (matched) {
      // Try to get content from bundle for each inner world path
      for (const path of trigger.innerWorldPaths) {
        const content = getInnerWorldContent(bundleRuntime, path, context);

        if (content) {
          // ============================================================
          // THEME DEDUPLICATION: Skip if content contains already-mentioned themes
          // ============================================================
          const contentThemes = extractPersonalThemes(content);
          const alreadyMentionedThemes = contentThemes.filter((t) => mentionedThemes.has(t));

          // Skip if any theme was already mentioned (unless user explicitly asked)
          if (alreadyMentionedThemes.length > 0) {
            const userAsked = alreadyMentionedThemes.some((theme) =>
              userAskedAboutTheme(context.userMessage, theme)
            );

            if (!userAsked) {
              // Skip this content - theme already mentioned
              continue;
            }
          }

          // Determine if relationship stage permits this depth
          const requiredRelationship = getRequiredRelationship(trigger.depth);

          // Calculate probability based on context
          const probability = calculateInjectionProbability(context, trigger.depth);

          injections.push({
            type: getTypeFromPath(path),
            content,
            trigger: path,
            depth: trigger.depth,
            requiredRelationship,
            transitionPhrases: TRANSITION_PHRASES[trigger.depth],
            probability,
          });
        }
      }
    }
  }

  // Sort by probability and limit to avoid overwhelming
  return injections.sort((a, b) => b.probability - a.probability).slice(0, 2);
}

/**
 * Get content from bundle runtime for a specific inner world path
 * Uses the BundleRuntimeEngine's existing methods to access content
 */
function getInnerWorldContent(
  bundleRuntime: BundleRuntimeEngine,
  path: string,
  context: InnerWorldContext
): string | null {
  try {
    // Map paths to BundleRuntimeEngine method calls
    if (path.includes('sense_memories') || path.includes('embodied_memories')) {
      const memory = bundleRuntime.getSensoryMemory(context.userMessage);
      if (memory) return memory.memory;
      const randomMemory = bundleRuntime.getRandomSensoryMemory();
      if (randomMemory) return randomMemory.memory;
    }

    if (
      path.includes('what_they_tell_themselves_when_struggling') ||
      path.includes('inner_voice')
    ) {
      return bundleRuntime.getSelfTalk('struggling');
    }

    if (path.includes('inner_critic')) {
      return bundleRuntime.getSelfTalk('critic');
    }

    if (path.includes('inner_champion')) {
      return bundleRuntime.getSelfTalk('champion');
    }

    if (path.includes('mantra')) {
      return bundleRuntime.getSelfTalk('mantra');
    }

    if (path.includes('contradiction') || path.includes('belief_vs_behavior')) {
      const contradiction = bundleRuntime.getContradiction();
      if (contradiction) return `${contradiction.belief}, but ${contradiction.but}`;
    }

    if (path.includes('public_vs_private')) {
      const publicPrivate = bundleRuntime.getPublicPrivateSelf();
      if (publicPrivate)
        return `People see me as ${publicPrivate.public_self}, but really ${publicPrivate.private_self}`;
    }

    if (path.includes('regret')) {
      return bundleRuntime.getRegret();
    }

    if (path.includes('what_keeps_them_up')) {
      return bundleRuntime.getWhatKeepsThemUp();
    }

    if (path.includes('legacy_hope')) {
      return bundleRuntime.getLegacyHope();
    }

    if (path.includes('secret_fear')) {
      return bundleRuntime.getSecretFear();
    }

    if (path.includes('guilty_admission')) {
      return bundleRuntime.getGuiltyAdmission();
    }

    if (path.includes('line_they_wont_cross') || path.includes('values_under_pressure')) {
      return bundleRuntime.getLineWontCross();
    }

    if (path.includes('music_for_different_moods')) {
      if (context.emotionalIntensity < 0.3) {
        return bundleRuntime.getMusicForMood('thinking');
      }
      if (context.emotionalIntensity > 0.7) {
        return bundleRuntime.getMusicForMood('energy');
      }
      return bundleRuntime.getMusicForMood('joy');
    }

    if (path.includes('sounds_that_fill_the_soul')) {
      const sounds = bundleRuntime.getSoulFillingSounds();
      if (sounds && sounds.length > 0) {
        return sounds[Math.floor(Math.random() * sounds.length)];
      }
    }

    if (path.includes('mentor')) {
      const mentor = bundleRuntime.getMentorQuote();
      if (mentor) return `${mentor.mentor} once told me: "${mentor.quote}"`;
    }

    if (path.includes('growth_edge') || path.includes('actively_working_on')) {
      return bundleRuntime.getGrowthEdge();
    }

    if (path.includes('recharge') || path.includes('daily_rhythms')) {
      return bundleRuntime.getRechargeMethod();
    }

    if (path.includes('signature_phrase') || path.includes('voice_fingerprint')) {
      return bundleRuntime.getSignaturePhrase();
    }

    if (path.includes('verbal_tic')) {
      return bundleRuntime.getVerbalTic();
    }

    // Fallback: try getting a random humanizing moment
    const humanizing = bundleRuntime.getHumanizingMoment();
    if (humanizing) return humanizing.content;

    return null;
  } catch {
    return null;
  }
}

/**
 * Get required relationship stage for a depth level
 */
function getRequiredRelationship(
  depth: InnerWorldInjection['depth']
): InnerWorldInjection['requiredRelationship'] {
  switch (depth) {
    case 'surface':
      return 'stranger';
    case 'medium':
      return 'acquaintance';
    case 'deep':
      return 'friend';
    case 'sacred':
      return 'trusted_advisor';
  }
}

/**
 * Calculate probability of injection based on context
 */
function calculateInjectionProbability(
  context: InnerWorldContext,
  depth: InnerWorldInjection['depth']
): number {
  let probability = 0.15; // Base probability

  // Higher probability for vulnerable moments
  if (context.isVulnerableMoment) {
    probability += 0.2;
  }

  // Adjust based on turn count (more likely in mid-conversation)
  if (context.turnCount > 5 && context.turnCount < 15) {
    probability += 0.1;
  }

  // Adjust based on depth and relationship
  const relationshipDepth = getRelationshipDepthScore(context.relationshipStage);
  const requiredDepth = getDepthScore(depth);

  if (relationshipDepth >= requiredDepth) {
    probability += 0.15;
  } else {
    probability -= 0.2; // Reduce if relationship isn't deep enough
  }

  // High emotional intensity increases likelihood
  if (context.emotionalIntensity > 0.6) {
    probability += 0.1;
  }

  return Math.max(0, Math.min(1, probability));
}

/**
 * Get numeric depth score for relationship stage
 */
function getRelationshipDepthScore(stage: string): number {
  const scores: Record<string, number> = {
    stranger: 1,
    acquaintance: 2,
    friend: 3,
    trusted_advisor: 4,
  };
  return scores[stage] || 1;
}

/**
 * Get numeric depth score for injection depth
 */
function getDepthScore(depth: InnerWorldInjection['depth']): number {
  const scores: Record<string, number> = {
    surface: 1,
    medium: 2,
    deep: 3,
    sacred: 4,
  };
  return scores[depth] || 1;
}

/**
 * Get injection type from path
 */
function getTypeFromPath(path: string): InnerWorldInjection['type'] {
  if (path.includes('sense_memories') || path.includes('embodied')) return 'embodied_memory';
  if (path.includes('sensory')) return 'sensory_memory';
  if (path.includes('contradiction')) return 'contradiction';
  if (path.includes('flashpoint')) return 'emotional_flashpoint';
  if (path.includes('unfinished')) return 'unfinished_business';
  if (path.includes('secret')) return 'secret_self';
  if (path.includes('dream')) return 'dream_still_chasing';
  if (path.includes('mortality')) return 'mortality_awareness';
  if (path.includes('voice_fingerprint')) return 'voice_fingerprint';
  return 'sensory_memory';
}

/**
 * Format inner world injections for LLM prompt
 */
export function formatInnerWorldForPrompt(
  injections: InnerWorldInjection[],
  relationshipStage: string
): string {
  if (injections.length === 0) {
    return '';
  }

  const relationshipDepth = getRelationshipDepthScore(relationshipStage);
  const validInjections = injections.filter((i) => {
    const requiredDepth = getRelationshipDepthScore(i.requiredRelationship);
    return relationshipDepth >= requiredDepth;
  });

  if (validInjections.length === 0) {
    return '';
  }

  const sections: string[] = [];
  sections.push('[PERSONAL SHARE OPPORTUNITY]');
  sections.push('If the moment feels right, you could naturally share something personal:');
  sections.push('');

  for (const injection of validInjections.slice(0, 2)) {
    const transition =
      injection.transitionPhrases[Math.floor(Math.random() * injection.transitionPhrases.length)];
    sections.push(`Transition: "${transition}"`);
    sections.push(`Share: "${injection.content}"`);
    sections.push(`(Depth: ${injection.depth} - ${Math.round(injection.probability * 100)}% fit)`);
    sections.push('');
  }

  sections.push("IMPORTANT: Only share if it feels NATURAL. Don't force it.");
  sections.push('These personal moments should feel spontaneous, not scripted.');

  return sections.join('\n');
}

/**
 * Check if an injection should actually be used (probabilistic)
 */
export function shouldInject(injection: InnerWorldInjection): boolean {
  return Math.random() < injection.probability;
}

export default findInnerWorldInjections;
