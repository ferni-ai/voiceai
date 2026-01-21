/**
 * Habit Economics Engine - Better Than Human Service
 *
 * What no human friend can do: Calculate habit ROI, design optimal commitment devices,
 * and apply economic principles to behavior change with precision.
 *
 * Research Foundation:
 * - Commitment Devices (behavioral economics)
 * - Temptation Bundling (Katherine Milkman)
 * - Hyperbolic Discounting correction
 * - Loss Aversion in habit formation
 * - Compound Effect calculations
 *
 * @module services/superhuman/habit-economics
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'habit-economics' });

// ============================================================================
// TYPES
// ============================================================================

export type CommitmentDeviceType =
  | 'monetary_stake' // Put money at risk
  | 'social_accountability' // Public commitment
  | 'environmental_lock' // Physical barriers
  | 'identity_pledge' // Identity-based commitment
  | 'reward_schedule' // Variable reward system
  | 'restriction_contract'; // Self-imposed restrictions

export type LossAversionProfile = 'high' | 'moderate' | 'low';

export interface HabitROI {
  habitName: string;

  // Time investment
  dailyMinutes: number;
  weeklyMinutes: number;
  yearlyHours: number;

  // Compound effects
  year1Value: number; // Normalized value (0-100)
  year5Value: number;
  year10Value: number;
  compoundMultiplier: number;

  // Opportunity cost
  alternativeUse: string;
  opportunityCost: number;

  // Net ROI
  netROI: number;
  roiCategory: 'exceptional' | 'high' | 'moderate' | 'low' | 'negative';

  // Comparison
  betterThan: string[];
  worseThan: string[];
}

export interface CommitmentDevice {
  id: string;
  userId: string;
  habitId: string;
  type: CommitmentDeviceType;

  // Device details
  description: string;
  stakeAmount?: number; // For monetary stakes
  beneficiary?: string; // Who gets the money if you fail
  witnesses?: string[]; // For social accountability
  environmentChange?: string; // For environmental locks

  // Triggers
  triggerCondition: string; // When does the commitment kick in
  frequency: 'daily' | 'weekly' | 'monthly';

  // Tracking
  successCount: number;
  failureCount: number;
  totalStakeLost: number;
  effectivenessScore: number; // 0-1

  createdAt: number;
  expiresAt?: number;
  active: boolean;
}

export interface TemptationBundle {
  id: string;
  userId: string;

  // The pairing
  wantActivity: string; // Enjoyable activity
  shouldActivity: string; // Habit to reinforce

  // Rules
  rule: string; // e.g., "Only listen to podcast while exercising"
  strictness: 'strict' | 'flexible';

  // Tracking
  complianceRate: number;
  bundleExecutions: number;
  enjoymentRetained: number; // 0-1, does the want activity stay enjoyable?

  createdAt: number;
  active: boolean;
}

export interface DiscountingProfile {
  userId: string;

  // Present bias measurement
  presentBias: number; // 0-1, how much they discount the future

  // Measured preferences
  preferNowVsLater: Array<{
    nowAmount: number;
    laterAmount: number;
    laterDays: number;
    choseNow: boolean;
  }>;

  // Calculated parameters
  beta: number; // Quasi-hyperbolic parameter (present bias)
  delta: number; // Standard discount factor

  // Recommendations
  needsCommitmentDevices: boolean;
  optimalRewardDelay: number; // Days

  updatedAt: number;
}

export interface HabitEconomicsProfile {
  userId: string;
  lossAversion: LossAversionProfile;
  discounting: DiscountingProfile;
  commitmentDevices: CommitmentDevice[];
  bundles: TemptationBundle[];
  habitROIs: Record<string, HabitROI>;
  totalInvestmentMinutesPerWeek: number;
  updatedAt: number;
}

// ============================================================================
// HABIT ROI CALCULATION
// ============================================================================

/**
 * Compound effect multipliers for different habit categories.
 * Based on research into long-term habit effects.
 */
const COMPOUND_MULTIPLIERS: Record<
  string,
  { year1: number; year5: number; year10: number; category: string }
