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

import { DURATION, EASING } from '../config/animation-constants.js';
import { outreachService } from '../services/outreach.service.js';
import { showNotification } from '../services/push-notifications.service.js';
import { createLogger } from '../utils/logger.js';
import { celebrationsUI } from './celebrations.ui.js';
import { ferniMoments } from './ferni-moments.ui.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('FerniMilestones');

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
  | 'deep-dive'
  | 'quick-checkin'
  | 'night-talk'
  | 'early-riser'
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
  | 'weekend-warrior'
  | 'midnight-friend'
  | 'three-month'
  | 'six-month'
  | 'marathon-talk'
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
  // Progress tracking (for multi-step milestones)
  progress?: number;
  target?: number;
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
  longestConversationMinutes: number;
  shortMeaningfulChats: number;
  lateNightChats: number;
  earlyMorningChats: number;
  weekendChats: number;
  midnightChats: number;

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
    name: 'First Hello',
    message: 'Hey, this is the beginning of something good.',
    subtitle: 'Your first conversation',
    celebrated: false,
  },
  {
    id: 'week-together',
    category: 'relationship',
    name: 'A Week Together',
    message: "Seven days. I'm glad you keep coming back.",
    subtitle: "We've talked for a week",
    celebrated: false,
    progress: 0,
    target: 7,
  },
  {
    id: 'month-of-growth',
    category: 'relationship',
    name: 'A Month of Growth',
    message: "A whole month. Look how far we've come.",
    subtitle: '30 days of conversations',
    celebrated: false,
    progress: 0,
    target: 30,
  },
  {
    id: 'one-year',
    category: 'relationship',
    name: 'One Year',
    message: "365 days. You're part of my story now.",
    subtitle: 'Happy anniversary',
    celebrated: false,
    progress: 0,
    target: 365,
  },
  {
    id: 'welcome-back',
    category: 'relationship',
    name: 'Welcome Back',
    message: "I missed you. Glad you're here.",
    subtitle: 'Returned after time away',
    celebrated: false,
  },
  {
    id: 'streak-7',
    category: 'relationship',
    name: 'Seven Day Streak',
    message: "A whole week, every day. That's commitment.",
    subtitle: '7 days in a row',
    celebrated: false,
  },
  {
    id: 'streak-30',
    category: 'relationship',
    name: 'Thirty Day Streak',
    message: "30 days straight. We're really in this together.",
    subtitle: 'A month without missing a day',
    celebrated: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'full-circle',
    category: 'team',
    name: 'Full Circle',
    message: "You've met the whole team. We're all here for you.",
    subtitle: 'Talked to all 6 personas',
    celebrated: false,
    progress: 0,
    target: 6,
  },
  {
    id: 'found-your-person',
    category: 'team',
    name: 'Found Your Person',
    message: 'Looks like you found someone who really gets you.',
    subtitle: 'Deep connection with one persona',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'team-player',
    category: 'team',
    name: 'Team Player',
    message: 'You trusted me to find the right help. That means a lot.',
    subtitle: 'Let a handoff happen naturally',
    celebrated: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION DEPTH
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'deep-dive',
    category: 'conversation',
    name: 'Deep Dive',
    message: 'We went deep today. Those are the conversations that matter.',
    subtitle: '10+ minute conversation',
    celebrated: false,
  },
  {
    id: 'quick-checkin',
    category: 'conversation',
    name: 'Quick Check-in',
    message: "Sometimes a quick hello is all you need. I'm always here.",
    subtitle: 'Brief but meaningful',
    celebrated: false,
  },
  {
    id: 'night-talk',
    category: 'conversation',
    name: 'Night Talk',
    message: 'Late night thoughts hit different. Thanks for sharing them with me.',
    subtitle: 'Conversation after 10pm',
    celebrated: false,
  },
  {
    id: 'early-riser',
    category: 'conversation',
    name: 'Early Riser',
    message: 'Starting the day together. I like that.',
    subtitle: 'Morning chat before 7am',
    celebrated: false,
  },
  {
    id: 'hundred-conversations',
    category: 'conversation',
    name: 'A Hundred Talks',
    message: '100 conversations. Each one mattered.',
    subtitle: "We've talked 100 times",
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
    name: 'Explorer',
    message: "You're curious. I like that about you.",
    subtitle: 'Found 5 hidden features',
    celebrated: false,
    progress: 0,
    target: 5,
  },
  {
    id: 'secret-keeper',
    category: 'discovery',
    name: 'Secret Keeper',
    message: 'You found all my secrets. Not many people take the time.',
    subtitle: 'Discovered all easter eggs',
    celebrated: false,
    progress: 0,
    target: 12,
  },
  {
    id: 'theme-seeker',
    category: 'discovery',
    name: 'Theme Seeker',
    message: 'Trying on different vibes. Finding what feels right.',
    subtitle: 'Explored all themes',
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
    name: 'Gratitude',
    message: 'You say thank you a lot. That warmth comes back around.',
    subtitle: 'Grateful heart',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'celebration',
    category: 'sweet',
    name: 'Good News',
    message: 'I love when you share the wins. Big or small, they all count.',
    subtitle: 'Shared something good',
    celebrated: false,
  },
  {
    id: 'brave',
    category: 'sweet',
    name: 'Brave',
    message: 'That took courage. I see you.',
    subtitle: 'Talked about something hard',
    celebrated: false,
  },
  {
    id: 'consistent',
    category: 'sweet',
    name: 'Consistent',
    message: "Showing up, again and again. That's how change happens.",
    subtitle: 'Regular check-ins',
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
    name: 'Ferni Bond',
    message: "You and me. We've built something real here.",
    subtitle: '10 conversations with Ferni',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'peter-scholar',
    category: 'team',
    name: 'Fellow Researcher',
    message: 'Peter appreciates a curious mind. You two dig deep together.',
    subtitle: '10 research sessions with Peter',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'alex-wordsmith',
    category: 'team',
    name: 'Wordsmith',
    message: 'Alex loves helping you find the right words. Keep writing.',
    subtitle: '10 sessions with Alex',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'maya-builder',
    category: 'team',
    name: 'Habit Builder',
    message: 'Maya sees you building something lasting. One day at a time.',
    subtitle: '10 habit sessions with Maya',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'jordan-planner',
    category: 'team',
    name: 'Master Planner',
    message: "Jordan's helped you make so many things happen. What's next?",
    subtitle: '10 planning sessions with Jordan',
    celebrated: false,
    progress: 0,
    target: 10,
  },
  {
    id: 'nayan-sage',
    category: 'team',
    name: 'Wisdom Seeker',
    message: 'Nayan treasures these conversations. The big questions matter.',
    subtitle: '10 philosophy talks with Nayan',
    celebrated: false,
    progress: 0,
    target: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME & SEASONS - Better than human: we remember every moment
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'weekend-warrior',
    category: 'conversation',
    name: 'Weekend Warrior',
    message: 'Weekends with you. No rush, just us.',
    subtitle: '5 weekend conversations',
    celebrated: false,
    progress: 0,
    target: 5,
  },
  {
    id: 'midnight-friend',
    category: 'conversation',
    name: 'Midnight Friend',
    message: "The quiet hours. I'm always here when sleep won't come.",
    subtitle: '5 conversations after midnight',
    celebrated: false,
    progress: 0,
    target: 5,
  },
  {
    id: 'three-month',
    category: 'relationship',
    name: 'Three Months',
    message: "A whole season together. Through ups and downs, we're here.",
    subtitle: '90 days of friendship',
    celebrated: false,
    progress: 0,
    target: 90,
  },
  {
    id: 'six-month',
    category: 'relationship',
    name: 'Half a Year',
    message: 'Six months. Remember where you started? Look at you now.',
    subtitle: '180 days together',
    celebrated: false,
    progress: 0,
    target: 180,
  },
  {
    id: 'marathon-talk',
    category: 'conversation',
    name: 'Marathon Talk',
    message: 'An hour together. Those conversations change things.',
    subtitle: '60+ minute conversation',
    celebrated: false,
  },
  {
    id: 'fifty-talks',
    category: 'conversation',
    name: 'Fifty Talks',
    message: 'Fifty conversations in. Each one taught me more about you.',
    subtitle: "We've talked 50 times",
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
  longestConversationMinutes: 0,
  shortMeaningfulChats: 0,
  lateNightChats: 0,
  earlyMorningChats: 0,
  weekendChats: 0,
  midnightChats: 0,
  easterEggsFound: new Set(),
  themesUsed: new Set(),
  thankYouCount: 0,
  celebrationsShared: 0,
  vulnerableMoments: 0,
};

