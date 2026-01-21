/**
 * Habit Optimization Engine - Better Than Human Service
 *
 * What no human friend can do: Compute optimal habit timing, predict cascade effects,
 * and apply behavioral science frameworks with mathematical precision.
 *
 * Research Foundation:
 * - Fogg Behavior Model (BJ Fogg, Stanford Persuasive Tech Lab)
 * - MCII/WOOP Protocol (Gabriele Oettingen, NYU)
 * - Self-Determination Theory (Deci & Ryan)
 * - Temporal Self-Regulation Theory
 * - Circadian Rhythm Research
 *
 * @module services/superhuman/habit-optimization-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'habit-optimization-engine' });

// ============================================================================
// TYPES
// ============================================================================

export type MotivationType =
  | 'intrinsic'
  | 'extrinsic'
  | 'integrated'
  | 'identified'
  | 'introjected';
export type ChronotypeProfile = 'lion' | 'bear' | 'wolf' | 'dolphin'; // Based on Dr. Michael Breus
export type HabitDifficulty = 'tiny' | 'small' | 'medium' | 'challenging' | 'ambitious';
export type CascadeStrength = 'weak' | 'moderate' | 'strong' | 'keystone';

export interface FoggBehaviorScore {
  motivation: number; // 0-10
  ability: number; // 0-10
  prompt: number; // 0-10, prompt clarity/reliability
  behaviorScore: number; // Combined score: B = MAT (above threshold)
  threshold: number; // Action line threshold
  aboveThreshold: boolean;
  recommendations: string[];
}

export interface HabitCascade {
  sourceHabit: string;
  targetHabits: string[];
  cascadeStrength: CascadeStrength;
  probabilityBoost: number; // 0-1, how much more likely target habits become
  mechanism: string; // Why this cascade happens
  observedCount: number;
  lastObserved: number;
}

export interface ImplementationIntention {
  id: string;
  userId: string;
  habit: string;
  anchor: string; // Existing behavior to attach to
  tinyVersion: string; // 2-minute or less version
  fullIntention: string; // "When I [anchor], I will [tinyVersion]"
  mentalContrast?: {
    wish: string; // Desired outcome
    outcome: string; // Positive outcome visualization
    obstacle: string; // Inner obstacle
    plan: string; // If [obstacle], then [plan]
  };
  createdAt: number;
  successRate: number; // 0-1, tracked over time
  executionCount: number;
}

export interface OptimalHabitWindow {
  habitId: string;
  habitName: string;
  optimalStart: string; // HH:MM format
  optimalEnd: string;
  confidence: number; // 0-1
  basedOn: string; // Explanation
  chronotypeAdjusted: boolean;
  energyLevelRequired: 'low' | 'medium' | 'high';
  conflictsWith: string[]; // Other habits that compete for this window
}

export interface HabitOptimizationContext {
  optimalWindows: OptimalHabitWindow[];
  cascadeEffects: HabitCascade[];
  implementationIntentions: ImplementationIntention[];
  foggAnalysis: Record<string, FoggBehaviorScore>;
  chronotype: ChronotypeProfile;
  keystoneHabits: string[];
  recommendations: string[];
}

export interface UserHabitProfile {
  userId: string;
  chronotype: ChronotypeProfile;
  wakeTime: string; // HH:MM
  sleepTime: string;
  peakEnergyHours: number[]; // 0-23
  lowEnergyHours: number[];
  motivationProfile: {
    dominantType: MotivationType;
    intrinsicScore: number;
    extrinsicScore: number;
    autonomyNeed: number; // 0-10, Self-Determination Theory
    competenceNeed: number;
    relatednessNeed: number;
  };
  habits: UserHabit[];
  cascades: HabitCascade[];
  intentions: ImplementationIntention[];
  updatedAt: number;
}

export interface UserHabit {
  id: string;
  name: string;
  category: string;
  difficulty: HabitDifficulty;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  missedDays: number;
  foggScore: FoggBehaviorScore;
  preferredTime?: string;
  anchoredTo?: string;
  isKeystone: boolean;
  energyRequired: 'low' | 'medium' | 'high';
  lastCompleted?: number;
  createdAt: number;
}

// ============================================================================
// CHRONOTYPE DETECTION
// ============================================================================

/**
 * Detect chronotype from conversation patterns and self-reported data.
 * Based on Dr. Michael Breus's chronotype research.
 */
