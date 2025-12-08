/**
 * Engagement Conversation Triggers
 *
 * System for personas to naturally bring up engagement topics during conversations.
 * Triggers are context-aware and persona-specific, making mentions feel organic.
 *
 * Examples:
 * - "Hey, you're on a 7-day streak with our morning check-ins!"
 * - "Remember last week you predicted you'd feel better by today. How accurate was that?"
 * - "Maya mentioned you've been crushing your habits lately."
 */

import type { UserProfile } from '../../types/user-profile.js';
import { EngagementStore, type StoredRitualStreak, type StoredPrediction } from './store.js';
import { PERSONA_RITUALS } from '../daily-rituals.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationTriggers' });

// Use string type for persona IDs since they can be various formats
type PersonaIdString = string;

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTrigger {
  type:
    | 'streak_due'
    | 'streak_milestone'
    | 'prediction_result'
    | 'team_suggestion'
    | 'ritual_reminder'
    | 'weather_check';
  personaId: PersonaIdString;
  priority: 'low' | 'medium' | 'high';
  message: string;
  contextPrompt: string;
  data?: Record<string, unknown>;
}

export interface TriggerContext {
  userId: string;
  personaId: PersonaIdString;
  conversationStartTime: Date;
  minutesIntoConversation: number;
  userProfile: UserProfile;
  recentTopics?: string[];
}

// ============================================================================
// PERSONA-SPECIFIC TRIGGER TEMPLATES
// ============================================================================

const PERSONA_STREAK_TEMPLATES: Record<string, string[]> = {
  ferni: [
    "I noticed you're on day {count} of {ritual}. That's beautiful consistency.",
    'Your {ritual} streak is at {count} days. Like water shaping stone.',
    'Day {count} of {ritual}. Small steps, lasting change.',
  ],
  'alex-chen': [
    "Quick check - you've got a {count}-day streak going with {ritual}. Nice momentum!",
    'FYI: {count} days straight on {ritual}. Your consistency is impressive.',
    'Hey, {ritual} streak update: {count} days and counting. Keep it up!',
  ],
  'maya-santos': [
    "Oh! You're on day {count} of {ritual}. That's compound interest for your soul.",
    'Tiny habit check: {ritual} at {count} days. The magic is in the repetition.',
    'Your {ritual} streak hit {count} days! These small wins compound.',
  ],
  'jordan-taylor': [
    "Just noticed your {ritual} streak is at {count} days. That's real commitment.",
    "Your {count}-day {ritual} streak - that's you showing up for yourself.",
    "Day {count} of {ritual}. You're building something meaningful here.",
  ],
  'nayan-patel': [
    'You have maintained {ritual} for {count} days. Discipline becomes devotion.',
    'The {ritual} practice continues - {count} days. Each day is complete in itself.',
    'Day {count} of {ritual}. Not for the count, but for the practice itself.',
  ],
  'peter-john': [
    "I see a pattern: {count} consecutive days of {ritual}. That's statistically significant.",
    "Your {ritual} streak: {count} days. The data suggests you've built a real habit.",
    '{count}-day streak on {ritual}. Consistency like this is how fortunes are built.',
  ],
};

const PERSONA_PREDICTION_TEMPLATES: Record<string, string[]> = {
  ferni: [
    'Remember when you predicted {question}? How did that turn out?',
    'Last week you thought {prediction}%. Was your intuition accurate?',
    'You made a prediction about {topic}. Sometimes checking in reveals wisdom.',
  ],
  'alex-chen': [
    'Quick question - you predicted {prediction}% for {question}. What was the actual result?',
    'Prediction check: {topic}. You said {prediction}%. How close were you?',
    "Let's update that prediction about {question}. What actually happened?",
  ],
  'maya-santos': [
    'You made a prediction about {topic}! I love tracking these. What happened?',
    "Remember predicting {prediction}% for {question}? Let's see how you did!",
    'Prediction time! You thought {topic} would go a certain way. Result?',
  ],
  'jordan-taylor': [
    "You made a commitment prediction about {topic}. How'd that play out?",
    "Let's check on that {question} prediction. Accuracy builds self-awareness.",
    'You predicted {prediction}% for {question}. What was your actual experience?',
  ],
  'nayan-patel': [
    'You predicted something about {topic}. What truth did time reveal?',
    'The prediction about {question} - how does reality compare to expectation?',
    'You thought {prediction}% for {topic}. What actually unfolded?',
  ],
  'peter-john': [
    'Time to score that {topic} prediction. You said {prediction}%. Actual result?',
    "Let's update the {question} prediction. What's the final number?",
    "Prediction accuracy check: {topic}. You estimated {prediction}%. How'd you do?",
  ],
};