> = {
  exercise: { year1: 1.2, year5: 2.5, year10: 5.0, category: 'Health & Energy' },
  meditation: { year1: 1.3, year5: 2.2, year10: 4.0, category: 'Mental Clarity' },
  reading: { year1: 1.4, year5: 3.0, year10: 8.0, category: 'Knowledge' },
  journaling: { year1: 1.2, year5: 2.0, year10: 3.5, category: 'Self-Awareness' },
  sleep: { year1: 1.5, year5: 2.8, year10: 4.5, category: 'Foundation' },
  learning: { year1: 1.5, year5: 4.0, year10: 12.0, category: 'Skills' },
  networking: { year1: 1.3, year5: 3.5, year10: 10.0, category: 'Relationships' },
  saving: { year1: 1.07, year5: 1.4, year10: 2.0, category: 'Financial' },
  creative: { year1: 1.2, year5: 2.5, year10: 5.0, category: 'Expression' },
  default: { year1: 1.1, year5: 1.5, year10: 2.0, category: 'General' },
};

/**
 * Calculate the ROI of a habit over time using compound effect principles.
 */
export function calculateHabitROI(habit: {
  name: string;
  category: string;
  dailyMinutes: number;
  perceivedValue: number; // 1-10, how valuable does user think this is
  currentStreak: number;
  alternativeUse?: string;
}): HabitROI {
  const { name, category, dailyMinutes, perceivedValue, currentStreak, alternativeUse } = habit;

  // Get compound multipliers for this category
  const multipliers = COMPOUND_MULTIPLIERS[category.toLowerCase()] || COMPOUND_MULTIPLIERS.default;

  // Base value from perceived value and time invested
  const baseValue = perceivedValue * 10 * Math.log10(dailyMinutes + 1);

  // Apply compound multipliers
  const year1Value = baseValue * multipliers.year1;
  const year5Value = baseValue * multipliers.year5;
  const year10Value = baseValue * multipliers.year10;

  // Calculate time investment
  const weeklyMinutes = dailyMinutes * 7;
  const yearlyHours = (dailyMinutes * 365) / 60;

  // Opportunity cost (what else could they do with this time)
  const opportunityCostBase =
    dailyMinutes < 15 ? 10 : dailyMinutes < 30 ? 25 : dailyMinutes < 60 ? 40 : 60;
  const opportunityCost = opportunityCostBase * (1 - Math.min(currentStreak, 30) / 30); // Reduces with streak

  // Calculate net ROI
  const avgYearlyValue = (year1Value + year5Value / 5 + year10Value / 10) / 3;
  const netROI = avgYearlyValue - opportunityCost;

  // Categorize ROI
  let roiCategory: HabitROI['roiCategory'];
  if (netROI > 80) roiCategory = 'exceptional';
  else if (netROI > 50) roiCategory = 'high';
  else if (netROI > 20) roiCategory = 'moderate';
  else if (netROI > 0) roiCategory = 'low';
  else roiCategory = 'negative';

  // Comparison with other common activities
  const betterThan: string[] = [];
  const worseThan: string[] = [];

  if (netROI > 60) {
    betterThan.push('social media scrolling', 'watching TV', 'hitting snooze');
  }
  if (netROI > 40) {
    betterThan.push('casual gaming', 'passive entertainment');
  }
  if (netROI < 30 && dailyMinutes > 60) {
    worseThan.push('shorter, more intense practice');
  }
  if (netROI < 20) {
    worseThan.push("sleep (if you're sleep deprived)", 'exercise (if sedentary)');
  }

  return {
    habitName: name,
    dailyMinutes,
    weeklyMinutes,
    yearlyHours,
    year1Value,
    year5Value,
    year10Value,
    compoundMultiplier: multipliers.year10,
    alternativeUse: alternativeUse || 'unstructured time',
    opportunityCost,
    netROI,
    roiCategory,
    betterThan,
    worseThan,
  };
}

// ============================================================================
// COMMITMENT DEVICES
// ============================================================================

/**
 * Recommend optimal commitment device based on user's profile.
 */
