/**
 * Ferni Milestones - Warm Achievement & Relationship Celebrations
 *
 * Unlike typical gamified achievements, these are genuine moments
 * of connection that celebrate the relationship, not the click.
 *
 * DESIGN PRINCIPLES:
 * - Feels like Ferni noticing and appreciating you
 * - Warm, personal language (never "Achievement Unlocked!")
 * - Subtle but meaningful animations
 * - Respects the moment - doesn't interrupt important conversations
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { isNoStreaksOn } from '../config/no-streaks.js';
import { outreachService } from '../services/outreach.service.js';
import { showNotification } from '../services/push-notifications.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { haptics } from '../utils/haptics.js';
import { celebrationsUI } from './celebrations.ui.js';
import { ferniMoments } from './ferni-moments.ui.js';
import * as placement from './milestone-placement.js';
import { soundUI } from './sound.ui.js';
import { isToastRegionEnabled } from './overlay/toast-flag.js';
import { showToast } from './overlay/toast-region.js';
import { getCategoryIcon } from './ferni-milestone-icons.js';

const log = createLogger('FerniMilestones');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

/** Valid milestone IDs for triggering celebrations */
export type MilestoneType =
  | 'first-hello'
  | 'week-together'
  | 'month-of-growth'
  | 'one-year'
  | 'welcome-back'
  | 'streak-7'
  | 'streak-30'
  | 'full-circle'
  | 'found-your-person'
  | 'team-player'
  | 'hundred-conversations'
  | 'explorer'
  | 'secret-keeper'
  | 'theme-seeker'
  | 'gratitude'
  | 'celebration'
  | 'brave'
  | 'consistent'
  // Persona bonds
  | 'ferni-bond'
  | 'peter-scholar'
  | 'alex-wordsmith'
  | 'maya-builder'
  | 'jordan-planner'
  | 'nayan-sage'
  // Time & seasons
  | 'three-month'
  | 'six-month'
  | 'fifty-talks';

interface Milestone {
  id: MilestoneType;
  category: 'relationship' | 'team' | 'conversation' | 'discovery' | 'sweet';
  name: string;
  // Ferni's warm message when this milestone happens
  message: string;
  // Optional subtitle for context
  subtitle?: string;
  // Has this milestone been celebrated?
  celebrated: boolean;
  celebratedAt?: number;
  outreachDone?: boolean; // the server answered sent or already-sent; until then it retries
  // Progress tracking (for multi-step milestones)
  progress?: number;
  target?: number;
  /** Emoji/icon for the milestone type */
  emoji?: string;
  /** Persona who celebrated with the user */
  personaId?: string;
}

interface MilestoneProgress {
  // Relationship tracking
  firstConversation?: boolean;
  conversationDays: string[]; // ISO date strings
  longestStreak: number;
  currentStreak: number;
  lastConversationDate?: string;

  // Team tracking
  personasUsed: Set<string>;
  personaConversations: Record<string, number>;
  naturalHandoffs: number;

  // Conversation tracking
  totalConversations: number;

  // Discovery tracking
  easterEggsFound: Set<string>;
  themesUsed: Set<string>;

  // Sweet moments
  thankYouCount: number;
  celebrationsShared: number;
  vulnerableMoments: number;
}

// ============================================================================
// MILESTONE DEFINITIONS - Ferni's warm voice
// ============================================================================

