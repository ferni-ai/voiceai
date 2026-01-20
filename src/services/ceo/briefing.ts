/**
 * Briefing Service for CEO CLI
 *
 * Generates morning briefings with calendar, priorities, metrics, and AI suggestions.
 * Part of the Personal Productivity commands (ferni briefing).
 *
 * Aggregates data from:
 * - Calendar (mock for now, will integrate Google Calendar later)
 * - Goals service (top 3 active goals as priorities)
 * - Metrics (from unified-data service or mock)
 * - Experiments (from experiment manager)
 *
 * @module services/ceo/briefing
 */

import chalk from 'chalk';
import { createLogger } from '../../utils/safe-logger.js';
import { goalsService, type Goal } from './goals.js';
import { getRunningWebExperiments, analyzeExperiment } from '../experiments/web-experiments.js';

const log = createLogger({ module: 'briefing-service' });

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarEvent {
  title: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}

export interface Priority {
  id: string;
  title: string;
  source: 'goal' | 'manual';
  progress?: number;
  category?: string;
}

export interface MetricsSummary {
  activeUsers: { value: number; change: number };
  callQuality: { value: number; change: number };
  revenue: { value: number; change: number };
}

export interface ExperimentSummary {
  id: string;
  name: string;
  status: string;
  confidence: number;
  recommendation: string;
  isSignificant: boolean;
  sampleSize: number;
  progress: number;
}

export interface Briefing {
  greeting: string;
  date: Date;
  calendar: CalendarEvent[];
  priorities: Priority[];
  metrics: MetricsSummary;
  experiments: ExperimentSummary[];
  suggestion: string;
}

export interface BriefingService {
  generateBriefing: (userId: string) => Promise<Briefing>;
  formatForTerminal: (briefing: Briefing) => string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get time-appropriate greeting
 */
function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let timeGreeting: string;

  if (hour < 12) {
    timeGreeting = 'Good morning';
  } else if (hour < 17) {
    timeGreeting = 'Good afternoon';
  } else {
    timeGreeting = 'Good evening';
  }

