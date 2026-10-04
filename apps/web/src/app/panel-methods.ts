/**
 * Panel Methods
 *
 * Handles showing various settings/dashboard panels.
 * Each method fetches data from API, falls back to demo data in development,
 * or shows an empty state.
 */

import type { ScreenName } from '../services/app-context-tracking.service.js';
import { getDemoTeamHuddle, isDemoDataEnabled } from '../services/engagement-demo-data.js';
import {
  type AnalyticsDashboardData,
  getAnalyticsDashboardUI,
} from '../ui/analytics-dashboard.ui.js';
import { type CognitiveInsightsData, getCognitiveInsightsUI } from '../ui/cognitive-insights.ui.js';
import {
  type ConversationHistoryData,
  getConversationHistoryUI,
} from '../ui/conversation-history.ui.js';
import { getDataExportUI } from '../ui/data-export.ui.js';
import { getPredictionTrackerUI } from '../ui/prediction-tracker.ui.js';
import { showTeamHuddle as showTeamHuddleUI } from '../ui/team-huddle.ui.js';
import type { fetchVisualizationData, YourStoryData } from '../ui/visualizations/index.js';
import { loadYourStory } from '../ui/lazy-screens.js';
import { toast } from '../ui/whisper.ui.js';
import { apiDelete, apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

// 🧠 Better Than Human: Track screen view for Voice ↔ App Sync
async function trackScreen(screen: ScreenName): Promise<void> {
  try {
    const { trackScreenView } = await import('../services/app-context-tracking.service.js');
    trackScreenView(screen);
  } catch {
    // Non-critical
  }
}

const log = createLogger('PanelMethods');

// ============================================================================
// CONVERSATION HISTORY
// ============================================================================

/**
 * Show conversation history panel.
 * Fetches real data from API, falls back to demo data in development.
 */
export async function showConversationHistory(): Promise<void> {
  void trackScreen('journal');
  getConversationHistoryUI().showLoading();

  const response = await apiGet<ConversationHistoryData>('/api/conversations');
  if (response.ok && response.data) {
    getConversationHistoryUI().show(response.data);
    return;
  }
  log.debug(
    { status: response.status, error: response.error },
    'Conversation history fetch failed'
  );

  // Fall back to demo data if enabled
  if (isDemoDataEnabled()) {
    const demoData = {
      sessions: [
        {
          id: '1',
          date: new Date(Date.now() - 86400000).toISOString(),
          personaId: 'ferni',
          personaName: 'Ferni',
          duration: 15,
          messageCount: 24,
          mood: 'sunny' as const,
          insights: [
            'You mentioned wanting to exercise more',
            'Morning routines seem important to you',
          ],
          highlights: ['Great progress on sleep goals'],
          topicsDiscussed: ['Sleep', 'Exercise', 'Mindfulness'],
        },
        {
          id: '2',
          date: new Date(Date.now() - 172800000).toISOString(),
          personaId: 'maya-santos',
          personaName: 'Maya Santos',
          duration: 8,
          messageCount: 12,
          mood: 'partly-cloudy' as const,
          insights: ['Two-minute rule resonates with you'],
          highlights: [],
          topicsDiscussed: ['Habits', 'Productivity'],
        },
        {
          id: '3',
          date: new Date(Date.now() - 259200000).toISOString(),
          personaId: 'alex-chen',
          personaName: 'Alex Chen',
          duration: 22,
          messageCount: 35,
          mood: 'sunny' as const,
          insights: ['Communication patterns at work', 'Meeting prep strategies'],
          highlights: ['Clarity on project priorities'],
          topicsDiscussed: ['Work', 'Communication', 'Planning'],
        },
      ],
      totalSessions: 3,
      totalMinutes: 45,
      favoritePersona: 'ferni',
      insightCount: 5,
    };
    getConversationHistoryUI().show(demoData);
    return;
  }

  // Show error state with retry when fetch fails and demo data is disabled
  getConversationHistoryUI().showError(() => void showConversationHistory());
}

// ============================================================================
// ANALYTICS DASHBOARD
// ============================================================================

/**
 * Show analytics dashboard.
 * Shows loading state, fetches real data from API, falls back to demo data in development.
 */
export async function showAnalyticsDashboard(): Promise<void> {
  void trackScreen('insights');
  // Show loading state immediately
  getAnalyticsDashboardUI().showLoading();

  // No userId param: the server takes identity from the auth token only.
  const response = await apiGet<AnalyticsDashboardData>('/api/analytics/user');
  if (response.ok && response.data) {
    getAnalyticsDashboardUI().show(response.data);
    return;
  }
  log.debug({ status: response.status, error: response.error }, 'Analytics fetch failed');

  // Fall back to demo data if enabled
  if (isDemoDataEnabled()) {
    const demoData = {
      totalDays: 14,
      totalRituals: 28,
      currentLongestStreak: 7,
      averageMood: 3.8,
      predictionAccuracy: 72,
      streakTrends: Array.from({ length: 14 }, (_, i) => ({
        date: new Date(Date.now() - (13 - i) * 86400000).toISOString(),
        count: Math.floor(Math.random() * 3) + 1,
        ritualId: 'morning-sky',
        personaId: 'ferni',
      })),
      moodTrends: Array.from({ length: 14 }, (_, i) => {
        const moods: Array<'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy'> = [
          'sunny',
          'partly-cloudy',
          'cloudy',
          'sunny',
          'sunny',
        ];
        const energies: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
        return {
          date: new Date(Date.now() - (13 - i) * 86400000).toISOString(),
          mood: moods[Math.floor(Math.random() * moods.length)] ?? 'sunny',
          energy: energies[Math.floor(Math.random() * energies.length)] ?? 'medium',
        };
      }),
      predictionTrends: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 86400000).toISOString(),
        accuracy: 60 + Math.floor(Math.random() * 30),
        totalPredictions: i + 1,
      })),
      bestDay: 'Monday',
      mostConsistentRitual: 'Morning Sky Check',
      improvementAreas: [
        'Evening rituals could be more consistent',
        'Try predictions in new categories',
      ],
    };
    getAnalyticsDashboardUI().show(demoData);
    return;
  }

  // Show empty state (real user with no data yet)
  getAnalyticsDashboardUI().show({
    totalDays: 0,
    totalRituals: 0,
    currentLongestStreak: 0,
    averageMood: 0,
    predictionAccuracy: null,
    streakTrends: [],
    moodTrends: [],
    predictionTrends: [],
    bestDay: null,
    mostConsistentRitual: null,
    improvementAreas: [],
  });
}