export function recommendCommitmentDevice(profile: {
  lossAversion: LossAversionProfile;
  socialMotivation: number; // 0-10
  financialFlexibility: number; // 0-10
  environmentControl: number; // 0-10, how much can they modify their environment
  identityDriven: boolean;
  habitDifficulty: 'easy' | 'moderate' | 'hard';
}): { device: CommitmentDeviceType; explanation: string; setup: string } {
  const {
    lossAversion,
    socialMotivation,
    financialFlexibility,
    environmentControl,
    identityDriven,
    habitDifficulty,
  } = profile;

  // Score each device type
  const scores: Array<{
    device: CommitmentDeviceType;
    score: number;
    explanation: string;
    setup: string;
  }> = [
    {
      device: 'monetary_stake',
      score:
        (lossAversion === 'high' ? 8 : lossAversion === 'moderate' ? 5 : 2) +
        financialFlexibility * 0.5 +
        (habitDifficulty === 'hard' ? 3 : 0),
      explanation:
        'Put money at risk. Your loss aversion makes financial stakes powerful motivators.',
      setup:
        'Set aside $X that you forfeit to a charity you dislike if you miss your habit. Apps like Beeminder or StickK can automate this.',
    },
    {
      device: 'social_accountability',
      score:
        socialMotivation +
        (lossAversion === 'high' ? 2 : 0) +
        (habitDifficulty === 'moderate' ? 2 : 0),
      explanation: 'Public commitment leverages social pressure. You care about what others think.',
      setup:
        'Tell a friend your goal and ask them to check in. Post progress publicly. Join an accountability group.',
    },
    {
      device: 'environmental_lock',
      score:
        environmentControl * 1.2 +
        (habitDifficulty === 'hard' ? 3 : habitDifficulty === 'easy' ? 1 : 2),
      explanation:
        'Modify your environment to make the wrong choice impossible. Remove willpower from the equation.',
      setup:
        'Example: Delete social media apps, put your alarm across the room, prep gym bag the night before.',
    },
    {
      device: 'identity_pledge',
      score: identityDriven ? 10 : 3 + (habitDifficulty === 'hard' ? 2 : 0),
      explanation:
        'Frame the habit as who you ARE, not what you DO. Identity-based habits are most durable.',
      setup:
        'Write down: "I am a person who [habit]." Every time you do the habit, say "This is who I am."',
    },
    {
      device: 'reward_schedule',
      score: 5 + (habitDifficulty === 'easy' ? 3 : 0) + (lossAversion === 'low' ? 2 : 0),
      explanation: 'Variable rewards keep habits engaging. Good for habits that might get boring.',
      setup:
        'Create a reward menu. After completing habits, spin a wheel or draw from a reward jar. Mix small and large rewards.',
    },
  ];

  // Sort by score
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  return {
    device: best.device,
    explanation: best.explanation,
    setup: best.setup,
  };
}

/**
 * Calculate optimal stake amount for monetary commitment devices.
 */
export function calculateOptimalStake(profile: {
  monthlyIncome: number;
  lossAversion: LossAversionProfile;
  habitImportance: number; // 1-10
  previousFailures: number;
}): { amount: number; rationale: string; frequency: 'daily' | 'weekly' | 'monthly' } {
  const { monthlyIncome, lossAversion, habitImportance, previousFailures } = profile;

  // Base stake as percentage of income
  const basePercentage =
    lossAversion === 'high' ? 0.005 : lossAversion === 'moderate' ? 0.01 : 0.02;

  // Adjust for importance and past failures
  const importanceMultiplier = 0.5 + habitImportance * 0.1;
  const failureMultiplier = 1 + previousFailures * 0.1;

  // Calculate amount
  let amount = monthlyIncome * basePercentage * importanceMultiplier * failureMultiplier;

  // Cap at reasonable levels
  amount = Math.min(amount, monthlyIncome * 0.05); // Max 5% of income
  amount = Math.max(amount, 5); // Min $5

  // Determine frequency based on stake size
  let frequency: 'daily' | 'weekly' | 'monthly';
  let rationale: string;

  if (amount < 10) {
    frequency = 'daily';
    rationale = `Small daily stake (${amount.toFixed(2)}) creates consistent pressure without major financial risk.`;
  } else if (amount < 50) {
    frequency = 'weekly';
    rationale = `Weekly stake of $${amount.toFixed(2)} is meaningful but not overwhelming.`;
  } else {
    frequency = 'monthly';
    amount = amount * 4; // Convert to monthly equivalent
    rationale = `Monthly stake of $${amount.toFixed(2)} creates significant accountability.`;
  }

  return { amount: Math.round(amount * 100) / 100, rationale, frequency };
}

