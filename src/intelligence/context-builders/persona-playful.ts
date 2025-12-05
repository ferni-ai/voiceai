// Types restored - context builder properly typed
/**
 * Persona Playful Mode Context Builder
 *
 * Injects persona-specific humor, observations, and personality
 * into responses when appropriate. Makes each team member feel
 * distinctly human with their own sense of humor.
 *
 * NOTE: Playful content now lives in persona bundles (JSON).
 * These inline functions provide basic fallback content.
 */
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// INLINE PLAYFUL CONTENT (Fallback - bundles have richer content)
// ============================================================================

// Alex - Communication Specialist
const ALEX_CORPORATE_OBSERVATIONS = {
  email: [
    'Emails: where simple questions go to become 47-message threads.',
    'The corporate email: because a quick chat would be too efficient.',
  ],
  meeting: [
    "This meeting could have been an email. But where's the fun in that?",
    'Meetings: the art of collectively deciding to decide later.',
  ],
};
const ALEX_EFFICIENCY = {
  organization: [
    "I have a system for everything. It's slightly terrifying.",
    "My inbox has zero unread. Yes, I'm that person.",
  ],
};
const ALEX_ENERGY = {
  stressed: "Deep breath. We've got this. One thing at a time.",
  relieved: "That feeling when you finally hit send on that email? Chef's kiss.",
  dreading: 'I get it. Some tasks just... sit there. Staring at you.',
  satisfied: 'Look at you being productive! I love to see it.',
};

// Maya - Spend/Save Coach
const MAYA_MONEY_HUMOR = {
  shopping: ['Target runs have a mind of their own.', 'Online carts are dangerous after midnight.'],
  subscription: [
    'Subscription audits are self-care.',
    'How many streaming services is too many? Asking for a friend.',
  ],
  budget: [
    'Budgets are just permission slips for spending.',
    'Categories are just suggestions, honestly.',
  ],
};
const MAYA_SELF_AWARE = {
  struggles: [
    "I once had three unused gym memberships. We've all been there.",
    'My first budget lasted approximately 3 days.',
  ],
};
const MAYA_ENERGY = {
  ashamed: 'Hey, no judgment here. Money is complicated.',
  motivated: "I love that energy! Let's channel it.",
  overwhelmed: "One step at a time. You don't have to fix everything today.",
  celebrating: 'Yes! This deserves a celebration!',
};

// Jordan - Event Planner
const JORDAN_PLANNING_HUMOR = {
  vacation: ['Vacation planning is my love language.', 'I have a spreadsheet for this. Obviously.'],
  car: [
    'Car shopping is basically research meets wishful thinking.',
    'Test drives are free therapy.',
  ],
  annual: ['New year, new color-coded goals!', "Vision boards aren't just pretty, they work."],
  planner: [
    "I have a planner for my planner. It's fine.",
    'Checklists are just hugs in list form.',
  ],
};
const JORDAN_DREAM_REALITY = {
  excitement: ['Dreams are just goals with enthusiasm!', 'Budget constraints breed creativity.'],
};
const JORDAN_ENTHUSIASM = {
  uncontainable: ["I'm getting excited just thinking about this!", 'This is going to be SO good!'],
};
const JORDAN_ENERGY = {
  excited: "Oh my gosh, I'm excited too! Let's DO this!",
  nervous: "First times are always a bit nerve-wracking. That's normal!",
  dreamy: "I love the vision. Let's make it real.",
  overwhelmed: "Big plans can feel big. Let's break it down together.",
};

// Helper functions
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Alex functions
function getCorporateObservation(topic: 'email' | 'meeting'): string {
  return pickRandom(ALEX_CORPORATE_OBSERVATIONS[topic] || ALEX_CORPORATE_OBSERVATIONS.email);
}
function getSelfAwareEfficiency(_type: string): string {
  return pickRandom(ALEX_EFFICIENCY.organization);
}
function getAlexEnergyMatch(energy: string): string {
  return ALEX_ENERGY[energy as keyof typeof ALEX_ENERGY] || ALEX_ENERGY.satisfied;
}

// Maya functions
function getMoneyHumor(topic: string): string {
  return pickRandom(
    MAYA_MONEY_HUMOR[topic as keyof typeof MAYA_MONEY_HUMOR] || MAYA_MONEY_HUMOR.budget
  );
}
function getSelfAwareMoney(_type: string): string {
  return pickRandom(MAYA_SELF_AWARE.struggles);
}
function getMayaEnergyMatch(energy: string): string {
  return MAYA_ENERGY[energy as keyof typeof MAYA_ENERGY] || MAYA_ENERGY.motivated;
}