// ============================================================================
// COGNITIVE INSIGHTS
// ============================================================================

/**
 * Delete a memory from "What I've Learned" and refresh the UI.
 */
export async function deleteMemory(memoryId: string): Promise<void> {
  const response = await apiDelete(`/api/cognitive/memories/${encodeURIComponent(memoryId)}`);
  if (response.ok) {
    toast.success('Memory removed');
  } else {
    log.error(
      { memoryId, status: response.status, error: response.error },
      'Failed to delete memory'
    );
    toast.error("Couldn't remove that memory. Try again?");
  }
  // Re-fetch either way so the list matches what the server actually has.
  await showCognitiveInsights();
}

/**
 * Show cognitive insights panel.
 * Fetches real data from API, falls back to demo data in development.
 */
export async function showCognitiveInsights(): Promise<void> {
  void trackScreen('cognitive-insights');
  getCognitiveInsightsUI().setCallbacks({
    onDeleteMemory: async (memoryId: string) => {
      await deleteMemory(memoryId);
    },
  });
  getCognitiveInsightsUI().showLoading();

  const response = await apiGet<Partial<CognitiveInsightsData>>('/api/cognitive/memories');
  if (response.ok && response.data) {
    const data = response.data;
    getCognitiveInsightsUI().show({
      memories: data.memories ?? [],
      patterns: data.patterns ?? [],
      totalInteractions: data.totalInteractions ?? 0,
      knowledgeScore: data.knowledgeScore ?? 0,
    });
    return;
  }
  log.debug({ status: response.status, error: response.error }, 'Cognitive memories fetch failed');

  // Fall back to demo data if enabled
  if (isDemoDataEnabled()) {
    const demoData = getDemoCognitiveData();
    getCognitiveInsightsUI().show(demoData);
    return;
  }

  // Show error state with retry when fetch fails and demo data is disabled
  getCognitiveInsightsUI().showError(() => void showCognitiveInsights());
}