// ============================================================================
// TEMPTATION BUNDLING
// ============================================================================

/**
 * Generate temptation bundle suggestions.
 * Based on Katherine Milkman's temptation bundling research.
 */
export function suggestTemptationBundles(profile: {
  wantActivities: string[]; // Things they enjoy but feel guilty about
  shouldHabits: string[]; // Habits they want to build
  activityCompatibility?: Record<string, string[]>; // Which activities can be done together
}): Array<{
  bundle: string;
  wantActivity: string;
  shouldActivity: string;
  compatibility: 'high' | 'medium' | 'low';
}> {
  const { wantActivities, shouldHabits } = profile;

  // Default compatibility matrix
  const defaultCompatibility: Record<string, string[]> = {
    podcast: ['exercise', 'walking', 'commute', 'cleaning', 'cooking'],
    audiobook: ['exercise', 'walking', 'commute', 'cleaning'],
    music: ['exercise', 'cleaning', 'cooking', 'work'],
    tv_show: ['treadmill', 'stationary bike', 'stretching'],
    coffee: ['reading', 'journaling', 'planning'],
    snacks: ['studying', 'reading'],
    social_media: ['cardio', 'waiting'],
    gaming: ['exercise bike'],
  };

  const bundles: Array<{
    bundle: string;
    wantActivity: string;
    shouldActivity: string;
    compatibility: 'high' | 'medium' | 'low';
  }> = [];

  for (const want of wantActivities) {
    const normalizedWant = want.toLowerCase().replace(/\s+/g, '_');
    const compatibleShould = defaultCompatibility[normalizedWant] || [];

    for (const should of shouldHabits) {
      const normalizedShould = should.toLowerCase();

      let compatibility: 'high' | 'medium' | 'low' = 'low';

      if (compatibleShould.some((c) => normalizedShould.includes(c))) {
        compatibility = 'high';
      } else if (
        ['audio', 'listen', 'music', 'podcast'].some((w) => normalizedWant.includes(w)) &&
        ['exercise', 'walk', 'run', 'clean'].some((w) => normalizedShould.includes(w))
      ) {
        compatibility = 'medium';
      }

      if (compatibility !== 'low') {
        bundles.push({
          bundle: `Only ${want} while ${should}`,
          wantActivity: want,
          shouldActivity: should,
          compatibility,
        });
      }
    }
  }

  // Sort by compatibility
  bundles.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.compatibility] - order[b.compatibility];
  });

  return bundles.slice(0, 5);
}

// ============================================================================
// HYPERBOLIC DISCOUNTING
// ============================================================================

/**
 * Measure present bias through hypothetical choices.
 * Uses quasi-hyperbolic discounting model.
 */
export function measurePresentBias(
  choices: Array<{
    nowAmount: number;
    laterAmount: number;
    laterDays: number;
    choseNow: boolean;
  }>
): { beta: number; delta: number; presentBias: number; recommendation: string } {
  if (choices.length < 3) {
    return {
      beta: 0.7, // Default moderate present bias
      delta: 0.99,
      presentBias: 0.3,
      recommendation:
        'Need more data to accurately measure present bias. Try more comparison questions.',
    };
  }

  // Calculate implied discount rates for each choice
  const impliedRates: number[] = [];

  for (const choice of choices) {
    if (choice.choseNow) {
      // They preferred now, so their discount rate is at least this high
      const rate = Math.pow(choice.nowAmount / choice.laterAmount, 365 / choice.laterDays);
      impliedRates.push(rate);
    } else {
      // They preferred later, so their discount rate is below this
      const rate = Math.pow(choice.nowAmount / choice.laterAmount, 365 / choice.laterDays);
      impliedRates.push(1 / rate);
    }
  }

  // Estimate beta (present bias) and delta (standard discounting)
  // Higher beta = more present bias (0 = extreme, 1 = none)
  const avgRate = impliedRates.reduce((a, b) => a + b, 0) / impliedRates.length;
  const beta = Math.min(1, Math.max(0.3, 1 - (avgRate - 1) / 2));
  const delta = 0.99; // Standard daily discount factor

  const presentBias = 1 - beta;

  let recommendation: string;
  if (presentBias > 0.5) {
    recommendation =
      'Strong present bias detected. You heavily discount future rewards. Use commitment devices and make future benefits feel more immediate.';
  } else if (presentBias > 0.25) {
    recommendation =
      'Moderate present bias. You can resist some temptations but benefit from structure. Pre-commit to decisions when possible.';
  } else {
    recommendation =
      'Low present bias. You naturally value future rewards well. Focus on maintaining this through visualization and goal tracking.';
  }

  return { beta, delta, presentBias, recommendation };
}

