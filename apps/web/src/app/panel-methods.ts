/**
 * Panel Methods
 *
 * Handles showing various settings/dashboard panels.
 * Each method fetches data from API, falls back to demo data in development,
 * or shows an empty state.
 */

import type { ScreenName } from '../services/app-context-tracking.service.js';
import { isDemoDataEnabled } from '../services/engagement-demo-data.js';
import { getAnalyticsDashboardUI } from '../ui/analytics-dashboard.ui.js';
import { getCognitiveInsightsUI } from '../ui/cognitive-insights.ui.js';
import { getConversationHistoryUI } from '../ui/conversation-history.ui.js';
import { getDataExportUI } from '../ui/data-export.ui.js';
import { getPredictionTrackerUI } from '../ui/prediction-tracker.ui.js';
import {
  toPredictionTrackerData,
  type PredictionsResponse,
} from '../services/prediction-tracker-data.js';
import { showTeamHuddle as showTeamHuddleUI, type TeamHuddleData } from '../ui/team-huddle.ui.js';
import type { fetchVisualizationData, YourStoryData } from '../ui/visualizations/index.js';
import { loadYourStory } from '../ui/lazy-screens.js';
import { createLogger } from '../utils/logger.js';
import { apiGet, apiPost } from '../utils/api.js';

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

  // TODO: Backend GET /api/conversations not implemented yet.
  // When the handler exists, uncomment the fetch below.
  // try {
  //   const response = await fetch('/api/conversations');
  //   if (response.ok) {
  //     const data = await response.json();
  //     getConversationHistoryUI().show(data);
  //     return;
  //   }
  // } catch (err) {
  //   log.debug('API fetch failed, checking for demo mode');
  // }

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

  // TODO: Backend GET /api/analytics/user not implemented yet.
  // When the handler exists, uncomment the fetch below.
  // try {
  //   const userId = localStorage.getItem('ferni_user_id');
  //   const url = userId
  //     ? `/api/analytics/user?userId=${encodeURIComponent(userId)}`
  //     : '/api/analytics/user';
  //   const response = await fetch(url);
  //   if (response.ok) {
  //     const data = await response.json();
  //     getAnalyticsDashboardUI().show(data);
  //     return;
  //   }
  // } catch (err) {
  //   log.debug('API fetch failed, checking for demo mode');
  // }

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
  // TODO: Backend DELETE /api/cognitive/memories/:id not implemented yet.
  // Re-enable when handler exists.
  log.debug({ memoryId }, 'deleteMemory: backend not implemented yet');
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

  // TODO: Backend GET /api/cognitive/memories not implemented yet.
  // When the handler exists, uncomment the fetch below.
  // try {
  //   const response = await fetch('/api/cognitive/memories');
  //   if (response.ok) {
  //     const data = await response.json();
  //     getCognitiveInsightsUI().show({
  //       memories: data.memories || [],
  //       patterns: data.patterns || [],
  //       totalInteractions: data.totalInteractions || 0,
  //       knowledgeScore: data.knowledgeScore || 0,
  //     });
  //     return;
  //   }
  // } catch (err) {
  //   log.debug('API fetch failed, checking for demo mode');
  // }

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
 * Show prediction tracker panel from GET /api/predictions.
 * No predictions yet, or a failed load, gets a toast instead of a zero dashboard.
 */
export async function showPredictionTracker(): Promise<void> {
  void trackScreen('predictions');
  const { toast } = await import('../ui/whisper.ui.js');
  const response = await apiGet<PredictionsResponse>('/api/predictions');
  if (!response.ok || !response.data) {
    log.warn({ status: response.status }, 'Prediction tracker load failed');
    toast.error("Couldn't load your predictions. Try again?");
    return;
  }
  const data = toPredictionTrackerData(response.data);
  if (!data) {
    toast.info("No predictions yet. Make one with Ferni and it'll show up here.");
    return;
  }
  getPredictionTrackerUI().show(data);
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

/** Body of POST /api/huddles/start (src/api/routes/team.ts handleStartHuddle). */
interface StartHuddleResponse {
  success?: boolean;
  huddle?: Omit<TeamHuddleData, 'type'> & { type?: string };
}

/**
 * Start a team huddle via POST /api/huddles/start and show it.
 * A failed start says so; nothing is shown that the server didn't send.
 */
export async function showTeamHuddle(topic?: string): Promise<void> {
  void trackScreen('team');
  const response = await apiPost<StartHuddleResponse>('/api/huddles/start', {
    topic: topic || 'Weekly check-in on your progress',
    type: 'weekly',
  });
  const huddle = response.ok ? response.data?.huddle : undefined;
  if (!huddle) {
    log.warn({ status: response.status }, 'Team huddle start failed');
    const { toast } = await import('../ui/whisper.ui.js');
    toast.error("Couldn't start a team huddle. Try again?");
    return;
  }
  const type = huddle.type === 'milestone' || huddle.type === 'special' ? huddle.type : 'weekly';
  showTeamHuddleUI({ ...huddle, type });
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
 * Aggregate story data: visualizations (Firestore) plus the header stats,
 * relationship stage and milestones from GET /api/your-story/section/:section
 * (src/api/your-story-routes.ts). A failed section throws, so the caller shows
 * the error state rather than zeros or a made-up stage.
 */
async function aggregateStoryData(
  userId: string,
  visualizationData: Awaited<ReturnType<typeof fetchVisualizationData>>
): Promise<YourStoryData> {
  const [header, relationship] = await Promise.all([
    fetchStorySection<StoryHeaderSection>('header'),
    fetchStorySection<RelationshipSection>('relationship'),
  ]);
  return {
    ...visualizationData,
    userId,
    timestamp: new Date().toISOString(),
    analytics: {
      daysTogether: header.daysTogether,
      conversations: header.totalConversations,
      streak: header.currentStreak,
    },
    stage: {
      name: relationship.stageLabel,
      progress: relationship.progress,
      tagline: relationship.tagline,
    },
    milestones: (relationship.milestones ?? [])
      .filter((m) => m.completed)
      .map((m) => ({
        id: m.id,
        name: m.title,
        celebratedAt: m.completedAt ? new Date(m.completedAt).getTime() : 0,
        category: 'relationship' as const,
      })),
  };
}

/** StoryHeader in src/api/your-story-routes.ts. */
interface StoryHeaderSection {
  daysTogether: number;
  totalConversations: number;
  currentStreak: number;
}

/** RelationshipProgress in src/api/your-story-routes.ts. */
interface RelationshipSection {
  stageLabel: string;
  progress: number;
  tagline: string;
  milestones?: Array<{ id: string; title: string; completed: boolean; completedAt?: string }>;
}

async function fetchStorySection<T>(section: 'header' | 'relationship'): Promise<T> {
  const response = await apiGet<{ data?: T }>(`/api/your-story/section/${section}`);
  if (!response.ok || !response.data?.data) {
    throw new Error(`Your Story ${section} failed (${response.status})`);
  }
  return response.data.data;
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
