/**
 * Conversational Superpowers Context Builder
 *
 * Integrates all the "better than human" conversational features:
 *
 * Phase 1 (Original):
 * - Quote memory ("Last time you said...")
 * - Relationship milestones ("It's been 3 months!")
 * - Micro-celebrations (real-time wins)
 * - Natural speech patterns
 * - Inside jokes
 * - Nicknames
 * - Story continuity (people in their life)
 *
 * Phase 2 (Enhanced):
 * - Vulnerability matching (reciprocal depth)
 * - Empathetic reflections (structured empathy)
 * - Presence mode ("just be here")
 * - Shared language ("our words")
 * - Conversational rituals ("our thing")
 * - Emotional forecasting ("tomorrow might be tough")
 * - Gentle challenges ("I love you, and...")
 * - Meta-moments ("this is nice")
 *
 * @module intelligence/context-builders/conversational-superpowers
 */

// Phase 1 imports
import {
  captureJoke,
  findRelevantJoke,
  formatJokeForPrompt,
} from '../../conversation/superhuman/inside-jokes.js';
import {
  detectMicroWin,
  formatMicroWinForPrompt,
} from '../../conversation/superhuman/micro-celebrations.js';
import { formatNaturalSpeechGuidance } from '../../conversation/superhuman/natural-speech.js';
import {
  extractNameFromMessage,
  formatNamingGuidance,
  setUserName,
  updateEndearmentLevel,
} from '../../conversation/superhuman/nicknames.js';
import {
  captureQuote,
  findRelevantQuote,
  formatQuoteForPrompt,
  markQuoteSurfaced,
} from '../../conversation/superhuman/quote-memory.js';
import {
  acknowledgeMilestone,
  checkMilestones,
  formatMilestoneForPrompt,
  recordConversation,
  recordLaugh,
} from '../../conversation/superhuman/relationship-milestones.js';
import {
  extractPerson,
  findPeopleToAskAbout,
  formatFollowUpForPrompt,
  getOrCreatePerson,
} from '../../conversation/superhuman/story-continuity.js';

// Phase 2 imports
import { formatVulnerabilityGuidance } from '../../conversation/superhuman/vulnerability-matching.js';
import { formatReflectionGuidance } from '../../conversation/superhuman/empathetic-reflections.js';
import {
  formatPresenceGuidance,
  shouldAvoidAdvice,
} from '../../conversation/superhuman/presence-mode.js';
import {
  extractSharedLanguage,
  formatSharedLanguageGuidance,
} from '../../conversation/superhuman/shared-language.js';
import { formatRitualGuidance } from '../../conversation/superhuman/conversational-rituals.js';
import {
  formatForecastGuidance,
  shouldMentionForecast,
} from '../../conversation/superhuman/emotional-forecasting.js';
import { formatChallengeGuidance } from '../../conversation/superhuman/gentle-challenges.js';
import { formatMetaMomentGuidance } from '../../conversation/superhuman/meta-moments.js';

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'ConversationalSuperpowers' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface SuperpowersSessionData {
  // Phase 1
  quoteSurfacedThisSession: boolean;
  milestoneSurfacedThisSession: boolean;
  jokeSurfacedThisSession: boolean;
  personFollowUpThisSession: boolean;
  // Phase 2
  vulnerabilityGuidanceGiven: boolean;
  reflectionGivenThisSession: boolean;
  presenceGuidanceGiven: boolean;
  sharedLanguageSurfaced: boolean;
  ritualSuggestedThisSession: boolean;
  forecastGivenThisSession: boolean;
  challengeGivenThisSession: boolean;
  metaMomentThisSession: boolean;
  // Tracking
  hadDeepSharing: boolean;
  hadLaughter: boolean;
  sessionEmotions: string[];
  sessionStartMood: string | null;
}

const sessionData = new Map<string, SuperpowersSessionData>();

