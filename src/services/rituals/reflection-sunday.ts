/**
 * Reflection Sunday System
 * 
 * The flagship weekly ritual - every Sunday, an invitation to deeper reflection.
 * This becomes a cultural touchpoint that exists beyond just using the product.
 * 
 * Features:
 * - Weekly prompt rotation (52 prompts)
 * - Community participation tracking
 * - Multi-channel delivery (app, Discord, social)
 * - Streak tracking for participation
 * 
 * @module services/rituals/reflection-sunday
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ReflectionSunday' });

// ============================================================================
// TYPES
// ============================================================================

export interface ReflectionPrompt {
  id: string;
  category: 'self' | 'relationships' | 'growth' | 'meaning' | 'gratitude';
  prompt: string;
  followUp?: string;
  weekNumber: number; // 1-52
}

export interface UserReflectionState {
  userId: string;
  reflectionsSundays: ReflectionParticipation[];
  currentStreak: number;
  longestStreak: number;
  totalParticipations: number;
}

export interface ReflectionParticipation {
  date: Date;
  promptId: string;
  participated: boolean;
  reflectionSummary?: string;
  sharedPublicly: boolean;
}

// ============================================================================
// 52 WEEKLY PROMPTS (One Year Cycle)
// ============================================================================

const REFLECTION_PROMPTS: ReflectionPrompt[] = [
  // SELF (Weeks 1-12)
  { id: 'self-1', category: 'self', prompt: 'What surprised you about yourself this week?', weekNumber: 1 },
  { id: 'self-2', category: 'self', prompt: 'When did you feel most like yourself?', weekNumber: 2 },
  { id: 'self-3', category: 'self', prompt: 'What did you learn that you didn\'t expect?', weekNumber: 3 },
  { id: 'self-4', category: 'self', prompt: 'What are you avoiding? What would happen if you faced it?', weekNumber: 4 },
  { id: 'self-5', category: 'self', prompt: 'What pattern do you keep repeating?', weekNumber: 5 },
  { id: 'self-6', category: 'self', prompt: 'What would your 10-year-old self think of who you\'ve become?', weekNumber: 6 },
  { id: 'self-7', category: 'self', prompt: 'What boundary do you need to set—or honor?', weekNumber: 7 },
  { id: 'self-8', category: 'self', prompt: 'What are you pretending not to know?', weekNumber: 8 },
  { id: 'self-9', category: 'self', prompt: 'What would you do if you weren\'t afraid?', weekNumber: 9 },
  { id: 'self-10', category: 'self', prompt: 'What does your body need right now?', weekNumber: 10 },
  { id: 'self-11', category: 'self', prompt: 'What story are you telling yourself that might not be true?', weekNumber: 11 },
  { id: 'self-12', category: 'self', prompt: 'What are you holding onto that no longer serves you?', weekNumber: 12 },
  
  // RELATIONSHIPS (Weeks 13-22)
  { id: 'rel-1', category: 'relationships', prompt: 'Who showed up for you this week?', weekNumber: 13 },
  { id: 'rel-2', category: 'relationships', prompt: 'Where did you show up for someone else?', weekNumber: 14 },
  { id: 'rel-3', category: 'relationships', prompt: 'What conversation are you avoiding?', weekNumber: 15 },
  { id: 'rel-4', category: 'relationships', prompt: 'Who in your life deserves more of your attention?', weekNumber: 16 },
  { id: 'rel-5', category: 'relationships', prompt: 'What relationship needs repair?', weekNumber: 17 },
  { id: 'rel-6', category: 'relationships', prompt: 'Who has surprised you recently?', weekNumber: 18 },
  { id: 'rel-7', category: 'relationships', prompt: 'What do you wish someone understood about you?', weekNumber: 19 },
  { id: 'rel-8', category: 'relationships', prompt: 'Who do you need to forgive? (Maybe yourself?)', weekNumber: 20 },
  { id: 'rel-9', category: 'relationships', prompt: 'What connection are you neglecting?', weekNumber: 21 },
  { id: 'rel-10', category: 'relationships', prompt: 'Who has been your teacher lately—even if they don\'t know it?', weekNumber: 22 },
  
  // GROWTH (Weeks 23-34)
  { id: 'growth-1', category: 'growth', prompt: 'What progress did you make, even if small?', weekNumber: 23 },
  { id: 'growth-2', category: 'growth', prompt: 'What did you try that didn\'t work? What did you learn?', weekNumber: 24 },
  { id: 'growth-3', category: 'growth', prompt: 'What are you proud of that no one else knows?', weekNumber: 25 },
  { id: 'growth-4', category: 'growth', prompt: 'What skill are you avoiding developing? Why?', weekNumber: 26 },
  { id: 'growth-5', category: 'growth', prompt: 'What would make next week better than this one?', weekNumber: 27 },
  { id: 'growth-6', category: 'growth', prompt: 'What habit is ready to become automatic?', weekNumber: 28 },
  { id: 'growth-7', category: 'growth', prompt: 'Where are you settling? Where could you stretch?', weekNumber: 29 },
  { id: 'growth-8', category: 'growth', prompt: 'What\'s the next right step?', weekNumber: 30 },
  { id: 'growth-9', category: 'growth', prompt: 'What challenge are you grateful for in hindsight?', weekNumber: 31 },
  { id: 'growth-10', category: 'growth', prompt: 'What would \'leveling up\' look like for you right now?', weekNumber: 32 },
  { id: 'growth-11', category: 'growth', prompt: 'What are you becoming?', weekNumber: 33 },
  { id: 'growth-12', category: 'growth', prompt: 'What\'s the difference between who you are and who you want to be?', weekNumber: 34 },
  
  // MEANING (Weeks 35-44)
  { id: 'meaning-1', category: 'meaning', prompt: 'What gave you energy this week?', weekNumber: 35 },
  { id: 'meaning-2', category: 'meaning', prompt: 'What drained you? Why?', weekNumber: 36 },
  { id: 'meaning-3', category: 'meaning', prompt: 'What matters more than it used to?', weekNumber: 37 },
  { id: 'meaning-4', category: 'meaning', prompt: 'If you had to give a TED talk tomorrow, what would it be about?', weekNumber: 38 },
  { id: 'meaning-5', category: 'meaning', prompt: 'What would you regret not doing?', weekNumber: 39 },
  { id: 'meaning-6', category: 'meaning', prompt: 'What does success actually look like for you?', weekNumber: 40 },
  { id: 'meaning-7', category: 'meaning', prompt: 'What brings you alive?', weekNumber: 41 },
  { id: 'meaning-8', category: 'meaning', prompt: 'What are you building?', weekNumber: 42 },
  { id: 'meaning-9', category: 'meaning', prompt: 'What legacy are you creating—even in small ways?', weekNumber: 43 },
  { id: 'meaning-10', category: 'meaning', prompt: 'What would you do if you knew you couldn\'t fail?', weekNumber: 44 },
  
  // GRATITUDE (Weeks 45-52)
  { id: 'grat-1', category: 'gratitude', prompt: 'What are you grateful for that you usually take for granted?', weekNumber: 45 },
  { id: 'grat-2', category: 'gratitude', prompt: 'What small moment brought you joy this week?', weekNumber: 46 },
  { id: 'grat-3', category: 'gratitude', prompt: 'What struggle are you grateful for?', weekNumber: 47 },
  { id: 'grat-4', category: 'gratitude', prompt: 'Who deserves your thanks?', weekNumber: 48 },
  { id: 'grat-5', category: 'gratitude', prompt: 'What about this season of life will you miss someday?', weekNumber: 49 },
  { id: 'grat-6', category: 'gratitude', prompt: 'What simple pleasure did you enjoy this week?', weekNumber: 50 },
  { id: 'grat-7', category: 'gratitude', prompt: 'What\'s right in your life right now?', weekNumber: 51 },
  { id: 'grat-8', category: 'gratitude', prompt: 'How have you grown this year?', weekNumber: 52 },
];

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const userStates = new Map<string, UserReflectionState>();

function getUserState(userId: string): UserReflectionState {
  let state = userStates.get(userId);
  if (!state) {
    state = {
      userId,
      reflectionsSundays: [],
      currentStreak: 0,
      longestStreak: 0,
      totalParticipations: 0,
    };
    userStates.set(userId, state);
  }
  return state;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get the current week number (1-52)
 */
