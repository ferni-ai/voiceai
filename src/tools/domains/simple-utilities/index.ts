/**
 * Simple Utilities Domain Tools
 *
 * The everyday helper tools that make Ferni feel like a real friend.
 *
 * BETTER THAN SIRI: Siri is transactional - answer and forget.
 * BETTER THAN HUMAN: We catch patterns humans miss, follow up, anticipate.
 *
 * KEY DIFFERENTIATORS:
 * 1. PATTERN RECOGNITION - "You always set a 5-min timer around 3pm"
 * 2. PROACTIVE WISDOM - After low tip: "That's 12% - fine if service was rough"
 * 3. ANTICIPATORY HELP - "Want your usual 5-minute tea timer?"
 * 4. CONNECTED DOTS - Links timezone checks to travel planning
 * 5. FOLLOW-THROUGH - "Timer done! How did it turn out?"
 * 6. SMALL CELEBRATIONS - "That's 100 days until your trip!"
 *
 * DOMAIN: simple-utilities
 *
 * Module structure:
 * - math-tools.ts: calculateTip, splitBill, calculatePercentage, quickMath
 * - conversion-tools.ts: convertUnits, convertTemperature
 * - date-tools.ts: daysUntil, dateFromNow, calculateAge
 * - timezone-tools.ts: timeInCity, bestTimeToCall
 * - decision-tools.ts: flipCoin, rollDice, pickRandom, helpMeDecide
 * - timer-tools.ts: setTimer, cancelTimer
 * - notes-tools.ts: quickNote, recallNote, clearNotes
 * - proactive-tools.ts: getUtilitySuggestions, checkTimerStatus
 * - pattern-intelligence.ts: Pattern learning and insights
 * - voice-callbacks.ts: Voice output helpers
 * - context-integration.ts: Life context enrichment
 * - persistence.ts: Cross-session memory
 * - proactive-hooks.ts: Anticipatory features
 * - shared-state.ts: In-memory state (timers, notes)
 * - session-init.ts: Session initialization
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition } from '../../registry/types.js';

// ============================================================================
// IMPORTS FROM MODULAR FILES
// ============================================================================

// Math tools
import {
  calculatePercentageDef,
  calculateTipDef,
  mathToolDefinitions,
  quickMathDef,
  splitBillDef,
} from './math-tools.js';

// Conversion tools
import {
  conversionToolDefinitions,
  convertTemperatureDef,
  convertUnitsDef,
} from './conversion-tools.js';

// Date tools
import {
  calculateAgeDef,
  dateFromNowDef,
  dateToolDefinitions,
  daysUntilDef,
} from './date-tools.js';

// Timezone tools
import { bestTimeToCallDef, timeInCityDef, timezoneToolDefinitions } from './timezone-tools.js';

// Decision tools
import {
  decisionToolDefinitions,
  flipCoinDef,
  helpMeDecideDef,
  pickRandomDef,
  rollDiceDef,
} from './decision-tools.js';

// Timer tools
import { setTimerDef, cancelTimerDef, timerToolDefinitions } from './timer-tools.js';

// Notes tools
import { clearNotesDef, notesToolDefinitions, quickNoteDef, recallNoteDef } from './notes-tools.js';

// Proactive tools - DISABLED pending implementation
// import {
//   getUtilitySuggestionsDef,
//   checkTimerStatusDef,
//   proactiveToolDefinitions,
// } from './proactive-tools.js';

// ============================================================================
// RE-EXPORTS FROM SUPPORT MODULES
// ============================================================================

// Pattern Intelligence - makes us "better than human"
export {
  generateInsight,
  getProactiveSuggestions,
  getTimerFollowUp,
  getUserPatterns,
  recordUsage,
} from './pattern-intelligence.js';

// Voice Callbacks - speak to user, don't just log
export {
  onTimerComplete,
  registerVoiceCallbackHandler,
  speakDuration,
  type VoiceCallback,
} from './voice-callbacks.js';

// Context Integration - connect to what we know about them
export {
  enrichCountdownWithContext,
  enrichTimerWithContext,
  enrichTimezoneWithContext,
  loadLifeContext,
} from './context-integration.js';

// Persistence - remember across sessions
export {
  loadPatternsFromFirestore,
  trackCountdown,
  updateTimerPreferences,
  updateTimezonePreferences,
  updateTipPreferences,
} from './persistence.js';

// Proactive Hooks - anticipate needs
export { getProactiveOpener } from './proactive-hooks.js';

// Shared State
export { activeTimers, quickNotes } from './shared-state.js';

// Session Init
export {
  initializeUtilitiesForSession,
  onConversationEnd,
  onConversationStart,
  onConversationTick,
} from './session-init.js';

// ============================================================================
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

// Individual tool definitions
export {
  bestTimeToCallDef,
  calculateAgeDef,
  calculatePercentageDef,
  // Math tools
  calculateTipDef,
  clearNotesDef,
  convertTemperatureDef,
  // Conversion tools
  convertUnitsDef,
  dateFromNowDef,
  // Date tools
  daysUntilDef,
  // Decision tools
  flipCoinDef,
  helpMeDecideDef,
  pickRandomDef,
  quickMathDef,
  // Timer tools - DISABLED (imports commented by linter)
  // setTimerDef,
  // cancelTimerDef,
  // Notes tools
  quickNoteDef,
  recallNoteDef,
  rollDiceDef,
  splitBillDef,
  // Timezone tools
  timeInCityDef,
};

// Tool definition arrays by category
export {
  conversionToolDefinitions,
  dateToolDefinitions,
  decisionToolDefinitions,
  mathToolDefinitions,
  timerToolDefinitions,
  notesToolDefinitions,
  timezoneToolDefinitions,
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const simpleUtilitiesTools: ToolDefinition[] = [
  // Math
  calculateTipDef,
  splitBillDef,
  calculatePercentageDef,
  quickMathDef,
  // Conversions
  convertUnitsDef,
  convertTemperatureDef,
  // Date/Time
  daysUntilDef,
  dateFromNowDef,
  calculateAgeDef,
  // Timezones
  timeInCityDef,
  bestTimeToCallDef,
  // Decisions
  flipCoinDef,
  rollDiceDef,
  pickRandomDef,
  helpMeDecideDef,
  // Timers
  setTimerDef,
  cancelTimerDef,
  // Notes
  quickNoteDef,
  recallNoteDef,
  clearNotesDef,
  // Proactive - DISABLED
  // getUtilitySuggestionsDef,
  // checkTimerStatusDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'simple-utilities',
  simpleUtilitiesTools
);

export default getToolDefinitions;