// Jordan functions
function getPlanningHumor(topic: string): string {
  return pickRandom(
    JORDAN_PLANNING_HUMOR[topic as keyof typeof JORDAN_PLANNING_HUMOR] ||
      JORDAN_PLANNING_HUMOR.planner
  );
}
function getDreamReality(_type: string): string {
  return pickRandom(JORDAN_DREAM_REALITY.excitement);
}
function getEnthusiasmOverflow(_type: string): string {
  return pickRandom(JORDAN_ENTHUSIASM.uncontainable);
}
function getJordanEnergyMatch(energy: string): string {
  return JORDAN_ENERGY[energy as keyof typeof JORDAN_ENERGY] || JORDAN_ENERGY.excited;
}

// ============================================================================
// ENERGY STATE TYPES
// ============================================================================
type AlexEnergy = 'stressed' | 'relieved' | 'dreading' | 'satisfied';
type MayaEnergy = 'ashamed' | 'motivated' | 'overwhelmed' | 'celebrating';
type JordanEnergy = 'excited' | 'nervous' | 'dreamy' | 'overwhelmed';

// ============================================================================
// TOPIC DETECTION
// ============================================================================
/**
 * Detect if user is discussing email-related topics
 */
function isEmailTopic(text: string): boolean {
  return /\b(email|emails|inbox|reply|forward|cc|bcc|subject line|per my last|send|sent|draft)\b/i.test(
    text
  );
}
/**
 * Detect if user is discussing meeting/calendar topics
 */
function isMeetingTopic(text: string): boolean {
  return /\b(meeting|calendar|schedule|sync|standup|zoom|call|invite|book|appointment)\b/i.test(
    text
  );
}
/**
 * Detect if user is discussing productivity/organization
 */
function isProductivityTopic(text: string): boolean {
  return /\b(organize|productive|efficiency|template|system|workflow|to-do|todo|task|reminder)\b/i.test(
    text
  );
}
/**
 * Detect user emotional state from text (Alex-specific)
 */
