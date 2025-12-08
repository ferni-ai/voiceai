/**
 * Pattern Intelligence for Simple Utilities
 * 
 * This is what makes Ferni "better than human" for everyday utilities.
 * 
 * SIRI PROBLEM: Transactional. Answer and forget.
 * HUMAN FRIEND: Remembers patterns, anticipates needs, follows up.
 * FERNI: All of that PLUS catches things humans miss.
 * 
 * "BETTER THAN HUMAN" PRINCIPLES:
 * 
 * 1. PATTERN RECOGNITION
 *    - "You always set a 5-min timer around 3pm - tea time?"
 *    - "Third Tokyo timezone check this week - planning something?"
 *    - "You've been splitting bills more lately - new dining crew?"
 * 
 * 2. PROACTIVE WISDOM (without being preachy)
 *    - After low tip: "That's 12% - totally fine if service was rough"
 *    - After coin flip: "Noticed you've flipped 5 coins today - big decisions brewing?"
 *    - After timer: "Timer done! How did it turn out?"
 * 
 * 3. ANTICIPATORY HELP
 *    - "Want me to set your usual 5-minute tea timer?"
 *    - "Calling Tokyo? Remember it's 14 hours ahead right now"
 *    - "Last time you split a bill at this amount, you did 20% tip"
 * 
 * 4. CONNECTED DOTS
 *    - Links timezone checks to remembered travel plans
 *    - Connects unit conversions to cooking/baking context
 *    - Ties decision-making patterns to life events
 * 
 * 5. CELEBRATION OF SMALL MOMENTS
 *    - "That's 100 days until your trip!"
 *    - "Fun fact: you've used the tip calculator 50 times - you're a generous tipper"
 */

import { getLogger } from '../../../utils/safe-logger.js';

// ============================================================================
// PATTERN TYPES
// ============================================================================

export interface UtilityUsage {
  tool: string;
  timestamp: Date;
  params: Record<string, unknown>;
  context?: string;
}

export interface UserUtilityPatterns {
  userId: string;
  
  // Usage tracking
  usageHistory: UtilityUsage[];
  
  // Detected patterns
  patterns: {
    // Timer patterns
    commonTimerDurations: Array<{ minutes: number; count: number; usualTime?: string; label?: string }>;
    lastTimerFollowUp?: { duration: number; label: string; askedAbout: boolean };
    
    // Tip patterns  
    averageTipPercent: number;
    tipCount: number;
    lastTipContext?: { amount: number; percent: number; venue?: string };
    
    // Timezone patterns
    frequentCities: Array<{ city: string; count: number; lastChecked: Date }>;
    possibleTravelPlanning?: { city: string; checksThisWeek: number };
    
    // Decision patterns
    coinFlipsToday: number;
    coinFlipsThisWeek: number;
    recentDecisionTopics: string[];
    
    // Conversion patterns
    frequentConversions: Array<{ from: string; to: string; count: number }>;
    likelyCookingSession?: boolean;
    
    // Date tracking patterns
    countdownsTracked: Array<{ event: string; targetDate: Date; checksCount: number }>;
  };
  
  // Preferences learned
  preferences: {
    defaultTipPercent?: number;
    preferredTimezone?: string;
    usualTimerDuration?: number;
  };
  
  // For follow-ups
  pendingFollowUps: Array<{
    type: 'timer_complete' | 'decision_check' | 'trip_planning' | 'countdown_milestone';
    context: Record<string, unknown>;
    scheduledFor?: Date;
  }>;
}

// In-memory store (in production, persist to Firestore)
const userPatterns = new Map<string, UserUtilityPatterns>();

// ============================================================================
// PATTERN TRACKING
// ============================================================================

/**
 * Get or create user patterns
 */
export function getUserPatterns(userId: string): UserUtilityPatterns {
  if (!userPatterns.has(userId)) {
    userPatterns.set(userId, {
      userId,
      usageHistory: [],
      patterns: {
        commonTimerDurations: [],
        averageTipPercent: 20,
        tipCount: 0,
        frequentCities: [],
        coinFlipsToday: 0,
        coinFlipsThisWeek: 0,
        recentDecisionTopics: [],
        frequentConversions: [],
        countdownsTracked: [],
      },
      preferences: {},
      pendingFollowUps: [],
    });
  }
  return userPatterns.get(userId)!;
}

/**
 * Record a utility usage and update patterns
 */
