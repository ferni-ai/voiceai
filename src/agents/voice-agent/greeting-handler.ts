/**
 * Voice Agent Greeting Handler
 *
 * Handles session greeting generation including:
 * - First taste trial welcomes
 * - Persona memory enhanced greetings
 * - Bundle runtime greetings (time-aware, relationship-stage aware)
 * - Standard greetings with proactive context (threads, insights, emotional check-ins)
 * - Cross-session music callbacks
 * - DJ integration (open the show)
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/greeting-handler
 */

import { log, type voice } from '@livekit/agents';
import { isMusicEnabled } from '../../config/environment.js';
import {
  getPersonaMemories,
  normalizePersonaId,
} from '../../intelligence/context-builders/personas/persona-memory.js';
import type { BundleRuntimeEngine } from '../../personas/bundles/index.js';
import { generateGreeting, type PersonaMemoryForGreeting } from '../../personas/greetings.js';
import { convertFromUserProfileEvents } from '../../personas/shared/life-events.js';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import { getTrialWelcomePrompt } from '../../services/monetization/first-taste-trial.js';
import {
  applyHumanizingStateToProfile,
  getHumanizingState,
  recordGreetingUsage,
} from '../../services/session-manager/humanizing-state.js';
import type { SessionServices } from '../../services/index.js';
import type { SpeechContext } from '../../speech/types/index.js';
import { getDJController } from '../../audio/dj-controller.js';
import type { UserData } from '../shared/types.js';
import { weaveProactiveIntoGreeting } from '../shared/utilities-integration.js';
// NOTE: conversation-priming is imported dynamically in generateAndSpeakGreeting
import { logPrimingApplied } from '../shared/function-call-telemetry.js';
// Speech coordination for centralized speech management
import { routeSpeech, SpeechPriority } from '../../speech/coordination/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GreetingContext {
  /** The persona for this session */
  sessionPersona: PersonaConfig;
  /** Session services instance */
  services: SessionServices;
  /** User data for the session */
  userData: UserData;
  /** Session ID */
  sessionId: string;
  /** User ID (may be undefined for anonymous) */
  userId: string | undefined;
  /** User name if known */
  userName: string | undefined;
  /** Whether this is a returning user */
  isReturningUser: boolean;
  /** Optional bundle runtime for enhanced greetings */
  bundleRuntime?: BundleRuntimeEngine;
  /** Optional utilities proactive opener */
  utilitiesProactiveOpener?: string;
  /** Voice session to speak the greeting */
  session: voice.AgentSession<UserData>;
  /** Function to tag greeting with SSML */
  tagGreeting: (text: string, context: SpeechContext, personaId?: string) => string;
  /** Claimed demo conversation (if user came from landing page demo) */
  claimedDemoConversation?: ClaimedDemoConversation;
}

/**
 * Data from a claimed demo session.
 * "Better than human" - We remember our first conversation.
 */
export interface ClaimedDemoConversation {
  highlights: string[];
  topics: string[];
  userMood: string | null;
  ferniNotes: string;
  messageCount: number;
}

export interface GreetingResult {
  /** The generated greeting text */
  greeting: string;
  /** Whether the greeting referenced last conversation */
  hasReferencedLastConversation: boolean;
  /** Persona memories used in greeting */
  personaMemories?: PersonaMemoryForGreeting[];
}

// ============================================================================
// MAIN GREETING GENERATION
// ============================================================================

/**
 * Generate and speak the session greeting
 *
 * This is the main entry point for greeting generation. It handles:
 * 1. Trial welcome for first-time trial users
 * 2. Persona memory loading for returning users
 * 3. Bundle runtime greetings (if available)
 * 4. Standard greetings with proactive context
 * 5. Utilities proactive opener weaving
 * 6. Cross-session music callbacks
 * 7. DJ integration (open the show)
 * 8. Greeting enhancement and SSML tagging
 * 9. Greeting usage tracking
 */
