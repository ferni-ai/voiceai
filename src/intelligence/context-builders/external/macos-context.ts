/**
 * macOS Context Builder
 *
 * Processes context from the macOS menubar app and generates
 * context strings for the agent's system prompt.
 *
 * The macOS app sends context via the LiveKit data channel as:
 * { type: "macos_context", payload: MacOSContextPayload, timestamp: number }
 *
 * "Better than Human" - Awareness that no human friend could consistently maintain:
 * - Real-time calendar awareness (next meeting in X minutes)
 * - Focus mode detection (adjust response length accordingly)
 * - App context awareness (knows you're coding vs. emailing)
 * - Screen time monitoring (gentle break suggestions)
 * - Selected text for instant help ("Help me with this")
 *
 * @module intelligence/context-builders/external/macos-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:macos-context' });

// MARK: - Types

export interface MacOSContextPayload {
  // Context Awareness
  activeApp: string;
  windowTitle: string;
  selectedText?: string;
  /** True when user pressed Cmd+Shift+H "Help me with this" */
  helpMeWithThis?: boolean;

  // Calendar
  upcomingEvent?: {
    title: string;
    inMinutes: number;
    attendees?: string[];
    notes?: string;
  };
  todaysEventCount: number;
  currentMeeting?: {
    title: string;
    remainingMinutes: number;
  };
  /** Whether user is currently in a meeting */
  isInMeeting?: boolean;

  // Focus Mode
  isFocused: boolean;
  focusMode?: string;

  // Location (optional)
  location?: string;
  /** Whether user is commuting */
  isCommuting?: boolean;

  // Screen Time (optional)
  topApp?: {
    name: string;
    minutesToday: number;
  };
  /** Total screen time today in minutes */
  totalMinutesToday?: number;
  /** Whether user needs a break */
  needsBreak?: boolean;
  /** Current app session duration in minutes */
  currentSessionMinutes?: number;

  // Contacts (birthdays)
  upcomingBirthdays?: Array<{
    name: string;
    daysUntil: number;
  }>;

  /** Timestamp when context was captured (ms since epoch) */
  timestamp?: number;
}

export interface MacOSContextMessage {
  type: 'macos_context';
  payload: MacOSContextPayload;
  timestamp: number;
}

// MARK: - Context Building

/**
 * Build a context string from macOS context for injection into system prompt
 */
