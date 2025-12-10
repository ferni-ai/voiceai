/**
 * Goal Tracking Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Structured goal-setting with follow-up - the core of life coaching.
 * Helps users define SMART goals, breaks them into milestones,
 * and proactively checks in on progress.
 *
 * Philosophy:
 * - Goals are not just tasks - they represent what matters
 * - Progress over perfection
 * - Celebrate wins, explore obstacles with curiosity
 * - Accountability with compassion
 *
 * @module GoalTracking
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GoalTracking' });

// ============================================================================
// TYPES
// ============================================================================

export type GoalDomain =
  | 'career'
  | 'health'
  | 'relationships'
  | 'finance'
  | 'personal_growth'
  | 'habits'
  | 'creativity'
  | 'education'
  | 'other';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: MilestoneStatus;
  completedAt?: Date;
  notes: string[];
  checkInScheduled?: Date;
}

export interface CoachingGoal {
  id: string;
  userId: string;

  // Which team member is helping
  personaId: string;

  // Definition
  title: string;
  description: string;
  domain: GoalDomain;

  // Why this matters
  motivation: string;
  obstacles: string[];

  // SMART criteria (optional but encouraged)
  smart?: {
    specific?: string;
    measurable?: string;
    achievable?: string;
    relevant?: string;
    timebound?: Date;
  };

  // Progress tracking
  milestones: Milestone[];
  currentMilestoneIndex: number;
  progress: number; // 0-100

  // Metadata
  status: GoalStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Context
  conversationId?: string; // Where this goal was created
  relatedTopics: string[];

  // Check-in settings
  checkInFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'none';
  nextCheckIn?: Date;
  lastCheckIn?: Date;
}

export interface GoalProgress {
  goalId: string;
  date: Date;
  progress: number;
  note?: string;
  milestoneCompleted?: string;
}

export interface GoalProfile {
  userId: string;
  goals: CoachingGoal[];
  progressHistory: GoalProgress[];

  // User preferences for goal coaching
  preferences: {
    checkInStyle: 'direct' | 'gentle' | 'celebratory';
    preferredCheckInTime?: string; // HH:MM
    reminderChannel: 'voice' | 'notification' | 'both';
  };

  // Stats
  stats: {
    totalGoalsSet: number;
    goalsCompleted: number;
    milestonesCompleted: number;
    currentStreak: number; // Days with progress
  };
}

export interface GoalCheckIn {
  goalId: string;
  question: string;
  ssml: string;
  tone: 'curious' | 'celebratory' | 'supportive' | 'direct';
  context: {
    lastProgress: number;
    daysSinceUpdate: number;
    currentMilestone?: string;
  };
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const goalProfiles = new Map<string, GoalProfile>();

function getOrCreateProfile(userId: string): GoalProfile {
  let profile = goalProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      goals: [],
      progressHistory: [],
      preferences: {
        checkInStyle: 'gentle',
        reminderChannel: 'both',
      },
      stats: {
        totalGoalsSet: 0,
        goalsCompleted: 0,
        milestonesCompleted: 0,
        currentStreak: 0,
      },
    };
    goalProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// GOAL DETECTION
// ============================================================================

/** Patterns indicating goal statements */
const GOAL_PATTERNS = [
  /i (want to|need to|should|have to|'m going to|'ll|will) (.+)/i,
  /my goal is to (.+)/i,
  /i('m|'ve been) (trying to|working on) (.+)/i,
  /i (want|need) (.+)/i,
  /i('d| would) (like|love) to (.+)/i,
];

/** Domain keywords */
const DOMAIN_KEYWORDS: Record<GoalDomain, string[]> = {
  career: ['job', 'work', 'career', 'promotion', 'salary', 'interview', 'resume', 'boss', 'office'],
  health: [
    'exercise',
    'gym',
    'weight',
    'diet',
    'sleep',
    'health',
    'doctor',
    'run',
    'workout',
    'fitness',
  ],
  relationships: [
    'friend',
    'family',
    'partner',
    'relationship',
    'dating',
    'marriage',
    'parent',
    'sibling',
  ],
  finance: ['money', 'save', 'budget', 'invest', 'debt', 'financial', 'retire', 'savings'],
  personal_growth: [
    'learn',
    'grow',
    'improve',
    'better',
    'change',
    'habit',
    'mindset',
    'confidence',
  ],
  habits: ['routine', 'habit', 'daily', 'morning', 'night', 'regular', 'consistent'],
  creativity: ['write', 'art', 'music', 'create', 'creative', 'paint', 'design', 'book'],
  education: ['study', 'course', 'degree', 'school', 'class', 'certif', 'learn'],
  other: [],
};

/**
 * Detect a potential goal in user speech
 */
export function detectGoalStatement(
  userId: string,
  userMessage: string
): { detected: boolean; goalText?: string; domain?: GoalDomain } {
  const lower = userMessage.toLowerCase();

  for (const pattern of GOAL_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      const goalText = match[match.length - 1]; // Get the last capture group

      // Skip if too short or generic
      if (goalText.length < 10) continue;
      if (['it', 'that', 'this', 'something'].some((w) => goalText === w)) continue;

      // Detect domain
      const domain = detectDomain(goalText);

      log.debug({ userId, goalText, domain }, '🎯 Potential goal detected');

      return {
        detected: true,
        goalText,
        domain,
      };
    }
  }

  return { detected: false };
}