export function recordUsage(
  userId: string,
  tool: string,
  params: Record<string, unknown>,
  context?: string
): void {
  const patterns = getUserPatterns(userId);
  
  // Add to history (keep last 100)
  patterns.usageHistory.push({
    tool,
    timestamp: new Date(),
    params,
    context,
  });
  if (patterns.usageHistory.length > 100) {
    patterns.usageHistory.shift();
  }
  
  // Update tool-specific patterns
  switch (tool) {
    case 'setTimer':
      updateTimerPatterns(patterns, params);
      break;
    case 'calculateTip':
      updateTipPatterns(patterns, params);
      break;
    case 'timeInCity':
    case 'bestTimeToCall':
      updateTimezonePatterns(patterns, params);
      break;
    case 'flipCoin':
    case 'rollDice':
    case 'helpMeDecide':
      updateDecisionPatterns(patterns, tool, params);
      break;
    case 'convertUnits':
    case 'convertTemperature':
      updateConversionPatterns(patterns, params);
      break;
    case 'daysUntil':
      updateCountdownPatterns(patterns, params);
      break;
  }
  
  getLogger().debug({ userId, tool, params }, 'Utility usage recorded');
}

// ============================================================================
// PATTERN UPDATE FUNCTIONS
// ============================================================================

function updateTimerPatterns(patterns: UserUtilityPatterns, params: Record<string, unknown>): void {
  const minutes = (params.minutes as number) || 0;
  const seconds = (params.seconds as number) || 0;
  const totalMinutes = minutes + seconds / 60;
  const label = params.label as string | undefined;
  
  // Track common durations
  const existing = patterns.patterns.commonTimerDurations.find(
    d => Math.abs(d.minutes - totalMinutes) < 0.5
  );
  
  if (existing) {
    existing.count++;
    if (label) existing.label = label;
    // Track time of day
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) existing.usualTime = 'morning';
    else if (hour >= 12 && hour < 17) existing.usualTime = 'afternoon';
    else if (hour >= 17 && hour < 21) existing.usualTime = 'evening';
  } else {
    patterns.patterns.commonTimerDurations.push({
      minutes: totalMinutes,
      count: 1,
      label,
    });
  }
  
  // Set up follow-up
  patterns.patterns.lastTimerFollowUp = {
    duration: totalMinutes,
    label: label || 'timer',
    askedAbout: false,
  };
  
  // Learn preference if consistent
  const mostCommon = patterns.patterns.commonTimerDurations
    .sort((a, b) => b.count - a.count)[0];
  if (mostCommon && mostCommon.count >= 3) {
    patterns.preferences.usualTimerDuration = mostCommon.minutes;
  }
}

function updateTipPatterns(patterns: UserUtilityPatterns, params: Record<string, unknown>): void {
  const tipPercent = (params.tipPercent as number) || 20;
  const billAmount = params.billAmount as number;
  
  // Update running average
  const oldAvg = patterns.patterns.averageTipPercent;
  const count = patterns.patterns.tipCount;
  patterns.patterns.averageTipPercent = (oldAvg * count + tipPercent) / (count + 1);
  patterns.patterns.tipCount++;
  
  // Track last context
  patterns.patterns.lastTipContext = {
    amount: billAmount,
    percent: tipPercent,
  };
  
  // Learn default preference if consistent
  if (count >= 5) {
    // Round to nearest 5%
    patterns.preferences.defaultTipPercent = Math.round(patterns.patterns.averageTipPercent / 5) * 5;
  }
}

function updateTimezonePatterns(patterns: UserUtilityPatterns, params: Record<string, unknown>): void {
  const city = ((params.city as string) || (params.theirCity as string) || '').toLowerCase();
  if (!city) return;
  
  const existing = patterns.patterns.frequentCities.find(c => c.city === city);
  if (existing) {
    existing.count++;
    existing.lastChecked = new Date();
  } else {
    patterns.patterns.frequentCities.push({
      city,
      count: 1,
      lastChecked: new Date(),
    });
  }
  
  // Detect possible travel planning (3+ checks for same city in a week)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentChecks = patterns.usageHistory.filter(
    u => (u.tool === 'timeInCity' || u.tool === 'bestTimeToCall') &&
         u.timestamp > weekAgo &&
         ((u.params.city as string) || (u.params.theirCity as string) || '').toLowerCase() === city
  );
  
  if (recentChecks.length >= 3) {
    patterns.patterns.possibleTravelPlanning = {
      city,
      checksThisWeek: recentChecks.length,
    };
  }
}

function updateDecisionPatterns(
  patterns: UserUtilityPatterns,
  tool: string,
  params: Record<string, unknown>
): void {
  const now = new Date();
  const today = now.toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Count flips
  if (tool === 'flipCoin') {
    const todayFlips = patterns.usageHistory.filter(
      u => u.tool === 'flipCoin' && u.timestamp.toDateString() === today
    );
    patterns.patterns.coinFlipsToday = todayFlips.length + 1;
    
    const weekFlips = patterns.usageHistory.filter(
      u => u.tool === 'flipCoin' && u.timestamp > weekAgo
    );
    patterns.patterns.coinFlipsThisWeek = weekFlips.length + 1;
  }
  
  // Track decision topics
  if (tool === 'helpMeDecide' && params.options) {
    const options = params.options as string[];
    patterns.patterns.recentDecisionTopics.push(...options);
    // Keep last 20
    if (patterns.patterns.recentDecisionTopics.length > 20) {
      patterns.patterns.recentDecisionTopics = 
        patterns.patterns.recentDecisionTopics.slice(-20);
    }
  }
}

