/**
 * Topic Guidance Context Builder
 *
 * > "Some conversations require a different kind of presence."
 *
 * Provides specialized guidance for sensitive conversation topics:
 * - Grief conversations - unhurried presence, avoid silver linings
 * - Anxiety conversations - calm anchor, grounding techniques
 * - Second chances - holding hope, celebrating tiny wins
 * - Life transitions - honor both endings and beginnings
 * - Difficult conversations - practice partner mode
 * - Vulnerability - sacred space, honor what they're sharing
 * - Late night - quieter, softer, no judgment about the hour
 * - Connection/loneliness - non-judgmental curiosity
 * - Quiet growth - patient presence for slow internal work
 *
 * Content Source: bundles/ferni/content/behaviors/topic-guidance.json
 *
 * @module intelligence/context-builders/coaching/topic-guidance
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadPersonaContent } from '../../../services/persona-content-loader.js';
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';

const log = createLogger({ module: 'context:topic-guidance' });

// ============================================================================
// TYPES
// ============================================================================

interface TopicGuidanceContent {
  grief?: TopicConfig;
  anxiety?: TopicConfig;
  second_chances?: TopicConfig;
  life_transitions?: TopicConfig;
  difficult_conversations?: TopicConfigWithApproach;
  vulnerability?: TopicConfigWithResponse;
  late_night?: TopicConfig;
  connection?: TopicConfig;
  quiet_growth?: TopicConfig;
  _usage?: {
    when_to_reference?: string[];
    how_to_use?: string;
    remember?: string;
  };
}

interface TopicConfig {
  energy: string;
  pacing: string;
  key_truths?: string[];
  avoid?: string[];
  signature_moment?: string;
  signature_phrase?: string;
}

interface TopicConfigWithApproach extends TopicConfig {
  approach?: string[];
}

interface TopicConfigWithResponse extends TopicConfig {
  response?: string[];
}

interface TopicTrigger {
  topic: keyof Omit<TopicGuidanceContent, '_usage'>;
  patterns: RegExp[];
  priority: number;
  voiceEmotionMatch?: string[];
}

// ============================================================================
// TOPIC TRIGGERS
// ============================================================================

const TOPIC_TRIGGERS: TopicTrigger[] = [
  // GRIEF - Highest priority for safety
  {
    topic: 'grief',
    patterns: [
      /\b(died|death|passed away|lost|grief|mourning|funeral|miss them|gone forever)\b/i,
      /\b(my (mom|dad|father|mother|brother|sister|friend|husband|wife|partner|child|son|daughter|grandma|grandpa).*(died|passed|gone))\b/i,
      /\b(grieving|bereaved|bereavement|widow|widower)\b/i,
    ],
    priority: 95,
    voiceEmotionMatch: ['sad', 'grief', 'distressed'],
  },

  // ANXIETY - High priority for immediate support
  {
    topic: 'anxiety',
    patterns: [
      /\b(anxiety|anxious|panic|panicking|can't breathe|heart racing)\b/i,
      /\b(worried sick|freaking out|spiraling|overwhelmed)\b/i,
      /\b(catastrophizing|worst case|what if|can't stop thinking)\b/i,
    ],
    priority: 90,
    voiceEmotionMatch: ['anxious', 'stressed', 'fearful'],
  },

  // VULNERABILITY - High priority for sacred moments
  {
    topic: 'vulnerability',
    patterns: [
      /\b(never told anyone|hard to (say|admit)|between us|first time.*saying)\b/i,
      /\b(vulnerable|opening up|trust.*with this|confess)\b/i,
      /\b(shame|ashamed|embarrassed to admit|secret)\b/i,
    ],
    priority: 85,
    voiceEmotionMatch: ['vulnerable', 'nervous', 'hesitant'],
  },

  // LATE NIGHT - Time-based detection + content
  {
    topic: 'late_night',
    patterns: [
      /\b(can't sleep|sleepless|insomnia|awake at|3 ?am|2 ?am|middle of the night)\b/i,
      /\b(racing thoughts|mind won't stop|up all night|lying awake)\b/i,
    ],
    priority: 80,
  },

  // LIFE TRANSITIONS
  {
    topic: 'life_transitions',
    patterns: [
      /\b(moving|relocating|new city|leaving|starting over|big change)\b/i,
      /\b(career change|new job|quitting|retiring|graduation)\b/i,
      /\b(divorce|breakup|empty nest|becoming a parent|marriage)\b/i,
      /\b(chapter.*closing|new chapter|turning point|crossroads)\b/i,
    ],
    priority: 75,
    voiceEmotionMatch: ['uncertain', 'mixed', 'ambivalent'],
  },

  // SECOND CHANCES
  {
    topic: 'second_chances',
    patterns: [
      /\b(second chance|start over|rock bottom|comeback|redemption)\b/i,
      /\b(recovery|sober|clean|relapse|addiction)\b/i,
      /\b(failed.*trying again|messed up.*another shot|learn.*mistake)\b/i,
    ],
    priority: 70,
    voiceEmotionMatch: ['hopeful', 'determined', 'vulnerable'],
  },

  // DIFFICULT CONVERSATIONS
  {
    topic: 'difficult_conversations',
    patterns: [
      /\b(need to (tell|say|confront|talk to).*about)\b/i,
      /\b(difficult conversation|hard talk|awkward discussion)\b/i,
      /\b(how do I (say|tell|bring up|approach))\b/i,
      /\b(practice.*saying|rehearse|what to say)\b/i,
    ],
    priority: 65,
  },

  // CONNECTION / LONELINESS
  {
    topic: 'connection',
    patterns: [
      /\b(lonely|alone|isolated|no friends|disconnected)\b/i,
      /\b(hard to (connect|make friends|fit in|belong))\b/i,
      /\b(feel.*apart|outsider|don't belong|social anxiety)\b/i,
    ],
    priority: 60,
    voiceEmotionMatch: ['sad', 'lonely', 'withdrawn'],
  },

  // QUIET GROWTH
  {
    topic: 'quiet_growth',
    patterns: [
      /\b(working on myself|inner work|growth.*slow|small steps)\b/i,
      /\b(healing|processing|reflecting|introspection)\b/i,
      /\b(not ready to talk|need time|just.*thinking)\b/i,
    ],
    priority: 55,
    voiceEmotionMatch: ['contemplative', 'reflective', 'calm'],
  },
];

// Cache for loaded content
let contentCache: TopicGuidanceContent | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadTopicGuidanceContent(): Promise<TopicGuidanceContent | null> {
  const now = Date.now();
  if (contentCache && now - cacheTimestamp < CACHE_TTL) {
    return contentCache;
  }

  try {
    const content = await loadPersonaContent<TopicGuidanceContent>('ferni', 'topic_guidance');
    if (content) {
      contentCache = content;
      cacheTimestamp = now;
      log.debug('Loaded topic guidance content');
    }
    return content;
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not load topic guidance content');
    return null;
  }
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatTopicGuidance(
  topic: string,
  config: TopicConfig | TopicConfigWithApproach | TopicConfigWithResponse
): string {
  const sections: string[] = [];

  sections.push(`ENERGY: ${config.energy}`);
  sections.push(`PACING: ${config.pacing}`);

  if (config.key_truths && config.key_truths.length > 0) {
    sections.push(`\nKEY TRUTHS TO HOLD:`);
    config.key_truths.forEach((truth) => {
      sections.push(`  • "${truth}"`);
    });
  }

  if ('approach' in config && config.approach && config.approach.length > 0) {
    sections.push(`\nAPPROACH:`);
    config.approach.forEach((a) => {
      sections.push(`  • ${a}`);
    });
  }

  if ('response' in config && config.response && config.response.length > 0) {
    sections.push(`\nRESPONSES TO CONSIDER:`);
    config.response.forEach((r) => {
      sections.push(`  • "${r}"`);
    });
  }

  if (config.avoid && config.avoid.length > 0) {
    sections.push(`\n🚫 AVOID:`);
    config.avoid.forEach((a) => {
      sections.push(`  • "${a}"`);
    });
  }

  if (config.signature_phrase) {
    sections.push(`\n✨ SIGNATURE: "${config.signature_phrase}"`);
  }

  if (config.signature_moment) {
    sections.push(`\n✨ SIGNATURE MOMENT: ${config.signature_moment}`);
  }

  return sections.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build topic-specific guidance for sensitive conversations.
 *
 * This builder detects when the conversation enters sensitive territory
 * and provides Ferni with the right energy, pacing, and truths to hold.
 */