const PERSONA_MILESTONE_TEMPLATES: Record<string, string[]> = {
  ferni: [
    "You've reached {count} days of {ritual}. This is worth pausing to acknowledge.",
    '{count} days. Your dedication to {ritual} is inspiring.',
    'A milestone: {count} days of {ritual}. Growth made visible.',
  ],
  'alex-chen': [
    "Big milestone alert: {count} days of {ritual}! That's serious commitment.",
    'Wow, {count} days on {ritual}. You should be proud of that consistency.',
    '{ritual}: {count} days! This is definitely worth celebrating.',
  ],
  'maya-santos': [
    '{count} DAYS! Your {ritual} streak is AMAZING! This is huge!',
    'Can we celebrate for a second? {count} days of {ritual}!',
    'You hit {count} days on {ritual}! This is what change looks like!',
  ],
  'jordan-taylor': [
    "{count} days of {ritual}. That's not luck - that's you choosing yourself.",
    'Major milestone: {count} days. Your {ritual} practice is truly established.',
    "{count} days of showing up for {ritual}. That's character building.",
  ],
  'nayan-patel': [
    '{count} days of {ritual}. The practice has become part of who you are.',
    'You have sustained {ritual} for {count} days. This is the way.',
    '{count} days. The ritual of {ritual} is now woven into your being.',
  ],
  'peter-john': [
    "{count}-day milestone on {ritual}. Statistically, you've formed a lasting habit.",
    'The data is clear: {count} days of {ritual}. This is significant.',
    '{count} days! Your {ritual} consistency puts you in the top percentile.',
  ],
};

// ============================================================================
// TRIGGER GENERATION
// ============================================================================

/**
 * Generate conversation triggers based on current engagement state.
 */