const MILESTONES: Milestone[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIP MILESTONES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'first-hello',
    category: 'relationship',
    name: 'ferniMilestones.firstHello.name',
    message: 'ferniMilestones.firstHello.message',
    subtitle: 'ferniMilestones.firstHello.subtitle',
    celebrated: false,
  },
  {
    id: 'week-together',
    category: 'relationship',
    name: 'ferniMilestones.weekTogether.name',
    message: 'ferniMilestones.weekTogether.message',
    subtitle: 'ferniMilestones.weekTogether.subtitle',
    celebrated: false,
    progress: 0,
    target: 7,
  },
  {
    id: 'month-of-growth',
    category: 'relationship',
    name: 'ferniMilestones.monthOfGrowth.name',
    message: 'ferniMilestones.monthOfGrowth.message',
    subtitle: 'ferniMilestones.monthOfGrowth.subtitle',
    celebrated: false,
    progress: 0,
    target: 30,
  },
  {
    id: 'one-year',
    category: 'relationship',
    name: 'ferniMilestones.oneYear.name',
    message: 'ferniMilestones.oneYear.message',
    subtitle: 'ferniMilestones.oneYear.subtitle',
    celebrated: false,
    progress: 0,
    target: 365,
  },
  {
    id: 'welcome-back',
    category: 'relationship',
    name: 'ferniMilestones.welcomeBack.name',
    message: 'ferniMilestones.welcomeBack.message',
    subtitle: 'ferniMilestones.welcomeBack.subtitle',
    celebrated: false,
  },
  {
    id: 'streak-7',
    category: 'relationship',
    name: 'ferniMilestones.streak7.name',
    message: 'ferniMilestones.streak7.message',
    subtitle: 'ferniMilestones.streak7.subtitle',
    celebrated: false,
  },
  {
    id: 'streak-30',
    category: 'relationship',
    name: 'ferniMilestones.streak30.name',
    message: 'ferniMilestones.streak30.message',
    subtitle: 'ferniMilestones.streak30.subtitle',
    celebrated: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'full-circle',
    category: 'team',
    name: 'ferniMilestones.fullCircle.name',
    message: 'ferniMilestones.fullCircle.message',
    subtitle: 'ferniMilestones.fullCircle.subtitle',
    celebrated: false,
    progress: 0,
    target: 6,
  },
  {
    id: 'found-your-person',
    category: 'team',
    name: 'ferniMilestones.foundYourPerson.name',
    message: 'ferniMilestones.foundYourPerson.message',
    subtitle: 'ferniMilestones.foundYourPerson.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'team-player',
    category: 'team',
    name: 'ferniMilestones.teamPlayer.name',
    message: 'ferniMilestones.teamPlayer.message',
    subtitle: 'ferniMilestones.teamPlayer.subtitle',
    celebrated: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION DEPTH
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'hundred-conversations',
    category: 'conversation',
    name: 'ferniMilestones.hundredConversations.name',
    message: 'ferniMilestones.hundredConversations.message',
    subtitle: 'ferniMilestones.hundredConversations.subtitle',
    celebrated: false,
    progress: 0,
    target: 100,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIDDEN DISCOVERIES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'explorer',
    category: 'discovery',
    name: 'ferniMilestones.explorer.name',
    message: 'ferniMilestones.explorer.message',
    subtitle: 'ferniMilestones.explorer.subtitle',
    celebrated: false,
    progress: 0,
    target: 5,
  },
  {
    id: 'secret-keeper',
    category: 'discovery',
    name: 'ferniMilestones.secretKeeper.name',
    message: 'ferniMilestones.secretKeeper.message',
    subtitle: 'ferniMilestones.secretKeeper.subtitle',
    celebrated: false,
    progress: 0,
    target: 12,
  },
  {
    id: 'theme-seeker',
    category: 'discovery',
    name: 'ferniMilestones.themeSeeker.name',
    message: 'ferniMilestones.themeSeeker.message',
    subtitle: 'ferniMilestones.themeSeeker.subtitle',
    celebrated: false,
    progress: 0,
    target: 3,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SWEET MOMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gratitude',
    category: 'sweet',
    name: 'ferniMilestones.gratitude.name',
    message: 'ferniMilestones.gratitude.message',
    subtitle: 'ferniMilestones.gratitude.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'celebration',
    category: 'sweet',
    name: 'ferniMilestones.celebration.name',
    message: 'ferniMilestones.celebration.message',
    subtitle: 'ferniMilestones.celebration.subtitle',
    celebrated: false,
  },
  {
    id: 'brave',
    category: 'sweet',
    name: 'ferniMilestones.brave.name',
    message: 'ferniMilestones.brave.message',
    subtitle: 'ferniMilestones.brave.subtitle',
    celebrated: false,
  },
  {
    id: 'consistent',
    category: 'sweet',
    name: 'ferniMilestones.consistent.name',
    message: 'ferniMilestones.consistent.message',
    subtitle: 'ferniMilestones.consistent.subtitle',
    celebrated: false,
    progress: 0,
    target: 20,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA CONNECTIONS - Better than human: we notice which minds you connect with
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ferni-bond',
    category: 'team',
    name: 'ferniMilestones.ferniBond.name',
    message: 'ferniMilestones.ferniBond.message',
    subtitle: 'ferniMilestones.ferniBond.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'peter-scholar',
    category: 'team',
    name: 'ferniMilestones.peterScholar.name',
    message: 'ferniMilestones.peterScholar.message',
    subtitle: 'ferniMilestones.peterScholar.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'alex-wordsmith',
    category: 'team',
    name: 'ferniMilestones.alexWordsmith.name',
    message: 'ferniMilestones.alexWordsmith.message',
    subtitle: 'ferniMilestones.alexWordsmith.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'maya-builder',
    category: 'team',
    name: 'ferniMilestones.mayaBuilder.name',
    message: 'ferniMilestones.mayaBuilder.message',
    subtitle: 'ferniMilestones.mayaBuilder.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'jordan-planner',
    category: 'team',
    name: 'ferniMilestones.jordanPlanner.name',
    message: 'ferniMilestones.jordanPlanner.message',
    subtitle: 'ferniMilestones.jordanPlanner.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'nayan-sage',
    category: 'team',
    name: 'ferniMilestones.nayanSage.name',
    message: 'ferniMilestones.nayanSage.message',
    subtitle: 'ferniMilestones.nayanSage.subtitle',
    celebrated: false,
    progress: 0,
    target: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME & SEASONS - Better than human: we remember every moment
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'three-month',
    category: 'relationship',
    name: 'ferniMilestones.threeMonth.name',
    message: 'ferniMilestones.threeMonth.message',
    subtitle: 'ferniMilestones.threeMonth.subtitle',
    celebrated: false,
    progress: 0,
    target: 90,
  },
  {
    id: 'six-month',
    category: 'relationship',
    name: 'ferniMilestones.sixMonth.name',
    message: 'ferniMilestones.sixMonth.message',
    subtitle: 'ferniMilestones.sixMonth.subtitle',
    celebrated: false,
    progress: 0,
    target: 180,
  },
  {
    id: 'fifty-talks',
    category: 'conversation',
    name: 'ferniMilestones.fiftyTalks.name',
    message: 'ferniMilestones.fiftyTalks.message',
    subtitle: 'ferniMilestones.fiftyTalks.subtitle',
    celebrated: false,
    progress: 0,
    target: 50,
  },
];