export async function buildTopicGuidanceContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, voiceEmotion } = input;
  const injections: ContextInjection[] = [];
  const emotionalState = voiceEmotion?.emotion;

  if (!userText) return injections;

  const content = await loadTopicGuidanceContent();
  if (!content) return injections;

  const combinedText = userText.toLowerCase();

  // Find matching topics (sorted by priority)
  const matchingTopics: { trigger: TopicTrigger; score: number }[] = [];

  for (const trigger of TOPIC_TRIGGERS) {
    const matched = trigger.patterns.some((pattern) => pattern.test(combinedText));
    if (!matched) continue;

    // Boost score if voice emotion matches
    let score = trigger.priority;
    if (
      trigger.voiceEmotionMatch &&
      emotionalState &&
      trigger.voiceEmotionMatch.includes(emotionalState)
    ) {
      score += 10;
    }

    matchingTopics.push({ trigger, score });
  }

  if (matchingTopics.length === 0) return injections;

  // Sort by score (highest first) and take top match
  matchingTopics.sort((a, b) => b.score - a.score);
  const bestMatch = matchingTopics[0];
  const topicConfig = content[bestMatch.trigger.topic];

  if (!topicConfig) return injections;

  const guidance = formatTopicGuidance(bestMatch.trigger.topic, topicConfig);

  injections.push({
    id: `topic-guidance-${bestMatch.trigger.topic}-${Date.now()}`,
    source: 'topic-guidance',
    category: 'topic_guidance',
    content: `[🎯 SENSITIVE TOPIC GUIDANCE - ${bestMatch.trigger.topic.replace(/_/g, ' ').toUpperCase()}]

This conversation has entered sensitive territory. Adjust your presence:

${guidance}

Remember: Embody the energy and truths, don't recite phrases.
The LLM generates better responses when it understands the WHY.`,
    priority: bestMatch.score >= 85 ? 'critical' : 'high',
  });

  log.info(
    { topic: bestMatch.trigger.topic, score: bestMatch.score },
    '🎯 Topic guidance activated'
  );

  return injections;
}

export default buildTopicGuidanceContext;