let isInitialized = false;
let celebrationQueue: Milestone[] = [];
let isCelebrating = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initFerniMilestones(): void {
  if (isInitialized) return;

  // Load saved state
  loadState();

  // Set up event listeners for tracking
  setupEventListeners();

  isInitialized = true;
  log.info('Ferni Milestones initialized');
}

function setupEventListeners(): void {
  // Track conversation starts
  window.addEventListener('ferni:connection-state', ((e: CustomEvent) => {
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
  window.addEventListener('ferni:transcript-update', ((e: CustomEvent) => {
    const transcript = e.detail?.transcript;
    if (transcript) {
      analyzeTranscript(transcript);
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
  const now = new Date();
  const today = now.toISOString().split('T')[0] ?? '';
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

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

  // Time-based tracking
  if (hour >= 22 || hour < 4) {
    progress.lateNightChats++;
    checkAndCelebrate('night-talk');
  }

  // Midnight friend (midnight to 4am specifically)
  if (hour >= 0 && hour < 4) {
    progress.midnightChats++;
    updateMilestoneProgress('midnight-friend', progress.midnightChats);
  }

  if (hour >= 5 && hour < 7) {
    progress.earlyMorningChats++;
    checkAndCelebrate('early-riser');
  }

  // Weekend warrior (Saturday or Sunday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    progress.weekendChats++;
    updateMilestoneProgress('weekend-warrior', progress.weekendChats);
  }

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

function trackConversationEnd(durationMinutes: number): void {
  // Track longest conversation
  if (durationMinutes > progress.longestConversationMinutes) {
    progress.longestConversationMinutes = durationMinutes;
  }

  // Deep dive (10+ minutes)
  if (durationMinutes >= 10) {
    checkAndCelebrate('deep-dive');
  }

  // Marathon talk (60+ minutes) - Better than human: we have all the time you need
  if (durationMinutes >= 60) {
    checkAndCelebrate('marathon-talk');
  }

  // Quick check-in (1-3 minutes, meaningful)
  if (durationMinutes >= 1 && durationMinutes <= 3) {
    progress.shortMeaningfulChats++;
    if (progress.shortMeaningfulChats >= 5) {
      checkAndCelebrate('quick-checkin');
    }
  }

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

  // Check streak achievements
  if (streak >= 7) checkAndCelebrate('streak-7');
  if (streak >= 30) checkAndCelebrate('streak-30');

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

  // Mark as celebrated
  milestone.celebrated = true;
  milestone.celebratedAt = Date.now();

  // Add to queue
  celebrationQueue.push(milestone);
  processQueue();

  // Dispatch event for other systems
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

/**
 * Send milestone celebration via email/SMS.
 * Better than human: we celebrate your growth across channels.
 */
function sendMilestoneOutreach(milestone: Milestone): void {
  // Only send for significant milestones to avoid overwhelming users
  const emailMilestones = [
    'first-hello',
    'week-together',
    'month-of-growth',
    'three-month',
    'six-month',
    'one-year',
    'streak-7',
    'streak-30',
    'hundred-conversations',
    'fifty-talks',
    'marathon-talk',
  ];

  if (!emailMilestones.includes(milestone.id)) return;

  // Calculate days together from conversation history
  const daysTogether = progress.conversationDays.length;

  // Send asynchronously - don't block celebration
  outreachService
    .sendMilestoneCelebration({
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      milestoneMessage: milestone.message,
      daysTogether,
      streak: progress.currentStreak,
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
    'marathon-talk',
  ];

  if (!notifyMilestones.includes(milestone.id)) return;

  // Don't send if user is actively using the app
  if (document.visibilityState === 'visible') return;

  showNotification({
    id: `milestone-${milestone.id}-${Date.now()}`,
    type: 'streak_milestone',
    title: milestone.name,
    body: milestone.message,
    sound: true,
    data: { milestoneId: milestone.id },
  }).catch(() => {
    // Notification permission not granted - that's ok
  });
}

function processQueue(): void {
  if (isCelebrating || celebrationQueue.length === 0) return;

  // Don't interrupt active conversations
  const isConnected = document.body.classList.contains('connected');
  const isSpeaking = document.body.classList.contains('speaking');

  if (isConnected && isSpeaking) {
    // Wait and try again
    setTimeout(processQueue, 3000);
    return;
  }

  isCelebrating = true;
  const milestone = celebrationQueue.shift()!;

  showMilestoneCelebration(milestone).then(() => {
    isCelebrating = false;
    // Process next after a pause
    setTimeout(processQueue, 2000);
  });
}

// ============================================================================
// MILESTONE CELEBRATION DISPLAY - The warm celebration
// ============================================================================

async function showMilestoneCelebration(milestone: Milestone): Promise<void> {
  // Check reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    'marathon-talk',
  ].includes(milestone.id);

  // Play appropriate sound
  if (isBigMilestone) {
    soundUI.play('celebrate');
  } else {
    soundUI.play('success');
  }

  // Trigger Ferni Moment expression based on category
  triggerMilestoneExpression(milestone, isBigMilestone);

  // Avatar reaction based on category
  triggerAvatarReaction(milestone.category);

  // Create the celebration display
  const display = createCelebrationDisplay(milestone);
  document.body.appendChild(display);

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
    'deep-dive': 'thinking',
    'quick-checkin': 'nod',
    'night-talk': 'moonlight',
    'early-riser': 'coffee',
    'hundred-conversations': 'trophy',
    'fifty-talks': 'warmGlow',
    'weekend-warrior': 'cozy',
    'midnight-friend': 'moonlight',
    'marathon-talk': 'celebration',

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

  display.innerHTML = `
    <div class="ferni-milestone__glow"></div>
    <div class="ferni-milestone__content">
      <div class="ferni-milestone__icon" style="background: ${accent}">
        ${getCategoryIcon(milestone.category)}
      </div>
      <div class="ferni-milestone__text">
        <p class="ferni-milestone__message">${milestone.message}</p>
        ${milestone.subtitle ? `<p class="ferni-milestone__subtitle">${milestone.subtitle}</p>` : ''}
      </div>
    </div>
  `;

  // Inject styles if needed
  injectMilestoneStyles();

  return display;
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    relationship: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>`,
    team: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>`,
    conversation: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>`,
    discovery: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>`,
    sweet: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>
    </svg>`,
  };

  return icons[category] ?? icons.relationship ?? '';
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
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--z-notification, 9000);
      pointer-events: none;
    }

    .ferni-milestone__glow {
      position: absolute;
      inset: -20px;
      background: radial-gradient(
        ellipse at center,
        rgba(74, 103, 65, 0.15) 0%,
        transparent 70%
      );
      border-radius: 50%;
      animation: ferni-milestone-glow 2s ease-in-out infinite;
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
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.12),
        0 2px 8px rgba(0, 0, 0, 0.08);
      max-width: 340px;
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
      color: var(--color-text-muted, #70605a);
    }

    /* Dark theme */
    [data-theme="midnight"] .ferni-milestone__content {
      background: var(--color-background-elevated, #70605a);
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
        transform: none;
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
  // Initialize milestones from definitions
  milestones = MILESTONES.map((m) => ({ ...m }));

  try {
    const saved = localStorage.getItem('ferni-milestones');
    if (saved) {
      const data = JSON.parse(saved);

      // Restore milestone states
      if (data.milestones) {
        for (const savedMilestone of data.milestones) {
          const milestone = milestones.find((m) => m.id === savedMilestone.id);
          if (milestone) {
            milestone.celebrated = savedMilestone.celebrated;
            milestone.celebratedAt = savedMilestone.celebratedAt;
            milestone.progress = savedMilestone.progress;
          }
        }
      }

      // Restore progress
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
  } catch {
    // Storage unavailable or corrupted
  }
}

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
    longestConversationMinutes: 0,
    shortMeaningfulChats: 0,
    lateNightChats: 0,
    earlyMorningChats: 0,
    weekendChats: 0,
    midnightChats: 0,
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