/**
 * Get demo cognitive data for development.
 */
function getDemoCognitiveData() {
  return {
    memories: [
      {
        id: '1',
        type: 'fact' as const,
        content: 'You live in Seattle and work in tech',
        confidence: 0.95,
        source: 'Ferni',
        learnedAt: new Date(Date.now() - 604800000).toISOString(),
      },
      {
        id: '2',
        type: 'preference' as const,
        content: 'You prefer morning workouts over evening',
        confidence: 0.88,
        source: 'Maya',
        learnedAt: new Date(Date.now() - 432000000).toISOString(),
      },
      {
        id: '3',
        type: 'goal' as const,
        content: 'Building a meditation habit is a priority',
        confidence: 0.92,
        source: 'Ferni',
        learnedAt: new Date(Date.now() - 259200000).toISOString(),
      },
      {
        id: '4',
        type: 'pattern' as const,
        content: 'Energy tends to dip around 3pm',
        confidence: 0.75,
        source: 'observation',
        learnedAt: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: '5',
        type: 'relationship' as const,
        content: 'Partner Sarah is supportive of your goals',
        confidence: 0.85,
        source: 'Ferni',
        learnedAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: '6',
        type: 'preference' as const,
        content: 'You prefer index funds over individual stocks',
        confidence: 0.9,
        source: 'Jack Bogle',
        learnedAt: new Date(Date.now() - 518400000).toISOString(),
      },
      {
        id: '7',
        type: 'fact' as const,
        content: "Mom's birthday is on March 15th",
        confidence: 0.98,
        source: 'Jordan',
        learnedAt: new Date(Date.now() - 345600000).toISOString(),
      },
    ],
    patterns: [
      // Communication patterns
      {
        id: 'comm_style',
        pattern: 'You prefer direct, to-the-point communication',
        frequency: 45,
        examples: [],
        category: 'communication' as const,
      },
      {
        id: 'humor',
        pattern: 'You enjoy humor and lighter moments in our conversations',
        frequency: 45,
        examples: [],
        category: 'communication' as const,
      },
      // Timing patterns
      {
        id: 'preferred_time',
        pattern: 'You tend to chat most in the morning',
        frequency: 8,
        examples: [],
        category: 'timing' as const,
      },
      {
        id: 'avg_duration',
        pattern: 'Our conversations typically last around 12 minutes',
        frequency: 45,
        examples: [],
        category: 'timing' as const,
      },
      // Interest patterns
      {
        id: 'preferred_topics',
        pattern: 'Topics you love: personal growth, wellness, finance',
        frequency: 3,
        examples: ['personal growth', 'wellness', 'finance'],
        category: 'interests' as const,
      },
      {
        id: 'high_engagement_topics',
        pattern: 'You light up when we discuss: morning routines, meditation, goal-setting',
        frequency: 3,
        examples: ['morning routines', 'meditation', 'goal-setting'],
        category: 'interests' as const,
      },
      // Relationship patterns
      {
        id: 'relationship_stage',
        pattern: 'We have a solid, established relationship',
        frequency: 45,
        examples: [],
        category: 'relationship' as const,
      },
      {
        id: 'key_moments',
        pattern: "We've shared 3 meaningful moments together",
        frequency: 3,
        examples: [
          'breakthrough on habits',
          'celebration of first streak',
          'opening up about stress',
        ],
        category: 'relationship' as const,
      },
      {
        id: 'time_together',
        pattern: "We've spent about 2 hours and 15 minutes in conversation",
        frequency: 45,
        examples: [],
        category: 'relationship' as const,
      },
      // Engagement patterns
      {
        id: 'likes_stories',
        pattern: 'You engage well when I share stories and examples',
        frequency: 45,
        examples: [],
        category: 'engagement' as const,
      },
      {
        id: 'response_length',
        pattern: 'You prefer concise, to-the-point responses',
        frequency: 45,
        examples: [],
        category: 'communication' as const,
      },
      // Goals & achievements
      {
        id: 'active_goals',
        pattern: "You're working toward 2 goals",
        frequency: 2,
        examples: ['meditation habit', 'better sleep schedule'],
        category: 'goals' as const,
      },
      {
        id: 'completed_goals',
        pattern: "You've achieved 1 goal we discussed",
        frequency: 1,
        examples: ['morning routine consistency'],
        category: 'achievements' as const,
      },
      // Voice patterns
      {
        id: 'speaking_pace',
        pattern: 'You think quickly and prefer fast-paced exchanges',
        frequency: 45,
        examples: [],
        category: 'voice' as const,
      },
      // Life context
      {
        id: 'life_stage',
        pattern: "You're building your career and establishing foundations",
        frequency: 1,
        examples: [],
        category: 'life' as const,
      },
      // Boundaries
      {
        id: 'avoid_topics',
        pattern: 'I know to be careful around certain topics',
        frequency: 2,
        examples: [],
        category: 'boundaries' as const,
      },
    ],
    totalInteractions: 45,
    knowledgeScore: 78,
  };
}

