/**
 * Situational Awareness Context Builder
 *
 * Gives the AI awareness of the current state when users ask
 * "what's going on", "what's happening", "catch me up", etc.
 *
 * This makes the AI feel present and aware of:
 * - Current time and day context
 * - User's name and relationship stage
 * - Music playing status
 * - Available capabilities (team members, tools)
 * - Recent conversation highlights
 * - Session duration
 */

import { log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// AWARENESS TRIGGER PATTERNS
// ============================================================================

const AWARENESS_PATTERNS = [
  /what('s| is)?\s+(going on|happening|up)/i,
  /catch me up/i,
  /fill me in/i,
  /what (can you|do you) (do|help with)/i,
  /what are you/i,
  /who are you/i,
  /tell me about yourself/i,
  /what do you know/i,
  /how('s| is)?\s+everything/i,
  /status/i,
  /where (are|were) we/i,
];

// ============================================================================
// TIME CONTEXT HELPERS
// ============================================================================

function getTimeOfDay(): { period: string; greeting: string; context: string } {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 9) {
    return {
      period: 'early morning',
      greeting: 'Good morning',
      context: "It's early morning - a great time for quiet reflection or planning the day ahead.",
    };
  } else if (hour >= 9 && hour < 12) {
    return {
      period: 'morning',
      greeting: 'Good morning',
      context: "It's mid-morning - typically prime focus time for most people.",
    };
  } else if (hour >= 12 && hour < 14) {
    return {
      period: 'midday',
      greeting: 'Good afternoon',
      context: "It's around lunchtime - a good moment to pause and recharge.",
    };
  } else if (hour >= 14 && hour < 17) {
    return {
      period: 'afternoon',
      greeting: 'Good afternoon',
      context: "It's afternoon - the post-lunch hours when energy can dip.",
    };
  } else if (hour >= 17 && hour < 20) {
    return {
      period: 'evening',
      greeting: 'Good evening',
      context: "It's evening - time when many people are winding down from work.",
    };
  } else if (hour >= 20 && hour < 23) {
    return {
      period: 'night',
      greeting: 'Good evening',
      context: "It's getting late - a time for reflection or relaxation.",
    };
  } else {
    return {
      period: 'late night',
      greeting: 'Hello',
      context: "It's late at night - sometimes the quiet hours are when we think deepest.",
    };
  }
}

function getDayContext(): { dayName: string; isWeekend: boolean; context: string } {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIndex = new Date().getDay();
  const dayName = days[dayIndex];
  const isWeekend = dayIndex === 0 || dayIndex === 6;

  let context = '';
  if (dayIndex === 1) {
    context = "It's Monday - the start of a new week with fresh possibilities.";
  } else if (dayIndex === 5) {
    context = "It's Friday - the week is winding down.";
  } else if (isWeekend) {
    context = `It's ${dayName} - weekend time for many people.`;
  } else {
    context = `It's ${dayName} - mid-week.`;
  }

  return { dayName, isWeekend, context };
}

// ============================================================================
// BUILD AWARENESS CONTEXT
// ============================================================================

async function buildSituationalAwareness(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, userData, services, persona } = input;
  const injections: ContextInjection[] = [];

  // Check if user is asking for awareness/status
  const isAwarenessQuery = AWARENESS_PATTERNS.some((pattern) => pattern.test(userText));

  if (!isAwarenessQuery) {
    return injections;
  }

  getLogger().debug('Building situational awareness context');

  // Gather all awareness information
  const timeContext = getTimeOfDay();
  const dayContext = getDayContext();
  const userName = userData?.name || services?.userProfile?.name;
  const relationshipStage = services?.userProfile?.relationshipStage || 'new_acquaintance';

  // Check music state
  let musicInfo = '';
  try {
    const { getMusicPlayer } = await import('../../audio/index.js');
    const player = getMusicPlayer();
    const state = player.getState();
    if (state.isPlaying && state.currentTrack) {
      musicInfo = `\n- MUSIC: "${state.currentTrack.name}" by ${state.currentTrack.artist} is playing in the background`;
    }
  } catch {
    // Music player not available
  }

  // Session duration (from sessionDurationMs in ContextUserData)
  const sessionDurationMs = userData?.sessionDurationMs;
  let sessionDuration = '';
  if (sessionDurationMs) {
    const minutes = Math.floor(sessionDurationMs / 60000);
    if (minutes > 5) {
      sessionDuration = `\n- SESSION: We've been talking for about ${minutes} minutes`;
    }
  }

  // Recent topics discussed (recentTopics in ContextUserData)
  const recentTopics = userData?.recentTopics?.slice(-3) || [];
  let topicsInfo = '';
  if (recentTopics.length > 0) {
    topicsInfo = `\n- RECENT TOPICS: We've touched on: ${recentTopics.join(', ')}`;
  }

  // Key moments
  const keyMoments = userData?.keyMoments?.slice(-2) || [];
  let momentsInfo = '';
  if (keyMoments.length > 0) {
    momentsInfo = `\n- HIGHLIGHTS: ${keyMoments.join('; ')}`;
  }

  // Build team awareness for Ferni
  let teamInfo = '';
  if (persona?.id === 'ferni' || persona?.id === 'jack-b') {
    teamInfo = `
- YOUR TEAM: You coordinate specialists who can help:
  • Jack Bogle - Long-term investing wisdom, index funds, market perspective
  • Peter John - Stock research, company analysis, investment opportunities  
  • Alex - Communication, scheduling, organization
  • Maya - Spending, saving, budgeting, financial habits
  • Jordan - Life events, milestones, celebrations, travel`;
  }

  // Available capabilities
  let capabilitiesInfo = '';
  if (persona?.id === 'ferni' || persona?.id === 'jack-b') {
    capabilitiesInfo = `
- CAPABILITIES: You can help with:
  • Play music to set the mood
  • Check stocks and market info
  • Look up weather
  • Get news and sports scores
  • Help with budgets and financial planning
  • Schedule and organize
  • Connect to the right specialist`;
  }

  // Build the awareness injection
  const awarenessContext = `[SITUATIONAL AWARENESS - Share this naturally if relevant]

CURRENT MOMENT:
- TIME: ${timeContext.period} on ${dayContext.dayName}
- USER: ${userName ? `You're talking with ${userName}` : "You're getting to know this person"}
- RELATIONSHIP: ${formatRelationshipStage(relationshipStage)}${musicInfo}${sessionDuration}${topicsInfo}${momentsInfo}${teamInfo}${capabilitiesInfo}

GUIDANCE:
- Share this awareness conversationally, not as a data dump
- If they asked "what's going on" casually, keep it light
- If they seem to want a real update, be more thorough
- Connect the awareness to how you can help them
- Be present and engaged, not robotic`;

  injections.push(createStandardInjection('situational_awareness', awarenessContext));

  return injections;
}

// Helper to format relationship stage nicely
function formatRelationshipStage(stage: string): string {
  const stageMap: Record<string, string> = {
    new_acquaintance: "You're just getting to know each other",
    getting_to_know: "You're building rapport - they're opening up more",
    trusted_advisor: 'They trust you and value your perspective',
    old_friend: "You have a deep, established relationship",
  };
  return stageMap[stage] || "You're building a connection";
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('situational_awareness', buildSituationalAwareness);

export { buildSituationalAwareness, AWARENESS_PATTERNS };

