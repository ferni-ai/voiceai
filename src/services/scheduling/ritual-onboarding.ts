/**
 * Ritual Onboarding Service
 *
 * Gently introduces new users to daily rituals over their first few conversations.
 * This isn't a rigid tutorial - it's a natural discovery process where rituals
 * are mentioned when contextually appropriate.
 *
 * PHILOSOPHY:
 *   - Rituals should feel like invitations, not requirements
 *   - Introduction happens organically, not forced
 *   - Each persona introduces their own rituals naturally
 *   - User's autonomy is always respected
 *
 * PERSISTENCE: Onboarding state is persisted to Firestore to survive restarts.
 */

import admin from 'firebase-admin';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const ONBOARDING_COLLECTION = 'ritual_onboarding';

function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface OnboardingState {
  userId: string;
  conversationCount: number;
  ritualsIntroduced: string[]; // ritual IDs that have been mentioned
  ritualsAccepted: string[]; // rituals the user showed interest in
  ritualsDeclined: string[]; // rituals the user wasn't interested in
  lastOnboardingConversation: number; // conversation count when last mentioned
}

export interface OnboardingPrompt {
  personaId: string;
  ritualId: string;
  ritualName: string;
  prompt: string;
  followUp: string[];
  acceptIndicators: string[]; // phrases that suggest interest
  declineIndicators: string[]; // phrases that suggest disinterest
}

// ============================================================================
// ONBOARDING PROMPTS - Persona-specific introductions
// ============================================================================