export function detectChronotype(signals: {
  preferredWakeTime?: string;
  preferredSleepTime?: string;
  peakProductivityTime?: string;
  exercisePreference?: 'morning' | 'afternoon' | 'evening';
  socialEnergyPeak?: 'morning' | 'afternoon' | 'evening' | 'night';
  sleepQuality?: 'light' | 'medium' | 'deep';
  morningAlertness?: 'immediate' | 'gradual' | 'slow' | 'very_slow';
}): { chronotype: ChronotypeProfile; confidence: number; explanation: string } {
  const scores = { lion: 0, bear: 0, wolf: 0, dolphin: 0 };

  // Wake time analysis
  if (signals.preferredWakeTime) {
    const hour = parseInt(signals.preferredWakeTime.split(':')[0]);
    if (hour <= 5) {
      scores.lion += 3;
    } else if (hour <= 7) {
      scores.lion += 2;
      scores.bear += 1;
    } else if (hour <= 9) {
      scores.bear += 3;
    } else {
      scores.wolf += 3;
    }
  }

  // Peak productivity
  if (signals.peakProductivityTime) {
    const hour = parseInt(signals.peakProductivityTime.split(':')[0]);
    if (hour <= 10) scores.lion += 2;
    else if (hour <= 14) scores.bear += 2;
    else if (hour <= 18) scores.wolf += 1;
    else scores.wolf += 3;
  }

  // Morning alertness
  if (signals.morningAlertness === 'immediate') scores.lion += 2;
  else if (signals.morningAlertness === 'gradual') scores.bear += 2;
  else if (signals.morningAlertness === 'slow') scores.wolf += 2;
  else if (signals.morningAlertness === 'very_slow') {
    scores.wolf += 1;
    scores.dolphin += 2;
  }

  // Sleep quality (dolphins are light sleepers)
  if (signals.sleepQuality === 'light') scores.dolphin += 3;
  else if (signals.sleepQuality === 'medium') scores.bear += 1;
  else scores.lion += 1;

  // Find winner
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [chronotype, topScore] = sorted[0] as [ChronotypeProfile, number];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? topScore / totalScore : 0.25;

  const explanations: Record<ChronotypeProfile, string> = {
    lion: 'Early riser with morning peak energy. Best for habits that require focus and discipline.',
    bear: 'Solar-aligned schedule. Most habits work well mid-morning to early afternoon.',
    wolf: 'Night owl with evening peak. Schedule demanding habits for late afternoon or evening.',
    dolphin:
      'Light sleeper with irregular patterns. Flexible timing, avoid high-stress habits before bed.',
  };

  return {
    chronotype,
    confidence,
    explanation: explanations[chronotype],
  };
}

// ============================================================================
// FOGG BEHAVIOR MODEL
// ============================================================================

/**
 * Calculate Fogg Behavior Model score for a habit.
 * B = MAT (Behavior happens when Motivation, Ability, and Trigger align above threshold)
 */
