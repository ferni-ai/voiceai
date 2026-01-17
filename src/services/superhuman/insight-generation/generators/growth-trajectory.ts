/**
 * Growth Trajectory Insight Generator
 *
 * Generates insights that celebrate and reflect on growth:
 * - "Remember when you couldn't even say his name? Now you're reflecting with clarity."
 * - "Three months ago Sunday nights spiraled. You've handled 4 in a row."
 * - "You've come so far on this journey."
 *
 * Humans don't track growth objectively. We do.
 *
 * @module services/superhuman/insight-generation/generators/growth-trajectory
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getGrowthFingerprint } from '../../semantic-intelligence/growth-fingerprint.js';
import { registerInsightGenerator } from '../engine.js';
import type { GeneratedInsight, InsightGenerator, InsightGeneratorContext } from '../types.js';

const log = createLogger({ module: 'insight-gen:growth' });

// ============================================================================
// TEMPLATES
// ============================================================================

const GROWTH_TEMPLATES = {
  then_vs_now: [
    "Remember when {startingPoint}? Look at you now—{currentPoint}. That's real growth.",
    "I want to pause and acknowledge something. {startingPoint}, and now? {currentPoint}. You've worked for this.",
    "Something I've watched unfold: you went from {startingPoint} to {currentPoint}. That's not nothing.",
  ],
  pattern_broken: [
    "You used to {oldPattern}. The last {count} times? You handled it differently. That pattern is breaking.",
    "I've noticed a shift. {oldPattern} used to be your go-to, but not anymore. You're responding differently now.",
    "There's something worth celebrating: {oldPattern} was so hard for you. Now it's not. What changed?",
  ],
  milestone_reached: [
    "This is a milestone worth marking: {milestone}. You've been working toward this.",
    "I want to celebrate with you: {milestone}. That took courage and consistency.",
    "Look at that: {milestone}. Remember when this felt impossible?",
  ],
  gradual_shift: [
    "It's subtle, but I've watched you shift. Your relationship with {topic} has evolved.",
    "The way you talk about {topic} has changed over time. There's more {quality} now.",
    "I don't know if you've noticed, but {topic} doesn't land the same way it used to. You've grown.",
  ],
  resilience: [
    "You've faced {challenge} multiple times now, and each time you bounce back a little faster. That's resilience building.",
    "I see a pattern of resilience. When {challenge} happens, you recover better each time.",
    "Something I want you to know: you're more resilient than you were {timeframe} ago. The evidence is there.",
  ],
  self_compassion: [
    "I've noticed you're gentler with yourself lately. When {trigger} happens, you don't spiral like before.",
    "The way you talk to yourself has shifted. There's more kindness there now.",
    "You used to beat yourself up over {trigger}. Now you give yourself grace. That's huge.",
  ],
};

// ============================================================================
// DATA STRUCTURES
// ============================================================================

interface GrowthData {
  area: string;
  startingPoint: string;
  currentPoint: string;
  progressPercentage: number;
  milestones: string[];
  timeframe: string;
  growthType: 'then_vs_now' | 'pattern_broken' | 'milestone_reached' | 'gradual_shift' | 'resilience' | 'self_compassion';
}

async function fetchGrowthData(userId: string): Promise<GrowthData[]> {
  const growthAreas: GrowthData[] = [];

  try {
    const fingerprint = await getGrowthFingerprint(userId);

    if (!fingerprint || !fingerprint.snapshots || fingerprint.snapshots.length < 2) {
      return [];
    }

    // Compare first and most recent snapshots
    const firstSnapshot = fingerprint.snapshots[0];
    const latestSnapshot = fingerprint.snapshots[fingerprint.snapshots.length - 1];

    // Analyze growth metrics if available
    if (fingerprint.growth) {
      const { emotionalRangeGrowth, topicDiversityGrowth, cognitiveGrowth } =
        fingerprint.growth;

      if (emotionalRangeGrowth && emotionalRangeGrowth > 0.1) {
        growthAreas.push({
          area: 'emotional expression',
          startingPoint: 'limited emotional vocabulary',
          currentPoint: 'richer emotional expression',
          progressPercentage: emotionalRangeGrowth * 100,
          milestones: [],
          timeframe: calculateTimeframe(firstSnapshot.timestamp, latestSnapshot.timestamp),
          growthType: 'gradual_shift',
        });
      }

      if (topicDiversityGrowth && topicDiversityGrowth > 0.1) {
        growthAreas.push({
          area: 'topic breadth',
          startingPoint: 'focused on few areas',
          currentPoint: 'exploring more areas of life',
          progressPercentage: topicDiversityGrowth * 100,
          milestones: [],
          timeframe: calculateTimeframe(firstSnapshot.timestamp, latestSnapshot.timestamp),
          growthType: 'gradual_shift',
        });
      }

      if (cognitiveGrowth?.growthMindsetProgress && cognitiveGrowth.growthMindsetProgress > 0.3) {
        growthAreas.push({
          area: 'overall growth',
          startingPoint: 'earlier self',
          currentPoint: 'evolved perspective',
          progressPercentage: cognitiveGrowth.growthMindsetProgress * 100,
          milestones: [],
          timeframe: calculateTimeframe(firstSnapshot.timestamp, latestSnapshot.timestamp),
          growthType: 'then_vs_now',
        });
      }
    }

    // Analyze cognitive patterns from latest snapshot
    if (latestSnapshot.cognitivePatterns) {
      const { problemSolvingRatio, selfCompassionLevel } = latestSnapshot.cognitivePatterns;

      if (problemSolvingRatio && problemSolvingRatio > 0.5) {
        growthAreas.push({
          area: 'problem-solving',
          startingPoint: 'felt stuck',
          currentPoint: 'approaching challenges with clarity',
          progressPercentage: problemSolvingRatio * 100,
          milestones: [],
          timeframe: calculateTimeframe(firstSnapshot.timestamp, latestSnapshot.timestamp),
          growthType: 'gradual_shift',
        });
      }

      if (selfCompassionLevel && selfCompassionLevel > 0.5) {
        growthAreas.push({
          area: 'self-compassion',
          startingPoint: 'being hard on yourself',
          currentPoint: 'treating yourself with more kindness',
          progressPercentage: selfCompassionLevel * 100,
          milestones: [],
          timeframe: calculateTimeframe(firstSnapshot.timestamp, latestSnapshot.timestamp),
          growthType: 'self_compassion',
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Error fetching growth data');
  }

  // Sort by progress and return top areas
  return growthAreas
    .sort((a, b) => b.progressPercentage - a.progressPercentage)
    .slice(0, 3);
}

function calculateTimeframe(start: Date | string | number, end: Date | string | number): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

  if (days < 7) return 'this week';
  if (days < 14) return 'the past couple weeks';
  if (days < 30) return 'the past few weeks';
  if (days < 60) return 'the past month';
  if (days < 90) return 'the past couple months';
  return `the past ${Math.floor(days / 30)} months`;
}

// ============================================================================
// GENERATOR
// ============================================================================

async function generateGrowthInsights(
  userId: string,
  context: InsightGeneratorContext
): Promise<GeneratedInsight[]> {
  const insights: GeneratedInsight[] = [];

  try {
    const growthData = await fetchGrowthData(userId);

    for (const growth of growthData) {
      const insight = buildGrowthInsight(growth, userId, context);
      if (insight) {
        insights.push(insight);
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate growth insights');
  }

  return insights;
}

function buildGrowthInsight(
  data: GrowthData,
  userId: string,
  context: InsightGeneratorContext
): GeneratedInsight | null {
  const templates = GROWTH_TEMPLATES[data.growthType];
  if (!templates || templates.length === 0) {
    return null;
  }

  let message = templates[Math.floor(Math.random() * templates.length)];

  // Replace placeholders
  message = message
    .replace(/{startingPoint}/g, data.startingPoint)
    .replace(/{currentPoint}/g, data.currentPoint)
    .replace(/{oldPattern}/g, data.startingPoint)
    .replace(/{topic}/g, data.area)
    .replace(/{quality}/g, 'ease')
    .replace(/{milestone}/g, data.milestones[0] || data.currentPoint)
    .replace(/{challenge}/g, data.area)
    .replace(/{trigger}/g, data.area)
    .replace(/{timeframe}/g, data.timeframe)
    .replace(/{count}/g, '3');

  return {
    id: `growth_${data.area.replace(/\s+/g, '_')}_${Date.now()}`,
    userId,
    category: 'growth_trajectory',
    priority: data.progressPercentage > 70 ? 'high' : 'medium',
    headline: `Growth in ${data.area}`,
    message,
    evidence: [
      `Started: ${data.startingPoint}`,
      `Now: ${data.currentPoint}`,
      `Progress: ${Math.round(data.progressPercentage)}%`,
      `Over: ${data.timeframe}`,
    ],
    surfacingMoment: 'natural_pause',
    tone: 'celebratory',
    triggerTopics: [data.area],
    confidence: Math.min(data.progressPercentage / 100, 0.9),
    dataPoints: 5,
    generatedAt: new Date(),
    surfaced: false,
    dismissed: false,
  };
}

async function hasEnoughData(userId: string): Promise<boolean> {
  try {
    const fingerprint = await getGrowthFingerprint(userId);
    return fingerprint !== null && fingerprint.snapshots?.length >= 2;
  } catch {
    return false;
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

const growthTrajectoryGenerator: InsightGenerator = {
  category: 'growth_trajectory',
  name: 'Growth Trajectory Generator',
  description: 'Celebrates and reflects on personal growth over time',
  generate: generateGrowthInsights,
  hasEnoughData,
};

registerInsightGenerator(growthTrajectoryGenerator);

export { growthTrajectoryGenerator };
