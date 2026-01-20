/**
 * CEO Storage Client for CLI
 *
 * Connects CLI commands to the same Firestore backend as the voice agent.
 * This enables cross-device sync: track wins via CLI, Jordan celebrates via voice.
 *
 * Uses the CEO services from src/services/ceo/ for Firestore persistence.
 */

import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

// ============================================================================
// RE-EXPORT TYPES FROM SERVICES
// ============================================================================

// Goals
export type {
  Goal,
  Milestone,
  GoalStatus,
  GoalCategory,
  CreateGoalInput,
  UpdateGoalInput,
} from '../../../../src/services/ceo/goals.js';

// Wins
export type { Win, WinPeriod } from '../../../../src/services/ceo/wins.js';

// Journal
export type { JournalEntry, JournalPeriod, Sentiment } from '../../../../src/services/ceo/journal.js';

// Energy
export type { EnergyLog, EnergyTrend } from '../../../../src/services/ceo/energy.js';

// Gratitude
export type { GratitudeEntry, GratitudeCategory } from '../../../../src/services/ceo/gratitude.js';

// Decisions
export type { Decision, DecisionStatus } from '../../../../src/services/ceo/decisions.js';

// Priorities
export type { Priority } from '../../../../src/services/ceo/priorities.js';

// Blockers
export type { Blocker, BlockerSeverity, BlockerStatus } from '../../../../src/services/ceo/blockers.js';

// Ideas
export type { Idea } from '../../../../src/services/ceo/ideas.js';

// Focus
export type { FocusSession, FocusStats, StartSessionOptions } from '../../../../src/services/ceo/focus.js';

// Briefing
export type { Briefing } from '../../../../src/services/ceo/briefing.js';

// Weekly Review
export type { WeeklyReview } from '../../../../src/services/ceo/weekly-review.js';

// Meetings
export type { Meeting, ActionItem, MeetingPeriod } from '../../../../src/services/ceo/meetings.js';

// Insights
export type { Insight, InsightType, InsightCategory, InsightPriority } from '../../../../src/services/ceo/insights.js';

// ============================================================================
// USER ID MANAGEMENT
// ============================================================================

const CONFIG_DIR = join(homedir(), '.ferni');
const USER_FILE = join(CONFIG_DIR, 'user.json');

interface UserConfig {
  userId: string;
  email?: string;
  lastSync?: string;
}

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function getUserId(): Promise<string | null> {
  try {
    const data = await fs.readFile(USER_FILE, 'utf-8');
    const config: UserConfig = JSON.parse(data);
    return config.userId || null;
  } catch {
    return null;
  }
}

export async function setUserId(userId: string, email?: string): Promise<void> {
  await ensureConfigDir();
  const config: UserConfig = { userId, email, lastSync: new Date().toISOString() };
  await fs.writeFile(USER_FILE, JSON.stringify(config, null, 2));
}

// ============================================================================
// SERVICE IMPORTS (lazy-loaded to avoid import errors in CLI context)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let servicesModule: any = null;

async function getServices() {
  if (!servicesModule) {
    try {
      // Dynamic import from project root - works in both dev and built modes
      const projectRoot = process.env.FERNI_PROJECT_ROOT || process.cwd();
      const servicesPath = `${projectRoot}/dist/services/ceo/index.js`;
      servicesModule = await import(servicesPath);
    } catch (e) {
      console.error('Failed to load CEO services:', e);
      throw new Error('Could not connect to CEO services. Run: pnpm build:fast');
    }
  }
  return servicesModule;
}

// ============================================================================
// WRAPPER FUNCTIONS - Call services with CLI user ID
// ============================================================================

// --- GOALS ---
export async function createGoal(
  input: Parameters<typeof import('../../../../src/services/ceo/goals.js').createGoal>[1]
) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.createGoal(userId, input);
}

export async function getGoals(status?: 'active' | 'completed' | 'paused' | 'all') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getGoals(userId, status || 'all');
}

export async function getGoal(goalId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getGoal(userId, goalId);
}

export async function updateGoal(
  goalId: string,
  updates: Parameters<typeof import('../../../../src/services/ceo/goals.js').updateGoal>[2]
) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.updateGoal(userId, goalId, updates);
}

export async function updateProgress(goalId: string, progress: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.updateProgress(userId, goalId, progress);
}

export async function addMilestone(goalId: string, title: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addMilestone(userId, goalId, title);
}