/**
 * Design interventions to correct hyperbolic discounting.
 */
export function designDiscountingIntervention(presentBias: number): {
  interventions: string[];
  rewardDelay: number; // Optimal days to delay rewards
  visualizationPrompts: string[];
} {
  const interventions: string[] = [];
  const visualizationPrompts: string[] = [];

  if (presentBias > 0.5) {
    interventions.push('Use immediate micro-rewards for each habit completion');
    interventions.push("Pre-commit to decisions: decide tomorrow's choices today");
    interventions.push('Remove yourself from temptation environments');
    visualizationPrompts.push(
      'Imagine yourself 1 week from now thanking present-you for this choice'
    );
  } else if (presentBias > 0.25) {
    interventions.push('Balance immediate and delayed rewards');
    interventions.push('Use calendar blocking to protect future-self decisions');
    visualizationPrompts.push(
      'Picture your future self in 1 month - what would they want you to do?'
    );
  } else {
    interventions.push('You can use delayed rewards effectively');
    interventions.push('Consider longer-term reward systems that compound');
    visualizationPrompts.push('Envision your life in 5 years with this habit fully established');
  }

  // Optimal reward delay based on bias level
  const rewardDelay =
    presentBias > 0.5
      ? 0 // Immediate
      : presentBias > 0.25
        ? 1 // Daily
        : 7; // Weekly

  return { interventions, rewardDelay, visualizationPrompts };
}

// ============================================================================
// LOSS AVERSION ASSESSMENT
// ============================================================================

/**
 * Assess loss aversion level from user signals.
 */
export function assessLossAversion(signals: {
  riskPreference?: 'risk_averse' | 'neutral' | 'risk_seeking';
  reactionToLoss?: 'devastated' | 'upset' | 'disappointed' | 'accepting';
  streakProtection?: number; // 1-10, how much do they care about protecting streaks
  sunkCostSensitivity?: number; // 1-10, how much do sunk costs affect them
}): LossAversionProfile {
  let score = 5; // Start neutral

  if (signals.riskPreference === 'risk_averse') score += 2;
  else if (signals.riskPreference === 'risk_seeking') score -= 2;

  if (signals.reactionToLoss === 'devastated') score += 3;
  else if (signals.reactionToLoss === 'upset') score += 1;
  else if (signals.reactionToLoss === 'accepting') score -= 2;

  if (signals.streakProtection) score += (signals.streakProtection - 5) * 0.5;
  if (signals.sunkCostSensitivity) score += (signals.sunkCostSensitivity - 5) * 0.3;

  if (score >= 7) return 'high';
  if (score >= 4) return 'moderate';
  return 'low';
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadHabitEconomicsProfile(
  userId: string
): Promise<HabitEconomicsProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('habit_economics')
      .get();

    if (!doc.exists) return null;
    return doc.data() as HabitEconomicsProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load habit economics profile');
    return null;
  }
}

export async function saveHabitEconomicsProfile(profile: HabitEconomicsProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('habit_economics')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Habit economics profile saved');
  } catch (error) {
    log.warn(
      { error: String(error), userId: profile.userId },
      'Failed to save habit economics profile'
    );
  }
}

export async function saveCommitmentDevice(device: CommitmentDevice): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(device.userId)
      .collection('commitment_devices')
      .doc(device.id)
      .set(cleanForFirestore(device));

    log.debug({ userId: device.userId, deviceId: device.id }, 'Commitment device saved');
  } catch (error) {
    log.warn({ error: String(error), userId: device.userId }, 'Failed to save commitment device');
  }
}