// ============================================================================
// STATE
// ============================================================================

let milestones: Milestone[] = [];
let progress: MilestoneProgress = {
  conversationDays: [],
  longestStreak: 0,
  currentStreak: 0,
  personasUsed: new Set(),
  personaConversations: {},
  naturalHandoffs: 0,
  totalConversations: 0,
  easterEggsFound: new Set(),
  themesUsed: new Set(),
  thankYouCount: 0,
  celebrationsShared: 0,
  vulnerableMoments: 0,
};

let isInitialized = false;
const celebrationQueue: Milestone[] = [];
let isCelebrating = false;

// ============================================================================
// HMR CLEANUP - Required per brand guidelines
// ============================================================================

/**
 * Clean up any orphaned elements from HMR reloads
 */
function cleanupOrphanedElements(): void {
  document.querySelectorAll('.ferni-milestone-toast').forEach((el) => el.remove());
  document.querySelectorAll('.ferni-milestone-celebration').forEach((el) => el.remove());
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initFerniMilestones(): void {
  if (isInitialized) return;

  // HMR cleanup first
  cleanupOrphanedElements();

  // Load saved state
  loadState();

  setupEventListeners();

  isInitialized = true;
  log.info('Ferni Milestones initialized');
}

function setupEventListeners(): void {
  // Track conversation starts
  window.addEventListener('ferni:connection-state', ((e: CustomEvent) => {
    placement.noteConnectionState(e.detail?.state);
    if (e.detail?.state === 'connected') {
      trackConversationStart();
    }
  }) as EventListener);

  // Track conversation ends (for duration)
  window.addEventListener('ferni:conversation-end', ((e: CustomEvent) => {
    const duration = e.detail?.durationMinutes || 0;
    trackConversationEnd(duration);
  }) as EventListener);

  // Track persona changes
  window.addEventListener('ferni:switch-persona', ((e: CustomEvent) => {
    const personaId = e.detail?.personaId || e.detail?.persona;
    if (personaId) {
      trackPersonaUse(personaId);
    }
  }) as EventListener);

  // Track handoffs
  window.addEventListener('ferni:handoff-complete', (() => {
    trackNaturalHandoff();
  }) as EventListener);

  // Track theme changes (theme system dispatches 'themechange')
  window.addEventListener('themechange', ((e: CustomEvent) => {
    const theme = e.detail?.theme;
    if (theme) {
      trackThemeUse(theme);
    }
  }) as EventListener);

  // Track transcript for sweet moments
  window.addEventListener('ferni:transcript', ((e: CustomEvent) => {
    const { type, text, isFinal } = e.detail ?? {};
    if (type === 'user' && isFinal && typeof text === 'string' && text) {
      analyzeTranscript(text);
    }
  }) as EventListener);

  // Track easter eggs from the easter eggs system
  window.addEventListener('ferni:achievement-unlocked', ((e: CustomEvent) => {
    const id = e.detail?.id;
    if (id) {
      trackEasterEgg(id);
    }
  }) as EventListener);
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

function trackConversationStart(): void {
  // Email/SMS the server hasn't confirmed yet (e.g. it said not-reached on the call that crossed
  // the threshold) gets another try, for a week; older ones are never re-sent from here
  milestones
    .filter((m) => m.celebrated && !m.outreachDone && Date.now() - (m.celebratedAt ?? 0) < 7 * 864e5)
    .forEach(sendMilestoneOutreach);
  const now = new Date();
  const today = now.toISOString().split('T')[0] ?? '';

  // First conversation ever? - This is special!
  if (!progress.firstConversation) {
    progress.firstConversation = true;
    // First-hello gets special treatment (handled in celebration display)
    checkAndCelebrate('first-hello');
  }

  // Track conversation days
  if (today && !progress.conversationDays.includes(today)) {
    progress.conversationDays.push(today);
    updateStreaks();
  }

  // No milestones for when or how long someone talks: Ferni doesn't comment on
  // the hour, the weekday or the length of a call.
  progress.totalConversations++;

  // Check conversation count milestones
  updateMilestoneProgress('fifty-talks', progress.totalConversations);
  updateMilestoneProgress('hundred-conversations', progress.totalConversations);

  // Welcome back check (7+ days since last conversation)
  if (progress.lastConversationDate) {
    const lastDate = new Date(progress.lastConversationDate);
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 7) {
      checkAndCelebrate('welcome-back');
    }
  }

  progress.lastConversationDate = today;
  saveState();
}

function trackConversationEnd(_durationMinutes: number): void {
  // Consistent check-ins
  updateMilestoneProgress('consistent', progress.totalConversations);

  saveState();
}

function updateStreaks(): void {
  const days = progress.conversationDays.sort();
  let streak = 1;
  let maxStreak = 1;

  for (let i = days.length - 1; i > 0; i--) {
    const currentDay = days[i];
    const previousDay = days[i - 1];
    if (!currentDay || !previousDay) continue;

    const current = new Date(currentDay);
    const previous = new Date(previousDay);
    const diffDays = Math.floor((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      break;
    }
  }

  progress.currentStreak = streak;
  progress.longestStreak = Math.max(progress.longestStreak, streak);

  if (!isNoStreaksOn() && streak >= 7) checkAndCelebrate('streak-7'); // off under VITE_NO_STREAKS
  if (!isNoStreaksOn() && streak >= 30) checkAndCelebrate('streak-30');

  // Check total days - tracking every milestone of our relationship
  const totalDays = progress.conversationDays.length;
  updateMilestoneProgress('week-together', totalDays);
  updateMilestoneProgress('month-of-growth', totalDays);
  updateMilestoneProgress('three-month', totalDays);
  updateMilestoneProgress('six-month', totalDays);
  updateMilestoneProgress('one-year', totalDays);
}

function trackPersonaUse(personaId: string): void {
  progress.personasUsed.add(personaId);

  // Track conversations per persona
  progress.personaConversations[personaId] = (progress.personaConversations[personaId] || 0) + 1;
  const personaCount = progress.personaConversations[personaId] ?? 0;

  // Full circle - all personas
  updateMilestoneProgress('full-circle', progress.personasUsed.size);

  // Found your person - 10+ with one persona
  const maxConversations = Math.max(...Object.values(progress.personaConversations));
  updateMilestoneProgress('found-your-person', maxConversations);

  // Individual persona bonds - Better than human: we notice which minds you connect with
  const personaMilestoneMap: Record<string, MilestoneType> = {
    ferni: 'ferni-bond',
    peter: 'peter-scholar',
    alex: 'alex-wordsmith',
    maya: 'maya-builder',
    jordan: 'jordan-planner',
    nayan: 'nayan-sage',
  };

  const personaMilestone = personaMilestoneMap[personaId.toLowerCase()];
  if (personaMilestone) {
    updateMilestoneProgress(personaMilestone, personaCount);
  }

  saveState();
}

function trackNaturalHandoff(): void {
  progress.naturalHandoffs++;
  checkAndCelebrate('team-player');
  saveState();
}

function trackThemeUse(theme: string): void {
  progress.themesUsed.add(theme);
  updateMilestoneProgress('theme-seeker', progress.themesUsed.size);
  saveState();
}

function trackEasterEgg(eggId: string): void {
  progress.easterEggsFound.add(eggId);
  updateMilestoneProgress('explorer', progress.easterEggsFound.size);
  updateMilestoneProgress('secret-keeper', progress.easterEggsFound.size);
  saveState();
}

function analyzeTranscript(transcript: string): void {
  const text = transcript.toLowerCase();

  // Thank you tracking
  if (text.includes('thank') || text.includes('appreciate') || text.includes('grateful')) {
    progress.thankYouCount++;
    updateMilestoneProgress('gratitude', progress.thankYouCount);
  }

  // Celebration detection (simplified - could be enhanced with AI)
  const celebrationWords = [
    'excited',
    'amazing',
    'great news',
    'good news',
    'got the job',
    'promotion',
    'engaged',
    'pregnant',
    'won',
    'passed',
    'accepted',
  ];
  if (celebrationWords.some((word) => text.includes(word))) {
    progress.celebrationsShared++;
    checkAndCelebrate('celebration');
  }

  // Vulnerability detection (simplified)
  const vulnerableWords = [
    'scared',
    'afraid',
    'anxious',
    'depressed',
    'struggling',
    'hard time',
    'difficult',
    'lost',
    'confused',
    'hurt',
    'pain',
  ];
  if (vulnerableWords.some((word) => text.includes(word))) {
    progress.vulnerableMoments++;
    if (progress.vulnerableMoments >= 3) {
      checkAndCelebrate('brave');
    }
  }

  saveState();
}

// ============================================================================
// CELEBRATION SYSTEM
// ============================================================================

function updateMilestoneProgress(milestoneId: MilestoneType, currentProgress: number): void {
  const milestone = milestones.find((m) => m.id === milestoneId);
  if (!milestone || milestone.celebrated) return;

  milestone.progress = currentProgress;

  if (milestone.target && currentProgress >= milestone.target) {
    checkAndCelebrate(milestoneId);
  }
}

function checkAndCelebrate(milestoneId: MilestoneType): void {
  const milestone = milestones.find((m) => m.id === milestoneId);
  if (!milestone || milestone.celebrated) return;

  milestone.celebrated = true;
  milestone.celebratedAt = Date.now();

  celebrationQueue.push(milestone);
  processQueue();

  window.dispatchEvent(
    new CustomEvent('ferni:milestone-celebrated', {
      detail: { milestone },
    })
  );

  // Send push notification - Better than human: we celebrate even when you're away
  sendMilestoneNotification(milestone);

  // Send email/SMS celebration - Better than human: we reach out with warmth
  sendMilestoneOutreach(milestone);

  saveState();
  log.info('Milestone celebrated:', milestoneId);
}

const EMAIL_MILESTONES = new Set<string>(['first-hello', 'week-together', 'month-of-growth',
  'three-month', 'six-month', 'one-year', 'streak-7', 'streak-30', 'hundred-conversations', 'fifty-talks']);

/**
 * Send milestone celebration via email/SMS.
 * Better than human: we celebrate your growth across channels.
 */
function sendMilestoneOutreach(milestone: Milestone): void {
  // Only send for significant milestones to avoid overwhelming users
  if (!EMAIL_MILESTONES.has(milestone.id)) return;

  // The server checks the milestone against its own records, counts for itself and
  // sends each one once per user, so this browser's local numbers are not sent
  outreachService
    .sendMilestoneCelebration({
      milestoneId: milestone.id,
      milestoneName: t(milestone.name),
      milestoneMessage: t(milestone.message),
    })
    .then((result) => {
      if (!result.sent && result.reason !== 'already-sent') return; // retried next call
      milestone.outreachDone = true;
      saveState();
    })
    .catch((error) => {
      log.warn('Failed to send milestone outreach:', error);
    });
}

/**
 * Send a warm push notification for a milestone.
 * Better than human: we celebrate your growth even when you're not looking.
 */
function sendMilestoneNotification(milestone: Milestone): void {
  // Only send for significant milestones to avoid notification fatigue
  const notifyMilestones = [
    'first-hello',
    'week-together',
    'month-of-growth',
    'three-month',
    'six-month',
    'one-year',
    'streak-7',
    'streak-30',
    'full-circle',
    'hundred-conversations',
    'fifty-talks',
  ];

  if (!notifyMilestones.includes(milestone.id)) return;

  // Don't send if user is actively using the app
  if (document.visibilityState === 'visible') return;

  showNotification({
    id: `milestone-${milestone.id}-${Date.now()}`,
    type: 'streak_milestone',
    title: t(milestone.name), // name and message are i18n keys, not copy
    body: t(milestone.message),
    sound: true,
    data: { milestoneId: milestone.id },
  }).catch(() => {
    // Notification permission not granted - that's ok
  });
}

function processQueue(): void {
  if (isCelebrating || celebrationQueue.length === 0) return;

  // Don't land on the call's opening or while Ferni speaks: wait and try again
  const holdMs = placement.celebrationHoldMs();
  if (holdMs > 0) {
    trackedTimeout(processQueue, holdMs);
    return;
  }

  isCelebrating = true;
  const milestone = celebrationQueue.shift()!;

  void showMilestoneCelebration(milestone).then(() => {
    isCelebrating = false;
    // Process next after a pause
    trackedTimeout(processQueue, 2000);
  });
}

// ============================================================================
// MILESTONE CELEBRATION DISPLAY - The warm celebration
// ============================================================================

async function showMilestoneCelebration(milestone: Milestone): Promise<void> {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inToastRegion = isToastRegionEnabled();
  if (inToastRegion) {
    // Shown (and announced) under Reduce Motion too; only the flourishes below are skipped.
    const message = t(milestone.message);
    const subtitle = milestone.subtitle ? t(milestone.subtitle) : '';
    showToast(
      subtitle
        ? { kind: 'achievement', title: message, message: subtitle }
        : { kind: 'achievement', message }
    );
  }

  // Check reduced motion
  if (reducedMotion) {
    return;
  }

  // Determine celebration intensity - these deserve extra celebration
  const isBigMilestone = [
    'one-year',
    'six-month',
    'streak-30',
    'hundred-conversations',
    'full-circle',
    'secret-keeper',
  ].includes(milestone.id);

  // Play appropriate sound
  if (isBigMilestone) {
    soundUI.play('celebrate');
    // Big win deserves big haptics
    haptics.bigWin();
  } else {
    soundUI.play('success');
    // Small win - gentle celebration haptic
    haptics.smallWin();
  }

  // Trigger Ferni Moment expression based on category
  triggerMilestoneExpression(milestone, isBigMilestone);

  // Avatar reaction based on category
  triggerAvatarReaction(milestone.category);

  if (inToastRegion) return;

  // Create the celebration display, above the call controls (never over them)
  const display = createCelebrationDisplay(milestone);
  placement.placeMilestoneCard(display);

  // Animate in
  await animateCelebrationIn(display);

  // Hold
  await sleep(4000);

  // Animate out
  await animateCelebrationOut(display);

  display.remove();
}

/**
 * Trigger a Ferni Moment expression based on the milestone
 */
function triggerMilestoneExpression(milestone: Milestone, isBig: boolean): void {
  // Map categories/milestones to Ferni Moment expressions
  const expressionMap: Record<string, string> = {
    // Relationship milestones
    'first-hello': 'wave',
    'week-together': 'warmGlow',
    'month-of-growth': 'hearts',
    'three-month': 'celebration',
    'six-month': 'celebration',
    'one-year': 'celebration',
    'welcome-back': 'wave',
    'streak-7': 'streakFire',
    'streak-30': 'trophy',

    // Team milestones
    'full-circle': 'celebration',
    'found-your-person': 'hearts',
    'team-player': 'highFive',

    // Persona bonds
    'ferni-bond': 'hearts',
    'peter-scholar': 'thinking',
    'alex-wordsmith': 'lightbulb',
    'maya-builder': 'growing',
    'jordan-planner': 'sparkle',
    'nayan-sage': 'thinking',

    // Conversation milestones
    'hundred-conversations': 'trophy',
    'fifty-talks': 'warmGlow',

    // Discovery milestones
    explorer: 'sparkle',
    'secret-keeper': 'celebration',
    'theme-seeker': 'lightbulb',

    // Sweet milestones
    gratitude: 'warmGlow',
    celebration: 'celebration',
    brave: 'hearts',
    consistent: 'streakFire',
  };

  const expressionId = expressionMap[milestone.id];

  if (expressionId) {
    // For big milestones, use the special celebration expression
    if (isBig) {
      ferniMoments.play('celebration');
    } else {
      ferniMoments.play(expressionId as Parameters<typeof ferniMoments.play>[0]);
    }
  }
}

function createCelebrationDisplay(milestone: Milestone): HTMLElement {
  const display = document.createElement('div');
  display.className = 'ferni-milestone';
  display.setAttribute('role', 'status');
  display.setAttribute('aria-live', 'polite');

  // Category-specific accent color
  const accentColors: Record<string, string> = {
    relationship: 'var(--persona-primary, #4a6741)',
    team: 'var(--color-peter, #3a6b73)',
    conversation: 'var(--color-alex, #5a6b8a)',
    discovery: 'var(--color-maya, #a67a6a)',
    sweet: 'var(--color-nayan, #b8956a)',
  };

  const accent = accentColors[milestone.category] || 'var(--persona-primary)';
  const subtitle = milestone.subtitle ? t(milestone.subtitle) : '';
  display.innerHTML = `
    <div class="ferni-milestone__glow"></div>
    <div class="ferni-milestone__content">
      <div class="ferni-milestone__icon" style="background: ${accent}">
        ${getCategoryIcon(milestone.category)}
      </div>
      <div class="ferni-milestone__text">
        <p class="ferni-milestone__message">${t(milestone.message)}</p>
        ${subtitle ? `<p class="ferni-milestone__subtitle">${subtitle}</p>` : ''}
      </div>
    </div>
  `;
  // Inject styles if needed
  injectMilestoneStyles();

  return display;
}

function triggerAvatarReaction(category: string): void {
  const avatar = document.querySelector('#coachAvatar, .coach-avatar, [data-avatar]');
  if (!avatar || !(avatar instanceof HTMLElement)) return;

  // Warm glow effect
  celebrationsUI.warmthGlow({ intensity: 'warm' });

  // Category-specific reaction
  const reactions: Record<string, Keyframe[]> = {
    relationship: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.1) translateY(-5px)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1)' },
    ],
    team: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-5deg)' },
      { transform: 'rotate(5deg)' },
      { transform: 'rotate(0deg)' },
    ],
    conversation: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05) translateY(-3px)' },
      { transform: 'scale(1)' },
    ],
    discovery: [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.08) rotate(-3deg)' },
      { transform: 'scale(1.08) rotate(3deg)' },
      { transform: 'scale(1.05) rotate(-1deg)' },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    sweet: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.08)' },
      { transform: 'scale(1.04)' },
      { transform: 'scale(1.06)' },
      { transform: 'scale(1)' },
    ],
  };

  const keyframes = reactions[category] ?? reactions.relationship;
  if (!keyframes) return;

  avatar.animate(keyframes, {
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  });
}