export async function completeMilestone(goalId: string, milestoneId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.completeMilestone(userId, goalId, milestoneId);
}

// --- WINS ---
export async function addWin(description: string, category?: string, linkedGoalId?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addWin(userId, description, category, linkedGoalId);
}

export async function getWins(period: 'today' | 'week' | 'month' | 'all' = 'week') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getWins(userId, period);
}

export async function getRandomWin() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getRandomWin(userId);
}

export async function getWinsByCategory(category: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getWinsByCategory(userId, category);
}

export async function getWinCount() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getWinCount(userId);
}

// --- JOURNAL ---
export async function addJournalEntry(content: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addEntry(userId, content);
}

export async function getJournalEntries(period: 'today' | 'week' | 'month' | 'all' = 'week') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getEntries(userId, period);
}

export async function searchJournal(query: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.search(userId, query);
}

export async function getJournalBySentiment(sentiment: 'positive' | 'neutral' | 'negative') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getEntriesBySentiment(userId, sentiment);
}

export async function getLatestJournalEntry() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getLatestEntry(userId);
}

// --- ENERGY ---
export async function logEnergy(level: number, notes?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.logEnergy(userId, level, notes);
}

export async function getEnergyToday() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getEnergyToday(userId);
}

export async function getWeeklyEnergyAverage() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getWeeklyAverage(userId);
}

export async function getEnergyTrend(days: number = 7) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getTrend(userId, days);
}

export async function getWeeklyEnergyAnalysis() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getWeeklyAnalysis(userId);
}

export async function getLatestEnergyLog() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getLatestLog(userId);
}

// --- GRATITUDE ---
export async function addGratitude(content: string, category?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addGratitude(userId, content, category);
}

export async function getGratitudeEntries(period: 'today' | 'week' | 'month' | 'all' = 'week') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getGratitudeEntries(userId, period);
}

export async function getRandomGratitude() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getRandom(userId);
}

export async function getGratitudeToday() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getGratitudeToday(userId);
}

export async function getGratitudeThisWeek() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getThisWeek(userId);
}

export async function getGratitudeByCategory(category: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getByCategory(userId, category);
}

export async function getGratitudeCount() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getCount(userId);
}

export async function getGratitudeStreak() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getStreak(userId);
}

// --- DECISIONS ---
export async function addDecision(
  title: string,
  description?: string,
  options?: string[],
  deadline?: Date | string
) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  const deadlineDate = deadline instanceof Date ? deadline : deadline ? new Date(deadline) : undefined;
  return services.addDecision(userId, title, description, options, deadlineDate);
}

export async function getDecisions(status?: 'pending' | 'decided' | 'implemented' | 'all') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getDecisions(userId, status || 'all');
}

export async function getDecision(decisionId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getDecision(userId, decisionId);
}

export async function makeDecision(decisionId: string, choice: string, reasoning?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.makeDecision(userId, decisionId, choice, reasoning);
}

export async function addDecisionOutcome(decisionId: string, outcome: string, rating?: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addOutcome(userId, decisionId, outcome, rating);
}

export async function getPendingDecisions() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getPendingDecisions(userId);
}

// --- PRIORITIES ---
export async function addPriority(text: string, goalId?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addPriority(userId, text, goalId);
}

export async function getPriorities() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getPriorities(userId);
}

export async function completePriority(priorityId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.completePriority(userId, priorityId);
}

export async function reorderPriorities(priorityIds: string[]) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.reorderPriorities(userId, priorityIds);
}

export async function clearCompletedPriorities() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.clearCompleted(userId);
}

export async function getTopPriority() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getTopPriority(userId);
}

// --- BLOCKERS ---
export async function addBlocker(
  text: string,
  severity?: 'low' | 'medium' | 'high' | 'critical',
  goalId?: string
) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addBlocker(userId, text, severity, goalId);
}

export async function getBlockers(status?: 'active' | 'resolved' | 'all') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getBlockers(userId, status || 'all');
}

export async function getActiveBlockers() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getActiveBlockers(userId);
}

export async function getBlocker(blockerId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getBlocker(userId, blockerId);
}

export async function resolveBlocker(blockerId: string, resolution?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.resolveBlocker(userId, blockerId, resolution);
}

export async function escalateBlocker(blockerId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.escalateBlocker(userId, blockerId);
}

export async function getBlockersForGoal(goalId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getBlockersForGoal(userId, goalId);
}