export function buildMacOSContext(ctx: MacOSContextPayload): string {
  const parts: string[] = [];

  // Active app context
  if (ctx.activeApp && ctx.windowTitle) {
    parts.push(`User is currently in ${ctx.activeApp}: "${ctx.windowTitle}"`);
  } else if (ctx.activeApp) {
    parts.push(`User is currently in ${ctx.activeApp}`);
  }

  // Selected text (critical for "Help me with this")
  if (ctx.selectedText && ctx.selectedText.trim().length > 0) {
    const truncated =
      ctx.selectedText.length > 500 ? ctx.selectedText.substring(0, 500) + '...' : ctx.selectedText;
    parts.push(`User has highlighted this text: "${truncated}"`);
    // Only add the "Help me with this" prompt if they actually pressed the hotkey
    if (ctx.helpMeWithThis) {
      parts.push(
        '⚡ They pressed "Help me with this" - IMMEDIATELY focus on helping them with this specific text. Do not ask clarifying questions first.'
      );
    }
  }

  // Current meeting
  if (ctx.currentMeeting) {
    parts.push(
      `User is currently in a meeting: "${ctx.currentMeeting.title}" (${ctx.currentMeeting.remainingMinutes} minutes remaining)`
    );
    parts.push('Keep responses concise - they may be multitasking.');
  }

  // Upcoming meeting
  if (ctx.upcomingEvent) {
    const { title, inMinutes, attendees } = ctx.upcomingEvent;

    if (inMinutes <= 5) {
      parts.push(`⚠️ "${title}" starts in ${inMinutes} minutes!`);
    } else if (inMinutes <= 15) {
      parts.push(`Upcoming: "${title}" in ${inMinutes} minutes`);
    } else {
      parts.push(`Later: "${title}" in ${inMinutes} minutes`);
    }

    if (attendees && attendees.length > 0) {
      const attendeeList =
        attendees.length > 3
          ? attendees.slice(0, 3).join(', ') + ` and ${attendees.length - 3} others`
          : attendees.join(', ');
      parts.push(`Attendees: ${attendeeList}`);
    }
  }

  // Today's schedule density
  if (ctx.todaysEventCount > 5) {
    parts.push(`Busy day: ${ctx.todaysEventCount} events scheduled`);
  }

  // Focus mode
  if (ctx.isFocused) {
    if (ctx.focusMode) {
      parts.push(`Focus Mode: ${ctx.focusMode} (be concise and respectful of their focus)`);
    } else {
      parts.push('Focus Mode is active (be concise and respectful of their focus)');
    }
  }

  // Location context
  if (ctx.location) {
    parts.push(`Location: ${ctx.location}`);
  }

  // Commuting detection
  if (ctx.isCommuting) {
    parts.push('User is currently commuting - they may be hands-free or distracted.');
  }

  // Screen time awareness
  if (ctx.topApp && ctx.topApp.minutesToday > 120) {
    const hours = Math.round(ctx.topApp.minutesToday / 60);
    parts.push(`Note: User has spent ${hours}+ hours in ${ctx.topApp.name} today`);
  }

  // Break suggestion
  if (ctx.needsBreak) {
    const sessionMins = ctx.currentSessionMinutes || 0;
    if (sessionMins > 60) {
      parts.push(
        `💆 User has been in the current app for ${sessionMins} minutes. Consider gently suggesting a break if the moment feels right.`
      );
    }
  }

  // Birthday awareness (relationship magic)
  if (ctx.upcomingBirthdays && ctx.upcomingBirthdays.length > 0) {
    const todayBirthdays = ctx.upcomingBirthdays.filter((b) => b.daysUntil === 0);
    const tomorrowBirthdays = ctx.upcomingBirthdays.filter((b) => b.daysUntil === 1);

    if (todayBirthdays.length > 0) {
      const names = todayBirthdays.map((b) => b.name).join(', ');
      parts.push(`🎂 Today is ${names}'s birthday!`);
    }
    if (tomorrowBirthdays.length > 0) {
      const names = tomorrowBirthdays.map((b) => b.name).join(', ');
      parts.push(`📅 Tomorrow is ${names}'s birthday`);
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return `
## macOS Desktop Context

${parts.join('\n')}
`.trim();
}

/**
 * Parse a data channel message and extract macOS context if present
 */
export function parseMacOSContextMessage(data: Buffer | string): MacOSContextPayload | null {
  try {
    const message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());

    if (message.type === 'macos_context' && message.payload) {
      log.debug({ payload: message.payload }, 'Received macOS context');
      return message.payload as MacOSContextPayload;
    }

    return null;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to parse macOS context message');
    return null;
  }
}

// MARK: - Context Insights

/**
 * Generate proactive insights based on macOS context
 * These can be used by the agent to offer unprompted help
 */
export function generateContextInsights(ctx: MacOSContextPayload): string[] {
  const insights: string[] = [];

  // Meeting prep opportunity
  if (ctx.upcomingEvent && ctx.upcomingEvent.inMinutes <= 15 && ctx.upcomingEvent.inMinutes > 5) {
    insights.push(
      `You have "${ctx.upcomingEvent.title}" coming up - would you like help preparing?`
    );
  }

  // Long time in same app
  if (ctx.topApp && ctx.topApp.minutesToday > 180) {
    insights.push(
      `You've been focused on ${ctx.topApp.name} for a while. Would you like a quick break or to talk through what you're working on?`
    );
  }

  // Communication app context
  if (
    ctx.activeApp &&
    (ctx.activeApp.toLowerCase().includes('slack') ||
      ctx.activeApp.toLowerCase().includes('mail') ||
      ctx.activeApp.toLowerCase().includes('teams'))
  ) {
    if (ctx.selectedText) {
      insights.push('I see you have a message selected. Would you like help composing a response?');
    }
  }

  // Coding context
  if (
    ctx.activeApp &&
    (ctx.activeApp.toLowerCase().includes('code') ||
      ctx.activeApp.toLowerCase().includes('xcode') ||
      ctx.activeApp.toLowerCase().includes('cursor'))
  ) {
    if (ctx.selectedText && ctx.selectedText.includes('error')) {
      insights.push('I notice an error in what you selected. Want me to help debug it?');
    }
  }

  return insights;
}

// MARK: - Work Context Classification

export type WorkContextType =
  | 'communication'
  | 'email'
  | 'coding'
  | 'terminal'
  | 'notes'
  | 'documents'
  | 'spreadsheet'
  | 'presentation'
  | 'browsing'
  | 'design'
  | 'media'
  | 'other';

/**
 * Classify the work context from the active app
 */
export function classifyWorkContext(activeApp: string): WorkContextType {
  const app = activeApp.toLowerCase();

  if (app.includes('slack') || app.includes('discord') || app.includes('teams')) {
    return 'communication';
  }
  if (app.includes('mail') || app.includes('gmail') || app.includes('outlook')) {
    return 'email';
  }
  if (
    app.includes('code') ||
    app.includes('xcode') ||
    app.includes('cursor') ||
    app.includes('android studio') ||
    app.includes('intellij')
  ) {
    return 'coding';
  }
  if (app.includes('terminal') || app.includes('iterm') || app.includes('warp')) {
    return 'terminal';
  }
  if (app.includes('notion') || app.includes('obsidian') || app.includes('bear')) {
    return 'notes';
  }
  if (app.includes('pages') || app.includes('docs') || app.includes('word')) {
    return 'documents';
  }
  if (app.includes('numbers') || app.includes('sheets') || app.includes('excel')) {
    return 'spreadsheet';
  }
  if (app.includes('keynote') || app.includes('slides') || app.includes('powerpoint')) {
    return 'presentation';
  }
  if (
    app.includes('safari') ||
    app.includes('chrome') ||
    app.includes('firefox') ||
    app.includes('arc')
  ) {
    return 'browsing';
  }
  if (app.includes('figma') || app.includes('sketch') || app.includes('photoshop')) {
    return 'design';
  }
  if (app.includes('spotify') || app.includes('music') || app.includes('podcasts')) {
    return 'media';
  }

  return 'other';
}

/**
 * Get suggested persona based on work context
 */
export function getSuggestedPersona(workContext: WorkContextType): string | null {
  switch (workContext) {
    case 'communication':
    case 'email':
      return 'alex'; // Communication specialist
    case 'spreadsheet':
      return 'peter'; // Research/analysis
    case 'presentation':
      return 'jordan'; // Planning/organization
    default:
      return null; // No specific suggestion
  }
}

// MARK: - Context Builder Registration

/**
 * macOS Context Builder
 *
 * Priority: 30 (runs early to inform other builders about user's desktop context)
 *
 * Reads macOS context from userData.macOS (stored by data-channel-handler)
 * and generates context injections for the LLM.
 */
export const macOSContextBuilder: ContextBuilder = {
  name: 'macos-context',
  description: 'Injects macOS desktop context (calendar, focus mode, active app) from menubar app',
  priority: 30, // Early priority - informs other builders about context

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    // Get macOS context from userData (stored by data-channel-handler)
    const macOSContext = (input.userData as Record<string, unknown> | undefined)?.macOS as
      | MacOSContextPayload
      | undefined;

    if (!macOSContext) {
      // No macOS context available - user not on native app
      return [];
    }

    // Check for stale context (older than 30 seconds)
    const STALENESS_THRESHOLD_MS = 30000;
    const contextAge = macOSContext.timestamp ? Date.now() - macOSContext.timestamp : 0;
    const isStale = contextAge > STALENESS_THRESHOLD_MS;

    if (isStale) {
      log.warn({ ageMs: contextAge }, 'macOS context is stale, ignoring');
      return [];
    }

    log.debug({ context: macOSContext, ageMs: contextAge }, 'Building macOS context injection');

    const injections: ContextInjection[] = [];

    // Build the main context string
    const contextString = buildMacOSContext(macOSContext);

    if (contextString) {
      injections.push({
        id: 'macos-desktop-context',
        source: 'macos-context',
        content: contextString,
        priority: 'high', // Desktop context is valuable
        category: 'desktop-awareness',
        confidence: 1.0,
      });
    }

    // Add specific injections for high-priority situations

    // "Help me with this" - CRITICAL priority
    if (macOSContext.helpMeWithThis && macOSContext.selectedText) {
      injections.push({
        id: 'macos-help-me-with-this',
        source: 'macos-context',
        content: `⚡ USER PRESSED "HELP ME WITH THIS" - They have selected text and want immediate help with it. Focus your ENTIRE response on helping with the selected text. Do NOT ask clarifying questions first. Just help them.`,
        priority: 'critical',
        category: 'user-action',
        confidence: 1.0,
      });
    }

    // Urgent meeting warning
    if (macOSContext.upcomingEvent && macOSContext.upcomingEvent.inMinutes <= 5) {
      injections.push({
        id: 'macos-meeting-urgent',
        source: 'macos-context',
        content: `⚠️ URGENT: User has "${macOSContext.upcomingEvent.title}" starting in ${macOSContext.upcomingEvent.inMinutes} minutes. Keep responses very brief unless they ask for more.`,
        priority: 'critical',
        category: 'time-pressure',
        confidence: 1.0,
      });
    }

    // Focus mode - adjust response style
    if (macOSContext.isFocused) {
      injections.push({
        id: 'macos-focus-mode',
        source: 'macos-context',
        content: `User has Focus Mode active${macOSContext.focusMode ? ` (${macOSContext.focusMode})` : ''}. Keep responses concise and focused. Avoid unnecessary small talk.`,
        priority: 'high',
        category: 'response-style',
        confidence: 1.0,
      });
    }

    // Currently in meeting
    if (macOSContext.currentMeeting) {
      injections.push({
        id: 'macos-in-meeting',
        source: 'macos-context',
        content: `User is currently in a meeting ("${macOSContext.currentMeeting.title}", ${macOSContext.currentMeeting.remainingMinutes} min remaining). They may be multitasking. Keep responses brief and whisper-appropriate.`,
        priority: 'high',
        category: 'time-pressure',
        confidence: 1.0,
      });
    }

    // Work context awareness (coding, email, etc.)
    if (macOSContext.activeApp) {
      const workContext = classifyWorkContext(macOSContext.activeApp);

      if (workContext === 'coding') {
        injections.push({
          id: 'macos-coding-context',
          source: 'macos-context',
          content: `User is in ${macOSContext.activeApp} (coding environment). If they mention an error or ask for help, offer technical assistance. Code-focused responses are welcome.`,
          priority: 'standard',
          category: 'work-context',
          confidence: 0.9,
        });
      } else if (workContext === 'communication' || workContext === 'email') {
        injections.push({
          id: 'macos-communication-context',
          source: 'macos-context',
          content: `User is in ${macOSContext.activeApp} (communication app). If they seem stressed about a message, offer to help draft a response or think through their reply.`,
          priority: 'standard',
          category: 'work-context',
          confidence: 0.9,
        });
      }
    }

    // Screen time awareness - gentle nudge
    if (macOSContext.topApp && macOSContext.topApp.minutesToday > 180) {
      const hours = Math.round(macOSContext.topApp.minutesToday / 60);
      injections.push({
        id: 'macos-screen-time',
        source: 'macos-context',
        content: `Note: User has been in ${macOSContext.topApp.name} for ${hours}+ hours today. If conversation allows, gently acknowledge their focus or suggest a break.`,
        priority: 'hint',
        category: 'wellbeing',
        confidence: 0.7,
      });
    }

    // Generate proactive insights
    const insights = generateContextInsights(macOSContext);
    if (insights.length > 0) {
      injections.push({
        id: 'macos-proactive-insights',
        source: 'macos-context',
        content: `Proactive opportunities (use naturally if conversation allows):\n${insights.map((i) => `- ${i}`).join('\n')}`,
        priority: 'hint',
        category: 'proactive',
        confidence: 0.6,
      });
    }

    log.info({ injectionCount: injections.length }, 'macOS context injections generated');

    return injections;
  },
};

// Register builder on module load
registerContextBuilder(macOSContextBuilder);