export async function recordCommitmentOutcome(
  userId: string,
  deviceId: string,
  success: boolean,
  stakeLost?: number
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('commitment_devices')
      .doc(deviceId);
    const doc = await docRef.get();
    if (!doc.exists) return;

    const device = doc.data() as CommitmentDevice;
    const newSuccessCount = device.successCount + (success ? 1 : 0);
    const newFailureCount = device.failureCount + (success ? 0 : 1);
    const newTotalStakeLost = device.totalStakeLost + (stakeLost || 0);
    const totalAttempts = newSuccessCount + newFailureCount;

    await docRef.update({
      successCount: newSuccessCount,
      failureCount: newFailureCount,
      totalStakeLost: newTotalStakeLost,
      effectivenessScore: totalAttempts > 0 ? newSuccessCount / totalAttempts : 0,
    });

    log.debug({ userId, deviceId, success }, 'Commitment outcome recorded');
  } catch (error) {
    log.warn({ error: String(error), userId, deviceId }, 'Failed to record commitment outcome');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildHabitEconomicsContext(userId: string): Promise<string> {
  const profile = await loadHabitEconomicsProfile(userId);
  if (!profile) return '';

  const sections: string[] = ['[HABIT ECONOMICS - Better Than Human Behavioral Economics]'];
  sections.push('You apply economic principles to behavior change with computational precision.');

  // Loss aversion insight
  sections.push(`\n**Loss Aversion Profile**: ${profile.lossAversion.toUpperCase()}`);
  if (profile.lossAversion === 'high') {
    sections.push(
      'Frame habit breaks as losses, not missed gains. Streaks are powerful for this person.'
    );
  }

  // Present bias insight
  if (profile.discounting) {
    const biasLevel =
      profile.discounting.presentBias > 0.5
        ? 'HIGH'
        : profile.discounting.presentBias > 0.25
          ? 'MODERATE'
          : 'LOW';
    sections.push(`\n**Present Bias**: ${biasLevel}`);
    sections.push(
      profile.discounting.needsCommitmentDevices
        ? 'Benefits significantly from commitment devices and pre-commitment strategies.'
        : 'Can work with delayed rewards; good self-regulation.'
    );
  }

  // Active commitment devices
  const activeDevices = profile.commitmentDevices?.filter((d) => d.active) || [];
  if (activeDevices.length > 0) {
    sections.push('\n**Active Commitment Devices**:');
    for (const device of activeDevices.slice(0, 2)) {
      const effectiveness = Math.round(device.effectivenessScore * 100);
      sections.push(`• ${device.type}: ${device.description} (${effectiveness}% effective)`);
    }
  }

  // Top ROI habits
  const sortedROIs = Object.entries(profile.habitROIs || {})
    .sort(([, a], [, b]) => b.netROI - a.netROI)
    .slice(0, 3);

  if (sortedROIs.length > 0) {
    sections.push('\n**Highest ROI Habits**:');
    for (const [, roi] of sortedROIs) {
      sections.push(
        `• ${roi.habitName}: ${roi.roiCategory} ROI (${Math.round(roi.netROI)} score, compounds ${roi.compoundMultiplier}x over 10 years)`
      );
    }
  }

  // Active bundles
  const activeBundles = profile.bundles?.filter((b) => b.active) || [];
  if (activeBundles.length > 0) {
    sections.push('\n**Temptation Bundles**:');
    for (const bundle of activeBundles.slice(0, 2)) {
      sections.push(`• ${bundle.rule} (${Math.round(bundle.complianceRate * 100)}% compliance)`);
    }
  }

  sections.push('\nUse economic framing naturally. Make compound effects feel tangible.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const habitEconomics = {
  // ROI Calculation
  calculateHabitROI,

  // Commitment Devices
  recommendCommitmentDevice,
  calculateOptimalStake,
  saveCommitmentDevice,
  recordCommitmentOutcome,

  // Temptation Bundling
  suggestTemptationBundles,

  // Discounting
  measurePresentBias,
  designDiscountingIntervention,

  // Loss Aversion
  assessLossAversion,

  // Profile Management
  loadProfile: loadHabitEconomicsProfile,
  saveProfile: saveHabitEconomicsProfile,

  // Context Building
  buildContext: buildHabitEconomicsContext,
};
