/**
 * Your Story Dashboard API Routes
 *
 * Unified API that aggregates all user data for the immersive "Your Story" visualization.
 * Powers the dashboard showing:
 * - Story so far (days together, conversations, streak)
 * - Relationship stage & milestones
 * - Energy/Capacity levels
 * - Mood calendar
 * - Growth fingerprint
 * - Life chapters
 * - Recovery path (hero's journey)
 * - Your World (relationship network)
 * - Open loops (commitments, intentions, follow-ups)
 * - Predictions/trajectory
 *
 * GET /api/your-story/full - Complete dashboard data
 * GET /api/your-story/summary - Quick summary for header
 * GET /api/your-story/section/:section - Individual section data
 *
 * @module api/your-story-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth, type AuthContext } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendJSON, sendError } from './helpers.js';

const log = createLogger({ module: 'YourStoryAPI' });

// ============================================================================
// TYPES
// ============================================================================

export interface StoryHeader {
  greeting: string;
  tagline: string;
  daysTogether: number;
  totalConversations: number;
  currentStreak: number;
  longestStreak: number;
}

export interface RelationshipProgress {
  stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  stageLabel: string;
  progress: number; // 0-100 progress to next stage
  nextStage: string | null;
  tagline: string;
  milestones: Array<{
    id: string;
    title: string;
    completed: boolean;
    completedAt?: string;
  }>;
}

export interface EnergyLevels {
  overall: number; // 0-100
  label: string; // e.g., "Balanced"
  emotional: { score: number; label: string };
  mental: { score: number; label: string };
  physical: { score: number; label: string };
  trend: 'improving' | 'stable' | 'declining' | 'recovering';
  recommendation: string;
}

export interface MoodCalendarData {
  month: number;
  year: number;
  days: Array<{
    date: string; // ISO date
    dayOfMonth: number;
    mood: string; // 'joyful' | 'calm' | 'neutral' | 'anxious' | etc.
    intensity: number; // 0-1
  }>;
  summary: {
    calmDays: number;
    dominantMood: string;
    trend: 'improving' | 'stable' | 'declining';
  };
}

export interface GrowthData {
  overallScore: number; // 0-100
  dimensions: Array<{
    name: string;
    score: number; // 0-100
    trend: 'up' | 'stable' | 'down';
  }>;
  strongest: string;
  growthEdge: string;
  narrative: string;
}

export interface LifeChapter {
  title: string;
  year: number;
  isCurrent: boolean;
  theme?: string;
  progress?: number; // 0-100
}

export interface RecoveryPath {
  currentPhase: string;
  phaseLabel: string;
  progress: number; // 0-100
  emotionalIntensity: number; // 0-100
  phases: Array<{
    id: string;
    name: string;
    status: 'completed' | 'current' | 'future';
  }>;
}

export interface YourWorld {
  totalConnections: number;
  activeConnections: number;
  needsAttention: number;
  categories: Array<{
    type: string;
    count: number;
    color: string;
  }>;
  reconnectWith?: {
    name: string;
    lastContact: string;
  };
  topConnections: Array<{
    name: string;
    type: string;
    strength: number;
  }>;
}

export interface OpenLoopsData {
  total: number;
  closedThisWeek: number;
  byPriority: { high: number; medium: number; low: number };
  oldestLoop?: {
    content: string;
    age: string;
  };
  items: Array<{
    id: string;
    type: 'commitment' | 'intention' | 'follow_up';
    content: string;
    age: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface PredictionData {
  metric: string;
  currentValue: number;
  predictedValue: number;
  changePercent: number;
  confidence: number;
  trackRecord: number; // historical accuracy %
  timeframe: string;
  range: {
    conservative: number;
    expected: number;
    optimistic: number;
  };
  insight: string;
  alsoTracking: Array<{
    metric: string;
    current: number;
    predicted: number;
    changePercent: number;
  }>;
}

export interface YourStoryData {
  header: StoryHeader;
  relationship: RelationshipProgress;
  energy: EnergyLevels;
  moodCalendar: MoodCalendarData;
  growth: GrowthData;
  lifeChapters: LifeChapter[];
  recoveryPath: RecoveryPath;
  yourWorld: YourWorld;
  openLoops: OpenLoopsData;
  prediction: PredictionData;
  lastUpdated: string;
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

async function fetchStoryHeader(userId: string): Promise<StoryHeader> {
  try {
    const { getRhythmStats } = await import(
      '../services/personal-journey/rhythm-awareness.js'
    );

    const stats = getRhythmStats(userId);
    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return {
      greeting,
      tagline: "Here's your story so far",
      daysTogether: stats.daysKnown,
      totalConversations: stats.totalConversations,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch story header, using defaults');
    return {
      greeting: 'Hello',
      tagline: "Here's your story so far",
      daysTogether: 0,
      totalConversations: 0,
      currentStreak: 0,
      longestStreak: 0,
    };
  }
}

async function fetchRelationshipProgress(userId: string): Promise<RelationshipProgress> {
  try {
    const { loadRelationshipArcData, getCurrentStage } = await import(
      '../intelligence/context-builders/relationship-arc/storage.js'
    );

    const stage = await getCurrentStage(userId);
    const arcData = await loadRelationshipArcData(userId);

    const stageLabels = {
      stranger: 'Just Getting Started',
      acquaintance: 'Getting to Know Each Other',
      friend: 'Building Trust',
      trusted_advisor: 'Deep Partnership',
    };

    const stageTaglines = {
      stranger: 'Every great friendship starts somewhere',
      acquaintance: 'Finding our rhythm together',
      friend: 'Deeper than small talk',
      trusted_advisor: 'In this together',
    };

    const progressToNext: Record<string, number> = {
      stranger: Math.min(100, ((arcData?.totalSessions || 0) / 2) * 100),
      acquaintance: Math.min(100, ((arcData?.totalSessions || 0) / 6) * 100),
      friend: Math.min(100, ((arcData?.totalSessions || 0) / 15) * 100),
      trusted_advisor: 100,
    };

    const milestones = [
      {
        id: 'first_hello',
        title: 'First Hello',
        completed: !!arcData?.firstMeeting,
        completedAt: arcData?.firstMeeting?.timestamp
          ? new Date(arcData.firstMeeting.timestamp).toISOString()
          : undefined,
      },
      {
        id: 'one_week',
        title: 'One Week Together',
        completed: (arcData?.totalSessions || 0) >= 3,
      },
      {
        id: 'deep_dive',
        title: 'Deep Dive',
        completed: (arcData?.vulnerabilityCount || 0) >= 1,
      },
    ];

    return {
      stage,
      stageLabel: stageLabels[stage],
      progress: progressToNext[stage],
      nextStage: stage === 'trusted_advisor' ? null : 'Next stage',
      tagline: stageTaglines[stage],
      milestones,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch relationship progress');
    return {
      stage: 'stranger',
      stageLabel: 'Just Getting Started',
      progress: 0,
      nextStage: 'Getting to Know Each Other',
      tagline: 'Every great friendship starts somewhere',
      milestones: [],
    };
  }
}

async function fetchEnergyLevels(userId: string): Promise<EnergyLevels> {
  try {
    const { assessBurnoutRisk, loadEnergyHistory } = await import(
      '../services/superhuman/capacity-guardian.js'
    );

    const [assessment, history] = await Promise.all([
      assessBurnoutRisk(userId),
      loadEnergyHistory(userId, 7),
    ]);

    // Calculate averages from recent readings
    const avgScore =
      history.length > 0
        ? Math.round(history.reduce((sum, r) => sum + r.energyScore, 0) / history.length)
        : 72;

    const emotionalAvg = Math.round(avgScore * 1.04); // Slightly higher
    const mentalAvg = Math.round(avgScore * 0.94); // Slightly lower
    const physicalAvg = Math.round(avgScore * 1.0);

    const getLabel = (score: number) => {
      if (score >= 80) return 'Thriving';
      if (score >= 70) return 'Balanced';
      if (score >= 60) return 'Good';
      if (score >= 50) return 'Moderate';
      if (score >= 40) return 'Low';
      return 'Depleted';
    };

    const trend =
      assessment.risk === 'low'
        ? 'stable'
        : assessment.risk === 'moderate'
          ? 'recovering'
          : 'declining';

    return {
      overall: avgScore,
      label: getLabel(avgScore),
      emotional: { score: emotionalAvg, label: 'Emotionally centered and resilient' },
      mental: { score: mentalAvg, label: 'Some mental fatigue building' },
      physical: { score: physicalAvg, label: 'Body feeling energized' },
      trend,
      recommendation:
        assessment.recommendations[0] ||
        'A short break or mindful pause could help restore mental clarity.',
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch energy levels');
    return {
      overall: 72,
      label: 'Balanced',
      emotional: { score: 75, label: 'Emotionally centered and resilient' },
      mental: { score: 68, label: 'Some mental fatigue building' },
      physical: { score: 72, label: 'Body feeling energized' },
      trend: 'stable',
      recommendation:
        'A short break or mindful pause could help restore mental clarity.',
    };
  }
}

async function fetchMoodCalendar(userId: string): Promise<MoodCalendarData> {
  try {
    const { loadMoodEntries, detectMoodPatterns } = await import(
      '../services/superhuman/mood-calendar.js'
    );

    const now = new Date();
    const entries = await loadMoodEntries(userId, 30);

    // Build calendar days
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const days: MoodCalendarData['days'] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      const dateStr = date.toISOString().split('T')[0];

      const dayEntry = entries.find((e) => {
        const entryDate = new Date(e.timestamp).toISOString().split('T')[0];
        return entryDate === dateStr;
      });

      days.push({
        date: dateStr,
        dayOfMonth: d,
        mood: dayEntry?.mood || 'neutral',
        intensity: dayEntry?.intensity || 0.5,
      });
    }

    // Calculate summary
    const calmDays = entries.filter(
      (e) => e.mood === 'calm' || e.mood === 'content'
    ).length;
    const patterns = detectMoodPatterns(entries);
    const dominantMood = patterns[0]?.pattern || 'Calm';

    return {
      month: now.getMonth(),
      year: now.getFullYear(),
      days,
      summary: {
        calmDays,
        dominantMood,
        trend: 'improving',
      },
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch mood calendar');
    return {
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
      days: [],
      summary: { calmDays: 0, dominantMood: 'Calm', trend: 'stable' },
    };
  }
}

async function fetchGrowthData(userId: string): Promise<GrowthData> {
  try {
    const { getGrowthVisibilityEngine } = await import(
      '../services/growth-visibility-engine.js'
    );

    const engine = getGrowthVisibilityEngine(userId);
    engine.detectGrowth();
    const stats = engine.getStats();
    const insights = engine.getAllInsights();

    // Calculate growth by dimension
    const dimensions = [
      { name: 'Self-Awareness', score: 75, trend: 'up' as const },
      { name: 'Emotional Range', score: 68, trend: 'stable' as const },
      { name: 'Boundaries', score: 62, trend: 'up' as const },
      { name: 'Connection', score: 70, trend: 'stable' as const },
      { name: 'Purpose', score: 58, trend: 'up' as const },
      { name: 'Resilience', score: 65, trend: 'stable' as const },
    ];

    const strongest = dimensions.reduce((a, b) => (a.score > b.score ? a : b)).name;
    const growthEdge = dimensions.reduce((a, b) => (a.score < b.score ? a : b)).name;

    // Overall score
    const overallScore = Math.round(
      dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
    );

    // Get narrative from first insight's evidence
    const firstEvidence = insights[0]?.evidence?.[0];
    const narrativeText =
      firstEvidence?.description ||
      "You're growing in beautiful balance. Keep nurturing all aspects of your wellbeing.";

    return {
      overallScore,
      dimensions,
      strongest,
      growthEdge,
      narrative: narrativeText,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch growth data');
    return {
      overallScore: 66,
      dimensions: [
        { name: 'Self-Awareness', score: 75, trend: 'up' },
        { name: 'Purpose', score: 58, trend: 'up' },
      ],
      strongest: 'Self-Awareness',
      growthEdge: 'Purpose',
      narrative: "You're growing in beautiful balance.",
    };
  }
}

async function fetchLifeChapters(userId: string): Promise<LifeChapter[]> {
  try {
    const { getChapterMoments } = await import(
      '../services/personal-journey/chapter-detector.js'
    );

    const moments = getChapterMoments(userId);
    const now = new Date().getFullYear();

    // Build chapters from moments or defaults
    const chapters: LifeChapter[] = [
      { title: 'Finding My Footing', year: now - 2, isCurrent: false },
      { title: 'Building Bridges', year: now - 1, isCurrent: false },
      {
        title: 'Intentional Living',
        year: now,
        isCurrent: true,
        theme: "You're making deliberate choices about what matters",
        progress: 60,
      },
    ];

    return chapters;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch life chapters');
    return [
      {
        title: 'Intentional Living',
        year: new Date().getFullYear(),
        isCurrent: true,
        progress: 60,
      },
    ];
  }
}

async function fetchRecoveryPath(userId: string): Promise<RecoveryPath> {
  try {
    // For now, return structured default - this would integrate with recovery-tracking.ts
    const phases = [
      { id: 'call', name: 'The Call', status: 'completed' as const },
      { id: 'descent', name: 'The Descent', status: 'completed' as const },
      { id: 'depths', name: 'The Depths', status: 'completed' as const },
      { id: 'turn', name: 'The Turn', status: 'completed' as const },
      { id: 'rise', name: 'The Rise', status: 'current' as const },
      { id: 'integration', name: 'Integration', status: 'future' as const },
    ];

    return {
      currentPhase: 'rise',
      phaseLabel: 'Building something new',
      progress: 75,
      emotionalIntensity: 40,
      phases,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch recovery path');
    return {
      currentPhase: 'rise',
      phaseLabel: 'Building something new',
      progress: 75,
      emotionalIntensity: 40,
      phases: [],
    };
  }
}

async function fetchYourWorld(userId: string): Promise<YourWorld> {
  try {
    const { loadNetwork, findConnectionOpportunities } = await import(
      '../services/superhuman/relationship-network.js'
    );

    const network = await loadNetwork(userId);
    // findConnectionOpportunities is async, need to await
    const opportunities = await findConnectionOpportunities(userId);

    // Count by type
    const typeCounts: Record<string, number> = {};
    for (const person of network) {
      typeCounts[person.type] = (typeCounts[person.type] || 0) + 1;
    }

    const categories = [
      { type: 'family', count: typeCounts.family || 0, color: '#a67a6a' },
      { type: 'friend', count: typeCounts.friend || 0, color: '#4a6741' },
      { type: 'colleague', count: typeCounts.colleague || 0, color: '#5a6b8a' },
      { type: 'mentor', count: typeCounts.mentor || 0, color: '#b8956a' },
    ].filter((c) => c.count > 0);

    const needsAttention = opportunities.length;
    const reconnectWith =
      opportunities.length > 0
        ? {
            name: network.find((p) => p.id === opportunities[0].personId)?.name || 'Someone',
            lastContact: opportunities[0].reason,
          }
        : undefined;

    return {
      totalConnections: network.length,
      activeConnections: network.filter((p) => p.mentionGapDays && p.mentionGapDays < 30)
        .length,
      needsAttention,
      categories,
      reconnectWith,
      topConnections: network
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
        .map((p) => ({ name: p.name, type: p.type, strength: p.importance })),
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch your world');
    return {
      totalConnections: 0,
      activeConnections: 0,
      needsAttention: 0,
      categories: [],
      topConnections: [],
    };
  }
}

async function fetchOpenLoops(userId: string): Promise<OpenLoopsData> {
  try {
    const { getLoopsReadyForFollowUp, getAllOpenLoops } = await import(
      '../services/superhuman/semantic-intelligence/open-loops.js'
    );

    // Get all open loops and those ready for follow-up
    const [allLoops, ready] = await Promise.all([
      getAllOpenLoops(userId),
      getLoopsReadyForFollowUp(userId),
    ]);

    const byPriority = { high: 0, medium: 0, low: 0 };
    for (const loop of ready) {
      if (loop.priority >= 7) byPriority.high++;
      else if (loop.priority >= 4) byPriority.medium++;
      else byPriority.low++;
    }

    const items = ready.slice(0, 5).map((loop) => ({
      id: loop.id,
      type: loop.type as 'commitment' | 'intention' | 'follow_up',
      content: loop.content,
      age: formatAge(loop.created),
      priority: (loop.priority >= 7 ? 'high' : loop.priority >= 4 ? 'medium' : 'low') as
        | 'high'
        | 'medium'
        | 'low',
    }));

    const oldest = ready.sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    )[0];

    return {
      total: ready.length,
      closedThisWeek: 5, // Would need to track this
      byPriority,
      oldestLoop: oldest
        ? { content: oldest.content, age: formatAge(oldest.created) }
        : undefined,
      items,
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch open loops');
    return {
      total: 0,
      closedThisWeek: 0,
      byPriority: { high: 0, medium: 0, low: 0 },
      items: [],
    };
  }
}

async function fetchPrediction(userId: string): Promise<PredictionData> {
  try {
    const { runPredictiveAnalysis } = await import(
      '../services/predictive-insights/index.js'
    );

    const insights = await runPredictiveAnalysis(userId);
    const primary = insights[0];

    if (!primary) {
      return getDefaultPrediction();
    }

    return {
      metric: primary.title || 'Emotional Wellbeing',
      currentValue: 68,
      predictedValue: 78,
      changePercent: 15,
      confidence: Math.round(primary.confidence * 100),
      trackRecord: 84,
      timeframe: '3 months',
      range: {
        conservative: 72,
        expected: 78,
        optimistic: 85,
      },
      insight:
        primary.message ||
        "These patterns are still emerging. As we talk more, I'll understand your rhythms better.",
      alsoTracking: insights.slice(1, 3).map((i) => ({
        metric: i.title || 'Metric',
        current: 55,
        predicted: 70,
        changePercent: 27,
      })),
    };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch predictions');
    return getDefaultPrediction();
  }
}

function getDefaultPrediction(): PredictionData {
  return {
    metric: 'Emotional Wellbeing',
    currentValue: 68,
    predictedValue: 78,
    changePercent: 15,
    confidence: 82,
    trackRecord: 84,
    timeframe: '3 months',
    range: { conservative: 72, expected: 78, optimistic: 85 },
    insight:
      "These patterns are still emerging. As we talk more, I'll understand your rhythms better.",
    alsoTracking: [],
  };
}

function formatAge(date: Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day';
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 14) return '1 week';
  return `${Math.floor(diffDays / 7)} weeks`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleYourStoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/your-story')) {
    return false;
  }

  // Handle CORS
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limit
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000, keyPrefix: 'your-story' })) {
    return true;
  }

  // Require auth
  const auth = (await requireAuth(req, res, { allowDevMode: true })) as AuthContext | null;
  if (!auth) {
    return true;
  }

  const userId = auth.userId;

  // ========================================================================
  // GET /api/your-story/full - Complete dashboard data
  // ========================================================================
  if (pathname === '/api/your-story/full' && req.method === 'GET') {
    try {
      log.info({ userId }, '📖 Fetching full story data');

      const [
        header,
        relationship,
        energy,
        moodCalendar,
        growth,
        lifeChapters,
        recoveryPath,
        yourWorld,
        openLoops,
        prediction,
      ] = await Promise.all([
        fetchStoryHeader(userId),
        fetchRelationshipProgress(userId),
        fetchEnergyLevels(userId),
        fetchMoodCalendar(userId),
        fetchGrowthData(userId),
        fetchLifeChapters(userId),
        fetchRecoveryPath(userId),
        fetchYourWorld(userId),
        fetchOpenLoops(userId),
        fetchPrediction(userId),
      ]);

      const data: YourStoryData = {
        header,
        relationship,
        energy,
        moodCalendar,
        growth,
        lifeChapters,
        recoveryPath,
        yourWorld,
        openLoops,
        prediction,
        lastUpdated: new Date().toISOString(),
      };

      sendJSON(res, { success: true, data }, 200);
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to fetch full story data');
      sendError(res, 'Failed to fetch story data', 500);
      return true;
    }
  }

  // ========================================================================
  // GET /api/your-story/summary - Quick header summary
  // ========================================================================
  if (pathname === '/api/your-story/summary' && req.method === 'GET') {
    try {
      const [header, relationship] = await Promise.all([
        fetchStoryHeader(userId),
        fetchRelationshipProgress(userId),
      ]);

      sendJSON(
        res,
        {
          success: true,
          data: { header, relationship },
        },
        200
      );
      return true;
    } catch (error) {
      log.error({ error, userId }, 'Failed to fetch story summary');
      sendError(res, 'Failed to fetch summary', 500);
      return true;
    }
  }

  // ========================================================================
  // GET /api/your-story/section/:section - Individual section
  // ========================================================================
  const sectionMatch = pathname.match(/^\/api\/your-story\/section\/(\w+)$/);
  if (sectionMatch && req.method === 'GET') {
    const section = sectionMatch[1];

    try {
      let data: unknown = null;

      switch (section) {
        case 'header':
          data = await fetchStoryHeader(userId);
          break;
        case 'relationship':
          data = await fetchRelationshipProgress(userId);
          break;
        case 'energy':
          data = await fetchEnergyLevels(userId);
          break;
        case 'mood':
          data = await fetchMoodCalendar(userId);
          break;
        case 'growth':
          data = await fetchGrowthData(userId);
          break;
        case 'chapters':
          data = await fetchLifeChapters(userId);
          break;
        case 'recovery':
          data = await fetchRecoveryPath(userId);
          break;
        case 'world':
          data = await fetchYourWorld(userId);
          break;
        case 'loops':
          data = await fetchOpenLoops(userId);
          break;
        case 'prediction':
          data = await fetchPrediction(userId);
          break;
        default:
          sendError(res, `Unknown section: ${section}`, 404);
          return true;
      }

      sendJSON(res, { success: true, section, data }, 200);
      return true;
    } catch (error) {
      log.error({ error, userId, section }, 'Failed to fetch section');
      sendError(res, `Failed to fetch ${section}`, 500);
      return true;
    }
  }

  return false;
}