export function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil(days / 7);
}

/**
 * Check if today is Sunday
 */
export function isSunday(date: Date = new Date()): boolean {
  return date.getDay() === 0;
}

/**
 * Get this week's reflection prompt
 */
export function getWeeklyPrompt(): ReflectionPrompt {
  const weekNumber = getCurrentWeekNumber();
  const prompt = REFLECTION_PROMPTS.find(p => p.weekNumber === weekNumber);
  return prompt ?? REFLECTION_PROMPTS[0];
}

/**
 * Get a prompt by ID
 */
export function getPromptById(promptId: string): ReflectionPrompt | undefined {
  return REFLECTION_PROMPTS.find(p => p.id === promptId);
}

/**
 * Record a user's participation in Reflection Sunday
 */
export function recordParticipation(
  userId: string,
  promptId: string,
  reflectionSummary?: string,
  sharedPublicly: boolean = false
): void {
  const state = getUserState(userId);
  
  const participation: ReflectionParticipation = {
    date: new Date(),
    promptId,
    participated: true,
    reflectionSummary,
    sharedPublicly,
  };
  
  state.reflectionsSundays.push(participation);
  state.totalParticipations++;
  
  // Update streak
  state.currentStreak++;
  if (state.currentStreak > state.longestStreak) {
    state.longestStreak = state.currentStreak;
  }
  
  log.info({ userId, promptId, streak: state.currentStreak }, '🌿 Reflection Sunday participation recorded');
}

