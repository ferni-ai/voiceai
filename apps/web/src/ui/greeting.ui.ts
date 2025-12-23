/**
 * Greeting UI - Personalized, time-aware welcome messages
 * 
 * Apple-inspired design: Minimal, confident, no emojis.
 * Clean typography carries the message.
 */

import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

interface UserHistory {
  lastVisit: number;
  visitCount: number;
  streak: number;
  lastStreakDate: string;
  conversationCount: number;
  favoritePersona: string | null;
}

// ============================================================================
// STATE
// ============================================================================

const STORAGE_KEY = 'voiceai_user_history';

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Get a personalized greeting based on time and user history.
 */
export function getPersonalizedGreeting(): string {
  const history = getHistory();
  const hour = new Date().getHours();
  const timeGreeting = getTimeGreeting(hour);
  
  // First time visitor
  if (history.visitCount <= 1) {
    return getFirstTimeGreeting(timeGreeting);
  }
  
  // Check for streak
  updateStreak(history);
  
  // Returning visitor
  return getReturningGreeting(timeGreeting, history);
}

/**
 * Get time-based greeting.
 */
function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return t('greetings.goodMorning');
  if (hour >= 12 && hour < 17) return t('greetings.goodAfternoon');
  if (hour >= 17 && hour < 21) return t('greetings.goodEvening');
  return t('greetings.workingLate');
}

/**
 * Get greeting for first-time visitors.
 * Apple-style: Simple, confident, action-oriented.
 */
function getFirstTimeGreeting(timeGreeting: string): string {
  const greetings = [
    `${timeGreeting}. ${t('greetings.letsGetStarted')}`,
    `${timeGreeting}. ${t('greetings.yourTeamIsReady')}`,
    `${timeGreeting}. ${t('greetings.hereToHelp')}`,
    `${t('greetings.welcome')} ${t('greetings.letsBegin')}`,
  ];
  const selected = greetings[Math.floor(Math.random() * greetings.length)];
  return selected ?? `${timeGreeting}.`;
}

/**
 * Get greeting for returning visitors.
 * Apple-style: Understated, personal, no emoji clutter.
 */
function getReturningGreeting(timeGreeting: string, history: UserHistory): string {
  const daysSinceVisit = getDaysSinceLastVisit(history.lastVisit);
  
  // Same day return
  if (daysSinceVisit === 0) {
    const sameDay = [
      t('greetings.welcomeBack'),
      t('greetings.readyWhenYouAre'),
      t('greetings.letsContinue'),
    ];
    const selected = sameDay[Math.floor(Math.random() * sameDay.length)];
    return selected ?? `${timeGreeting}.`;
  }
  
  // Streak celebration - subtle, no emoji
  if (history.streak >= 7) {
    return t('greetings.streakImpressive', { days: history.streak });
  }
  if (history.streak >= 3) {
    return t('greetings.streakNice', { days: history.streak });
  }
  
  // Been away for a while
  if (daysSinceVisit >= 7) {
    return `${timeGreeting}. ${t('greetings.goodToSeeYou')}`;
  }
  
  // Regular return
  const regular = [
    `${timeGreeting}.`,
    t('greetings.welcomeBack'),
    t('greetings.readyToGo'),
  ];
  const selected = regular[Math.floor(Math.random() * regular.length)];
  return selected ?? `${timeGreeting}.`;
}

// ============================================================================
// STREAK MANAGEMENT
// ============================================================================

/**
 * Update user's streak.
 */
function updateStreak(history: UserHistory): void {
  const today = new Date().toDateString();
  const lastDate = history.lastStreakDate;
  
  if (lastDate === today) {
    // Already visited today
    return;
  }
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (lastDate === yesterday.toDateString()) {
    // Consecutive day - increment streak
    history.streak += 1;
  } else {
    // Streak broken - reset
    history.streak = 1;
  }
  
  history.lastStreakDate = today;
  saveHistory(history);
}

/**
 * Get current streak.
 */
export function getStreak(): number {
  const history = getHistory();
  return history.streak;
}

/**
 * Check if user earned a new streak milestone.
 */