/**
 * Detect the domain of a goal
 */
function detectDomain(goalText: string): GoalDomain {
  const lower = goalText.toLowerCase();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return domain as GoalDomain;
    }
  }

  return 'personal_growth';
}

// ============================================================================
// GOAL CRUD
// ============================================================================

/**
 * Create a new goal
 */
export function createGoal(
  userId: string,
  goalData: {
    title: string;
    description?: string;
    domain: GoalDomain;
    motivation?: string;
    obstacles?: string[];
    targetDate?: Date;
    personaId?: string;
  }
): CoachingGoal {
  const profile = getOrCreateProfile(userId);

  const goal: CoachingGoal = {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    personaId: goalData.personaId || 'ferni',
    title: goalData.title,
    description: goalData.description || '',
    domain: goalData.domain,
    motivation: goalData.motivation || '',
    obstacles: goalData.obstacles || [],
    milestones: [],
    currentMilestoneIndex: 0,
    progress: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    relatedTopics: [],
    checkInFrequency: 'weekly',
    smart: goalData.targetDate ? { timebound: goalData.targetDate } : undefined,
  };

  // Schedule first check-in
  goal.nextCheckIn = calculateNextCheckIn(goal.checkInFrequency);

  profile.goals.push(goal);
  profile.stats.totalGoalsSet++;

  log.info({ userId, goalId: goal.id, title: goal.title, domain: goal.domain }, '🎯 Goal created');

  return goal;
}

/**
 * Add a milestone to a goal
 */
export function addMilestone(
  userId: string,
  goalId: string,
  milestoneData: {
    title: string;
    description?: string;
    dueDate?: Date;
  }
): Milestone | null {
  const profile = goalProfiles.get(userId);
  if (!profile) return null;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal) return null;

  const milestone: Milestone = {
    id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: milestoneData.title,
    description: milestoneData.description,
    dueDate: milestoneData.dueDate,
    status: 'pending',
    notes: [],
  };

  goal.milestones.push(milestone);
  goal.updatedAt = new Date();

  log.debug({ userId, goalId, milestoneId: milestone.id }, '📍 Milestone added');

  return milestone;
}

/**
 * Update goal progress
 */
export function updateProgress(
  userId: string,
  goalId: string,
  progress: number,
  note?: string
): boolean {
  const profile = goalProfiles.get(userId);
  if (!profile) return false;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal) return false;

  const previousProgress = goal.progress;
  goal.progress = Math.max(0, Math.min(100, progress));
  goal.updatedAt = new Date();
  goal.lastCheckIn = new Date();

  // Record progress history
  profile.progressHistory.push({
    goalId,
    date: new Date(),
    progress: goal.progress,
    note,
  });

  // Check if completed
  if (goal.progress >= 100 && goal.status === 'active') {
    goal.status = 'completed';
    goal.completedAt = new Date();
    profile.stats.goalsCompleted++;
    log.info({ userId, goalId, title: goal.title }, '🎉 Goal completed!');
  }

  // Update streak if progress increased
  if (goal.progress > previousProgress) {
    profile.stats.currentStreak++;
  }

  log.debug({ userId, goalId, progress: goal.progress }, '📈 Progress updated');

  return true;
}

/**
 * Complete a milestone
 */