/**
 * Break user's streak (if they miss a Sunday)
 */
export function checkAndResetStreak(userId: string): void {
  const state = getUserState(userId);
  
  if (state.reflectionsSundays.length === 0) return;
  
  const lastParticipation = state.reflectionsSundays[state.reflectionsSundays.length - 1];
  const daysSinceLastParticipation = Math.floor(
    (Date.now() - lastParticipation.date.getTime()) / (24 * 60 * 60 * 1000)
  );
  
  // If more than 7 days since last participation, reset streak
  if (daysSinceLastParticipation > 7) {
    state.currentStreak = 0;
  }
}

/**
 * Get user's reflection stats
 */
export function getUserStats(userId: string): {
  currentStreak: number;
  longestStreak: number;
  totalParticipations: number;
  participationRate: number;
} {
  const state = getUserState(userId);
  
  // Calculate participation rate
  const weeksSinceStart = state.reflectionsSundays.length > 0
    ? Math.ceil((Date.now() - state.reflectionsSundays[0].date.getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0;
  
  const participationRate = weeksSinceStart > 0
    ? state.totalParticipations / weeksSinceStart
    : 0;
  
  return {
    currentStreak: state.currentStreak,
    longestStreak: state.longestStreak,
    totalParticipations: state.totalParticipations,
    participationRate,
  };
}

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

/**
 * Get the in-app notification message for Reflection Sunday
 */
export function getInAppMessage(prompt: ReflectionPrompt): string {
  return `It's Reflection Sunday. 🌿

This week's prompt:
"${prompt.prompt}"

Take as much time as you need.
Share in the community if you'd like.
Or just sit with it quietly.

I'm here if you want to talk.`;
}

/**
 * Get the Discord message for Reflection Sunday
 */
export function getDiscordMessage(prompt: ReflectionPrompt): string {
  return `🌿 **Reflection Sunday**

This week's prompt:
> ${prompt.prompt}

Share your reflection below.
Read others.
We grow together.`;
}

/**
 * Get the social media message for Reflection Sunday
 */
export function getSocialMessage(prompt: ReflectionPrompt): string {
  return `🌿 It's Reflection Sunday.

"${prompt.prompt}"

Take a moment.
You don't have to answer anyone but yourself.

#ReflectionSunday #Ferni`;
}

/**
 * Get the email subject for Reflection Sunday
 */
export function getEmailSubject(): string {
  return 'It\'s Reflection Sunday 🌿';
}

/**
 * Get the email body for Reflection Sunday
 */
export function getEmailBody(prompt: ReflectionPrompt, userName?: string): string {
  const greeting = userName ? `Hey ${userName},` : 'Hey,';
  
  return `${greeting}

It's Reflection Sunday—our weekly moment to pause.

This week's prompt:

"${prompt.prompt}"

You don't need to respond to anyone. Just sit with it for a moment.

If something comes up that you want to explore, I'm here.

Take care,
Ferni

---
🌿 #ReflectionSunday
`;
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

/**
 * Format Reflection Sunday context for prompt injection
 */
export function formatReflectionSundayForPrompt(userId: string): string | null {
  if (!isSunday()) {
    return null;
  }
  
  const prompt = getWeeklyPrompt();
  const stats = getUserStats(userId);
  
  const lines = [
    '[🌿 REFLECTION SUNDAY]',
    '',
    `This week's prompt: "${prompt.prompt}"`,
    `Category: ${prompt.category}`,
  ];
  
  if (stats.currentStreak > 0) {
    lines.push(`User's streak: ${stats.currentStreak} weeks`);
  }
  
  lines.push('');
  lines.push('If the conversation feels right, gently introduce this prompt.');
  lines.push('Don\'t force it—let it arise naturally.');
  lines.push('If they engage, go deep. If not, respect their pace.');
  
  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getCurrentWeekNumber,
  isSunday,
  getWeeklyPrompt,
  getPromptById,
  recordParticipation,
  checkAndResetStreak,
  getUserStats,
  getInAppMessage,
  getDiscordMessage,
  getSocialMessage,
  getEmailSubject,
  getEmailBody,
  formatReflectionSundayForPrompt,
  REFLECTION_PROMPTS,
};