export function checkStreakMilestone(): number | null {
  const streak = getStreak();
  const milestones = [3, 7, 14, 30, 60, 100];
  
  if (milestones.includes(streak)) {
    return streak;
  }
  return null;
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

/**
 * Get user history from storage.
 */
function getHistory(): UserHistory {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UserHistory;
    }
  } catch {
    // Storage error - return default
  }
  
  return createDefaultHistory();
}

/**
 * Create default history for new users.
 */
function createDefaultHistory(): UserHistory {
  const history: UserHistory = {
    lastVisit: Date.now(),
    visitCount: 1,
    streak: 1,
    lastStreakDate: new Date().toDateString(),
    conversationCount: 0,
    favoritePersona: null,
  };
  
  saveHistory(history);
  return history;
}

/**
 * Save history to storage.
 */
function saveHistory(history: UserHistory): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage error - ignore
  }
}

/**
 * Record a visit.
 */
export function recordVisit(): void {
  const history = getHistory();
  history.visitCount += 1;
  history.lastVisit = Date.now();
  updateStreak(history);
  saveHistory(history);
}

/**
 * Record a conversation.
 */
export function recordConversation(): void {
  const history = getHistory();
  history.conversationCount += 1;
  saveHistory(history);
}

/**
 * Set favorite persona.
 */
export function setFavoritePersona(personaId: string): void {
  const history = getHistory();
  history.favoritePersona = personaId;
  saveHistory(history);
}

/**
 * Get conversation count.
 */
export function getConversationCount(): number {
  return getHistory().conversationCount;
}

/**
 * Get visit count.
 */
export function getVisitCount(): number {
  return getHistory().visitCount;
}

// ============================================================================
// HELPERS
// ============================================================================

function getDaysSinceLastVisit(lastVisit: number): number {
  const now = new Date();
  const last = new Date(lastVisit);
  const diffTime = Math.abs(now.getTime() - last.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// ============================================================================
// MILESTONE MESSAGES
// ============================================================================

/**
 * Get a milestone celebration message.
 * Apple-style: Numbers speak for themselves. No emoji clutter.
 */
export function getMilestoneMessage(type: string, value: number): string {
  switch (type) {
    case 'streak':
      if (value === 3) return t('greetings.milestones.streak3');
      if (value === 7) return t('greetings.milestones.streak7');
      if (value === 14) return t('greetings.milestones.streak14');
      if (value === 30) return t('greetings.milestones.streak30');
      if (value === 60) return t('greetings.milestones.streak60');
      if (value === 100) return t('greetings.milestones.streak100');
      return t('greetings.streakNice', { days: value });
      
    case 'conversations':
      if (value === 5) return t('greetings.milestones.conversations5');
      if (value === 10) return t('greetings.milestones.conversations10');
      if (value === 25) return t('greetings.milestones.conversations25');
      if (value === 50) return t('greetings.milestones.conversations50');
      if (value === 100) return t('greetings.milestones.conversations100');
      return `${value} conversations.`;
      
    case 'visits':
      if (value === 10) return t('greetings.milestones.visits10');
      if (value === 50) return t('greetings.milestones.visits50');
      if (value === 100) return t('greetings.milestones.visits100');
      return `${value} visits.`;
      
    default:
      return t('greetings.milestones.milestoneReached');
  }
}

// ============================================================================
// EVENT-DRIVEN CONVERSATION TRACKING
// ============================================================================

let isEventListenerSetup = false;

/**
 * Initialize greeting UI with event listeners.
 * Automatically tracks conversations via ferni:conversation-start event.
 */
export function initGreetingUI(): void {
  if (isEventListenerSetup) return;
  isEventListenerSetup = true;

  window.addEventListener('ferni:conversation-start', () => {
    recordConversation();
  });
}

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  initGreetingUI();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const greetingUI = {
  getGreeting: getPersonalizedGreeting,
  getStreak,
  checkStreakMilestone,
  recordVisit,
  recordConversation,
  setFavoritePersona,
  getConversationCount,
  getVisitCount,
  getMilestoneMessage,
  init: initGreetingUI,
};