  return `${timeGreeting}, ${name}!`;
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format date for display (e.g., "Monday, January 20, 2026")
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format percentage change with arrow
 */
function formatChange(change: number): string {
  if (change > 0) {
    return chalk.green(`+${change}% ↑`);
  } else if (change < 0) {
    return chalk.red(`${change}% ↓`);
  }
  return chalk.gray('stable');
}

/**
 * Generate AI suggestion based on calendar and priorities
 */
function generateSuggestion(calendar: CalendarEvent[], priorities: Priority[]): string {
  const meetingCount = calendar.length;
  const now = new Date();
  const hour = now.getHours();

  // Analyze calendar density
  const morningMeetings = calendar.filter((e) => e.startTime.getHours() < 12).length;
  const afternoonMeetings = calendar.filter((e) => e.startTime.getHours() >= 12).length;

  // Priority suggestions
  const topPriority = priorities[0];

  const suggestions: string[] = [];

  // Calendar-based suggestions
  if (meetingCount === 0) {
    suggestions.push('You have no meetings today - perfect for deep work!');
  } else if (meetingCount <= 2) {
    suggestions.push('Light meeting day - great opportunity to make progress on your priorities.');
  } else if (meetingCount >= 5) {
    suggestions.push('Heavy meeting day. Consider batching tasks between meetings.');
  }

  if (morningMeetings === 0 && meetingCount > 0) {
    suggestions.push('Your morning is free - tackle your most important task first.');
  }

  if (afternoonMeetings === 0 && meetingCount > 0) {
    suggestions.push('Light afternoon - perfect for deep work or reflection.');
  }

  // Priority-based suggestions
  if (topPriority) {
    suggestions.push(`Focus on "${topPriority.title}" to keep momentum.`);
  }

  // Time-based suggestions
  if (hour < 10) {
    suggestions.push('Early start! Use your peak energy for complex tasks.');
  } else if (hour >= 21) {
    suggestions.push("It's late - consider wrapping up and resting well for tomorrow.");
  }

  // Pick a relevant suggestion or combine a couple
  if (suggestions.length === 0) {
    return 'Have a productive day!';
  }

  // Return first two suggestions combined if available
  if (suggestions.length >= 2) {
    return suggestions.slice(0, 2).join(' ');
  }

  return suggestions[0];
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

/**
 * Get calendar events for today (mock data for now)
 * TODO: Integrate with Google Calendar API
 */
async function getCalendarEvents(_userId: string): Promise<CalendarEvent[]> {
  // Mock calendar events for now
  // In the future, this will integrate with Google Calendar API
  const today = new Date();
  const mockEvents: CalendarEvent[] = [
    {
      title: 'Team standup',
      startTime: new Date(today.setHours(9, 0, 0, 0)),
      endTime: new Date(today.setHours(9, 30, 0, 0)),
    },
    {
      title: 'Product review',
      startTime: new Date(new Date().setHours(14, 0, 0, 0)),
      endTime: new Date(new Date().setHours(15, 0, 0, 0)),
      location: 'Conference Room A',
    },
    {
      title: '1:1 with Alex',
      startTime: new Date(new Date().setHours(16, 0, 0, 0)),
      endTime: new Date(new Date().setHours(16, 30, 0, 0)),
    },
  ];

  log.debug({ userId: _userId, eventCount: mockEvents.length }, 'Calendar events fetched (mock)');
  return mockEvents;
}

/**
 * Get priorities from active goals
 */
async function getPrioritiesFromGoals(userId: string): Promise<Priority[]> {
  try {
    const goals = await goalsService.getGoals(userId, 'active');

    // Sort by progress (lower progress = higher priority) and take top 3
    const sortedGoals = goals
      .sort((a, b) => {
        // Prioritize goals with target dates
        if (a.targetDate && !b.targetDate) return -1;
        if (!a.targetDate && b.targetDate) return 1;

        // Then by progress (lower progress first)
        return a.progress - b.progress;
      })
      .slice(0, 3);

    return sortedGoals.map((goal: Goal) => ({
      id: goal.id,
      title: goal.title,
      source: 'goal' as const,
      progress: goal.progress,
      category: goal.category,
    }));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get goals for priorities');
    return [];
  }
}

/**
 * Get metrics summary (mock data for now)
 * TODO: Integrate with actual metrics endpoints
 */
async function getMetricsSummary(_userId: string): Promise<MetricsSummary> {
  // Mock metrics for now
  // In the future, this will pull from observability endpoints
  const mockMetrics: MetricsSummary = {
    activeUsers: { value: 1234, change: 5 },
    callQuality: { value: 98.2, change: 0 },
    revenue: { value: 12450, change: 8 },
  };

  log.debug({ userId: _userId }, 'Metrics fetched (mock)');
  return mockMetrics;
}

/**
 * Get running experiments with analysis
 */
async function getExperimentSummaries(): Promise<ExperimentSummary[]> {
  try {
    const experiments = await getRunningWebExperiments();
    const summaries: ExperimentSummary[] = [];

    for (const exp of experiments) {
      try {
        const analysis = await analyzeExperiment(exp.id);
        if (analysis) {
          summaries.push({
            id: exp.id,
            name: exp.name,
            status: exp.status,
            confidence: analysis.confidence,
            recommendation: analysis.recommendation,
            isSignificant: analysis.isSignificant,
            sampleSize: analysis.sampleSize,
            progress: analysis.progress,
          });
        }
      } catch (error) {
        log.warn({ error: String(error), experimentId: exp.id }, 'Failed to analyze experiment');
      }
    }

    return summaries;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get experiments');
    return [];
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Generate a complete briefing for a user
 */
export async function generateBriefing(userId: string): Promise<Briefing> {
  log.info({ userId }, 'Generating briefing');

  // Fetch all data in parallel
  const [calendar, priorities, metrics, experiments] = await Promise.all([
    getCalendarEvents(userId),
    getPrioritiesFromGoals(userId),
    getMetricsSummary(userId),
    getExperimentSummaries(),
  ]);

  // Generate AI suggestion based on context
  const suggestion = generateSuggestion(calendar, priorities);

  const briefing: Briefing = {
    greeting: getGreeting('Seth'), // TODO: Get user's name from profile
    date: new Date(),
    calendar,
    priorities,
    metrics,
    experiments,
    suggestion,
  };

  log.info(
    {
      userId,
      eventCount: calendar.length,
      priorityCount: priorities.length,
      experimentCount: experiments.length,
    },
    'Briefing generated'
  );

  return briefing;
}

/**
 * Format briefing for terminal output with colors
 */
export function formatForTerminal(briefing: Briefing): string {
  const lines: string[] = [];

  // Header with greeting and date
  lines.push('');
  lines.push(chalk.yellow.bold(`🌅 ${briefing.greeting}`));
  lines.push(chalk.gray(`   ${formatDate(briefing.date)}`));
  lines.push('');

  // Calendar section
  if (briefing.calendar.length > 0) {
    lines.push(
      chalk.cyan.bold(`📅 TODAY'S CALENDAR`) +
        chalk.gray(
          ` (${briefing.calendar.length} meeting${briefing.calendar.length !== 1 ? 's' : ''})`
        )
    );
    for (const event of briefing.calendar) {
      const time = formatTime(event.startTime);
      const location = event.location ? chalk.gray(` @ ${event.location}`) : '';
      lines.push(`   ${chalk.white(time.padEnd(10))} ${event.title}${location}`);
    }
    lines.push('');
  } else {
    lines.push(chalk.cyan.bold("📅 TODAY'S CALENDAR"));
    lines.push(chalk.gray('   No meetings scheduled - great for deep work!'));
    lines.push('');
  }

  // Priorities section
  if (briefing.priorities.length > 0) {
    lines.push(chalk.magenta.bold('🎯 TOP PRIORITIES'));
    for (let i = 0; i < briefing.priorities.length; i++) {
      const p = briefing.priorities[i];
      const progress = p.progress !== undefined ? chalk.gray(` (${p.progress}%)`) : '';
      lines.push(`   ${i + 1}. ${p.title}${progress}`);
    }
    lines.push('');
  }

  // Metrics section
  lines.push(chalk.blue.bold('📊 METRICS'));
  const m = briefing.metrics;
  lines.push(
    `   ${chalk.white('•')} Active users: ${chalk.white(m.activeUsers.value.toLocaleString())} ${formatChange(m.activeUsers.change)}`
  );
  lines.push(
    `   ${chalk.white('•')} Call quality: ${chalk.white(`${m.callQuality.value.toFixed(1)}%`)} ${formatChange(m.callQuality.change)}`
  );
  lines.push(
    `   ${chalk.white('•')} Revenue: ${chalk.white(`$${m.revenue.value.toLocaleString()}`)} MTD ${formatChange(m.revenue.change)}`
  );
  lines.push('');

  // Experiments section
  if (briefing.experiments.length > 0) {
    lines.push(chalk.yellow.bold('⚡ EXPERIMENTS'));
    for (const exp of briefing.experiments) {
      const confidenceColor =
        exp.confidence >= 95 ? chalk.green : exp.confidence >= 80 ? chalk.yellow : chalk.gray;
      const status =
        exp.isSignificant && exp.confidence >= 95
          ? chalk.green.bold('ready to promote')
          : `${exp.progress}% to significance`;
      lines.push(
        `   ${chalk.white('•')} ${exp.name}: ${confidenceColor(`${exp.confidence}% confidence`)} (${status})`
      );
    }
    lines.push('');
  }

  // AI Suggestion section
  lines.push(chalk.green.bold('💡 SUGGESTION'));
  lines.push(`   "${briefing.suggestion}"`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

/**
 * Singleton briefing service instance.
 * Use this for typed access to all briefing operations.
 */
export const briefingService: BriefingService = {
  generateBriefing,
  formatForTerminal,
};

export default briefingService;