export async function getActiveBlockerCount() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getActiveBlockerCount(userId);
}

export async function getBlockersBySeverity(severity: 'low' | 'medium' | 'high' | 'critical') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getBlockersBySeverity(userId, severity);
}

// --- IDEAS ---
export async function addIdea(content: string, tags?: string[]) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addIdea(userId, content, tags);
}

export async function getIdeas(limit?: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getIdeas(userId, limit);
}

export async function getIdeasByTag(tag: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getIdeasByTag(userId, tag);
}

export async function getRandomIdea() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getRandomIdea(userId);
}

export async function searchIdeas(query: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.searchIdeas(userId, query);
}

export async function tagIdea(ideaId: string, tags: string[]) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.tagIdea(userId, ideaId, tags);
}

export async function archiveIdea(ideaId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.archiveIdea(userId, ideaId);
}

export async function getIdeaCount() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getIdeaCount(userId);
}

// --- MEETINGS ---
export async function addMeeting(
  title: string,
  meetingDate: Date | string,
  attendees?: string[],
  notes?: string
) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  const date = meetingDate instanceof Date ? meetingDate : new Date(meetingDate);
  return services.addMeeting(userId, title, date, attendees, notes);
}

export async function getMeetings(period: 'today' | 'week' | 'month' | 'all' = 'week') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getMeetings(userId, period);
}

export async function getMeeting(meetingId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getMeeting(userId, meetingId);
}

export async function updateMeetingNotes(meetingId: string, notes: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.updateNotes(userId, meetingId, notes);
}

export async function addMeetingActionItem(meetingId: string, text: string, assignee?: string, dueDate?: Date) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.addActionItem(userId, meetingId, text, assignee, dueDate);
}

export async function completeMeetingActionItem(meetingId: string, actionItemId: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.completeActionItem(userId, meetingId, actionItemId);
}

export async function getMeetingActionItems(completed?: boolean) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getActionItems(userId, completed);
}

export async function searchMeetings(query: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.searchMeetings(userId, query);
}

// --- FOCUS ---
export async function startFocusSession(durationMinutes: number, label?: string, goalId?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.focusService.startSession(userId, { durationMinutes, label, goalId });
}

export async function endFocusSession(completed: boolean, notes?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.focusService.endSession(userId, completed, notes);
}

export async function getActiveFocusSession() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.focusService.getActiveSession(userId);
}

export async function getFocusHistory(limit?: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.focusService.getHistory(userId, limit);
}

export async function getFocusStats() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.focusService.getStats(userId);
}

// --- BRIEFING ---
export async function generateBriefing() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.generateBriefing(userId);
}

export async function formatBriefingForTerminal(briefing: Awaited<ReturnType<typeof generateBriefing>>) {
  const services = await getServices();
  return services.formatBriefingForTerminal(briefing);
}

// --- WEEKLY REVIEW ---
export async function generateWeeklyReview() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.weeklyReviewService.generate(userId);
}

export async function formatWeeklyReviewForTerminal(review: Awaited<ReturnType<typeof generateWeeklyReview>>) {
  const services = await getServices();
  return services.weeklyReviewService.formatForTerminal(review);
}

// --- ASK ---
export async function askFerni(question: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.ask(userId, question);
}

export async function buildAskContext() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.buildContext(userId);
}

// --- INSIGHTS ("Better than Human" cross-data intelligence) ---
export async function getAllInsights() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getAllInsights(userId);
}

export async function getCriticalInsights() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getCriticalInsights(userId);
}

export async function getInsightsByCategory(
  category: 'energy' | 'goals' | 'decisions' | 'focus' | 'momentum' | 'burnout' | 'patterns' | 'blockers' | 'productivity'
) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getInsightsByCategory(userId, category);
}

export async function getInsightsByType(type: 'correlation' | 'pattern' | 'warning' | 'celebration' | 'suggestion') {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getInsightsByType(userId, type);
}

export async function refreshInsights() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.refreshInsights(userId);
}

export async function getEnergyGoalInsights() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getEnergyGoalInsights(userId);
}

export async function getBlockerImpactInsights() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getBlockerImpactInsights(userId);
}

export async function getBurnoutWarning() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getBurnoutWarning(userId);
}

export async function getWeeklyPatterns() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user configured. Run: ferni setup local');

  const services = await getServices();
  return services.getWeeklyPatterns(userId);
}