function updateConversionPatterns(patterns: UserUtilityPatterns, params: Record<string, unknown>): void {
  const fromUnit = (params.fromUnit as string || params.fromScale as string || '').toLowerCase();
  const toUnit = (params.toUnit as string || '').toLowerCase();
  
  if (!fromUnit) return;
  
  const key = `${fromUnit}->${toUnit || 'converted'}`;
  const existing = patterns.patterns.frequentConversions.find(
    c => `${c.from}->${c.to}` === key
  );
  
  if (existing) {
    existing.count++;
  } else {
    patterns.patterns.frequentConversions.push({
      from: fromUnit,
      to: toUnit || 'converted',
      count: 1,
    });
  }
  
  // Detect cooking session (multiple volume/weight conversions in short time)
  const lastHour = new Date(Date.now() - 60 * 60 * 1000);
  const recentConversions = patterns.usageHistory.filter(
    u => (u.tool === 'convertUnits') && u.timestamp > lastHour
  );
  
  const cookingUnits = ['cup', 'tbsp', 'tsp', 'ml', 'g', 'oz', 'gram', 'ounce'];
  const cookingConversions = recentConversions.filter(u => {
    const from = (u.params.fromUnit as string || '').toLowerCase();
    const to = (u.params.toUnit as string || '').toLowerCase();
    return cookingUnits.some(unit => from.includes(unit) || to.includes(unit));
  });
  
  patterns.patterns.likelyCookingSession = cookingConversions.length >= 2;
}

function updateCountdownPatterns(patterns: UserUtilityPatterns, params: Record<string, unknown>): void {
  const event = (params.event as string) || 'custom';
  
  const existing = patterns.patterns.countdownsTracked.find(c => c.event === event);
  if (existing) {
    existing.checksCount++;
  } else {
    patterns.patterns.countdownsTracked.push({
      event,
      targetDate: new Date(), // Would be calculated from actual target
      checksCount: 1,
    });
  }
}

// ============================================================================
// INTELLIGENCE GENERATORS
// ============================================================================

/**
 * Generate "better than human" insights for a tool response
 */
export function generateInsight(
  userId: string,
  tool: string,
  params: Record<string, unknown>,
  baseResponse: string
): { response: string; followUp?: string; proactiveOffer?: string } {
  const patterns = getUserPatterns(userId);
  let response = baseResponse;
  let followUp: string | undefined;
  let proactiveOffer: string | undefined;
  
  switch (tool) {
    case 'calculateTip': {
      const tipPercent = (params.tipPercent as number) || 20;
      const avgTip = patterns.patterns.averageTipPercent;
      
      // Notice if tip is different from their usual
      if (patterns.patterns.tipCount >= 3 && Math.abs(tipPercent - avgTip) > 5) {
        if (tipPercent < avgTip) {
          response += `\n\n_(That's below your usual ${Math.round(avgTip)}% - totally fine if service was off!)_`;
        } else if (tipPercent > avgTip + 5) {
          response += `\n\n_(Nice! Extra generous today 💚)_`;
        }
      }
      
      // Milestone celebration
      if (patterns.patterns.tipCount === 50) {
        followUp = "Fun fact: that's your 50th tip calculation with me! You're a generous tipper on average.";
      }
      break;
    }
    
    case 'setTimer': {
      const minutes = (params.minutes as number) || 0;
      const label = params.label as string;
      
      // Recognize their usual timer
      const usual = patterns.patterns.commonTimerDurations
        .find(d => Math.abs(d.minutes - minutes) < 0.5 && d.count >= 3);
      
      if (usual && usual.label) {
        response = response.replace(
          'Timer set',
          `Your ${usual.label} timer set`
        );
      }
      
      // Set up follow-up question
      followUp = `_I'll ask how it went when the timer's done!_`;
      break;
    }
    
    case 'timeInCity': {
      const city = (params.city as string || '').toLowerCase();
      const travelPlanning = patterns.patterns.possibleTravelPlanning;
      
      // Notice travel planning pattern
      if (travelPlanning && travelPlanning.city === city && travelPlanning.checksThisWeek >= 3) {
        followUp = `You've checked ${city} time ${travelPlanning.checksThisWeek} times this week - planning a trip? I can help with more than just timezone!`;
      }
      break;
    }
    
    case 'flipCoin': {
      const flipsToday = patterns.patterns.coinFlipsToday;
      const flipsWeek = patterns.patterns.coinFlipsThisWeek;
      
      // Notice decision-making patterns
      if (flipsToday >= 3) {
        followUp = `That's ${flipsToday} coin flips today - sounds like some big decisions brewing. Want to talk through any of them?`;
      } else if (flipsWeek >= 7 && flipsToday === 1) {
        followUp = `You've been doing a lot of coin flips lately. Sometimes that means there's a bigger decision underneath. I'm here if you want to think it through.`;
      }
      break;
    }
    
    case 'helpMeDecide': {
      const options = params.options as string[] || [];
      
      // Check if they've asked about similar decisions before
      const recentTopics = patterns.patterns.recentDecisionTopics;
      const repeatedTopics = options.filter(o => 
        recentTopics.filter(t => t.toLowerCase() === o.toLowerCase()).length >= 2
      );
      
      if (repeatedTopics.length > 0) {
        followUp = `I notice "${repeatedTopics[0]}" keeps coming up in your decisions. Maybe it's worth exploring why that one keeps pulling at you?`;
      }
      break;
    }
    
    case 'convertUnits': {
      // Notice cooking session
      if (patterns.patterns.likelyCookingSession) {
        response += `\n\n_(Looks like you're cooking! I'm here for more conversions 👨‍🍳)_`;
      }
      break;
    }
    
    case 'daysUntil': {
      const event = params.event as string;
      const tracked = patterns.patterns.countdownsTracked.find(c => c.event === event);
      
      // Notice milestone countdowns
      if (tracked && tracked.checksCount >= 5) {
        followUp = `You've checked this countdown ${tracked.checksCount} times - I can tell this is important to you! Want me to proactively give you updates?`;
      }
      break;
    }
  }
  
  return { response, followUp, proactiveOffer };
}

