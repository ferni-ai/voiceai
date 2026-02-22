/**
 * Panel Methods
 *
 * Handles showing various settings/dashboard panels.
 * Each method fetches data from API, falls back to demo data in development,
 * or shows an empty state.
 */

import type { ScreenName } from '../services/app-context-tracking.service.js';
import { getDemoTeamHuddle, isDemoDataEnabled } from '../services/engagement-demo-data.js';
import { fetchYourStory } from '../services/your-story.service.js';
import { getAnalyticsDashboardUI } from '../ui/analytics-dashboard.ui.js';
import { getCognitiveInsightsUI } from '../ui/cognitive-insights.ui.js';
import { getConversationHistoryUI } from '../ui/conversation-history.ui.js';
import { getDataExportUI } from '../ui/data-export.ui.js';
import { getPredictionTrackerUI } from '../ui/prediction-tracker.ui.js';
import { showTeamHuddle as showTeamHuddleUI } from '../ui/team-huddle.ui.js';
import {
  createDemoStoryData,
  fetchVisualizationData,
  hasAnyVisualizationData,
  type YourStoryData,
} from '../ui/visualizations/index.js';
import { getYourStoryUI } from '../ui/your-story-dashboard.ui.js';
import { getApiHeadersAsync } from '../utils/api.js';
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

  try {
    const response = await fetch('/api/conversations');
    if (response.ok) {
      const data = await response.json();
      getConversationHistoryUI().show(data);
      return;
    }
  } catch (err) {
    log.debug('API fetch failed, checking for demo mode');
  }

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

  // Try to fetch real data from API
  try {
    const userId = localStorage.getItem('ferni_user_id');
    const url = userId
      ? `/api/analytics/user?userId=${encodeURIComponent(userId)}`
      : '/api/analytics/user';

    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      getAnalyticsDashboardUI().show(data);
      return;
    }
    log.debug('API returned non-OK status:', response.status);
  } catch (err) {
    log.debug('API fetch failed, checking for demo mode');
  }

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
  try {
    const response = await fetch(`/api/cognitive/memories/${encodeURIComponent(memoryId)}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      log.info({ memoryId }, 'Memory deleted successfully');
      // Refresh the cognitive insights panel with updated data
      await showCognitiveInsights();
    } else {
      const error = await response.json();
      log.warn({ memoryId, error }, 'Failed to delete memory');
    }
  } catch (err) {
    log.error({ err, memoryId }, 'Error deleting memory');
  }
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

  try {
    const response = await fetch('/api/cognitive/memories');
    if (response.ok) {
      const data = await response.json();
      // API now returns data in correct UI format
      getCognitiveInsightsUI().show({
        memories: data.memories || [],
        patterns: data.patterns || [],
        totalInteractions: data.totalInteractions || 0,
        knowledgeScore: data.knowledgeScore || 0,
      });
      return;
    }
  } catch (err) {
    log.debug('API fetch failed, checking for demo mode');
  }

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
  // Try to fetch real data from API
  try {
    const response = await fetch('/api/predictions');
    if (response.ok) {
      const data = await response.json();
      // Transform API data to UI format
      const predictions = data.predictions || [];
      const completed = predictions.filter((p: { accuracy?: number }) => p.accuracy !== undefined);
      const totalCorrect = completed.reduce(
        (sum: number, p: { accuracy: number }) => sum + (p.accuracy >= 70 ? 1 : 0),
        0
      );

      getPredictionTrackerUI().show({
        overallAccuracy: data.stats?.averageAccuracy || 0,
        totalPredictions: data.stats?.totalPredictions || predictions.length,
        correctPredictions: totalCorrect,
        byCategory: [],
        recentTrend: completed.slice(0, 7).map((p: { accuracy: number }) => p.accuracy),
        bestStreak: 0,
        currentStreak: 0,
      });
      return;
    }
  } catch (err) {
    log.debug('API fetch failed, checking for demo mode');
  }

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
  const { dataExportService } = await import('../services/data-export.service.js');
  const { toast } = await import('../ui/whisper.ui.js');

  // Set up callbacks for export and delete
  getDataExportUI().setCallbacks({
    onExport: async (format, categories) => {
      try {
        toast.info('Preparing your data...');
        await dataExportService.exportData(format, categories);
        toast.success('Download started!');
      } catch (err) {
        log.error('Export failed:', err);
        toast.error("Couldn't export. Try again?");
      }
    },
    onDeleteData: async () => {
      try {
        toast.info('Deleting your data...');
        await dataExportService.deleteAllData();
        toast.success('All data deleted');
        // Redirect to home after deletion
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        log.error('Delete failed:', err);
        toast.error("Couldn't delete. Try again?");
      }
    },
    onClose: () => {
      log.debug('Data export panel closed');
    },
  });

  // Fetch categories from backend
  const categories = await dataExportService.getExportableCategories();
  getDataExportUI().show(categories);

  // Fall back to demo data if needed
  if (categories.length === 0 && isDemoDataEnabled()) {
    const demoData = [
      {
        category: 'Conversations',
        description: 'All conversation transcripts',
        itemCount: 45,
        exportable: true,
      },
      {
        category: 'Insights',
        description: 'What Ferni has learned about you',
        itemCount: 23,
        exportable: true,
      },
      {
        category: 'Rituals',
        description: 'Daily practice history and streaks',
        itemCount: 156,
        exportable: true,
      },
      {
        category: 'Predictions',
        description: 'Your predictions and outcomes',
        itemCount: 18,
        exportable: true,
      },
      {
        category: 'Mood History',
        description: 'Emotional weather records',
        itemCount: 42,
        exportable: true,
      },
      {
        category: 'Profile',
        description: 'Your profile and preferences',
        itemCount: 1,
        exportable: true,
      },
      {
        category: 'Contacts',
        description: 'Your people and relationships',
        itemCount: 12,
        exportable: true,
      },
      {
        category: 'Trust Journey',
        description: 'Your growth, boundaries, and shared moments',
        itemCount: 28,
        exportable: true,
      },
      {
        category: 'Wellbeing',
        description: 'Wellness snapshots and trends',
        itemCount: 35,
        exportable: true,
      },
      {
        category: 'Habits',
        description: "Maya's habit coaching data",
        itemCount: 8,
        exportable: true,
      },
      {
        category: 'Productivity',
        description: 'Tasks, notes, and journal entries',
        itemCount: 67,
        exportable: true,
      },
    ];
    getDataExportUI().show(demoData);
  }
}

// ============================================================================
// TEAM HUDDLE
// ============================================================================

/**
 * Show team huddle panel.
 * Starts a new huddle via API, or shows demo data in development.
 */
export async function showTeamHuddle(topic?: string): Promise<void> {
  void trackScreen('team');

  // Try to start a new huddle via API with proper Firebase auth
  try {
    const authHeaders = await getApiHeadersAsync(true);
    const response = await fetch('/api/huddles/start', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        topic: topic || 'Weekly check-in on your progress',
        type: 'weekly',
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.huddle) {
        // API now returns TeamHuddleData-compatible format
        showTeamHuddleUI(data.huddle);
        log.debug('Team huddle started via API');
        return;
      }
    }
  } catch (err) {
    log.debug('API fetch failed, checking for demo mode');
  }

  // Fall back to demo data if enabled
  if (isDemoDataEnabled()) {
    const demoHuddle = getDemoTeamHuddle('weekly');
    showTeamHuddleUI(demoHuddle);
    log.debug('Team huddle shown (demo)');
    return;
  }

  // No data available - show a demo weekly huddle anyway (better UX than empty)
  const demoHuddle = getDemoTeamHuddle('weekly');
  showTeamHuddleUI(demoHuddle);
  log.debug('Team huddle shown (fallback demo)');
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
 * 2. Direct Firestore fetch - fallback for offline/errors
 * 3. Demo data - for new users or when all else fails
 *
 * For new users, shows aspirational demo data with a warm banner.
 */
export async function showYourStoryDashboard(): Promise<void> {
  void trackScreen('your-story');
  const dashboard = getYourStoryUI();
  dashboard.showLoading();

  const userId = localStorage.getItem('ferni_user_id');

  // Priority 1: Try the unified API endpoint (aggregates all services)
  try {
    if (userId) {
      log.debug({ userId }, 'Fetching from /api/your-story/full');
      const storyData = await fetchYourStory();

      // Check if we got real data (not demo fallback)
      if (storyData.analytics.conversations > 0 || storyData.analytics.daysTogether > 0) {
        dashboard.show(storyData);
        log.info({ userId }, 'Your Story shown from API');
        return;
      }
    }
  } catch (err) {
    log.debug({ err }, 'API fetch failed, trying Firestore fallback');
  }

  // Priority 2: Fallback to direct Firestore fetch
  try {
    if (userId) {
      const visualizationData = await fetchVisualizationData(userId);

      if (hasAnyVisualizationData(visualizationData)) {
        // Aggregate with analytics and milestone data
        const storyData = await aggregateStoryData(userId, visualizationData);
        dashboard.show(storyData);
        log.info({ userId }, 'Your Story shown from Firestore fallback');
        return;
      }
    }
  } catch (err) {
    log.debug({ err }, 'Firestore fetch failed, using demo data');
  }

  // Priority 3: Demo data for new users or when all else fails
  const demoData = createDemoStoryData(userId || 'demo-user');
  dashboard.show(demoData, { showDemoBanner: true });
  log.info('Your Story shown with demo data (new user or demo mode)');
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
async function fetchAnalyticsStats(userId: string): Promise<YourStoryData['analytics']> {
  try {
    const response = await fetch(`/api/analytics/user?userId=${encodeURIComponent(userId)}`);
    if (response.ok) {
      const data = await response.json();
      return {
        daysTogether: data.totalDays || 0,
        conversations: data.totalSessions || 0,
        streak: data.currentLongestStreak || 0,
      };
    }
  } catch (err) {
    log.debug({ err }, 'Failed to fetch analytics stats');
  }

  // Return zeros if API fails
  return { daysTogether: 0, conversations: 0, streak: 0 };
}

/**
 * Fetch relationship stage for the story header.
 */
async function fetchRelationshipStage(userId: string): Promise<YourStoryData['stage']> {
  try {
    const response = await fetch(`/api/journey/stage?userId=${encodeURIComponent(userId)}`);
    if (response.ok) {
      const data = await response.json();
      return {
        name: data.stageName || 'Getting Started',
        progress: data.progress || 0,
        tagline: data.tagline || 'Just beginning our journey',
      };
    }
  } catch (err) {
    log.debug({ err }, 'Failed to fetch relationship stage');
  }

  // Return defaults if API fails
  return {
    name: 'Getting Started',
    progress: 0,
    tagline: 'Just beginning our journey',
  };
}

/**
 * Fetch recent milestones for the story.
 */
async function fetchRecentMilestones(userId: string): Promise<YourStoryData['milestones']> {
  try {
    const response = await fetch(
      `/api/journey/milestones?userId=${encodeURIComponent(userId)}&limit=5`
    );
    if (response.ok) {
      const data = await response.json();
      return (data.milestones || []).map(
        (m: { id: string; name: string; celebratedAt: string | number; category?: string }) => ({
          id: m.id,
          name: m.name,
          celebratedAt:
            typeof m.celebratedAt === 'string'
              ? new Date(m.celebratedAt).getTime()
              : m.celebratedAt,
          category: (m.category || 'discovery') as
            | 'relationship'
            | 'team'
            | 'conversation'
            | 'discovery'
            | 'sweet',
        })
      );
    }
  } catch (err) {
    log.debug({ err }, 'Failed to fetch milestones');
  }

  // Return empty array if API fails
  return [];
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