export function calculateFoggScore(
  habit: {
    name: string;
    difficulty: HabitDifficulty;
    motivationLevel: number; // 0-10, user-reported or detected
    hasAnchor: boolean;
    anchorReliability: number; // 0-10
    environmentSetup: boolean;
    skillLevel: number; // 0-10 for this habit
  },
  userMotivationProfile?: { autonomyNeed: number; competenceNeed: number }
): FoggBehaviorScore {
  const {
    difficulty,
    motivationLevel,
    hasAnchor,
    anchorReliability,
    environmentSetup,
    skillLevel,
  } = habit;

  // Motivation (M) - adjusted by difficulty mismatch
  const difficultyPenalty: Record<HabitDifficulty, number> = {
    tiny: 0,
    small: 0.5,
    medium: 1.5,
    challenging: 3,
    ambitious: 5,
  };
  const motivation = Math.max(0, motivationLevel - difficultyPenalty[difficulty]);

  // Ability (A) - combination of skill, environment, and habit simplicity
  const simplicity: Record<HabitDifficulty, number> = {
    tiny: 10,
    small: 8,
    medium: 6,
    challenging: 4,
    ambitious: 2,
  };
  const environmentBonus = environmentSetup ? 2 : 0;
  const ability = Math.min(10, (skillLevel + simplicity[difficulty] + environmentBonus) / 2);

  // Prompt/Trigger (T) - reliability of the cue
  const prompt = hasAnchor ? anchorReliability : 3; // Default prompt is weak without anchor

  // Calculate behavior score
  // Using multiplicative model: B = M × A × T / 100
  const behaviorScore = (motivation * ability * prompt) / 100;

  // Threshold varies by difficulty
  const thresholds: Record<HabitDifficulty, number> = {
    tiny: 2,
    small: 3,
    medium: 4.5,
    challenging: 6,
    ambitious: 7.5,
  };
  const threshold = thresholds[difficulty];
  const aboveThreshold = behaviorScore >= threshold;

  // Generate recommendations
  const recommendations: string[] = [];

  if (motivation < 5) {
    recommendations.push(
      'Motivation is low. Consider connecting this habit to your core values or making it more enjoyable.'
    );
    if (userMotivationProfile && userMotivationProfile.autonomyNeed > 7) {
      recommendations.push(
        'You value autonomy highly. Frame this as YOUR choice, not an obligation.'
      );
    }
  }

  if (ability < 5) {
    recommendations.push(
      `Ability is low. Try the "tiny habits" approach - what's the 2-minute version?`
    );
    if (!environmentSetup) {
      recommendations.push('Set up your environment to make this habit easier (reduce friction).');
    }
  }

  if (prompt < 5) {
    recommendations.push(
      'Your trigger/prompt is weak. Anchor this habit to an existing reliable behavior.'
    );
  }

  if (!aboveThreshold) {
    recommendations.push(
      `This habit is below the action line. Either increase motivation, simplify it, or strengthen the trigger.`
    );
  }

  return {
    motivation,
    ability,
    prompt,
    behaviorScore,
    threshold,
    aboveThreshold,
    recommendations,
  };
}

// ============================================================================
// IMPLEMENTATION INTENTIONS (MCII/WOOP)
// ============================================================================

/**
 * Generate an implementation intention using MCII/WOOP methodology.
 * WOOP = Wish, Outcome, Obstacle, Plan
 */