/**
 * Generate proactive suggestions based on patterns
 */
export function getProactiveSuggestions(userId: string): string[] {
  const patterns = getUserPatterns(userId);
  const suggestions: string[] = [];
  const now = new Date();
  const hour = now.getHours();
  
  // Suggest usual timer at usual time
  const usualTimer = patterns.patterns.commonTimerDurations
    .find(d => d.count >= 3 && d.usualTime);
  
  if (usualTimer) {
    const timeMatches = 
      (usualTimer.usualTime === 'morning' && hour >= 6 && hour < 12) ||
      (usualTimer.usualTime === 'afternoon' && hour >= 12 && hour < 17) ||
      (usualTimer.usualTime === 'evening' && hour >= 17 && hour < 21);
    
    if (timeMatches) {
      suggestions.push(
        `Want me to set your usual ${usualTimer.minutes}-minute ${usualTimer.label || 'timer'}?`
      );
    }
  }
  
  // Remind about pending travel planning
  const travelPlanning = patterns.patterns.possibleTravelPlanning;
  if (travelPlanning) {
    suggestions.push(
      `Still thinking about ${travelPlanning.city}? I can help with more than just timezone.`
    );
  }
  
  // Countdown reminders for tracked events
  for (const countdown of patterns.patterns.countdownsTracked) {
    if (countdown.checksCount >= 3) {
      suggestions.push(
        `Want an update on the ${countdown.event} countdown?`
      );
    }
  }
  
  return suggestions;
}

/**
 * Get timer follow-up message after timer completes
 */
export function getTimerFollowUp(userId: string): string | null {
  const patterns = getUserPatterns(userId);
  const lastTimer = patterns.patterns.lastTimerFollowUp;
  
  if (!lastTimer || lastTimer.askedAbout) {
    return null;
  }
  
  // Mark as asked
  lastTimer.askedAbout = true;
  
  const label = lastTimer.label;
  
  // Contextual follow-ups based on common labels
  if (label.toLowerCase().includes('tea') || label.toLowerCase().includes('coffee')) {
    return `⏰ Timer's done! Hope your ${label} turned out perfect.`;
  }
  
  if (label.toLowerCase().includes('break') || label.toLowerCase().includes('rest')) {
    return `⏰ Break time's over! Feel refreshed?`;
  }
  
  if (label.toLowerCase().includes('cook') || label.toLowerCase().includes('bake') || 
      label.toLowerCase().includes('oven')) {
    return `⏰ Timer's up! How did it turn out?`;
  }
  
  if (label.toLowerCase().includes('focus') || label.toLowerCase().includes('work') ||
      label.toLowerCase().includes('pomodoro')) {
    return `⏰ Focus session complete! Nice work. Ready for a break or keep going?`;
  }
  
  // Generic follow-up
  return `⏰ Your ${lastTimer.duration}-minute timer is done!`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getUserPatterns,
  recordUsage,
  generateInsight,
  getProactiveSuggestions,
  getTimerFollowUp,
};