export function completeMilestone(userId: string, goalId: string, milestoneId: string): boolean {
  const profile = goalProfiles.get(userId);
  if (!profile) return false;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal) return false;

  const milestone = goal.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return false;

  milestone.status = 'completed';
  milestone.completedAt = new Date();
  goal.updatedAt = new Date();
  profile.stats.milestonesCompleted++;

  // Update progress based on milestones
  const completedCount = goal.milestones.filter((m) => m.status === 'completed').length;
  if (goal.milestones.length > 0) {
    goal.progress = Math.round((completedCount / goal.milestones.length) * 100);
  }

  // Move to next milestone
  const nextIndex = goal.milestones.findIndex((m) => m.status === 'pending');
  if (nextIndex !== -1) {
    goal.currentMilestoneIndex = nextIndex;
  }

  log.info({ userId, goalId, milestoneId, title: milestone.title }, '✅ Milestone completed');

  return true;
}

/**
 * Pause a goal
 */
export function pauseGoal(userId: string, goalId: string, reason?: string): boolean {
  const profile = goalProfiles.get(userId);
  if (!profile) return false;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal) return false;

  goal.status = 'paused';
  goal.updatedAt = new Date();
  if (reason) {
    goal.obstacles.push(`Paused: ${reason}`);
  }

  log.info({ userId, goalId, reason }, '⏸️ Goal paused');

  return true;
}

/**
 * Resume a paused goal
 */
export function resumeGoal(userId: string, goalId: string): boolean {
  const profile = goalProfiles.get(userId);
  if (!profile) return false;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal || goal.status !== 'paused') return false;

  goal.status = 'active';
  goal.updatedAt = new Date();
  goal.nextCheckIn = calculateNextCheckIn(goal.checkInFrequency);

  log.info({ userId, goalId }, '▶️ Goal resumed');

  return true;
}

/**
 * Abandon a goal (with compassion - no shame)
 */
export function abandonGoal(userId: string, goalId: string, reason?: string): boolean {
  const profile = goalProfiles.get(userId);
  if (!profile) return false;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal) return false;

  goal.status = 'abandoned';
  goal.updatedAt = new Date();
  if (reason) {
    goal.obstacles.push(`Abandoned: ${reason}`);
  }

  log.info({ userId, goalId, reason }, '🔄 Goal abandoned (redirecting energy)');

  return true;
}

// ============================================================================
// GOAL QUERIES
// ============================================================================

/**
 * Get all active goals for a user
 */
export function getActiveGoals(userId: string): CoachingGoal[] {
  const profile = goalProfiles.get(userId);
  return profile?.goals.filter((g) => g.status === 'active') || [];
}

/**
 * Get goals that need check-in
 */
export function getGoalsNeedingCheckIn(userId: string): CoachingGoal[] {
  const profile = goalProfiles.get(userId);
  if (!profile) return [];

  const now = new Date();
  return profile.goals.filter(
    (g) => g.status === 'active' && g.nextCheckIn && g.nextCheckIn <= now
  );
}

/**
 * Get a specific goal
 */
export function getGoal(userId: string, goalId: string): CoachingGoal | null {
  const profile = goalProfiles.get(userId);
  return profile?.goals.find((g) => g.id === goalId) || null;
}

/**
 * Get goal stats for a user
 */
export function getGoalStats(userId: string): GoalProfile['stats'] | null {
  const profile = goalProfiles.get(userId);
  return profile?.stats || null;
}

/**
 * Get recent progress for a goal
 */
export function getRecentProgress(
  userId: string,
  goalId: string,
  days: number = 30
): GoalProgress[] {
  const profile = goalProfiles.get(userId);
  if (!profile) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return profile.progressHistory.filter((p) => p.goalId === goalId && p.date >= cutoff);
}

// ============================================================================
// CHECK-IN GENERATION
// ============================================================================

/**
 * Generate a check-in question for a goal
 */