// ============================================================================
// PREDICTION TRACKER
// ============================================================================

/**
 * Show prediction tracker panel.
 * Fetches real data from API, falls back to demo data in development.
 */
export async function showPredictionTracker(): Promise<void> {
  void trackScreen('predictions');
  // TODO: Backend GET /api/predictions not implemented yet.
  // When the handler exists, uncomment the fetch below.
  // try {
  //   const response = await fetch('/api/predictions');
  //   if (response.ok) {
  //     const data = await response.json();
  //     const predictions = data.predictions || [];
  //     const completed = predictions.filter((p) => p.accuracy !== undefined);
  //     const totalCorrect = completed.reduce((sum, p) => sum + (p.accuracy >= 70 ? 1 : 0), 0);
  //     getPredictionTrackerUI().show({
  //       overallAccuracy: data.stats?.averageAccuracy || 0,
  //       totalPredictions: data.stats?.totalPredictions || predictions.length,
  //       correctPredictions: totalCorrect,
  //       byCategory: [],
  //       recentTrend: completed.slice(0, 7).map((p) => p.accuracy),
  //       bestStreak: 0,
  //       currentStreak: 0,
  //     });
  //     return;
  //   }
  // } catch (err) {
  //   log.debug('API fetch failed, checking for demo mode');
  // }

  // Fall back to demo data if enabled
  if (isDemoDataEnabled()) {
    const demoData = {
      overallAccuracy: 72,
      totalPredictions: 18,
      correctPredictions: 13,
      byCategory: [
        { category: 'personal', correct: 5, total: 7, accuracy: 71 },
        { category: 'work', correct: 4, total: 5, accuracy: 80 },
        { category: 'health', correct: 3, total: 4, accuracy: 75 },
        { category: 'habits', correct: 1, total: 2, accuracy: 50 },
      ],
      recentTrend: [60, 70, 65, 80, 75, 72, 78],
      bestStreak: 5,
      currentStreak: 3,
    };
    getPredictionTrackerUI().show(demoData);
    return;
  }

  // Show empty state
  getPredictionTrackerUI().show({
    overallAccuracy: 0,
    totalPredictions: 0,
    correctPredictions: 0,
    byCategory: [],
    recentTrend: [],
    bestStreak: 0,
    currentStreak: 0,
  });
}

// ============================================================================
// DATA EXPORT
// ============================================================================

/**
 * Show data export panel.
 * Fetches categories from backend, sets up callbacks for export/delete.
 */