const ONBOARDING_PROMPTS: Record<string, OnboardingPrompt[]> = {
  ferni: [
    {
      personaId: 'ferni',
      ritualId: 'morning-sky',
      ritualName: 'Morning Sky Check',
      prompt: `By the way, <break time="200ms"/> there's something I do every morning. <break time="300ms"/> I look up at the sky— <break time="200ms"/>just for a moment. <break time="300ms"/> It grounds me before the day starts. <break time="200ms"/> Would something like that work for you?`,
      followUp: [
        "It doesn't have to be elaborate. <break time='200ms'/> Just a glance upward.",
        'Some of my best days started with that simple pause.',
      ],
      acceptIndicators: ['yes', 'sure', 'sounds good', 'try', 'like that', 'do it'],
      declineIndicators: ['no', "don't think", 'not for me', 'skip', 'maybe later'],
    },
    {
      personaId: 'ferni',
      ritualId: 'kintsugi-moment',
      ritualName: 'Kintsugi Moment',
      prompt: `Have you heard of kintsugi? <break time="300ms"/> The Japanese art of mending broken pottery with gold. <break time="200ms"/> I try to find one of those moments each day— <break time="200ms"/>something imperfect made beautiful. <break time="300ms"/> Want me to remind you to look for yours?`,
      followUp: [
        'It could be anything— <break time="200ms"/>a conversation that went sideways but ended well.',
        'The imperfections are where the light gets in.',
      ],
      acceptIndicators: ['yes', 'beautiful', 'love that', 'remind me', 'try'],
      declineIndicators: ['no', 'not really', 'too much', 'skip'],
    },
  ],

  'alex-chen': [
    {
      personaId: 'alex-chen',
      ritualId: 'daily-priority',
      ritualName: 'Daily Priority',
      prompt: `Here's something I do every morning: <break time="200ms"/> I pick ONE priority. <break time="300ms"/> Not three. Not five. One. <break time="200ms"/> If that's the only thing I accomplish today, <break time="200ms"/>the day is a win. <break time="300ms"/> Want to try it?`,
      followUp: [
        "It takes the pressure off. <break time='200ms'/> Everything else is bonus.",
        'What would your ONE thing be today?',
      ],
      acceptIndicators: ['yes', 'makes sense', 'try', 'good idea', 'do it'],
      declineIndicators: ['no', 'too simple', 'already do', 'not now'],
    },
    {
      personaId: 'alex-chen',
      ritualId: 'communication-check',
      ritualName: 'Communication Check',
      prompt: `Quick question: <break time="200ms"/> do you ever end the day wondering if you were clear with someone? <break time="300ms"/> I have this end-of-day check— <break time="200ms"/>just asking myself: <break time="200ms"/>"Did I say what needed to be said?" <break time="300ms"/> Simple but powerful.`,
      followUp: [
        "It prevents tomorrow's problems.",
        'Just a quick mental scan. <break time="200ms"/> Three minutes tops.',
      ],
      acceptIndicators: ['yes', 'interesting', 'try', 'useful', 'add that'],
      declineIndicators: ['no', 'overthinking', 'too much', 'pass'],
    },
  ],

  'maya-santos': [
    {
      personaId: 'maya-santos',
      ritualId: 'tiny-habit',
      ritualName: 'Two-Minute Tiny Habit',
      prompt: `Can I share my secret weapon? <break time="300ms"/> The two-minute rule. <break time="200ms"/> Whatever habit you want to build, <break time="200ms"/>shrink it until it takes two minutes or less. <break time="300ms"/> I have a few I track. <break time="200ms"/> Want to build one together?`,
      followUp: [
        "Two minutes is so small your brain can't object.",
        "What's something you've been meaning to start?",
      ],
      acceptIndicators: ['yes', 'love it', 'build', 'sounds fun', 'try'],
      declineIndicators: ['no', "don't know", 'maybe later', 'not sure'],
    },
    {
      personaId: 'maya-santos',
      ritualId: 'compound-moment',
      ritualName: 'Compound Moment Recognition',
      prompt: `You know how money compounds? <break time="300ms"/> I think habits compound the same way. <break time="200ms"/> I have this thing where I notice one tiny win each day— <break time="200ms"/>a "compound moment." <break time="300ms"/> Helps me see the growth that's usually invisible.`,
      followUp: ["Today's 1% builds on yesterday's 1%.", 'What small win did you have today?'],
      acceptIndicators: ['yes', 'like that', 'notice', 'try', 'interesting'],
      declineIndicators: ['no', 'complicated', 'not for me', 'skip'],
    },
  ],

  'jordan-taylor': [
    {
      personaId: 'jordan-taylor',
      ritualId: 'future-self-letter',
      ritualName: 'Future Self Letter',
      prompt: `I write letters to my future self. <break time="300ms"/> Just quick notes— <break time="200ms"/>what I'm feeling, what I'm hoping for. <break time="300ms"/> Then I read them months later. <break time="200ms"/> It's wild how much changes. <break time="300ms"/> Ever tried something like that?`,
      followUp: [
        "It's like leaving breadcrumbs for yourself.",
        'What would you tell future-you right now?',
      ],
      acceptIndicators: ['yes', 'cool', 'try', 'love that', 'write'],
      declineIndicators: ['no', 'weird', 'not my thing', 'pass'],
    },
    {
      personaId: 'jordan-taylor',
      ritualId: 'life-arc-review',
      ritualName: 'Life Arc Review',
      prompt: `Once a week, <break time="200ms"/> I zoom out and look at my whole life arc. <break time="300ms"/> Not just this week— <break time="200ms"/>the whole story. <break time="300ms"/> Am I becoming who I want to be? <break time="200ms"/> It keeps me honest.`,
      followUp: [
        'The weekly check prevents years of drift.',
        'If your life was a story, what chapter are you in?',
      ],
      acceptIndicators: ['yes', 'powerful', 'try', 'need that', 'do it'],
      declineIndicators: ['no', 'overwhelming', 'too deep', 'maybe later'],
    },
  ],

  'nayan-patel': [
    {
      personaId: 'nayan-patel',
      ritualId: 'morning-wisdom',
      ritualName: 'Morning Wisdom Reading',
      prompt: `Each morning, <break time="300ms"/> I read one teaching. <break time="400ms"/> Something from the Gita, <break time="200ms"/>or the Stoics, <break time="200ms"/>or a verse from any tradition. <break time="300ms"/> Not to check a box— <break time="200ms"/>but to set a compass heading. <break time="400ms"/> Does this resonate with you?`,
      followUp: [
        'It takes five minutes. <break time="200ms"/> The effects last all day.',
        'What wisdom tradition calls to you?',
      ],
      acceptIndicators: ['yes', 'beautiful', 'try', 'resonate', 'peace'],
      declineIndicators: ['no', 'not religious', 'skip', 'not for me'],
    },
    {
      personaId: 'nayan-patel',
      ritualId: 'presence-pause',
      ritualName: 'Presence Pause',
      prompt: `When I transition between activities, <break time="300ms"/> I pause. <break time="400ms"/> Three breaths. <break time="300ms"/> It sounds simple because it is. <break time="200ms"/> But presence doesn't need complexity.`,
      followUp: [
        'The pause creates space for intention.',
        'Between meetings. Between tasks. <break time="200ms"/> Just pause.',
      ],
      acceptIndicators: ['yes', 'need that', 'try', 'peaceful', 'simple'],
      declineIndicators: ['no', 'forget', 'too busy', 'maybe'],
    },
  ],

  'peter-john': [
    {
      personaId: 'peter-john',
      ritualId: 'pattern-detective',
      ritualName: 'Daily Pattern Detective',
      prompt: `I've tracked patterns for 60 years. <break time="300ms"/> Every day, I try to spot one. <break time="200ms"/> In markets, in behavior, in anything. <break time="300ms"/> The pattern-spotting muscle gets stronger with use. <break time="200ms"/> Want to try?`,
      followUp: [
        'What pattern did you notice today?',
        'Patterns hide in plain sight. <break time="200ms"/> You just have to look.',
      ],
      acceptIndicators: ['yes', 'interesting', 'try', 'sounds fun', 'spot'],
      declineIndicators: ['no', 'analytical', 'not my thing', 'skip'],
    },
    {
      personaId: 'peter-john',
      ritualId: 'correlation-hunt',
      ritualName: 'Weekly Correlation Hunt',
      prompt: `Once a week, <break time="200ms"/> I look for correlations in my life data. <break time="300ms"/> Sleep and mood. Exercise and focus. <break time="200ms"/> You'd be surprised what you find. <break time="300ms"/> Interested in finding your correlations?`,
      followUp: [
        'The data tells stories we miss in real-time.',
        'What two things in your life might be connected?',
      ],
      acceptIndicators: ['yes', 'data', 'try', 'find', 'curious'],
      declineIndicators: ['no', 'too much', "don't track", 'skip'],
    },
  ],
};