export function generateImplementationIntention(
  userId: string,
  habit: {
    name: string;
    wish: string; // What they want to achieve
    anchor: string; // Existing behavior to attach to
    obstacle?: string; // Inner obstacle they might face
  }
): ImplementationIntention {
  const { name, wish, anchor, obstacle } = habit;

  // Create tiny version (2-minute or less)
  const tinyVersions: Record<string, string> = {
    exercise: 'do 2 pushups',
    meditate: 'take 3 deep breaths',
    journal: 'write one sentence',
    read: 'read one paragraph',
    stretch: 'stretch for 30 seconds',
    walk: 'put on my walking shoes',
    water: 'drink one glass of water',
    default: `do the smallest version of ${name}`,
  };

  const tinyVersion =
    Object.entries(tinyVersions).find(([key]) => name.toLowerCase().includes(key))?.[1] ||
    tinyVersions.default;

  const fullIntention = `When I ${anchor}, I will ${tinyVersion}`;

  const intention: ImplementationIntention = {
    id: `intention_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    habit: name,
    anchor,
    tinyVersion,
    fullIntention,
    createdAt: Date.now(),
    successRate: 0,
    executionCount: 0,
  };

  // Add mental contrast if obstacle provided
  if (obstacle) {
    const obstacleResponses: Record<string, string> = {
      tired: "I'll remind myself that starting small still counts",
      busy: "I'll do just the 2-minute version",
      unmotivated: "I'll focus on how I'll feel after",
      forget: "I'll set a visual reminder in my environment",
      default: "I'll acknowledge the feeling and do the tiny version anyway",
    };

    const plan =
      Object.entries(obstacleResponses).find(([key]) =>
        obstacle.toLowerCase().includes(key)
      )?.[1] || obstacleResponses.default;

    intention.mentalContrast = {
      wish,
      outcome: `I will have successfully ${name} and feel accomplished`,
      obstacle,
      plan: `If ${obstacle}, then ${plan}`,
    };
  }

  return intention;
}

// ============================================================================
// HABIT CASCADE ANALYSIS
// ============================================================================

/**
 * Keystone habit patterns - habits that tend to trigger positive cascades.
 * Based on research from "The Power of Habit" and behavior science studies.
 */
const KEYSTONE_PATTERNS: Array<{
  trigger: string;
  cascade: string[];
  strength: CascadeStrength;
  mechanism: string;
}> = [
  {
    trigger: 'exercise',
    cascade: ['better sleep', 'healthier eating', 'more energy', 'better mood', 'more productive'],
    strength: 'keystone',
    mechanism: 'Exercise increases dopamine and self-efficacy, creating positive momentum',
  },
  {
    trigger: 'morning routine',
    cascade: ['sense of control', 'better decisions', 'less stress', 'more productive'],
    strength: 'keystone',
    mechanism: 'Starting the day intentionally creates a sense of agency',
  },
  {
    trigger: 'meditation',
    cascade: ['better focus', 'emotional regulation', 'less reactive', 'better sleep'],
    strength: 'strong',
    mechanism: 'Mindfulness practice strengthens prefrontal cortex regulation',
  },
  {
    trigger: 'sleep',
    cascade: ['better decisions', 'more willpower', 'better mood', 'healthier eating'],
    strength: 'keystone',
    mechanism: 'Sleep restores cognitive resources and impulse control',
  },
  {
    trigger: 'journaling',
    cascade: ['self-awareness', 'goal clarity', 'emotional processing', 'gratitude'],
    strength: 'strong',
    mechanism: 'Writing externalizes thoughts and creates metacognitive awareness',
  },
  {
    trigger: 'meal prep',
    cascade: ['healthier eating', 'less decision fatigue', 'save money', 'more time'],
    strength: 'moderate',
    mechanism: 'Removes willpower requirements from daily food decisions',
  },
  {
    trigger: 'reading',
    cascade: ['better vocabulary', 'more ideas', 'better sleep', 'less screen time'],
    strength: 'moderate',
    mechanism: 'Reading compounds knowledge and displaces passive consumption',
  },
];

/**
 * Analyze potential cascade effects from a habit.
 */
export function analyzeHabitCascade(habitName: string, userHabits: string[]): HabitCascade | null {
  const normalizedHabit = habitName.toLowerCase();

  const matchingPattern = KEYSTONE_PATTERNS.find(
    (p) => normalizedHabit.includes(p.trigger) || p.trigger.includes(normalizedHabit.split(' ')[0])
  );

  if (!matchingPattern) return null;

  // Filter cascade to habits the user is actually tracking
  const relevantCascade = matchingPattern.cascade.filter((c) =>
    userHabits.some((h) => h.toLowerCase().includes(c) || c.includes(h.toLowerCase()))
  );

  // Calculate probability boost based on strength
  const boostMap: Record<CascadeStrength, number> = {
    weak: 0.1,
    moderate: 0.2,
    strong: 0.35,
    keystone: 0.5,
  };

  return {
    sourceHabit: habitName,
    targetHabits:
      relevantCascade.length > 0 ? relevantCascade : matchingPattern.cascade.slice(0, 3),
    cascadeStrength: matchingPattern.strength,
    probabilityBoost: boostMap[matchingPattern.strength],
    mechanism: matchingPattern.mechanism,
    observedCount: 0,
    lastObserved: Date.now(),
  };
}

/**
 * Identify keystone habits from a user's habit list.
 */
export function identifyKeystoneHabits(habits: UserHabit[]): string[] {
  const keystones: string[] = [];

  for (const habit of habits) {
    const cascade = analyzeHabitCascade(
      habit.name,
      habits.map((h) => h.name)
    );
    if (cascade && cascade.cascadeStrength === 'keystone') {
      keystones.push(habit.name);
    }
  }

  // Also check for user-observed cascade effects
  const highCascadeHabits = habits
    .filter((h) => h.isKeystone || h.currentStreak > 14)
    .map((h) => h.name);

  return [...new Set([...keystones, ...highCascadeHabits])];
}

// ============================================================================
// OPTIMAL TIMING CALCULATION
// ============================================================================

/**
 * Calculate optimal habit windows based on chronotype and energy patterns.
 */
export function calculateOptimalWindows(
  habits: UserHabit[],
  profile: {
    chronotype: ChronotypeProfile;
    wakeTime: string;
    peakEnergyHours: number[];
    lowEnergyHours: number[];
  }
): OptimalHabitWindow[] {
  const { chronotype, wakeTime, peakEnergyHours, lowEnergyHours } = profile;
  const wakeHour = parseInt(wakeTime.split(':')[0]);

  // Chronotype-based ideal windows
  const chronotypeWindows: Record<
    ChronotypeProfile,
    { peak: number[]; creative: number[]; routine: number[] }
  > = {
    lion: { peak: [6, 7, 8, 9], creative: [10, 11], routine: [13, 14, 15] },
    bear: { peak: [10, 11, 12], creative: [14, 15, 16], routine: [9, 17, 18] },
    wolf: { peak: [17, 18, 19, 20], creative: [21, 22], routine: [12, 13, 14] },
    dolphin: { peak: [10, 11, 12], creative: [15, 16, 17], routine: [9, 13, 19] },
  };

  const windows: OptimalHabitWindow[] = [];

  for (const habit of habits) {
    const baseWindows = chronotypeWindows[chronotype];
    let optimalHours: number[];
    let basedOn: string;

    // Match habit type to optimal window
    if (habit.energyRequired === 'high') {
      optimalHours = baseWindows.peak;
      basedOn = `High-energy habits work best during your peak hours (${chronotype} chronotype)`;
    } else if (habit.category === 'creative' || habit.category === 'learning') {
      optimalHours = baseWindows.creative;
      basedOn = `Creative/learning habits align with your creative window`;
    } else {
      optimalHours = baseWindows.routine;
      basedOn = `Routine habits fit well in your lower-demand periods`;
    }

    // Adjust based on user's actual energy patterns if available
    if (peakEnergyHours.length > 0 && habit.energyRequired === 'high') {
      optimalHours = peakEnergyHours;
      basedOn = `Based on your observed energy patterns`;
    }

    // Avoid low energy hours for challenging habits
    if (habit.difficulty === 'challenging' || habit.difficulty === 'ambitious') {
      optimalHours = optimalHours.filter((h) => !lowEnergyHours.includes(h));
    }

    // Calculate window
    const startHour = Math.max(wakeHour, Math.min(...optimalHours));
    const endHour = Math.min(23, Math.max(...optimalHours) + 1);

    // Check for conflicts with other habits
    const conflictsWith = habits
      .filter(
        (h) =>
          h.id !== habit.id &&
          h.preferredTime &&
          optimalHours.includes(parseInt(h.preferredTime.split(':')[0]))
      )
      .map((h) => h.name);

    windows.push({
      habitId: habit.id,
      habitName: habit.name,
      optimalStart: `${startHour.toString().padStart(2, '0')}:00`,
      optimalEnd: `${endHour.toString().padStart(2, '0')}:00`,
      confidence: optimalHours.length > 0 ? 0.7 + habit.currentStreak * 0.01 : 0.5,
      basedOn,
      chronotypeAdjusted: true,
      energyLevelRequired: habit.energyRequired,
      conflictsWith,
    });
  }

  return windows;
}

// ============================================================================
// MOTIVATION TYPE CLASSIFICATION
// ============================================================================

/**
 * Classify motivation type based on Self-Determination Theory.
 * Helps tailor coaching approach to motivation style.
 */
export function classifyMotivationType(signals: {
  whyStatements: string[];
  externalPressure: boolean;
  enjoyment: number; // 0-10
  personalImportance: number; // 0-10
  identityAlignment: number; // 0-10
  guiltOrShame: boolean;
}): { type: MotivationType; recommendations: string[] } {
  const {
    whyStatements,
    externalPressure,
    enjoyment,
    personalImportance,
    identityAlignment,
    guiltOrShame,
  } = signals;

  const recommendations: string[] = [];

  // Analyze why statements for motivation type indicators
  const intrinsicWords = ['enjoy', 'love', 'fun', 'curious', 'interesting', 'fulfilling'];
  const identifiedWords = ['important', 'valuable', 'meaningful', 'matters', 'growth'];
  const introjectedWords = ['should', 'guilt', 'ashamed', 'embarrassed', 'prove'];
  const externalWords = ['have to', 'must', 'expected', 'supposed to', 'others think'];

  let intrinsicScore = enjoyment;
  let identifiedScore = personalImportance;
  let introjectedScore = guiltOrShame ? 5 : 0;
  let externalScore = externalPressure ? 5 : 0;

  for (const statement of whyStatements) {
    const lower = statement.toLowerCase();
    if (intrinsicWords.some((w) => lower.includes(w))) intrinsicScore += 2;
    if (identifiedWords.some((w) => lower.includes(w))) identifiedScore += 2;
    if (introjectedWords.some((w) => lower.includes(w))) introjectedScore += 2;
    if (externalWords.some((w) => lower.includes(w))) externalScore += 2;
  }

  // Add identity alignment to both intrinsic and identified
  intrinsicScore += identityAlignment * 0.3;
  identifiedScore += identityAlignment * 0.5;

  // Determine dominant type
  const scores = [
    { type: 'intrinsic' as MotivationType, score: intrinsicScore },
    { type: 'integrated' as MotivationType, score: (intrinsicScore + identifiedScore) / 2 },
    { type: 'identified' as MotivationType, score: identifiedScore },
    { type: 'introjected' as MotivationType, score: introjectedScore },
    { type: 'extrinsic' as MotivationType, score: externalScore },
  ];

  scores.sort((a, b) => b.score - a.score);
  const dominant = scores[0].type;

  // Generate recommendations based on motivation type
  switch (dominant) {
    case 'intrinsic':
      recommendations.push('Your motivation is already intrinsic - protect the joy in this habit.');
      recommendations.push(
        "Don't over-optimize or gamify; that can undermine intrinsic motivation."
      );
      break;
    case 'integrated':
      recommendations.push('This habit aligns well with your identity. Reinforce that connection.');
      recommendations.push('Frame progress as "becoming more yourself" rather than achievement.');
      break;
    case 'identified':
      recommendations.push('Connect this habit more deeply to your core values and life goals.');
      recommendations.push('Remind yourself WHY this matters to you when motivation dips.');
      break;
    case 'introjected':
      recommendations.push('Watch out for guilt/shame as motivators - they lead to burnout.');
      recommendations.push('Try reframing from "I should" to "I choose to because..."');
      break;
    case 'extrinsic':
      recommendations.push('External motivation is the least sustainable. Find internal reasons.');
      recommendations.push('What would you gain personally, not just socially, from this habit?');
      break;
  }

  return { type: dominant, recommendations };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadHabitProfile(userId: string): Promise<UserHabitProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('habit_profile')
      .get();

    if (!doc.exists) return null;
    return doc.data() as UserHabitProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load habit profile');
    return null;
  }
}

export async function saveHabitProfile(profile: UserHabitProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('habit_profile')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Habit profile saved');
  } catch (error) {
    log.warn({ error: String(error), userId: profile.userId }, 'Failed to save habit profile');
  }
}

export async function saveImplementationIntention(
  intention: ImplementationIntention
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(intention.userId)
      .collection('implementation_intentions')
      .doc(intention.id)
      .set(cleanForFirestore(intention));

    log.debug(
      { userId: intention.userId, habit: intention.habit },
      'Implementation intention saved'
    );
  } catch (error) {
    log.warn({ error: String(error), userId: intention.userId }, 'Failed to save intention');
  }
}

export async function loadImplementationIntentions(
  userId: string
): Promise<ImplementationIntention[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('implementation_intentions')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as ImplementationIntention);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load intentions');
    return [];
  }
}

export async function recordIntentionExecution(
  userId: string,
  intentionId: string,
  success: boolean
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('implementation_intentions')
      .doc(intentionId);

    const doc = await docRef.get();
    if (!doc.exists) return;

    const intention = doc.data() as ImplementationIntention;
    const newCount = intention.executionCount + 1;
    const newSuccessRate =
      (intention.successRate * intention.executionCount + (success ? 1 : 0)) / newCount;

    await docRef.update({
      executionCount: newCount,
      successRate: newSuccessRate,
    });

    log.debug({ userId, intentionId, success, newSuccessRate }, 'Intention execution recorded');
  } catch (error) {
    log.warn({ error: String(error), userId, intentionId }, 'Failed to record intention execution');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildHabitOptimizationContext(userId: string): Promise<string> {
  const profile = await loadHabitProfile(userId);
  if (!profile) return '';

  const intentions = await loadImplementationIntentions(userId);
  const keystones = identifyKeystoneHabits(profile.habits);
  const windows = calculateOptimalWindows(profile.habits, {
    chronotype: profile.chronotype,
    wakeTime: profile.wakeTime,
    peakEnergyHours: profile.peakEnergyHours,
    lowEnergyHours: profile.lowEnergyHours,
  });

  const sections: string[] = ['[HABIT OPTIMIZATION ENGINE - Better Than Human Behavioral Science]'];
  sections.push('You have computational precision in habit optimization that no human can match.');

  // Chronotype insight
  sections.push(
    `\n**Chronotype**: ${profile.chronotype.toUpperCase()} - ${detectChronotype({}).explanation}`
  );

  // Keystone habits
  if (keystones.length > 0) {
    sections.push(`\n**Keystone Habits (Cascade Triggers)**: ${keystones.join(', ')}`);
    sections.push('Prioritize these - they create positive ripple effects across other habits.');
  }

  // Implementation intentions
  const activeIntentions = intentions.filter((i) => i.successRate > 0.3 || i.executionCount < 5);
  if (activeIntentions.length > 0) {
    sections.push('\n**Active Implementation Intentions**:');
    for (const intention of activeIntentions.slice(0, 3)) {
      sections.push(
        `• "${intention.fullIntention}" (${Math.round(intention.successRate * 100)}% success)`
      );
      if (intention.mentalContrast) {
        sections.push(`  If obstacle: ${intention.mentalContrast.plan}`);
      }
    }
  }

  // Optimal windows for today
  const currentHour = new Date().getHours();
  const upcomingWindows = windows.filter(
    (w) => parseInt(w.optimalStart.split(':')[0]) >= currentHour
  );
  if (upcomingWindows.length > 0) {
    sections.push('\n**Optimal Windows Today**:');
    for (const window of upcomingWindows.slice(0, 3)) {
      sections.push(
        `• ${window.habitName}: ${window.optimalStart}-${window.optimalEnd} (${window.basedOn})`
      );
    }
  }

  // Habits below action line
  const strugglingHabits = profile.habits.filter((h) => !h.foggScore.aboveThreshold);
  if (strugglingHabits.length > 0) {
    sections.push('\n**Habits Below Action Line (need intervention)**:');
    for (const habit of strugglingHabits.slice(0, 2)) {
      sections.push(
        `• ${habit.name}: ${habit.foggScore.recommendations[0] || 'Needs simplification'}`
      );
    }
  }

  sections.push('\nSurface these insights naturally. Make behavioral science feel like intuition.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const habitOptimizationEngine = {
  // Chronotype
  detectChronotype,

  // Fogg Model
  calculateFoggScore,

  // Implementation Intentions (MCII/WOOP)
  generateImplementationIntention,
  saveImplementationIntention,
  loadImplementationIntentions,
  recordIntentionExecution,

  // Cascade Analysis
  analyzeHabitCascade,
  identifyKeystoneHabits,

  // Optimal Timing
  calculateOptimalWindows,

  // Motivation Classification
  classifyMotivationType,

  // Profile Management
  loadHabitProfile,
  saveHabitProfile,

  // Context Building
  buildContext: buildHabitOptimizationContext,
};