export async function showDataExport(): Promise<void> {
  void trackScreen('settings');
  const { dataExportService, dataRightsErrorMessage } =
    await import('../services/data-export.service.js');
  const { toast } = await import('../ui/whisper.ui.js');

  // Each request only reports success after the server confirms it.
  getDataExportUI().setCallbacks({
    onExport: async (format, categories) => {
      try {
        toast.info('Preparing your data...');
        await dataExportService.exportData(format, categories);
        toast.success('Download started!');
      } catch (err) {
        log.error('Export failed:', err);
        toast.error(dataRightsErrorMessage(err, "Couldn't export. Try again?"));
      }
    },
    onDeleteData: async () => {
      try {
        toast.info('Deleting your data...');
        await dataExportService.deleteAllData();
        toast.success('All data deleted');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        log.error('Delete failed:', err);
        toast.error(dataRightsErrorMessage(err, "Couldn't delete. Try again?"));
      }
    },
    onDeleteAccount: async () => {
      try {
        toast.info('Deleting your account...');
        await dataExportService.deleteAccount();
        toast.success('Your account is deleted. Take care.');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        log.error('Account deletion failed:', err);
        toast.error(dataRightsErrorMessage(err, "Couldn't delete your account. Try again?"));
      }
    },
    onClose: () => {
      log.debug('Data export panel closed');
    },
  });

  getDataExportUI().show(await dataExportService.getExportableCategories());
}

// ============================================================================
// TEAM HUDDLE
// ============================================================================

/**
 * Show team huddle panel.
 * Starts a new huddle via API, or shows demo data in development.
 */
export async function showTeamHuddle(_topic?: string): Promise<void> {
  void trackScreen('team');

  // TODO: Backend POST /api/huddles/start not implemented yet.
  // When the handler exists, uncomment the fetch below.
  // try {
  //   const authHeaders = await getApiHeadersAsync(true);
  //   const response = await fetch('/api/huddles/start', {
  //     method: 'POST',
  //     headers: authHeaders,
  //     body: JSON.stringify({
  //       topic: topic || 'Weekly check-in on your progress',
  //       type: 'weekly',
  //     }),
  //   });
  //   if (response.ok) {
  //     const data = await response.json();
  //     if (data.success && data.huddle) {
  //       showTeamHuddleUI(data.huddle);
  //       log.debug('Team huddle started via API');
  //       return;
  //     }
  //   }
  // } catch (err) {
  //   log.debug('API fetch failed, checking for demo mode');
  // }

  // Fall back to demo data if enabled
  if (isDemoDataEnabled()) {
    const demoHuddle = getDemoTeamHuddle('weekly');
    showTeamHuddleUI(demoHuddle);
    log.debug('Team huddle shown (demo)');
    return;
  }

  // Honest empty state — never fabricate a huddle in production
  const { toast } = await import('../ui/whisper.ui.js');
  toast.info("Team huddle isn't ready yet. Ask Ferni when you're in a conversation.");
  log.debug('Team huddle unavailable (no API, demo disabled)');
}

// ============================================================================
// YOUR STORY DASHBOARD
// ============================================================================

/**
 * Show the "Your Story" dashboard.
 *
 * This is the unified narrative dashboard that consolidates:
 * - 9 cross-platform visualizations (mood calendar, burnout gauge, etc.)
 * - Analytics stats (days together, conversations, streak)
 * - Relationship stage and milestones
 *
 * Data sources (in priority order):
 * 1. Backend API (/api/your-story/full) - aggregates all services
 * 2. Direct Firestore fetch - when the API has nothing or fails
 *
 * With no story yet it shows an empty state; when loading fails, an error
 * with a retry. Demo data appears only behind the explicit demo flag, and
 * always with the demo banner, so example numbers never pass as the user's.
 */
export async function showYourStoryDashboard(): Promise<void> {
  void trackScreen('your-story');
  const modules = await loadYourStory();
  if (!modules) return;
  const [{ getYourStoryUI }, { fetchYourStory }, viz] = modules;
  const dashboard = getYourStoryUI();
  dashboard.showLoading();

  if (isDemoDataEnabled()) {
    dashboard.show(viz.createDemoStoryData('demo-user'), { showDemoBanner: true });
    return;
  }

  const result = await fetchYourStory();
  if (result.status === 'ok') {
    dashboard.show(result.data);
    return;
  }

  let failed = result.status === 'error';
  const userId = localStorage.getItem('ferni_user_id');
  try {
    if (userId) {
      const visualizationData = await viz.fetchVisualizationData(userId);
      if (viz.hasAnyVisualizationData(visualizationData)) {
        dashboard.show(await aggregateStoryData(userId, visualizationData));
        return;
      }
    }
  } catch (err) {
    log.warn({ err }, 'Your Story Firestore read failed');
    failed = true;
  }

  dashboard.showStatus(failed ? 'error' : 'empty', () => void showYourStoryDashboard());
}