export async function generateAndSpeakGreeting(ctx: GreetingContext): Promise<GreetingResult> {
  const {
    sessionPersona,
    services,
    userData,
    sessionId,
    userId,
    userName,
    isReturningUser,
    bundleRuntime,
    utilitiesProactiveOpener,
    session,
    tagGreeting,
  } = ctx;

  diag.session('Step 8: Generating greeting');
  const greetingStart = Date.now();

  let greeting: string | undefined;
  let hasReferencedLastConversation = false;
  let usedWarmGreeting = false;

  // ===============================================
  // INSTANT GREETING: Use prewarmed greeting for immediate response
  // If greeting generation takes >150ms, use warm greeting first
  // ===============================================
  let warmGreeting: string | null = null;
  try {
    const { getWarmGreeting, clearWarmGreeting } = await import('../shared/warm-greeting.js');
    warmGreeting = getWarmGreeting(sessionPersona.id);
    // Clear it so we don't reuse on next session
    clearWarmGreeting();
  } catch {
    // Non-fatal - warm greeting is optional
  }

  // ===============================================
  // FIRST TASTE TRIAL: Use special welcome for first-time trial users
  // ===============================================
  if (userData.isFirstConversation && userData.isTrialUser) {
    greeting = getTrialWelcomePrompt();
    diag.session('Using trial welcome prompt for first-time user', {
      userId,
      greeting: `${greeting.slice(0, 50)}...`,
    });
  }

  // ===============================================
  // CLAIMED DEMO: "Better than human" - Remember our first conversation
  // If user came from landing page demo and claimed their conversation,
  // give them a warm "I remember you!" greeting
  // ===============================================
  if (!greeting && ctx.claimedDemoConversation) {
    const demoGreeting = generateClaimedDemoGreeting(
      ctx.claimedDemoConversation,
      userName,
      sessionPersona.id
    );
    if (demoGreeting) {
      greeting = demoGreeting;
      hasReferencedLastConversation = true;
      diag.session('Using claimed demo greeting (I remember you!)', {
        userId,
        highlights: ctx.claimedDemoConversation.highlights.length,
        topics: ctx.claimedDemoConversation.topics.length,
      });
    }
  }

  // Load persona-specific memories for memory-enhanced greetings (skip for trial welcome)
  let personaMemories: PersonaMemoryForGreeting[] = [];
  if (!greeting && isReturningUser && services.userProfile?.id && sessionPersona?.id) {
    personaMemories = await loadPersonaMemories(services, sessionPersona, userData);
  }

  // If greeting generation is taking too long and we have a warm greeting, use it
  const elapsedSoFar = Date.now() - greetingStart;
  if (!greeting && warmGreeting && elapsedSoFar > 100) {
    diag.session('Using warm greeting (personalized taking too long)', {
      elapsedMs: elapsedSoFar,
      warmGreeting: warmGreeting.slice(0, 30),
    });
    greeting = warmGreeting;
    usedWarmGreeting = true;
  }

  // ===============================================
  // HOLISTIC PERSONALITY: Use greetings.json directly
  // greetings.json has well-crafted, grounded Pixar-style greetings.
  // ===============================================
  if (!greeting && bundleRuntime) {
    // Bundle runtime standard greeting (uses greetings.json)
    const result = await generateBundleGreeting(
      bundleRuntime,
      services,
      userData,
      isReturningUser,
      sessionPersona,
      personaMemories
    );
    greeting = result.greeting;
    hasReferencedLastConversation = result.hasReferencedLastConversation;
  } else if (!greeting) {
    // Standard greeting without bundle - include persona memories and proactive context
    const result = await generateStandardGreeting(
      services,
      userData,
      isReturningUser,
      sessionPersona,
      personaMemories
    );
    greeting = result.greeting;
    hasReferencedLastConversation = result.hasReferencedLastConversation;
  }

  // Ensure greeting is defined (use CONTEXT-AWARE greeting as fallback)
  // NOTE: Never use "How can I help you today?" - that's customer service, not Ferni
  // "Better than Human" - even fallback greetings should be context-aware
  if (!greeting) {
    if (warmGreeting) {
      greeting = warmGreeting;
    } else {
      // Generate context-aware greeting (Better than Human)
      try {
        const warmGreetingModule = await import('../shared/warm-greeting.js');
        const { generateWarmGreeting } = warmGreetingModule;
        type GreetingContext = Parameters<
          typeof warmGreetingModule.generateContextAwareGreeting
        >[1];

        // Build context from what we know
        const greetingCtx: GreetingContext = {
          hour: new Date().getHours(),
          isReturningUser,
          userName,
          relationshipStage:
            userData.relationshipStage || (isReturningUser ? 'friend' : 'stranger'),
          lastEmotion: userData.lastEmotionAnalysis?.primary,
          lastEmotionIntensity: userData.lastEmotionAnalysis?.intensity,
        };

        greeting = generateWarmGreeting(sessionPersona.id, greetingCtx);
        diag.session('Generated context-aware fallback greeting', {
          hour: greetingCtx.hour,
          stage: greetingCtx.relationshipStage,
        });
      } catch {
        // Final fallback - static greeting
        greeting = `Hey! What's going on?`;
        diag.warn('Using static fallback greeting - context-aware generation failed');
      }
    }
  }

  diag.session('Greeting generated', {
    elapsedMs: Date.now() - greetingStart,
    usedWarmGreeting,
    greetingLength: greeting.length,
  });

  // Update userData with reference tracking
  userData.hasReferencedLastConversation = hasReferencedLastConversation;

  // ===============================================
  // STEP 8b: WEAVE IN UTILITIES PROACTIVE OPENER
  // ===============================================
  if (utilitiesProactiveOpener) {
    greeting = weaveProactiveIntoGreeting(greeting, utilitiesProactiveOpener, 0.3);
    diag.session('Wove in utilities proactive opener', {
      opener: utilitiesProactiveOpener.slice(0, 50),
    });
  }

  // ===============================================
  // STEP 8c: CROSS-SESSION MUSIC MEMORY CALLBACK
  // ===============================================
  greeting = await appendMusicCallback(greeting, isReturningUser, services, sessionPersona);

  diag.tts('Generated greeting', {
    greeting: greeting.substring(0, 100) + (greeting.length > 100 ? '...' : ''),
    length: greeting.length,
  });

  // ===============================================
  // DJ INTEGRATION: "Open the Show" moment
  // ===============================================
  greeting = await applyDJIntro(
    greeting,
    sessionPersona,
    userId,
    userData,
    services,
    isReturningUser
  );

  // ===============================================
  // HOLISTIC PERSONALITY: Don't over-enhance greetings
  // greetings.json already has SSML - don't layer more on top
  // ===============================================
  let enhancedGreeting = greeting;

  // Check if greeting already has SSML (from greetings.json)
  const hasExistingSsml =
    greeting.includes('<break') || greeting.includes('<emotion') || greeting.includes('<volume');

  if (!hasExistingSsml) {
    // Only tag if greeting doesn't have SSML yet
    const speechContext = services.getSpeechContext(greeting);
    enhancedGreeting = tagGreeting(greeting, speechContext);
  } else {
    diag.tts('Greeting already has SSML - skipping enhancement to prevent over-dramatic output');
  }

  // NOTE: Removed automatic speed modifier - it was making Ferni sound unnatural
  // Ferni's natural voice is his best voice. Only use speed for specific effect.

  diag.tts('Enhanced greeting', {
    enhanced: enhancedGreeting.substring(0, 100) + (enhancedGreeting.length > 100 ? '...' : ''),
  });

  // Speak the greeting via coordinated speech system
  // FIX: Disable interruptions for initial greeting to prevent iOS background noise from cutting off
  // The greeting is the first thing users hear - must be reliable across all devices
  try {
    const speakResult = await routeSpeech(sessionId, enhancedGreeting, {
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
      allowInterruptions: false, // CRITICAL: Greeting must complete on mobile/iOS
    });
    if (speakResult.accepted) {
      diag.tts('Greeting spoken via coordinator');
    } else {
      diag.warn('Greeting not accepted by coordinator', { reason: speakResult.reason });
      // Fallback to direct speech if coordinator rejects
      session.say(enhancedGreeting);
      diag.tts('Greeting spoken (fallback)');
    }

    // Track greeting usage to prevent repetition across sessions
    trackGreetingUsage(services, greeting);
  } catch (e) {
    diag.error('Greeting failed', { error: String(e) });
  }

  // Add to conversation history (internal tracking + on-behalf call capture)
  try {
    const { recordAgentTurn } = await import('./agent-turn-recorder.js');
    await recordAgentTurn(sessionId, services, greeting);
  } catch {
    // Fallback to direct recording if recorder fails
    if (services && typeof services.addTurn === 'function') {
      services.addTurn('assistant', greeting);
    }
  }

  // =========================================================================
  // PRIMING DISABLED - chatCtx.addMessage causes turns to be spoken aloud
  // TODO: Find alternative approach that doesn't trigger TTS
  // Options to explore:
  // 1. Add priming examples directly into system prompt
  // 2. Use a different LiveKit API that marks turns as "historical"
  // 3. Filter priming content in the TTS sanitizer
  // =========================================================================
  // const personaId = sessionPersona?.id || 'ferni';
  // diag.debug('🎯 PRIMING: Disabled - exploring alternative approaches');

  return {
    greeting,
    hasReferencedLastConversation,
    personaMemories,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a "Better than human" greeting for users who claimed their demo conversation.
 * This is the magic moment - Ferni remembers them from before they formally signed up.
 *
 * Philosophy: "Your best friend forgets. We don't."
 */
function generateClaimedDemoGreeting(
  demoConversation: ClaimedDemoConversation,
  userName: string | undefined,
  personaId: string
): string | null {
  // Only generate if we have meaningful content to reference
  if (
    demoConversation.highlights.length === 0 &&
    demoConversation.topics.length === 0 &&
    !demoConversation.ferniNotes
  ) {
    return null;
  }

  const name = userName ? `, ${userName}` : '';

  // Build greeting based on what we remember
  const greetings: string[] = [];

  // If we have specific highlights, reference them
  // NOTE: Use "affectionate" for warmth, not "happy" (sounds forced/cheerleader)
  if (demoConversation.highlights.length > 0) {
    const highlight = demoConversation.highlights[0];
    greetings.push(
      `<break time="200ms"/><emotion value="surprised"/>Oh.<break time="300ms"/>Hey${name}.<break time="350ms"/>` +
        `I remember you.<break time="200ms"/>` +
        `You mentioned ${highlight}.<break time="250ms"/>` +
        `I've been thinking about that.`
    );
    greetings.push(
      `<emotion value="surprised"/>Wait—<break time="250ms"/>I know you.<break time="300ms"/>` +
        `We talked about ${highlight} earlier.<break time="200ms"/>` +
        `<emotion value="affectionate"/>So glad you're back.`
    );
  }

  // If we have topics but no specific highlights
  if (greetings.length === 0 && demoConversation.topics.length > 0) {
    const topic = demoConversation.topics[0];
    greetings.push(
      `<break time="150ms"/><emotion value="affectionate"/>Hey${name}.<break time="350ms"/>` +
        `You're back.<break time="250ms"/>` +
        `I remember we were talking about ${topic}.<break time="200ms"/>` +
        `Want to pick up where we left off?`
    );
    greetings.push(
      `<break time="200ms"/>Oh.<break time="250ms"/>Hey${name}.<break time="300ms"/>` +
        `<emotion value="affectionate"/>I was hoping you'd come back.<break time="250ms"/>` +
        `We started something about ${topic}—<break time="150ms"/>` +
        `want to keep going?`
    );
  }

  // If we have Ferni's notes about the conversation
  if (greetings.length === 0 && demoConversation.ferniNotes) {
    greetings.push(
      `<break time="150ms"/><emotion value="affectionate"/>Hey${name}.<break time="350ms"/>` +
        `I remember our conversation.<break time="250ms"/>` +
        `Really glad you decided to continue.`
    );
  }

  // Generic "I remember you" fallback
  if (greetings.length === 0) {
    greetings.push(
      `<break time="150ms"/><emotion value="affectionate"/>Hey${name}.<break time="350ms"/>` +
        `Wait—<break time="200ms"/>we've talked before, right?<break time="250ms"/>` +
        `I remember you.<break time="200ms"/>Welcome back.`
    );
    greetings.push(
      `<break time="200ms"/>Oh.<break time="250ms"/><emotion value="affectionate"/>Hey${name}.<break time="350ms"/>` +
        `You came back.<break time="200ms"/>` +
        `That makes me really happy.`
    );
  }

  // Pick a random greeting
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  log().info(`Generated claimed demo greeting for ${personaId}`, {
    hasHighlights: demoConversation.highlights.length > 0,
    hasTopics: demoConversation.topics.length > 0,
    hasFerniNotes: !!demoConversation.ferniNotes,
  });

  return greeting;
}

/**
 * Load persona-specific memories for memory-enhanced greetings
 */
async function loadPersonaMemories(
  services: SessionServices,
  sessionPersona: PersonaConfig,
  userData: UserData
): Promise<PersonaMemoryForGreeting[]> {
  try {
    const normalizedId = normalizePersonaId(sessionPersona.id);
    if (!normalizedId || !services.userProfile?.id) {
      return [];
    }

    const memoryResult = await getPersonaMemories(
      services.userProfile.id,
      normalizedId,
      userData.name || services.userProfile.name
    );

    if (!memoryResult || memoryResult.memories.length === 0) {
      return [];
    }

    const memories = memoryResult.memories.map((m) => ({
      type: m.type,
      name: m.name,
      details: m.details,
      sentiment: m.sentiment,
      // Add persona-specific fields if present
      ...('ticker' in m && { ticker: (m as { ticker?: string }).ticker }),
      ...('date' in m && { date: (m as { date?: string }).date }),
      ...('targetAmount' in m && { targetAmount: (m as { targetAmount?: number }).targetAmount }),
      ...('currentAmount' in m && {
        currentAmount: (m as { currentAmount?: number }).currentAmount,
      }),
      ...('reason' in m && { reason: (m as { reason?: string }).reason }),
    }));

    diag.session('Loaded persona memories for greeting', {
      personaId: normalizedId,
      memoryCount: memories.length,
    });

    return memories;
  } catch (e) {
    diag.warn('Failed to load persona memories for greeting', { error: String(e) });
    return [];
  }
}

/**
 * Generate greeting using bundle runtime (time-aware, relationship-stage aware)
 */
async function generateBundleGreeting(
  bundleRuntime: BundleRuntimeEngine,
  services: SessionServices,
  userData: UserData,
  isReturningUser: boolean,
  sessionPersona: PersonaConfig,
  personaMemories: PersonaMemoryForGreeting[]
): Promise<{ greeting: string; hasReferencedLastConversation: boolean }> {
  let greeting: string;
  let hasReferencedLastConversation = false;

  // Get time-of-day aware greeting from bundle
  const timeGreeting = bundleRuntime.getTimeOfDayGreeting();
  const relationshipStage = bundleRuntime.getCurrentRelationshipStage();
  const stagePhrases = relationshipStage?.phrases?.greetings;

  if (stagePhrases && stagePhrases.length > 0) {
    // Use relationship-stage appropriate greeting
    let bundleGreeting = stagePhrases[Math.floor(Math.random() * stagePhrases.length)];

    // Substitute {name} placeholder if we have a name
    if (userData.name) {
      bundleGreeting = bundleGreeting.replace(/\{name\}/g, userData.name);
    } else {
      // Remove name placeholders if no name
      bundleGreeting = bundleGreeting.replace(/\{name\}[,!]?\s*/g, '');
    }

    greeting = bundleGreeting;
    diag.session('Using bundle relationship-stage greeting', {
      stage: bundleRuntime.getRelationshipStageName(),
      hasTimeGreeting: !!timeGreeting,
    });
  } else if (timeGreeting) {
    greeting = timeGreeting;
    diag.session('Using bundle time-of-day greeting');
  } else {
    // Fall back to standard greeting generator with persona memories + bundleRuntime
    const result = await generateGreetingWithContext(
      services,
      userData,
      isReturningUser,
      sessionPersona,
      personaMemories,
      bundleRuntime
    );
    greeting = result.greeting;
    hasReferencedLastConversation = result.hasReferencedLastConversation;
  }

  // Apply time-of-day modifiers to greeting delivery
  // NOTE: Removed soft volume modifier - it made Ferni sound timid/weird
  // Ferni should sound confident and warm, not whisper-quiet at night
  const timeModifiers = bundleRuntime.getTimeOfDayModifiers();
  void timeModifiers; // Keep for potential future use, but don't apply volume

  return { greeting, hasReferencedLastConversation };
}

/**
 * Generate standard greeting without bundle runtime
 */
async function generateStandardGreeting(
  services: SessionServices,
  userData: UserData,
  isReturningUser: boolean,
  sessionPersona: PersonaConfig,
  personaMemories: PersonaMemoryForGreeting[]
): Promise<{ greeting: string; hasReferencedLastConversation: boolean }> {
  // Get proactive context (threads, insights, emotional check-ins)
  const { threadStarter, proactiveInsight, proactiveInsightId, emotionalCheckIn, openQuestions } =
    await getProactiveContext(services, isReturningUser);

  // Generate the greeting
  const greeting = await generateGreeting(sessionPersona, {
    isReturningUser,
    userName: userData.name,
    lastConversationSummary: services.userProfile?.lastConversationSummary,
    personaMemories,
    relationshipStage: services.userProfile?.relationshipStage as
      | 'stranger'
      | 'acquaintance'
      | 'friend'
      | 'trusted_advisor'
      | undefined,
    usedGreetings: services.userProfile?.humanizingState?.usedGreetings,
    lastConversationDate: services.userProfile?.lastContact
      ? new Date(services.userProfile.lastContact)
      : undefined,
    goals: services.userProfile?.goals,
    primaryConcerns: services.userProfile?.primaryConcerns,
    openQuestions,
    lifeEvents: services.userProfile?.lifeEvents
      ? convertFromUserProfileEvents(services.userProfile.lifeEvents)
      : undefined,
    conversationCount: services.userProfile?.totalConversations,
    userId: services.userId,
  });

  // Apply proactive context to greeting
  return applyProactiveContext(
    greeting,
    threadStarter,
    proactiveInsight,
    proactiveInsightId,
    emotionalCheckIn,
    services
  );
}

/**
 * Generate greeting with full context (used by bundle runtime fallback)
 */
async function generateGreetingWithContext(
  services: SessionServices,
  userData: UserData,
  isReturningUser: boolean,
  sessionPersona: PersonaConfig,
  personaMemories: PersonaMemoryForGreeting[],
  bundleRuntime?: BundleRuntimeEngine
): Promise<{ greeting: string; hasReferencedLastConversation: boolean }> {
  // Get open thread conversation starter for proactive greeting
  let threadStarter: string | undefined;
  const openThreads = services.getOpenThreads();
  if (openThreads.length > 0 && isReturningUser) {
    threadStarter = services.getThreadConversationStarter() || undefined;
    if (threadStarter) {
      diag.session('Found cross-session thread to surface', {
        threadCount: openThreads.length,
        starter: threadStarter.slice(0, 50),
      });
    }
  }

  // Get open questions from threads
  const openQuestions = openThreads.flatMap((t) => t.questionsToAnswer || []).slice(0, 3);

  const greeting = await generateGreeting(sessionPersona, {
    isReturningUser,
    userName: userData.name,
    lastConversationSummary: services.userProfile?.lastConversationSummary,
    personaMemories,
    bundleRuntime,
    relationshipStage: services.userProfile?.relationshipStage as
      | 'stranger'
      | 'acquaintance'
      | 'friend'
      | 'trusted_advisor'
      | undefined,
    usedGreetings: services.userProfile?.humanizingState?.usedGreetings,
    lastConversationDate: services.userProfile?.lastContact
      ? new Date(services.userProfile.lastContact)
      : undefined,
    goals: services.userProfile?.goals,
    primaryConcerns: services.userProfile?.primaryConcerns,
    openQuestions,
    lifeEvents: services.userProfile?.lifeEvents
      ? convertFromUserProfileEvents(services.userProfile.lifeEvents)
      : undefined,
    conversationCount: services.userProfile?.totalConversations,
    userId: services.userId,
  });

  // Track if greeting referenced last conversation
  const hasReferencedLastConversation = greeting.toLowerCase().includes('last time');

  // If we have a thread starter and didn't use it in greeting, append it
  if (threadStarter && !hasReferencedLastConversation) {
    return {
      greeting: `${greeting} <break time="400ms"/> ${threadStarter}`,
      hasReferencedLastConversation: true,
    };
  }

  return { greeting, hasReferencedLastConversation };
}

/**
 * Get proactive context (threads, insights, emotional check-ins)
 */
async function getProactiveContext(
  services: SessionServices,
  isReturningUser: boolean
): Promise<{
  threadStarter?: string;
  proactiveInsight?: string;
  proactiveInsightId?: string;
  emotionalCheckIn?: string;
  openQuestions: string[];
}> {
  // Get open thread conversation starter for proactive greeting
  let threadStarter: string | undefined;
  const openThreads = services.getOpenThreads();
  if (openThreads.length > 0 && isReturningUser) {
    threadStarter = services.getThreadConversationStarter() || undefined;
  }

  // Get open questions from threads
  const openQuestions = openThreads.flatMap((t) => t.questionsToAnswer || []).slice(0, 3);

  // Get high-priority proactive insights for check-ins
  let proactiveInsight: string | undefined;
  let proactiveInsightId: string | undefined;
  if (isReturningUser) {
    try {
      const insightResult = await services.getProactiveInsights();
      if (insightResult.highPriorityCount > 0 && insightResult.suggestedConversationStarter) {
        // Only use proactive insight if no thread starter (avoid double-starter)
        if (!threadStarter) {
          proactiveInsight = insightResult.suggestedConversationStarter;
          proactiveInsightId = insightResult.suggestedInsightId;
        }
      }
    } catch (e) {
      log().debug({ error: String(e) }, 'Proactive insights fetch failed (non-blocking)');
    }
  }

  // Get emotional memory check-in suggestions for returning users
  let emotionalCheckIn: string | undefined;
  if (isReturningUser && !threadStarter && !proactiveInsight) {
    try {
      const checkIns = services.emotionalMemory.getCheckInSuggestions();
      if (checkIns.length > 0) {
        const topCheckIn = checkIns[0];
        // Mark as followed up so we don't repeat
        services.emotionalMemory.markFollowedUp(topCheckIn.moment.id);
        emotionalCheckIn = topCheckIn.suggestedOpener;
        diag.session('Using emotional memory check-in', {
          type: topCheckIn.type,
          reference: topCheckIn.reference,
        });
      }
    } catch (e) {
      log().debug({ error: String(e) }, 'Emotional check-in fetch failed (non-blocking)');
    }
  }

  return { threadStarter, proactiveInsight, proactiveInsightId, emotionalCheckIn, openQuestions };
}

/**
 * Apply proactive context to greeting
 */
function applyProactiveContext(
  greeting: string,
  threadStarter: string | undefined,
  proactiveInsight: string | undefined,
  proactiveInsightId: string | undefined,
  emotionalCheckIn: string | undefined,
  services: SessionServices
): { greeting: string; hasReferencedLastConversation: boolean } {
  let hasReferencedLastConversation = greeting.toLowerCase().includes('last time');

  // If we have a thread starter and didn't use it in greeting, append it
  if (threadStarter && !hasReferencedLastConversation) {
    greeting = `${greeting} <break time="400ms"/> ${threadStarter}`;
    hasReferencedLastConversation = true;
  }

  // If we have an emotional memory check-in, append it
  if (emotionalCheckIn && !hasReferencedLastConversation) {
    greeting = `${greeting} <break time="400ms"/> ${emotionalCheckIn}`;
    hasReferencedLastConversation = true;
  }

  // Or append proactive insight if we have one
  if (proactiveInsight && !threadStarter && !greeting.toLowerCase().includes('checking in')) {
    greeting = `${greeting} <break time="400ms"/> ${proactiveInsight}`;

    // Mark insight as delivered for tracking
    if (proactiveInsightId) {
      services.markInsightDelivered(proactiveInsightId);
      diag.session('Proactive insight delivered', { insightId: proactiveInsightId });
    }
  }

  return { greeting, hasReferencedLastConversation };
}

/**
 * Append cross-session music callback to greeting
 */
async function appendMusicCallback(
  greeting: string,
  isReturningUser: boolean,
  services: SessionServices,
  sessionPersona: PersonaConfig
): Promise<string> {
  if (!isReturningUser || !services.userProfile?.musicMemory || !isMusicEnabled()) {
    return greeting;
  }

  try {
    const { getCrossSessionMusicCallback } = await import('../../services/music/dj-service.js');
    const musicCallback = getCrossSessionMusicCallback(
      sessionPersona.id,
      services.userProfile.musicMemory
    );

    // 20% chance to mention music preferences in greeting (not too pushy)
    if (musicCallback && Math.random() < 0.2) {
      diag.session('Added cross-session music callback', {
        callback: musicCallback.slice(0, 50),
      });
      return `${greeting} <break time="500ms"/> ${musicCallback}`;
    }
  } catch (e) {
    diag.warn('Cross-session music callback failed', { error: String(e) });
  }

  return greeting;
}

/**
 * Apply DJ integration "open the show" moment
 */
async function applyDJIntro(
  greeting: string,
  _sessionPersona: PersonaConfig,
  _userId: string | undefined,
  _userData: UserData,
  _services: SessionServices,
  _isReturningUser: boolean
): Promise<string> {
  // DJ intro functionality has been simplified
  // The new DJ Controller architecture focuses on music playback,
  // not greeting generation. Session sounds are handled by session-sounds.ts
  try {
    // Initialize DJ Controller for this session (if needed for later music)
    const djController = getDJController();
    if (!djController.getState().isInitialized) {
      diag.debug('DJ Controller will be initialized when music handler runs');
    }
  } catch (djError) {
    diag.warn('🎧 DJ Controller check failed (non-fatal)', { error: String(djError) });
  }

  return greeting;
}

/**
 * Track greeting usage to prevent repetition across sessions
 */
function trackGreetingUsage(services: SessionServices, greeting: string): void {
  if (!services.userProfile) {
    return;
  }

  try {
    const currentState = getHumanizingState(services.userProfile);
    const updatedState = recordGreetingUsage(currentState, greeting);
    const updatedProfile = applyHumanizingStateToProfile(services.userProfile, updatedState);
    services.userProfile = updatedProfile;
    diag.session('Greeting recorded for repetition prevention', {
      greetingsTracked: updatedState.usedGreetings.length,
    });
  } catch (greetingTrackErr) {
    diag.warn('Failed to track greeting usage', { error: String(greetingTrackErr) });
  }
}

export default generateAndSpeakGreeting;
