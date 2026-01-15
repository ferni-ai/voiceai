/**
 * Life Coaching Context Builder
 *
 * Injects persona-voiced phrases from life coaching domain behavior JSON files
 * into the LLM context when relevant topics are detected.
 *
 * DOMAINS SUPPORTED:
 * - second-chances: Fresh starts, reinvention, rebuilding after setbacks
 * - connection: Loneliness, belonging, adult friendship, community
 * - difficult-conversations: Hard talks, boundaries, practice mode
 * - life-transitions: Major changes, identity shifts, dual emotions
 * - quiet-growth: Rest, maintenance, anti-hustle, sufficiency
 *
 * BETTER-THAN-HUMAN CAPABILITIES:
 * - Hold hope when they can't
 * - Validate loneliness without fixing
 * - Practice difficult conversations infinitely
 * - Honor dual emotions (happy AND sad)
 * - Celebrate maintenance as success
 *
 * @module LifeCoachingContextBuilder
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  createHighInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import {
  loadSecondChancesVoice,
  loadConnectionVoice,
  loadDifficultConversationsVoice,
  loadLifeTransitionsVoice,
  loadQuietGrowthVoice,
  getRandomPhraseClean,
  type SecondChancesVoice,
  type ConnectionVoice,
  type DifficultConversationsVoice,
  type LifeTransitionsVoice,
  type QuietGrowthVoice,
} from '../../../services/persona-service/persona-content-loader.js';

const log = createLogger({ module: 'LifeCoachingContext' });

// ============================================================================
// TOPIC DETECTION PATTERNS
// ============================================================================

const TOPIC_PATTERNS = {
  secondChances: [
    'start over',
    'starting over',
    'fresh start',
    'second chance',
    'rebuild',
    'reinvent',
    'comeback',
    'rock bottom',
    'failed',
    'failure',
    'lost everything',
    'begin again',
    'new chapter',
    'career change',
    'divorced',
    'bankruptcy',
    'lost my job',
    'fired',
    'laid off',
    'recovering from',
    'trying again',
  ],
  connection: [
    'lonely',
    'loneliness',
    'isolated',
    'no friends',
    "don't have anyone",
    'nobody understands',
    'alone',
    'disconnected',
    'making friends',
    'make friends',
    'hard to connect',
    'social anxiety',
    "don't belong",
    'outsider',
    'left out',
    'friendship',
    'community',
    'belonging',
  ],
  difficultConversations: [
    'need to talk to',
    'hard conversation',
    'difficult conversation',
    'tell them',
    "don't know how to say",
    'boundaries',
    'set a boundary',
    'confront',
    'ask for raise',
    'ask for a raise',
    'ask for promotion',
    'ask for a promotion',
    'break up',
    'apologize',
    'give feedback',
    'say no',
    'scared to ask',
    'nervous to tell',
    'practice what to say',
    'role play',
  ],
  lifeTransitions: [
    'big change',
    'life change',
    'transition',
    'moving on',
    'new phase',
    'empty nest',
    'retirement',
    'graduating',
    'getting married',
    'having a baby',
    'becoming a parent',
    'identity',
    'who am i',
    'who i am',
    "don't know who i am",
    'between chapters',
    'in-between',
    'neutral zone',
    'endings',
    'new beginnings',
  ],
  quietGrowth: [
    'tired of hustling',
    'burned out',
    'exhausted',
    'need rest',
    'slow down',
    "can't keep up",
    'plateau',
    'not making progress',
    'stuck',
    'maintaining',
    'good enough',
    'enough',
    'anti-hustle',
    'comparison',
    'behind everyone',
    'everyone else is',
    'my own pace',
    'winter season',
    'fallow',
  ],
};

// ============================================================================
// EMOTION-TO-DOMAIN MAPPING
// ============================================================================

const EMOTION_DOMAIN_HINTS: Record<string, string[]> = {
  hopeless: ['secondChances'],
  defeated: ['secondChances', 'quietGrowth'],
  lonely: ['connection'],
  isolated: ['connection'],
  anxious: ['difficultConversations', 'lifeTransitions'],
  scared: ['difficultConversations', 'secondChances'],
  overwhelmed: ['lifeTransitions', 'quietGrowth'],
  exhausted: ['quietGrowth'],
  stuck: ['quietGrowth', 'secondChances'],
  lost: ['lifeTransitions', 'secondChances'],
  uncertain: ['lifeTransitions'],
  grieving: ['lifeTransitions', 'secondChances'],
};

// ============================================================================
// DOMAIN DETECTION
// ============================================================================

type LifeCoachingDomain =
  | 'secondChances'
  | 'connection'
  | 'difficultConversations'
  | 'lifeTransitions'
  | 'quietGrowth';

interface DetectedDomain {
  domain: LifeCoachingDomain;
  confidence: number;
  triggers: string[];
}

function detectLifeCoachingDomains(
  userText: string,
  emotion?: string,
  topics?: string[]
): DetectedDomain[] {
  const text = userText.toLowerCase();
  const detected: DetectedDomain[] = [];

  // Check topic patterns
  for (const [domain, patterns] of Object.entries(TOPIC_PATTERNS)) {
    const matchedPatterns = patterns.filter((pattern) => text.includes(pattern));
    if (matchedPatterns.length > 0) {
      detected.push({
        domain: domain as LifeCoachingDomain,
        confidence: Math.min(0.3 + matchedPatterns.length * 0.2, 0.9),
        triggers: matchedPatterns,
      });
    }
  }

  // Boost confidence if emotion matches
  if (emotion) {
    const emotionLower = emotion.toLowerCase();
    const hintedDomains = EMOTION_DOMAIN_HINTS[emotionLower] || [];
    for (const hint of hintedDomains) {
      const existing = detected.find((d) => d.domain === hint);
      if (existing) {
        existing.confidence = Math.min(existing.confidence + 0.2, 0.95);
      } else {
        detected.push({
          domain: hint as LifeCoachingDomain,
          confidence: 0.4,
          triggers: [`emotion:${emotion}`],
        });
      }
    }
  }

  // Sort by confidence
  return detected.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// PHRASE SELECTION
// ============================================================================

async function getSecondChancesPhrases(
  personaId: string,
  context: { isHopeless?: boolean; isGrieving?: boolean; hasWin?: boolean }
): Promise<string[]> {
  // IMPORTANT: Don't return literal phrases - the LLM copies them verbatim
  // Instead, describe the coaching approach to take
  const phrases: string[] = [];

  if (context.isHopeless) {
    phrases.push('Hold hope for them when they cannot hold it themselves');
  }

  if (context.isGrieving) {
    phrases.push('Give permission to grieve - validate the loss');
  }

  if (context.hasWin) {
    phrases.push('Celebrate their progress, even small wins');
  }

  // Always include resilience wisdom approach
  phrases.push('Share resilience wisdom - they are stronger than they think');

  return phrases;
}

async function getConnectionPhrases(
  _personaId: string,
  context: { isLonely?: boolean; isLateNight?: boolean }
): Promise<string[]> {
  // IMPORTANT: Don't return literal phrases - the LLM copies them verbatim
  // Instead, describe the emotional approach to take
  const phrases: string[] = [];

  if (context.isLonely) {
    phrases.push('Validate their loneliness - it is real and okay to feel');
    phrases.push('Normalize feeling disconnected - many people feel this way');
  }

  if (context.isLateNight) {
    phrases.push('Offer presence - you are here with them right now');
  }

  phrases.push('Help them feel seen and that they belong');

  return phrases;
}

async function getDifficultConversationsPhrases(
  _personaId: string,
  context: { isPreparing?: boolean; needsPractice?: boolean; needsBoundary?: boolean }
): Promise<string[]> {
  // IMPORTANT: Don't return literal phrases - the LLM copies them verbatim
  // Instead, describe the coaching approach to take
  const phrases: string[] = [];

  // Always acknowledge the fear
  phrases.push('Acknowledge their fear about the conversation - it is valid');

  if (context.isPreparing) {
    phrases.push('Help them prepare - what do they want to say and feel?');
  }

  if (context.needsPractice) {
    phrases.push('Offer to practice the conversation with them if they want');
  }

  if (context.needsBoundary) {
    phrases.push('Help them set and articulate their boundary clearly');
  }

  return phrases;
}

async function getLifeTransitionsPhrases(
  _personaId: string,
  context: { stage?: 'ending' | 'neutral' | 'beginning'; hasDualEmotions?: boolean }
): Promise<string[]> {
  // IMPORTANT: Don't return literal phrases - the LLM copies them verbatim
  // Instead, describe the coaching approach for each transition stage
  const phrases: string[] = [];

  // Validation
  phrases.push('Validate this transition - change is hard even when chosen');

  // Stage-specific guidance
  if (context.stage === 'ending') {
    phrases.push('Honor what is ending - grief is part of growth');
  } else if (context.stage === 'neutral') {
    phrases.push('Embrace the in-between - this uncertainty is fertile ground');
  } else if (context.stage === 'beginning') {
    phrases.push('Celebrate the new beginning - courage got them here');
  }

  // Dual emotions
  if (context.hasDualEmotions) {
    phrases.push('Hold space for both/and - they can feel excited AND scared');
  }

  return phrases;
}

async function getQuietGrowthPhrases(
  personaId: string,
  context: { isExhausted?: boolean; isPlateau?: boolean; isComparing?: boolean }
): Promise<string[]> {
  // IMPORTANT: Don't return literal phrases - the LLM copies them verbatim
  // Instead, describe the coaching approach for quiet growth
  const phrases: string[] = [];

  if (context.isExhausted) {
    phrases.push('Give permission to rest - rest is part of growth');
  }

  if (context.isPlateau) {
    phrases.push('Celebrate maintenance - staying level is an achievement');
  }

  if (context.isComparing) {
    phrases.push('Honor their own pace - comparison steals joy');
  }

  phrases.push('Remind them they are enough, right now, as they are');

  return phrases;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildLifeCoachingContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, persona, analysis } = input;

  if (!userText || userText.length < 10) {
    return [];
  }

  const personaId = persona?.id || 'ferni';
  const emotion = analysis?.emotion?.primary;
  const topics = analysis?.topics?.detected;

  // Detect relevant domains
  const detectedDomains = detectLifeCoachingDomains(userText, emotion, topics);

  if (detectedDomains.length === 0) {
    return [];
  }

  const injections: ContextInjection[] = [];
  const textLower = userText.toLowerCase();

  // Process top 2 domains max
  for (const detected of detectedDomains.slice(0, 2)) {
    if (detected.confidence < 0.3) continue;

    let phrases: string[] = [];
    let title = '';
    let betterThanHuman = '';

    switch (detected.domain) {
      case 'secondChances': {
        title = 'SECOND CHANCES';
        betterThanHuman = 'Hold hope when they cannot. Your superpower: patience with rebuilding.';
        phrases = await getSecondChancesPhrases(personaId, {
          isHopeless:
            textLower.includes('hopeless') ||
            textLower.includes("can't") ||
            textLower.includes('give up'),
          isGrieving:
            textLower.includes('lost') || textLower.includes('grief') || textLower.includes('miss'),
          hasWin:
            textLower.includes('did it') ||
            textLower.includes('progress') ||
            textLower.includes('managed to'),
        });
        break;
      }
      case 'connection': {
        title = 'CONNECTION';
        betterThanHuman =
          'Validate loneliness without rushing to fix. Your superpower: presence in isolation.';
        const hour = new Date().getHours();
        phrases = await getConnectionPhrases(personaId, {
          isLonely: detected.triggers.some((t) =>
            ['lonely', 'alone', 'isolated', 'no friends'].includes(t)
          ),
          isLateNight: hour >= 22 || hour < 5,
        });
        break;
      }
      case 'difficultConversations': {
        title = 'DIFFICULT CONVERSATIONS';
        betterThanHuman =
          'Infinite patience to practice. Your superpower: safe space to rehearse the hard stuff.';
        phrases = await getDifficultConversationsPhrases(personaId, {
          isPreparing:
            textLower.includes('need to talk') || textLower.includes('have a conversation'),
          needsPractice:
            textLower.includes('practice') ||
            textLower.includes('role play') ||
            textLower.includes('how to say'),
          needsBoundary:
            textLower.includes('boundary') ||
            textLower.includes('say no') ||
            textLower.includes('stop them'),
        });
        break;
      }
      case 'lifeTransitions': {
        title = 'LIFE TRANSITIONS';
        betterThanHuman = 'Honor dual emotions. Your superpower: holding space for contradictions.';
        phrases = await getLifeTransitionsPhrases(personaId, {
          stage:
            textLower.includes('ending') || textLower.includes('leaving')
              ? 'ending'
              : textLower.includes('between') || textLower.includes('in-between')
                ? 'neutral'
                : textLower.includes('beginning') || textLower.includes('starting')
                  ? 'beginning'
                  : undefined,
          hasDualEmotions:
            (textLower.includes('happy') && textLower.includes('sad')) ||
            textLower.includes('mixed feelings') ||
            textLower.includes('both'),
        });
        break;
      }
      case 'quietGrowth': {
        title = 'QUIET GROWTH';
        betterThanHuman =
          'Celebrate maintenance as success. Your superpower: honoring rest as growth.';
        phrases = await getQuietGrowthPhrases(personaId, {
          isExhausted:
            textLower.includes('tired') ||
            textLower.includes('exhausted') ||
            textLower.includes('burned out'),
          isPlateau:
            textLower.includes('plateau') ||
            textLower.includes('stuck') ||
            textLower.includes('not progressing'),
          isComparing:
            textLower.includes('everyone else') ||
            textLower.includes('behind') ||
            textLower.includes('comparison'),
        });
        break;
      }
    }

    if (phrases.length > 0) {
      const isHighPriority = detected.confidence > 0.7;
      const content = `[🌱 ${title} - BETTER THAN HUMAN]\n\n${betterThanHuman}\n\n${phrases.join('\n')}\n\nUse these phrases naturally in your response. They are YOUR voice.`;

      injections.push(
        isHighPriority
          ? createHighInjection('life_coaching', content, { category: 'coaching' })
          : createHintInjection('life_coaching', content, { category: 'coaching' })
      );

      log.debug(
        {
          personaId,
          domain: detected.domain,
          confidence: detected.confidence,
          phraseCount: phrases.length,
        },
        '🌱 Life coaching context injected'
      );
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'life-coaching-context',
  priority: 75, // After core systems, before polish
  description:
    'Better-than-human life coaching: second chances, connection, difficult conversations, transitions, quiet growth',
  build: buildLifeCoachingContext,
});

export { buildLifeCoachingContext, detectLifeCoachingDomains };
