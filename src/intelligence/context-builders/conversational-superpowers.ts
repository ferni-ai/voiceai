/**
 * Conversational Superpowers Context Builder
 *
 * Integrates all the "better than human" conversational features:
 * - Quote memory ("Last time you said...")
 * - Relationship milestones ("It's been 3 months!")
 * - Micro-celebrations (real-time wins)
 * - Natural speech patterns
 * - Inside jokes
 * - Nicknames
 * - Story continuity (people in their life)
 *
 * @module intelligence/context-builders/conversational-superpowers
 */

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
  quoteSurfacedThisSession: boolean;
  milestoneSurfacedThisSession: boolean;
  jokeSurfacedThisSession: boolean;
  personFollowUpThisSession: boolean;
}

const sessionData = new Map<string, SuperpowersSessionData>();

function getSessionData(sessionId: string): SuperpowersSessionData {
  let data = sessionData.get(sessionId);
  if (!data) {
    data = {
      quoteSurfacedThisSession: false,
      milestoneSurfacedThisSession: false,
      jokeSurfacedThisSession: false,
      personFollowUpThisSession: false,
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