export function generateGoalCheckIn(userId: string, goalId: string): GoalCheckIn | null {
  const profile = goalProfiles.get(userId);
  if (!profile) return null;

  const goal = profile.goals.find((g) => g.id === goalId);
  if (!goal) return null;

  const daysSinceUpdate = goal.updatedAt
    ? Math.floor((Date.now() - goal.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const currentMilestone = goal.milestones[goal.currentMilestoneIndex];
  const style = profile.preferences.checkInStyle;

  // Determine tone and question based on context
  let tone: GoalCheckIn['tone'] = 'curious';
  let question: string;

  if (goal.progress >= 90) {
    tone = 'celebratory';
    question = `You're so close on "${goal.title}"! How's the final stretch going?`;
  } else if (daysSinceUpdate > 14) {
    tone = 'supportive';
    question = `I've been thinking about your goal: "${goal.title}". How are you feeling about it?`;
  } else if (currentMilestone) {
    tone = 'curious';
    question = `How's "${currentMilestone.title}" coming along? Any progress to share?`;
  } else {
    tone = 'direct';
    question = `Quick check-in on "${goal.title}" - where are we at?`;
  }

  // Adjust based on user preference
  if (style === 'gentle') {
    question = question.replace('Quick check-in', 'Just checking in');
    question = question.replace('where are we at', 'how are you feeling about it');
  } else if (style === 'celebratory') {
    question = `Tell me something good about "${goal.title}"!`;
  }

  const ssml = question
    .replace(/\. /g, ". <break time='200ms'/> ")
    .replace(/\?/g, "? <break time='300ms'/>");

  // Schedule next check-in
  goal.nextCheckIn = calculateNextCheckIn(goal.checkInFrequency);

  return {
    goalId,
    question,
    ssml,
    tone,
    context: {
      lastProgress: goal.progress,
      daysSinceUpdate,
      currentMilestone: currentMilestone?.title,
    },
  };
}

/**
 * Get the highest priority goal to check in on
 */
export function getGoalToCheckIn(userId: string): {
  goal: CoachingGoal;
  checkIn: GoalCheckIn;
} | null {
  const needsCheckIn = getGoalsNeedingCheckIn(userId);

  if (needsCheckIn.length === 0) return null;

  // Sort by last check-in (oldest first)
  const sorted = needsCheckIn.sort((a, b) => {
    const aTime = a.lastCheckIn?.getTime() || a.createdAt.getTime();
    const bTime = b.lastCheckIn?.getTime() || b.createdAt.getTime();
    return aTime - bTime;
  });

  const goal = sorted[0];
  const checkIn = generateGoalCheckIn(userId, goal.id);

  if (!checkIn) return null;

  return { goal, checkIn };
}

// ============================================================================
// HELPERS
// ============================================================================

function calculateNextCheckIn(frequency: CoachingGoal['checkInFrequency']): Date {
  const now = new Date();

  switch (frequency) {
    case 'daily':
      return new Date(now.setDate(now.getDate() + 1));
    case 'weekly':
      return new Date(now.setDate(now.getDate() + 7));
    case 'biweekly':
      return new Date(now.setDate(now.getDate() + 14));
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    default:
      return new Date(now.setDate(now.getDate() + 7));
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Export goal profile for persistence
 */
export function exportGoalProfile(userId: string): GoalProfile | null {
  return goalProfiles.get(userId) || null;
}

/**
 * Import goal profile from persistence
 */
export function importGoalProfile(profile: GoalProfile): void {
  // Convert dates from strings if needed
  profile.goals.forEach((g) => {
    g.createdAt = new Date(g.createdAt);
    g.updatedAt = new Date(g.updatedAt);
    if (g.completedAt) g.completedAt = new Date(g.completedAt);
    if (g.nextCheckIn) g.nextCheckIn = new Date(g.nextCheckIn);
    if (g.lastCheckIn) g.lastCheckIn = new Date(g.lastCheckIn);
    g.milestones.forEach((m) => {
      if (m.dueDate) m.dueDate = new Date(m.dueDate);
      if (m.completedAt) m.completedAt = new Date(m.completedAt);
    });
  });

  goalProfiles.set(profile.userId, profile);
  log.debug({ userId: profile.userId, goalCount: profile.goals.length }, 'Imported goal profile');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for goals
 */
export function buildGoalContext(userId: string): string | null {
  const activeGoals = getActiveGoals(userId);
  if (activeGoals.length === 0) return null;

  const lines: string[] = ['[🎯 ACTIVE GOALS]'];

  for (const goal of activeGoals) {
    lines.push(`• "${goal.title}" (${goal.domain}) - ${goal.progress}% complete`);

    const currentMilestone = goal.milestones[goal.currentMilestoneIndex];
    if (currentMilestone) {
      lines.push(`  Current milestone: ${currentMilestone.title}`);
    }

    if (goal.motivation) {
      lines.push(`  Why it matters: ${goal.motivation}`);
    }
  }

  lines.push('');
  lines.push('When relevant, ask about their goals with genuine curiosity.');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectGoalStatement,
  createGoal,
  addMilestone,
  updateProgress,
  completeMilestone,
  pauseGoal,
  resumeGoal,
  abandonGoal,
  getActiveGoals,
  getGoalsNeedingCheckIn,
  getGoal,
  getGoalStats,
  getRecentProgress,
  generateGoalCheckIn,
  getGoalToCheckIn,
  buildGoalContext,
  exportGoalProfile,
  importGoalProfile,
};