/**
 * Aggregate story data from multiple sources.
 *
 * Combines:
 * - Visualization data (from Firestore)
 * - Analytics (from API)
 * - Relationship stage (from API)
 * - Recent milestones (from API)
 */
async function aggregateStoryData(
  userId: string,
  visualizationData: Awaited<ReturnType<typeof fetchVisualizationData>>
): Promise<YourStoryData> {
  // Fetch additional data in parallel
  const [analyticsData, stageData, milestonesData] = await Promise.all([
    fetchAnalyticsStats(userId),
    fetchRelationshipStage(userId),
    fetchRecentMilestones(userId),
  ]);

  return {
    ...visualizationData,
    userId,
    timestamp: new Date().toISOString(),
    analytics: analyticsData,
    stage: stageData,
    milestones: milestonesData,
  };
}

/**
 * Fetch analytics stats for the story header.
 */
async function fetchAnalyticsStats(_userId: string): Promise<YourStoryData['analytics']> {
  // TODO: Backend GET /api/analytics/user not implemented yet.
  // Re-enable fetch when handler exists.
  return { daysTogether: 0, conversations: 0, streak: 0 };
}

/**
 * Fetch relationship stage for the story header.
 */
async function fetchRelationshipStage(_userId: string): Promise<YourStoryData['stage']> {
  // TODO: Backend GET /api/journey/stage not implemented yet.
  // Re-enable fetch when handler exists.
  return {
    name: 'Getting Started',
    progress: 0,
    tagline: 'Just beginning our journey',
  };
}

/**
 * Fetch completed relationship milestones for the story.
 * Source: GET /api/your-story/section/relationship (src/api/your-story-routes.ts),
 * built from the relationship arc stored in Firestore.
 */
async function fetchRecentMilestones(_userId: string): Promise<YourStoryData['milestones']> {
  const response = await apiGet<{
    data?: {
      milestones?: Array<{ id: string; title: string; completed: boolean; completedAt?: string }>;
    };
  }>('/api/your-story/section/relationship');
  if (!response.ok) {
    log.debug({ status: response.status }, 'Failed to fetch milestones');
    return [];
  }
  return (response.data?.data?.milestones ?? [])
    .filter((m) => m.completed)
    .map((m) => ({
      id: m.id,
      name: m.title,
      celebratedAt: m.completedAt ? new Date(m.completedAt).getTime() : 0,
      category: 'relationship' as const,
    }));
}

// ============================================================================
// WHAT I DO FOR YOU (Ferni Care - formerly "Life Automation")
// ============================================================================

/**
 * Show "What I Do For You" dashboard.
 * The things Ferni takes care of automatically - routines, not "automation".
 */
export async function showWhatIDoForYou(): Promise<void> {
  void trackScreen('other'); // TODO: Add 'care' to ScreenName

  const { showFerniCareDashboard } = await import('../ui/ferni-care/index.js');
  showFerniCareDashboard();
}

// Backwards compatibility alias
export const showLifeAutomation = showWhatIDoForYou;

/**
 * Show routine ideas gallery.
 */
export async function showRoutineIdeas(): Promise<void> {
  void trackScreen('other'); // TODO: Add 'care' to ScreenName

  const { showIdeasGallery } = await import('../ui/ferni-care/index.js');
  showIdeasGallery();
}

// Backwards compatibility alias
export const showWorkflowTemplates = showRoutineIdeas;

/**
 * Show routine builder.
 */
export async function showRoutineCreator(): Promise<void> {
  void trackScreen('other'); // TODO: Add 'care' to ScreenName

  const { showRoutineBuilder } = await import('../ui/ferni-care/index.js');
  showRoutineBuilder();
}

// Backwards compatibility alias
export const showWorkflowCreator = showRoutineCreator;