function getSessionData(sessionId: string): SuperpowersSessionData {
  let data = sessionData.get(sessionId);
  if (!data) {
    data = {
      // Phase 1
      quoteSurfacedThisSession: false,
      milestoneSurfacedThisSession: false,
      jokeSurfacedThisSession: false,
      personFollowUpThisSession: false,
      // Phase 2
      vulnerabilityGuidanceGiven: false,
      reflectionGivenThisSession: false,
      presenceGuidanceGiven: false,
      sharedLanguageSurfaced: false,
      ritualSuggestedThisSession: false,
      forecastGivenThisSession: false,
      challengeGivenThisSession: false,
      metaMomentThisSession: false,
      // Tracking
      hadDeepSharing: false,
      hadLaughter: false,
      sessionEmotions: [],
      sessionStartMood: null,
    };
    sessionData.set(sessionId, data);
  }
  return data;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildConversationalSuperpowers(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services, userText, analysis, persona } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userProfile?.id || services?.userId || 'unknown';
  const sessionId = services?.sessionId || 'unknown';
  const turnCount = input.userData?.turnCount || 0;
  const data = getSessionData(sessionId);

  // Get relationship stage
  const relationshipStage = calculateRelationshipStage(
    services?.userProfile?.totalConversations || 0
  );

  // Get current topics and emotion
  const currentTopics = analysis?.topics?.detected || [];
  const currentEmotion = analysis?.emotion?.primary || 'neutral';
  const wasLaughing = analysis?.emotion?.primary === 'joy' || /haha|lol|😂/i.test(userText);

  // ============================================================================
  // 1. CAPTURE DATA FROM USER MESSAGE
  // ============================================================================

  // Capture memorable quotes
  const quote = captureQuote(userId, userText, {
    sessionId,
    topics: currentTopics,
    emotion: currentEmotion,
  });
  if (quote) {
    log.debug({ userId, quoteId: quote.id }, '💬 Quote captured');
  }

  // Capture inside jokes
  if (wasLaughing) {
    const joke = captureJoke(userId, userText, {
      topics: currentTopics,
      wasLaughing: true,
      conversationMood: currentEmotion,
    });
    if (joke) {
      log.debug({ userId, jokeId: joke.id }, '😄 Joke captured');
    }
  }

  // Extract user's name if mentioned
  const nameExtraction = extractNameFromMessage(userText);
  if (nameExtraction?.firstName) {
    setUserName(userId, nameExtraction.firstName, nameExtraction.preferredName);
    updateEndearmentLevel(userId, relationshipStage);
  }

  // Track people mentioned
  const personMention = extractPerson(userId, userText);
  if (personMention) {
    const person = getOrCreatePerson(userId, personMention);
    log.debug({ userId, person: person.name }, '👥 Person tracked');
  }

  // Record laughs for milestones
  if (wasLaughing) {
    recordLaugh(userId);
  }

  // ============================================================================
  // 2. SURFACE RELEVANT MEMORIES (once per session each)
  // ============================================================================

  // Quote callback (most impactful - do first)
  if (!data.quoteSurfacedThisSession && turnCount >= 3) {
    const relevantQuote = findRelevantQuote({
      userId,
      currentTopic: currentTopics[0],
      currentEmotion,
      relationshipStage,
      turnCount,
    });

    if (relevantQuote && relevantQuote.relevanceScore > 25) {
      injections.push(
        createHintInjection('conversational_quote_callback', formatQuoteForPrompt(relevantQuote), {
          category: 'superhuman',
        })
      );
      markQuoteSurfaced(userId, relevantQuote.quote.id);
      data.quoteSurfacedThisSession = true;
      log.info({ userId, quoteId: relevantQuote.quote.id }, '💬 Quote callback surfaced');
    }
  }

  // Milestone check (early in conversation)
  if (!data.milestoneSurfacedThisSession && turnCount <= 2) {
    // Record this conversation for stats
    recordConversation(userId, 0, currentTopics);

    const milestones = checkMilestones(userId);
    if (milestones.length > 0) {
      const milestone = milestones[0];
      injections.push(
        createHintInjection('conversational_milestone', formatMilestoneForPrompt(milestone), {
          category: 'superhuman',
        })
      );
      acknowledgeMilestone(userId, milestone.type, milestone.value);
      data.milestoneSurfacedThisSession = true;
      log.info({ userId, milestone: milestone.label }, '🎉 Milestone surfaced');
    }
  }

  // Inside joke (mid-conversation, if mood is light)
  if (
    !data.jokeSurfacedThisSession &&
    turnCount >= 4 &&
    currentEmotion !== 'sad' &&
    currentEmotion !== 'anxious'
  ) {
    const relevantJoke = findRelevantJoke(userId, {
      currentTopics,
      currentMood: currentEmotion,
      turnCount,
    });

    if (relevantJoke) {
      injections.push(
        createHintInjection('conversational_inside_joke', formatJokeForPrompt(relevantJoke), {
          category: 'superhuman',
        })
      );
      data.jokeSurfacedThisSession = true;
      log.info({ userId, jokeId: relevantJoke.joke.id }, '😄 Inside joke surfaced');
    }
  }

  // Person follow-up (if natural opening)
  if (!data.personFollowUpThisSession && turnCount >= 5) {
    const followUp = findPeopleToAskAbout(userId, {
      recentTopics: currentTopics,
      turnCount,
    });

    if (followUp) {
      injections.push(
        createHintInjection('conversational_person_followup', formatFollowUpForPrompt(followUp), {
          category: 'superhuman',
        })
      );
      data.personFollowUpThisSession = true;
      log.info({ userId, person: followUp.person.name }, '👥 Person follow-up surfaced');
    }
  }

  // ============================================================================
  // 3. DETECT AND CELEBRATE MICRO-WINS
  // ============================================================================

  const microWin = detectMicroWin(userText);
  if (microWin) {
    injections.push(
      createHintInjection('conversational_micro_win', formatMicroWinForPrompt(microWin), {
        category: 'superhuman',
      })
    );
    log.info({ userId, winType: microWin.type }, '🎊 Micro-win detected');
  }

  // ============================================================================
  // 4. NATURAL SPEECH GUIDANCE
  // ============================================================================

  // Add natural speech guidance based on persona style
  const personaStyle = getPersonaStyle(persona?.id || 'ferni');
  const speechGuidance = formatNaturalSpeechGuidance(personaStyle);
  injections.push(
    createHintInjection('conversational_natural_speech', speechGuidance, { category: 'persona' })
  );

  // ============================================================================
  // 5. NAMING GUIDANCE
  // ============================================================================

  const namingContext = {
    relationshipStage,
    emotionalMoment: ['sad', 'anxious', 'upset'].includes(currentEmotion),
    celebrationMoment: currentEmotion === 'joy' || !!microWin,
    supportMoment: (analysis?.emotion?.intensity || 0) > 0.7,
  };

  const namingGuidance = formatNamingGuidance(userId, namingContext);
  if (namingGuidance) {
    injections.push(
      createHintInjection('conversational_naming', namingGuidance, { category: 'superhuman' })
    );
  }

  // ============================================================================
  // PHASE 2: ENHANCED SUPERHUMAN FEATURES
  // ============================================================================

  const emotionIntensity = analysis?.emotion?.intensity || 0;
  const isPersonalSharing = emotionIntensity > 0.5 || /\bi feel\b|i've been|i'm worried/i.test(userText);
  const currentHour = new Date().getHours();
  const dayOfWeek = new Date().getDay();

  // Track session state
  if (!data.sessionStartMood) {
    data.sessionStartMood = currentEmotion;
  }
  if (!data.sessionEmotions.includes(currentEmotion)) {
    data.sessionEmotions.push(currentEmotion);
  }
  if (emotionIntensity > 0.7) {
    data.hadDeepSharing = true;
  }
  if (wasLaughing) {
    data.hadLaughter = true;
  }

  // ============================================================================
  // 6. VULNERABILITY MATCHING
  // ============================================================================

  if (!data.vulnerabilityGuidanceGiven && isPersonalSharing) {
    const vulnGuidance = formatVulnerabilityGuidance(userId, userText);
    if (vulnGuidance) {
      injections.push(
        createHintInjection('conversational_vulnerability', vulnGuidance, { category: 'superhuman' })
      );
      data.vulnerabilityGuidanceGiven = true;
      log.debug({ userId }, '🫂 Vulnerability guidance provided');
    }
  }

  // ============================================================================
  // 7. EMPATHETIC REFLECTIONS
  // ============================================================================

  if (!data.reflectionGivenThisSession && isPersonalSharing && turnCount >= 2) {
    const reflectionGuidance = formatReflectionGuidance({
      emotion: currentEmotion,
      topics: currentTopics,
      message: userText,
      isPersonalSharing,
      relationshipStage,
      turnCount,
    });
    if (reflectionGuidance) {
      injections.push(
        createHintInjection('conversational_reflection', reflectionGuidance, { category: 'superhuman' })
      );
      data.reflectionGivenThisSession = true;
      log.debug({ userId }, '🪞 Empathetic reflection guidance provided');
    }
  }

  // ============================================================================
  // 8. PRESENCE MODE (high priority when needed)
  // ============================================================================

  if (!data.presenceGuidanceGiven) {
    const presenceGuidance = formatPresenceGuidance({
      message: userText,
      emotion: currentEmotion,
      emotionIntensity,
      topics: currentTopics,
      hour: currentHour,
      turnCount,
    });
    if (presenceGuidance) {
      injections.push(
        createHintInjection('conversational_presence', presenceGuidance, {
          category: 'superhuman',
        })
      );
      data.presenceGuidanceGiven = true;
      log.info({ userId }, '🕯️ Presence mode activated');
    }
  }

  // ============================================================================
  // 9. SHARED LANGUAGE CAPTURE AND SURFACE
  // ============================================================================

  // Capture new shared terms
  extractSharedLanguage(userId, userText, { topics: currentTopics, emotion: currentEmotion });

  // Surface relevant terms
  if (!data.sharedLanguageSurfaced && turnCount >= 5) {
    const langGuidance = formatSharedLanguageGuidance(userId, {
      currentTopics,
      currentMessage: userText,
      turnCount,
    });
    if (langGuidance) {
      injections.push(
        createHintInjection('conversational_shared_language', langGuidance, { category: 'superhuman' })
      );
      data.sharedLanguageSurfaced = true;
      log.debug({ userId }, '🗣️ Shared language callback');
    }
  }

  // ============================================================================
  // 10. CONVERSATIONAL RITUALS
  // ============================================================================

  if (!data.ritualSuggestedThisSession) {
    const phase = turnCount <= 2 ? 'greeting' : turnCount >= 15 ? 'closing' : 'middle';
    const ritualGuidance = formatRitualGuidance(userId, {
      phase,
      topics: currentTopics,
      emotion: currentEmotion,
      turnCount,
      hasWin: !!microWin,
      needsComfort: emotionIntensity > 0.7 && ['sad', 'anxious'].includes(currentEmotion),
    });
    if (ritualGuidance) {
      injections.push(
        createHintInjection('conversational_ritual', ritualGuidance, { category: 'superhuman' })
      );
      data.ritualSuggestedThisSession = true;
      log.debug({ userId }, '🎭 Ritual suggestion');
    }
  }

  // ============================================================================
  // 11. EMOTIONAL FORECASTING (end of heavy conversations)
  // ============================================================================

  if (!data.forecastGivenThisSession && turnCount >= 8 && data.hadDeepSharing) {
    const forecastContext = {
      currentEmotion,
      emotionIntensity,
      topics: currentTopics,
      hadHeavySharing: data.hadDeepSharing,
      madeDecision: /i decided|i'm going to|i chose/i.test(userText),
      dayOfWeek,
      hour: currentHour,
    };

    if (shouldMentionForecast(forecastContext)) {
      const forecastGuidance = formatForecastGuidance(forecastContext);
      if (forecastGuidance) {
        injections.push(
          createHintInjection('conversational_forecast', forecastGuidance, { category: 'superhuman' })
        );
        data.forecastGivenThisSession = true;
        log.debug({ userId }, '🔮 Emotional forecast provided');
      }
    }
  }

  // ============================================================================
  // 12. GENTLE CHALLENGES (when appropriate)
  // ============================================================================

  // Only challenge if not in presence mode
  const inPresenceMode = shouldAvoidAdvice({
    message: userText,
    emotion: currentEmotion,
    emotionIntensity,
    topics: currentTopics,
    hour: currentHour,
    turnCount,
  });

  if (!data.challengeGivenThisSession && !inPresenceMode && turnCount >= 5) {
    const challengeGuidance = formatChallengeGuidance({
      message: userText,
      topics: currentTopics,
      emotion: currentEmotion,
      relationshipStage,
      turnCount,
    });
    if (challengeGuidance) {
      injections.push(
        createHintInjection('conversational_challenge', challengeGuidance, { category: 'superhuman' })
      );
      data.challengeGivenThisSession = true;
      log.debug({ userId }, '🪞 Gentle challenge opportunity');
    }
  }

  // ============================================================================
  // 13. META-MOMENTS
  // ============================================================================

  if (!data.metaMomentThisSession && turnCount >= 7) {
    const moodShift =
      data.sessionStartMood && data.sessionStartMood !== currentEmotion
        ? ['sad', 'anxious', 'frustrated'].includes(data.sessionStartMood) &&
          !['sad', 'anxious', 'frustrated'].includes(currentEmotion)
          ? 'improved'
          : ['sad', 'anxious', 'frustrated'].includes(currentEmotion)
            ? 'declined'
            : 'stable'
        : 'stable';

    const metaGuidance = formatMetaMomentGuidance(sessionId, {
      sessionTopics: currentTopics,
      sessionEmotions: data.sessionEmotions,
      moodShift,
      hadLaughter: data.hadLaughter,
      hadDeepSharing: data.hadDeepSharing,
      relationshipStage,
      turnCount,
      sessionMinutes: turnCount * 2, // Rough estimate
      totalConversations: services?.userProfile?.totalConversations || 0,
    });
    if (metaGuidance) {
      injections.push(
        createHintInjection('conversational_meta_moment', metaGuidance, { category: 'superhuman' })
      );
      data.metaMomentThisSession = true;
      log.debug({ userId, sessionId }, '💭 Meta-moment opportunity');
    }
  }

  return injections;
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateRelationshipStage(
  conversationCount: number
): 'stranger' | 'acquaintance' | 'friend' | 'trusted' {
  if (conversationCount < 3) return 'stranger';
  if (conversationCount < 10) return 'acquaintance';
  if (conversationCount < 30) return 'friend';
  return 'trusted';
}

function getPersonaStyle(personaId: string): 'warm' | 'thoughtful' | 'energetic' | 'calm' {
  const styleMap: Record<string, 'warm' | 'thoughtful' | 'energetic' | 'calm'> = {
    ferni: 'warm',
    'peter-john': 'thoughtful',
    'alex-chen': 'energetic',
    'maya-santos': 'calm',
    'jordan-taylor': 'energetic',
    'nayan-patel': 'thoughtful',
  };
  return styleMap[personaId] || 'warm';
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'conversational_superpowers',
  description:
    'Superhuman conversational features: quotes, milestones, micro-wins, jokes, names, people',
  priority: 72, // After human_personality (75), before general engagement
  build: buildConversationalSuperpowers,
  category: BuilderCategory.PERSONA,
});

export { buildConversationalSuperpowers };