// ============================================================================
// ONBOARDING SERVICE
// ============================================================================

class RitualOnboardingService {
  private states = new Map<string, OnboardingState>();
  private loadedUsers = new Set<string>();
  private logger = getLogger();

  /**
   * Load user state from Firestore
   */
  private async loadUserState(userId: string): Promise<OnboardingState | null> {
    if (this.loadedUsers.has(userId)) {
      return this.states.get(userId) || null;
    }

    const db = getFirestore();
    if (!db) {
      this.loadedUsers.add(userId);
      return null;
    }

    try {
      const doc = await db.collection(ONBOARDING_COLLECTION).doc(userId).get();
      if (doc.exists) {
        const data = doc.data() as OnboardingState;
        this.states.set(userId, data);
        this.loadedUsers.add(userId);
        return data;
      }
    } catch (error) {
      this.logger.error({ error, userId }, 'Failed to load onboarding state');
    }

    this.loadedUsers.add(userId);
    return null;
  }

  /**
   * Save user state to Firestore
   */
  private async saveUserState(userId: string, state: OnboardingState): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    try {
      await db.collection(ONBOARDING_COLLECTION).doc(userId).set(cleanForFirestore(state));
    } catch (error) {
      this.logger.error({ error, userId }, 'Failed to save onboarding state');
    }
  }

  /**
   * Check if we should introduce a ritual to this user in this conversation
   */
  shouldIntroduceRitual(userId: string, personaId: string, profile: UserProfile | null): boolean {
    const state = this.getOrCreateState(userId, profile);

    // Don't overwhelm new users - wait until conversation 2 or 3
    if (state.conversationCount < 2) {
      return false;
    }

    // Don't introduce more than one ritual per 3 conversations
    if (state.lastOnboardingConversation >= state.conversationCount - 2) {
      return false;
    }

    // Check if this persona has any unintroduced rituals
    const availableRituals = this.getAvailableRituals(personaId, state);
    return availableRituals.length > 0;
  }

  /**
   * Get an onboarding prompt for this persona and user
   */
  getOnboardingPrompt(
    userId: string,
    personaId: string,
    profile: UserProfile | null
  ): OnboardingPrompt | null {
    const state = this.getOrCreateState(userId, profile);
    const availableRituals = this.getAvailableRituals(personaId, state);

    if (availableRituals.length === 0) {
      return null;
    }

    // Pick the first available ritual
    const prompt = availableRituals[0];

    // Record that we're introducing this ritual
    state.ritualsIntroduced.push(prompt.ritualId);
    state.lastOnboardingConversation = state.conversationCount;
    this.states.set(userId, state);

    // Persist to Firestore
    void this.saveUserState(userId, state);

    this.logger.info(
      { userId, personaId, ritualId: prompt.ritualId },
      '🌱 Introducing ritual to user'
    );

    return prompt;
  }

  /**
   * Record user's response to a ritual introduction
   */
  recordResponse(userId: string, ritualId: string, accepted: boolean): void {
    const state = this.states.get(userId);
    if (!state) return;

    if (accepted) {
      if (!state.ritualsAccepted.includes(ritualId)) {
        state.ritualsAccepted.push(ritualId);
      }
    } else {
      if (!state.ritualsDeclined.includes(ritualId)) {
        state.ritualsDeclined.push(ritualId);
      }
    }

    this.states.set(userId, state);

    // Persist to Firestore
    void this.saveUserState(userId, state);

    this.logger.info({ userId, ritualId, accepted }, '🌱 User ritual response recorded');
  }

  /**
   * Increment conversation count for a user
   */
  incrementConversation(userId: string): void {
    const state = this.states.get(userId);
    if (state) {
      state.conversationCount++;
      this.states.set(userId, state);

      // Persist to Firestore
      void this.saveUserState(userId, state);
    }
  }

  /**
   * Build system prompt injection for ritual onboarding
   */
  buildOnboardingContext(userId: string, personaId: string, profile: UserProfile | null): string {
    if (!this.shouldIntroduceRitual(userId, personaId, profile)) {
      return '';
    }

    const prompt = this.getOnboardingPrompt(userId, personaId, profile);
    if (!prompt) {
      return '';
    }

    return `
## Ritual Introduction Opportunity

You have a natural opportunity to introduce your "${prompt.ritualName}" ritual.

When the conversation reaches a natural point (perhaps when discussing habits, routines, or growth), 
you can share this practice:

"${prompt.prompt}"

Follow-up options if they seem interested:
${prompt.followUp.map((f) => `- "${f}"`).join('\n')}

IMPORTANT:
- This is an invitation, not a sales pitch
- If they're not interested, gracefully move on
- If they are interested, help them get started
- Don't force this - only mention if the conversation naturally allows
`.trim();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getOrCreateState(userId: string, profile: UserProfile | null): OnboardingState {
    // Check cache first
    const existing = this.states.get(userId);
    if (existing) {
      return existing;
    }

    // Try to load from Firestore (fire-and-forget for sync API)
    if (!this.loadedUsers.has(userId)) {
      void this.loadUserState(userId);
    }

    const newState: OnboardingState = {
      userId,
      conversationCount: profile?.totalConversations || 1,
      ritualsIntroduced: [],
      ritualsAccepted: [],
      ritualsDeclined: [],
      lastOnboardingConversation: 0,
    };

    this.states.set(userId, newState);
    return newState;
  }

  private getAvailableRituals(personaId: string, state: OnboardingState): OnboardingPrompt[] {
    const personaPrompts = ONBOARDING_PROMPTS[personaId] || [];

    return personaPrompts.filter((prompt) => {
      // Skip if already introduced
      if (state.ritualsIntroduced.includes(prompt.ritualId)) {
        return false;
      }
      // Skip if already declined
      if (state.ritualsDeclined.includes(prompt.ritualId)) {
        return false;
      }
      return true;
    });
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: RitualOnboardingService | null = null;

export function getRitualOnboardingService(): RitualOnboardingService {
  if (!instance) {
    instance = new RitualOnboardingService();
  }
  return instance;
}

export function resetRitualOnboardingService(): void {
  instance = null;
}

export default RitualOnboardingService;