async function animateCelebrationIn(display: HTMLElement): Promise<void> {
  display.style.opacity = '0';
  display.style.transform = 'translateY(20px) scale(0.95)';

  await sleep(50);

  display.style.transition = `all ${DURATION.DELIBERATE}ms ${EASING.SPRING}`;
  display.style.opacity = '1';
  display.style.transform = 'translateY(0) scale(1)';

  await sleep(DURATION.DELIBERATE);
}

async function animateCelebrationOut(display: HTMLElement): Promise<void> {
  display.style.transition = `all ${DURATION.SLOW}ms ${EASING.GENTLE}`;
  display.style.opacity = '0';
  display.style.transform = 'translateY(-10px) scale(0.98)';

  await sleep(DURATION.SLOW);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => trackedTimeout(resolve, ms));
}

// ============================================================================
// STYLES
// ============================================================================

function injectMilestoneStyles(): void {
  if (document.getElementById('ferni-milestone-styles')) return;

  const style = document.createElement('style');
  style.id = 'ferni-milestone-styles';
  style.textContent = `
    .ferni-milestone {
      position: fixed;
      bottom: 100px;
      /* Centred with margins, not a transform: the animation sets transform */
      left: 0;
      right: 0;
      width: min(340px, calc(100vw - 2 * var(--space-4, 16px)));
      margin-inline: auto;
      z-index: var(--z-notification);
      pointer-events: none;
    }

    .ferni-milestone__glow {
      position: absolute;
      inset: -20px;
      background: radial-gradient(
        ellipse at center,
        color-mix(in srgb, var(--persona-primary, #4a6741) 15%, transparent) 0%,
        transparent 70%
      );
      border-radius: 50%;
      animation: ferni-milestone-glow 2s ease-in-out infinite;
    }
    
    @supports not (background: color-mix(in srgb, red 50%, blue)) {
      .ferni-milestone__glow {
        background: radial-gradient(
          ellipse at center,
          rgba(74, 103, 65, 0.15) 0%,
          transparent 70%
        );
      }
    }

    @keyframes ferni-milestone-glow {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(1.1); }
    }

    .ferni-milestone__content {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      padding: var(--space-4, 16px) var(--space-6, 24px);
      background: var(--color-background-elevated, #faf8f5);
      border-radius: var(--radius-2xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
      max-width: min(340px, 100%);
    }

    .ferni-milestone__icon {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }

    .ferni-milestone__icon svg {
      width: 22px;
      height: 22px;
    }

    .ferni-milestone__text {
      flex: 1;
      min-width: 0;
    }

    .ferni-milestone__message {
      margin: 0;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 1rem);
      font-weight: 500;
      color: var(--color-text-primary, #2c2520);
      line-height: 1.4;
    }

    .ferni-milestone__subtitle {
      margin: var(--space-1, 4px) 0 0;
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #a89b8c);
    }

    /* Dark theme */
    [data-theme="midnight"] .ferni-milestone__content {
      background: var(--color-background-elevated, #352e28);
    }

    [data-theme="midnight"] .ferni-milestone__message {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .ferni-milestone__subtitle {
      color: var(--color-text-secondary, #e8e2da);
    }

    /* Mobile */
    @media (max-width: 480px) {
      .ferni-milestone {
        bottom: 80px;
        left: var(--space-4, 16px);
        right: var(--space-4, 16px);
        width: auto;
      }

      .ferni-milestone__content {
        max-width: none;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .ferni-milestone__glow {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function saveState(): void {
  try {
    // Convert Sets to arrays for JSON
    const saveData = {
      milestones: milestones.map((m) => ({
        id: m.id,
        celebrated: m.celebrated,
        celebratedAt: m.celebratedAt,
        outreachDone: m.outreachDone,
        progress: m.progress,
      })),
      progress: {
        ...progress,
        personasUsed: Array.from(progress.personasUsed),
        easterEggsFound: Array.from(progress.easterEggsFound),
        themesUsed: Array.from(progress.themesUsed),
      },
    };

    localStorage.setItem('ferni-milestones', JSON.stringify(saveData));
  } catch {
    // Storage unavailable
  }
}

function loadState(): void {
  milestones = MILESTONES.map((m) => ({ ...m }));

  try {
    const saved = localStorage.getItem('ferni-milestones');
    if (saved) {
      const data = JSON.parse(saved);

      if (data.milestones) {
        for (const savedMilestone of data.milestones) {
          const milestone = milestones.find((m) => m.id === savedMilestone.id);
          if (milestone) {
            milestone.celebrated = savedMilestone.celebrated;
            milestone.celebratedAt = savedMilestone.celebratedAt;
            milestone.outreachDone = savedMilestone.outreachDone;
            milestone.progress = savedMilestone.progress;
          }
        }
      }

      if (data.progress) {
        progress = {
          ...progress,
          ...data.progress,
          personasUsed: new Set(data.progress.personasUsed || []),
          easterEggsFound: new Set(data.progress.easterEggsFound || []),
          themesUsed: new Set(data.progress.themesUsed || []),
        };
      }
    }
    // One-time: milestones celebrated before outreach was confirmed by the server count as
    // sent, so the retry below only ever applies to ones celebrated after this point
    if (!localStorage.getItem(OUTREACH_MIGRATION_KEY)) {
      for (const m of milestones) if (m.celebrated) m.outreachDone = true;
      localStorage.setItem(OUTREACH_MIGRATION_KEY, new Date().toISOString());
      saveState();
    }
  } catch {
    // Storage unavailable or corrupted
  }
}
const OUTREACH_MIGRATION_KEY = 'milestoneOutreachMigratedAt';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get all milestones with their current state
 */
export function getMilestones(): Milestone[] {
  return milestones.map((m) => ({ ...m }));
}

/**
 * Get celebrated milestones count
 */
export function getCelebratedCount(): number {
  return milestones.filter((m) => m.celebrated).length;
}

/**
 * Get total milestones count
 */
export function getTotalMilestonesCount(): number {
  return milestones.length;
}

/**
 * Get progress data
 */
export function getProgress(): MilestoneProgress {
  return { ...progress };
}

/**
 * Manually trigger a milestone celebration (for testing)
 */
export function triggerMilestone(milestoneId: MilestoneType): void {
  const milestone = milestones.find((m) => m.id === milestoneId);
  if (milestone && !milestone.celebrated) {
    checkAndCelebrate(milestoneId);
  }
}

/**
 * Reset all milestones (for testing)
 */
export function resetMilestones(): void {
  milestones = MILESTONES.map((m) => ({ ...m }));
  progress = {
    conversationDays: [],
    longestStreak: 0,
    currentStreak: 0,
    personasUsed: new Set(),
    personaConversations: {},
    naturalHandoffs: 0,
    totalConversations: 0,
    easterEggsFound: new Set(),
    themesUsed: new Set(),
    thankYouCount: 0,
    celebrationsShared: 0,
    vulnerableMoments: 0,
  };
  localStorage.removeItem('ferni-milestones');
  log.info('Milestones reset');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniMilestones = {
  init: initFerniMilestones,
  getMilestones,
  getCelebratedCount,
  getTotalMilestonesCount,
  getProgress,
  triggerMilestone,
  resetMilestones,
};

export default ferniMilestones;