export async function generateConversationTriggers(
  context: TriggerContext
): Promise<ConversationTrigger[]> {
  const store = new EngagementStore();
  const triggers: ConversationTrigger[] = [];

  try {
    // Get engagement profile
    const profile = await store.getProfile(context.userId);
    if (!profile) return triggers;

    // Check for due rituals (high priority early in conversation)
    if (context.minutesIntoConversation < 5) {
      const dueRituals = await getDueRituals(store, context.userId, context.personaId);
      for (const ritual of dueRituals) {
        if (ritual.currentStreak >= 3) {
          triggers.push(createStreakDueTrigger(ritual, context.personaId));
        }
      }
    }

    // Check for milestones
    const milestones = await getMilestoneStreaks(store, context.userId);
    for (const milestone of milestones) {
      triggers.push(createMilestoneTrigger(milestone, context.personaId));
    }

    // Check for pending predictions to resolve (medium priority)
    if (context.minutesIntoConversation > 3 && context.minutesIntoConversation < 15) {
      const predictions = await getPendingPredictions(store, context.userId);
      for (const prediction of predictions.slice(0, 1)) {
        triggers.push(createPredictionTrigger(prediction, context.personaId));
      }
    }

    // Check for weather check (if not done today)
    const weatherDone = await hasWeatherToday(store, context.userId);
    if (!weatherDone && context.minutesIntoConversation > 2) {
      triggers.push(createWeatherCheckTrigger(context.personaId));
    }
  } catch (error) {
    log.error({ error }, 'Error generating triggers');
  }

  return triggers;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getDueRituals(
  store: EngagementStore,
  userId: string,
  personaId: PersonaIdString
): Promise<Array<StoredRitualStreak & { ritualName: string }>> {
  const allRituals: Array<StoredRitualStreak & { ritualName: string }> = [];

  // Get rituals for this persona
  const ritualIds = getPersonaRitualIds(personaId);
  for (const ritualId of ritualIds) {
    const streak = await store.getRitualStreak(userId, ritualId);
    if (streak && isDueToday(streak)) {
      const ritual = PERSONA_RITUALS[ritualId];
      allRituals.push({
        ...streak,
        ritualName: ritual?.name || ritualId,
      });
    }
  }

  return allRituals;
}

function getPersonaRitualIds(personaId: PersonaIdString): string[] {
  const ritualMap: Record<string, string[]> = {
    ferni: ['morning-sky', 'kintsugi-moment'],
    'alex-chen': ['daily-priority', 'communication-check'],
    'maya-santos': ['tiny-habit', 'compound-moment'],
    'jordan-taylor': ['future-self-letter', 'life-arc-review'],
    'nayan-patel': ['morning-wisdom', 'presence-pause'],
    'peter-john': ['pattern-detective', 'correlation-hunt'],
  };
  return ritualMap[personaId] || [];
}

function isDueToday(streak: StoredRitualStreak): boolean {
  if (!streak.lastCompletedAt) return true;

  const last = new Date(streak.lastCompletedAt);
  const today = new Date();

  return last.toDateString() !== today.toDateString();
}

async function getMilestoneStreaks(
  store: EngagementStore,
  userId: string
): Promise<Array<StoredRitualStreak & { ritualName: string }>> {
  const milestones: Array<StoredRitualStreak & { ritualName: string }> = [];
  const milestoneThresholds = [7, 14, 21, 30, 60, 90, 100, 365];

  // Check all known ritual types
  for (const [ritualId, ritual] of Object.entries(PERSONA_RITUALS)) {
    const streak = await store.getRitualStreak(userId, ritualId);
    if (streak && milestoneThresholds.includes(streak.currentStreak)) {
      milestones.push({
        ...streak,
        ritualName: ritual.name,
      });
    }
  }

  return milestones;
}

async function getPendingPredictions(
  store: EngagementStore,
  userId: string
): Promise<StoredPrediction[]> {
  const predictions = await store.getRecentPredictions(userId, 10);

  // Filter to predictions that need resolution (7+ days old, not completed)
  const EXPIRY_DAYS = 7;
  const now = Date.now();
  const resolveThreshold = now - EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  return predictions.filter((p) => {
    // Not completed yet
    if (p.completedAt) return false;

    // Old enough to resolve
    const createdAt = new Date(p.createdAt).getTime();
    return createdAt < resolveThreshold;
  });
}

async function hasWeatherToday(store: EngagementStore, userId: string): Promise<boolean> {
  const history = await store.getWeatherHistory(userId, 1);
  if (history.length === 0) return false;

  const lastEntry = history[0];
  if (!lastEntry) return false;

  const last = new Date(lastEntry.date);
  const today = new Date();

  return last.toDateString() === today.toDateString();
}

// ============================================================================
// TRIGGER CREATORS
// ============================================================================

function createStreakDueTrigger(
  ritual: StoredRitualStreak & { ritualName: string },
  personaId: PersonaIdString
): ConversationTrigger {
  const templates = PERSONA_STREAK_TEMPLATES[personaId] || PERSONA_STREAK_TEMPLATES['ferni'];
  const template = templates[Math.floor(Math.random() * templates.length)];

  const message = template
    .replace('{count}', ritual.currentStreak.toString())
    .replace('{ritual}', ritual.ritualName);

  return {
    type: 'streak_due',
    personaId,
    priority: ritual.currentStreak >= 7 ? 'high' : 'medium',
    message,
    contextPrompt: `User has a ${ritual.currentStreak}-day streak on "${ritual.ritualName}" that is due today. Naturally mention this to encourage continuation.`,
    data: {
      ritualId: ritual.ritualId,
      ritualName: ritual.ritualName,
      currentStreak: ritual.currentStreak,
    },
  };
}

function createMilestoneTrigger(
  streak: StoredRitualStreak & { ritualName: string },
  personaId: PersonaIdString
): ConversationTrigger {
  const templates = PERSONA_MILESTONE_TEMPLATES[personaId] || PERSONA_MILESTONE_TEMPLATES['ferni'];
  const template = templates[Math.floor(Math.random() * templates.length)];

  const message = template
    .replace('{count}', streak.currentStreak.toString())
    .replace('{ritual}', streak.ritualName);

  return {
    type: 'streak_milestone',
    personaId,
    priority: 'high',
    message,
    contextPrompt: `User just hit a ${streak.currentStreak}-day milestone on "${streak.ritualName}". Celebrate this achievement warmly.`,
    data: {
      ritualId: streak.ritualId,
      ritualName: streak.ritualName,
      milestone: streak.currentStreak,
    },
  };
}

function createPredictionTrigger(
  prediction: StoredPrediction,
  personaId: PersonaIdString
): ConversationTrigger {
  const templates =
    PERSONA_PREDICTION_TEMPLATES[personaId] || PERSONA_PREDICTION_TEMPLATES['ferni'];
  const template = templates[Math.floor(Math.random() * templates.length)];

  // The StoredPrediction uses predictions map format, so we need to format differently
  const firstPrediction = Object.entries(prediction.predictions)[0];
  const question = firstPrediction ? firstPrediction[0] : 'your prediction';
  const userPredictionValue = firstPrediction ? firstPrediction[1] : 50;

  const message = template
    .replace('{question}', question)
    .replace('{prediction}', userPredictionValue.toString())
    .replace('{topic}', 'weekly prediction');

  return {
    type: 'prediction_result',
    personaId,
    priority: 'medium',
    message,
    contextPrompt: `User made a prediction about "${question}" (they said ${userPredictionValue}%). It's time to check the actual result.`,
    data: {
      predictionId: prediction.id,
      question,
      userPrediction: userPredictionValue,
    },
  };
}

function createWeatherCheckTrigger(personaId: PersonaIdString): ConversationTrigger {
  const templates: Record<string, string> = {
    ferni: "How's your inner weather today? Clear skies, some clouds, or something else?",
    'alex-chen': 'Quick check-in: how are you feeling today on a scale of sunny to stormy?',
    'maya-santos': "Let's do a quick emotional weather check! What's the forecast for today?",
    'jordan-taylor': "Where's your headspace at today? Sunny, cloudy, or somewhere in between?",
    'nayan-patel': 'What is the weather of your mind today? Clear, clouded, turbulent?',
    'peter-john': 'If you had to describe your current state as weather, what would it be?',
  };

  return {
    type: 'weather_check',
    personaId,
    priority: 'low',
    message: templates[personaId] || templates['ferni'],
    contextPrompt:
      "User hasn't logged their emotional weather today. Ask about it naturally during the conversation.",
  };
}

// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================

/**
 * Build engagement context for system prompt injection.
 */
export async function buildEngagementContextPrompt(
  userId: string,
  personaId: PersonaIdString
): Promise<string> {
  const context: TriggerContext = {
    userId,
    personaId,
    conversationStartTime: new Date(),
    minutesIntoConversation: 0,
    userProfile: {} as UserProfile, // Would be fetched
  };

  const triggers = await generateConversationTriggers(context);

  if (triggers.length === 0) {
    return '';
  }

  const highPriority = triggers.filter((t) => t.priority === 'high');
  const medPriority = triggers.filter((t) => t.priority === 'medium');

  let prompt = '\n\n## Engagement Opportunities\n';
  prompt +=
    'Natural opportunities to deepen engagement (use conversationally, not robotically):\n\n';

  if (highPriority.length > 0) {
    prompt += '**Important:**\n';
    for (const trigger of highPriority) {
      prompt += `- ${trigger.contextPrompt}\n`;
    }
  }

  if (medPriority.length > 0) {
    prompt += '\n**If relevant:**\n';
    for (const trigger of medPriority) {
      prompt += `- ${trigger.contextPrompt}\n`;
    }
  }

  prompt +=
    '\nRemember: These should feel natural, not forced. Weave them into conversation when appropriate.';

  return prompt;
}