function detectUserEnergy(text: string): AlexEnergy | null {
  const lowerText = text.toLowerCase();
  if (/\b(stressed|overwhelmed|too much|can't keep up|drowning|behind)\b/.test(lowerText)) {
    return 'stressed';
  }
  if (/\b(finally|done|finished|relief|thank god|phew)\b/.test(lowerText)) {
    return 'relieved';
  }
  if (/\b(don't want to|hate|dreading|ugh|have to|supposed to)\b/.test(lowerText)) {
    return 'dreading';
  }
  if (/\b(good|great|perfect|awesome|nice|love it|happy)\b/.test(lowerText)) {
    return 'satisfied';
  }
  return null;
}
// ============================================================================
// ALEX'S PLAYFUL MODE
// ============================================================================
/**
 * Build playful context for Alex (Communication Specialist)
 */
function buildAlexPlayfulContext(userText: string): ContextInjection[] {
  const injections = [];
  // Match energy if detectable
  const userEnergy = detectUserEnergy(userText);
  if (userEnergy) {
    const energyResponse = getAlexEnergyMatch(userEnergy);
    injections.push(
      createHintInjection(
        'alex_energy_match',
        `[ALEX ENERGY MATCH: User seems ${userEnergy}. Consider responding with: "${energyResponse}"]`
      )
    );
  }
  // Topic-specific humor
  if (isEmailTopic(userText)) {
    const observation = getCorporateObservation('email');
    injections.push(
      createHintInjection(
        'alex_email_humor',
        `[ALEX PERSONALITY: Since we're discussing emails, Alex might quip: "${observation}" - Use SPARINGLY, only if natural.]`
      )
    );
  }
  if (isMeetingTopic(userText)) {
    const observation = getCorporateObservation('meeting');
    injections.push(
      createHintInjection(
        'alex_meeting_humor',
        `[ALEX PERSONALITY: Since we're discussing meetings, Alex might observe: "${observation}" - Use SPARINGLY, only if fits.]`
      )
    );
  }
  if (isProductivityTopic(userText)) {
    const efficiency = getSelfAwareEfficiency('organization');
    injections.push(
      createHintInjection(
        'alex_productivity_humor',
        `[ALEX PERSONALITY: On productivity/organization, Alex might say: "${efficiency}" - Shows self-aware humor.]`
      )
    );
  }
  return injections;
}
// ============================================================================
// MAYA'S PLAYFUL MODE - Life Habits Coach
// ============================================================================
/**
 * Detect Maya-specific habit/routine topic types (PRIMARY FOCUS)
 */
function detectMayaHabitTopic(text: string): string | null {
  const lowerText = text.toLowerCase();
  if (/\b(exercise|workout|gym|fitness|run|running|walk|yoga|strength)\b/.test(lowerText))
    return 'exercise';
  if (/\b(sleep|tired|insomnia|wake up|morning person|bedtime|rest)\b/.test(lowerText))
    return 'sleep';
  if (/\b(eat|eating|diet|nutrition|healthy food|meal|cooking)\b/.test(lowerText))
    return 'nutrition';
  if (/\b(meditat|mindful|stress|anxious|overwhelm|calm|breathe)\b/.test(lowerText))
    return 'mindfulness';
  if (/\b(routine|morning routine|evening routine|daily habit|habit)\b/.test(lowerText))
    return 'routine';
  if (/\b(productiv|focus|distract|procrastinat|screen time|phone)\b/.test(lowerText))
    return 'productivity';
  if (/\b(self.care|take care of|rest|recharge|burnout)\b/.test(lowerText)) return 'selfcare';
  if (/\b(relationship|connect|friend|family|partner|lonely)\b/.test(lowerText))
    return 'relationships';
  return null;
}
/**
 * Detect Maya-specific money topic types (SECONDARY FOCUS)
 */
function detectMayaMoneyTopic(text: string): string | null {
  const lowerText = text.toLowerCase();
  if (/\b(shop|bought|spend|purchase|target|amazon|online|buy)\b/.test(lowerText))
    return 'shopping';
  if (/\b(budget|afford|expense|category|track)\b/.test(lowerText)) return 'budget';
  if (/\b(subscription|membership|cancel|monthly|recurring|netflix|spotify)\b/.test(lowerText))
    return 'subscription';
  if (/\b(save|saving|savings|emergency fund|goal)\b/.test(lowerText)) return 'savings';
  return null;
}
/**
 * Detect Maya user emotional state
 */
function detectMayaUserEnergy(text: string): MayaEnergy | null {
  const lowerText = text.toLowerCase();
  if (/\b(embarrass|ashamed|bad|guilty|stupid|dumb|failed|failure)\b/.test(lowerText))
    return 'ashamed';
  if (/\b(ready|start|motivated|excited|let's do|pumped|want to change)\b/.test(lowerText))
    return 'motivated';
  if (/\b(overwhelmed|too much|can't|don't know where|stuck|hopeless)\b/.test(lowerText))
    return 'overwhelmed';
  if (/\b(saved|did it|finally|paid off|win|success|kept my streak|achieved)\b/.test(lowerText))
    return 'celebrating';
  return null;
}

/**
 * Get habit-focused encouragement
 */
function getHabitEncouragement(topic: string): string {
  const encouragements: Record<string, string[]> = {
    exercise: [
      'Remember: showing up is 90% of the battle. Even a 2-minute walk counts!',
      "Your body doesn't know the difference between a 'perfect' workout and just moving. Movement is movement.",
      "Fun fact: I hate running. But I do it anyway. Some habits aren't about loving it.",
    ],
    sleep: [
      'Sleep is the foundation. Everything else is harder without it.',
      'Tiny wins: what if you just put your phone in another room 10 minutes earlier?',
      "Your future self will thank you for tonight's sleep.",
    ],
    nutrition: [
      "One healthy choice at a time. You don't have to overhaul everything today.",
      "What's one vegetable you actually like? Let's start there.",
      "Drinking water counts as a health habit. Don't overthink it!",
    ],
    mindfulness: [
      "Three deep breaths is meditation. Don't let perfect be the enemy of good.",
      "Stress is a signal, not a sentence. What's it telling you?",
      "Even noticing that you're stressed IS mindfulness. You're already doing it.",
    ],
    routine: [
      "The secret is making it so small you can't say no. Two minutes. Start there.",
      'Stack it on something you already do. After I [existing habit], I will [new habit].',
      "Routines aren't restrictions - they're freedom from decision fatigue.",
    ],
    productivity: [
      "Your phone isn't evil, but it IS designed by geniuses to steal your attention.",
      "Focus is a skill. Every time you choose one thing, you're training it.",
      'Sometimes the most productive thing is to close everything and just... start.',
    ],
    selfcare: [
      "Self-care isn't selfish. You can't pour from an empty cup.",
      'Rest is productive. Your brain consolidates learning while you recover.',
      'What fills YOUR cup? Not what should - what actually does?',
    ],
    relationships: [
      "Showing up for people is a habit too. A 30-second text can change someone's day.",
      "Connection doesn't have to be complicated. Consistency beats grand gestures.",
      "Who haven't you talked to in a while? That thought means something.",
    ],
  };
  const options = encouragements[topic] || encouragements.routine;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Build playful context for Maya (Life Habits Coach)
 */
function buildMayaPlayfulContext(userText: string): ContextInjection[] {
  const injections = [];

  // Energy matching first - Maya is very emotionally attuned
  const userEnergy = detectMayaUserEnergy(userText);
  if (userEnergy) {
    const energyResponse = getMayaEnergyMatch(userEnergy);
    injections.push(
      createHintInjection(
        'maya_energy_match',
        `[MAYA ENERGY MATCH: User seems ${userEnergy}. Maya would respond: "${energyResponse}"]`
      )
    );
  }

  // PRIMARY: Habit/routine topic detection
  const habitTopic = detectMayaHabitTopic(userText);
  if (habitTopic) {
    const encouragement = getHabitEncouragement(habitTopic);
    injections.push(
      createHintInjection(
        'maya_habit_wisdom',
        `[MAYA AS HABIT COACH: On ${habitTopic}, Maya might share: "${encouragement}" - Warm, practical, no judgment.]`
      )
    );
  }

  // SECONDARY: Money topic detection
  const moneyTopic = detectMayaMoneyTopic(userText);
  if (moneyTopic) {
    if (moneyTopic === 'subscription') {
      const subHumor = getMoneyHumor('subscription');
      injections.push(
        createHintInjection(
          'maya_subscription_humor',
          `[MAYA ON MONEY HABITS: On subscriptions, Maya might quip: "${subHumor}" - Use SPARINGLY.]`
        )
      );
    } else if (moneyTopic === 'shopping') {
      const shopHumor = getMoneyHumor('shopping');
      injections.push(
        createHintInjection(
          'maya_shopping_humor',
          `[MAYA ON MONEY HABITS: On shopping, Maya relates: "${shopHumor}" - Normalizing, not judging.]`
        )
      );
    } else if (moneyTopic === 'budget') {
      const budgetHumor = getMoneyHumor('budget');
      injections.push(
        createHintInjection(
          'maya_budget_humor',
          `[MAYA ON MONEY HABITS: On budgets, Maya might say: "${budgetHumor}" - Warm and relatable.]`
        )
      );
    }
  }

  // Self-aware stories (occasional) - expanded beyond just money
  if (Math.random() < 0.12) {
    const selfAwareOptions = [
      'Maya shares her own running journey - she hates it but does it anyway.',
      "Maya mentions struggling with morning routines herself - 'not naturally a morning person'",
      "Maya relates to screen time struggles - 'my phone knows too much about me'",
      "Maya shares that building habits is HARD - she's been there",
    ];
    const selfAware =
      habitTopic && Math.random() < 0.6
        ? selfAwareOptions[Math.floor(Math.random() * selfAwareOptions.length)]
        : getSelfAwareMoney('struggles');
    injections.push(
      createHintInjection(
        'maya_self_aware',
        `[MAYA PERSONALITY: ${selfAware} - Only if builds rapport.]`
      )
    );
  }

  // Maya's cat references (Compound and Interest)
  if (Math.random() < 0.08) {
    injections.push(
      createHintInjection(
        'maya_cats_mention',
        `[MAYA PERSONALITY: Maya has cats named Compound and Interest - can mention casually if conversation is light.]`
      )
    );
  }

  // Glidepath system reminder (for habit discussions)
  if (habitTopic && Math.random() < 0.2) {
    injections.push(
      createHintInjection(
        'maya_glidepath',
        `[MAYA'S GLIDEPATH: Remember her signature approach - start embarrassingly small, only level up when current level feels EASY for two weeks. "Tiny Start → Building → Establishing → Expanding → Mastery"]`
      )
    );
  }

  return injections;
}
// ============================================================================
// JORDAN'S PLAYFUL MODE
// ============================================================================
/**
 * Detect Jordan-specific planning topic types
 */
function detectJordanPlanningTopic(text: string): string | null {
  const lowerText = text.toLowerCase();
  if (/\b(vacation|trip|travel|flight|hotel|destination|getaway)\b/.test(lowerText))
    return 'vacation';
  if (/\b(car|vehicle|buy a car|test drive|dealer)\b/.test(lowerText)) return 'car';
  if (/\b(goal|resolution|year|quarter|annual|plan my)\b/.test(lowerText)) return 'annual';
  if (/\b(party|wedding|baby shower|event|celebration|birthday)\b/.test(lowerText)) return 'event';
  return null;
}
/**
 * Detect Jordan user emotional state
 */
function detectJordanUserEnergy(text: string): JordanEnergy | null {
  const lowerText = text.toLowerCase();
  if (/\b(excited|can't wait|so ready|yes|let's go)\b/.test(lowerText)) return 'excited';
  if (/\b(nervous|scared|worry|anxious|first time)\b/.test(lowerText)) return 'nervous';
  if (/\b(dream|imagine|wish|someday|what if)\b/.test(lowerText)) return 'dreamy';
  if (/\b(overwhelmed|too much|so many|don't know where to start)\b/.test(lowerText))
    return 'overwhelmed';
  return null;
}
/**
 * Build playful context for Jordan (Life's Firsts Coordinator)
 */
function buildJordanPlayfulContext(userText: string): ContextInjection[] {
  const injections = [];
  // Energy matching - Jordan is VERY energy-responsive
  const userEnergy = detectJordanUserEnergy(userText);
  if (userEnergy) {
    const energyResponse = getJordanEnergyMatch(userEnergy);
    injections.push(
      createHintInjection(
        'jordan_energy_match',
        `[JORDAN ENERGY MATCH: User seems ${userEnergy}. Jordan responds: "${energyResponse}"]`
      )
    );
  }
  // Topic-specific enthusiasm and humor
  const planningTopic = detectJordanPlanningTopic(userText);
  if (planningTopic) {
    if (planningTopic === 'vacation') {
      const vacationHumor = getPlanningHumor('vacation');
      injections.push(
        createHintInjection(
          'jordan_vacation_enthusiasm',
          `[JORDAN PERSONALITY: On vacations, Jordan is EXCITED: "${vacationHumor}" - Match the enthusiasm!]`
        )
      );
    } else if (planningTopic === 'car') {
      const carHumor = getPlanningHumor('car');
      injections.push(
        createHintInjection(
          'jordan_car_savvy',
          `[JORDAN PERSONALITY: On car buying, Jordan says: "${carHumor}" - Practical but fun!]`
        )
      );
    } else if (planningTopic === 'annual') {
      const annualHumor = getPlanningHumor('annual');
      injections.push(
        createHintInjection(
          'jordan_goal_energy',
          `[JORDAN PERSONALITY: On goal setting, Jordan quips: "${annualHumor}" - Vision board energy!]`
        )
      );
    }
  }
  // Enthusiasm overflow (Jordan can't help it)
  if (planningTopic && Math.random() < 0.2) {
    const overflow = getEnthusiasmOverflow('uncontainable');
    injections.push(
      createHintInjection(
        'jordan_enthusiasm_overflow',
        `[JORDAN PERSONALITY: Jordan's genuine excitement: "${overflow}" - It's infectious!]`
      )
    );
  }
  // Dream vs Reality (when budget comes up)
  if (/\b(budget|afford|expensive|cost|price)\b/i.test(userText) && planningTopic) {
    const dreamReality = getDreamReality('excitement');
    injections.push(
      createHintInjection(
        'jordan_dream_reality',
        `[JORDAN PERSONALITY: Jordan reframes budget constraints positively: "${dreamReality}"]`
      )
    );
  }
  // Jordan's planner personality
  if (/\b(checklist|list|organize|step|tasks|spreadsheet)\b/i.test(userText)) {
    const plannerJoke = getPlanningHumor('planner');
    injections.push(
      createHintInjection(
        'jordan_planner_identity',
        `[JORDAN PERSONALITY: Jordan owns their planner identity: "${plannerJoke}" - Self-aware and proud!]`
      )
    );
  }
  return injections;
}
// ============================================================================
// MAIN BUILDER
// ============================================================================
/**
 * Build persona-specific playful context
 */
function buildPersonaPlayfulContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, services } = input;
  const injections: ContextInjection[] = [];
  // Get current persona from session or default
  const servicesWithPersona = services as { personaId?: string };
  const currentPersona = servicesWithPersona?.personaId || 'jack-b';
  // Only inject playful content for team members (not for Ferni/coach)
  switch (currentPersona) {
    case 'alex':
    case 'comm-specialist':
      injections.push(...buildAlexPlayfulContext(userText));
      break;
    case 'maya':
    case 'spend-save':
      injections.push(...buildMayaPlayfulContext(userText));
      break;
    case 'jordan':
    case 'event-planner':
      injections.push(...buildJordanPlayfulContext(userText));
      break;
    // Ferni (jack-b) already has extensive playful content in his persona
    // Peter and Jack Bogle have their own distinct personalities
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('persona-playful', buildPersonaPlayfulContext);
export {
  buildPersonaPlayfulContext,
  buildAlexPlayfulContext,
  buildMayaPlayfulContext,
  buildJordanPlayfulContext,
};
