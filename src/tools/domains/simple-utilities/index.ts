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
import { cancelTimerDef, setTimerDef, timerToolDefinitions } from './timer-tools.js';

// Notes tools
import { clearNotesDef, notesToolDefinitions, quickNoteDef, recallNoteDef } from './notes-tools.js';

// Translation tools
import {
  culturalContextDef,
  detectLanguageDef,
  learnPhrasesDef,
  pronounceDef,
  translateDef,
  translationToolDefinitions,
} from './translation-tools.js';

// App Settings tools (voice-controlled settings)
import { appSettingsToolDefinitions, setAppLanguageDef } from './app-settings-tools.js';

// Dictionary tools
import {
  dictionaryToolDefinitions,
  defineWordDef,
  getSynonymsDef,
  wordOfDayDef,
} from './dictionary-tools.js';

// Currency tools
import {
  currencyToolDefinitions,
  convertCurrencyDef,
  getExchangeRateDef,
  listCurrenciesDef,
} from './currency-tools.js';

// Alarm tools
import {
  alarmToolDefinitions,
  setAlarmDef,
  getAlarmsDef,
  deleteAlarmDef,
  snoozeAlarmDef,
} from './alarm-tools.js';

// List tools (general purpose lists)
import {
  listToolDefinitions,
  createListDef,
  addToListDef,
  viewListDef,
  getAllListsDef,
  checkOffItemDef,
  removeFromListDef,
  deleteListDef,
} from './list-tools.js';

// SMS Reading tools
import {
  smsReadingToolDefinitions,
  readSMSDef,
  checkNewMessagesDef,
  searchMessagesDef,
} from './sms-reading-tools.js';

// Voice Memos tools
import {
  voiceMemosToolDefinitions,
  saveVoiceMemoDef,
  listVoiceMemosDef,
  recallVoiceMemoDef,
  deleteVoiceMemoDef,
  searchVoiceMemosDef,
} from './voice-memos-tools.js';

// Essentials tools (voice assistant basics)
import {
  essentialsToolDefinitions,
  whatCanYouDoDef,
  quickCaptureDef,
  recentContextDef,
  setPreferenceDef,
  getPreferencesDef,
} from './essentials-tools.js';

// Humor tools (jokes, fun facts, stories)
import {
  humorToolDefinitions,
  tellJokeDef,
  getFunFactDef,
  tellMiniStoryDef,
} from './humor-tools.js';

// Wind-down tools (evening rituals)
import {
  winddownToolDefinitions,
  windDownDef,
  bedtimeCheckInDef,
  sleepAffirmationDef,
} from './winddown-tools.js';

// Cross-domain shortcuts (delegates to other domains)
import {
  shortcutsToolDefinitions,
  quickAlarmDef,
  quickTimerDef,
  quickWeatherDef,
  quickMusicDef,
  quickCalendarDef,
  quickSmartHomeDef,
  quickCallDef,
  quickTextDef,
  quickEmailDef,
  trackCapabilityUsage,
  getTopCapabilities,
  getRecentCapabilities,
} from './shortcuts-tools.js';

// Knowledge tools (spelling with phonetic alphabet)
// NOTE: Most knowledge tools already exist elsewhere:
// - Math: math-tools.ts
// - Conversions: conversion-tools.ts
// - Definitions: dictionary-tools.ts
// - Translation: translation-tools.ts
import { knowledgeToolDefinitions, spellDef } from './knowledge-tools.js';

// Advanced reminders (location-based, recurring)
import {
  advancedReminderDefinitions,
  locationReminderDef,
  listLocationRemindersDef,
  recurringReminderDef,
  listRecurringRemindersDef,
  cancelReminderDef,
} from './advanced-reminders.js';

// Advanced lists - functionality exists in list-tools.ts
// Project support can be added there if needed

// Device tools (find my phone, battery, etc.)
import {
  deviceToolDefinitions,
  findMyPhoneDef,
  stopRingingDef,
  checkBatteryDef,
  listDevicesDef,
  doNotDisturbDef,
} from './device-tools.js';

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
  notesToolDefinitions,
  timerToolDefinitions,
  timezoneToolDefinitions,
  translationToolDefinitions,
  dictionaryToolDefinitions,
  currencyToolDefinitions,
  alarmToolDefinitions,
  listToolDefinitions,
  smsReadingToolDefinitions,
  voiceMemosToolDefinitions,
};

// Translation tools
export { culturalContextDef, detectLanguageDef, learnPhrasesDef, pronounceDef, translateDef };

// App Settings tools
export { appSettingsToolDefinitions, setAppLanguageDef };

// Dictionary tools
export { defineWordDef, getSynonymsDef, wordOfDayDef };

// Currency tools
export { convertCurrencyDef, getExchangeRateDef, listCurrenciesDef };

// Alarm tools
export { setAlarmDef, getAlarmsDef, deleteAlarmDef, snoozeAlarmDef };

// List tools
export {
  createListDef,
  addToListDef,
  viewListDef,
  getAllListsDef,
  checkOffItemDef,
  removeFromListDef,
  deleteListDef,
};

// SMS Reading tools
export { readSMSDef, checkNewMessagesDef, searchMessagesDef };

// Voice Memos tools
export {
  saveVoiceMemoDef,
  listVoiceMemosDef,
  recallVoiceMemoDef,
  deleteVoiceMemoDef,
  searchVoiceMemosDef,
};

// Essentials tools
export {
  essentialsToolDefinitions,
  whatCanYouDoDef,
  quickCaptureDef,
  recentContextDef,
  setPreferenceDef,
  getPreferencesDef,
};

// Humor tools
export {
  humorToolDefinitions,
  tellJokeDef,
  getFunFactDef,
  tellMiniStoryDef,
};

// Wind-down tools
export {
  winddownToolDefinitions,
  windDownDef,
  bedtimeCheckInDef,
  sleepAffirmationDef,
};

// Cross-domain shortcuts
export {
  shortcutsToolDefinitions,
  quickAlarmDef,
  quickTimerDef,
  quickWeatherDef,
  quickMusicDef,
  quickCalendarDef,
  quickSmartHomeDef,
  quickCallDef,
  quickTextDef,
  quickEmailDef,
  trackCapabilityUsage,
  getTopCapabilities,
  getRecentCapabilities,
};

// Knowledge tools (only spelling - others exist elsewhere)
export { knowledgeToolDefinitions, spellDef };

// Advanced reminders
export {
  advancedReminderDefinitions,
  locationReminderDef,
  listLocationRemindersDef,
  recurringReminderDef,
  listRecurringRemindersDef,
  cancelReminderDef,
};

// Advanced lists - see list-tools.ts for full list functionality

// Device tools
export {
  deviceToolDefinitions,
  findMyPhoneDef,
  stopRingingDef,
  checkBatteryDef,
  listDevicesDef,
  doNotDisturbDef,
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
  // Translation & Language
  translateDef,
  pronounceDef,
  learnPhrasesDef,
  detectLanguageDef,
  culturalContextDef,
  // App Settings (voice-controlled)
  setAppLanguageDef,
  // Dictionary
  defineWordDef,
  getSynonymsDef,
  wordOfDayDef,
  // Currency
  convertCurrencyDef,
  getExchangeRateDef,
  listCurrenciesDef,
  // Alarms
  setAlarmDef,
  getAlarmsDef,
  deleteAlarmDef,
  snoozeAlarmDef,
  // Lists
  createListDef,
  addToListDef,
  viewListDef,
  getAllListsDef,
  checkOffItemDef,
  removeFromListDef,
  deleteListDef,
  // SMS Reading
  readSMSDef,
  checkNewMessagesDef,
  searchMessagesDef,
  // Voice Memos
  saveVoiceMemoDef,
  listVoiceMemosDef,
  recallVoiceMemoDef,
  deleteVoiceMemoDef,
  searchVoiceMemosDef,
  // Essentials (voice assistant basics)
  whatCanYouDoDef,
  quickCaptureDef,
  recentContextDef,
  setPreferenceDef,
  getPreferencesDef,
  // Humor & Entertainment
  tellJokeDef,
  getFunFactDef,
  tellMiniStoryDef,
  // Wind-down (evening rituals)
  windDownDef,
  bedtimeCheckInDef,
  sleepAffirmationDef,
  // Cross-domain shortcuts (delegates to other domains)
  quickAlarmDef,
  quickTimerDef,
  quickWeatherDef,
  quickMusicDef,
  quickCalendarDef,
  quickSmartHomeDef,
  quickCallDef,
  quickTextDef,
  quickEmailDef,
  // Knowledge tools (only spelling - others exist in separate files)
  spellDef,
  // Advanced reminders (location-based, recurring)
  locationReminderDef,
  listLocationRemindersDef,
  recurringReminderDef,
  listRecurringRemindersDef,
  cancelReminderDef,
  // Advanced lists - already in list-tools.ts
  // Device tools (find my phone, battery)
  findMyPhoneDef,
  stopRingingDef,
  checkBatteryDef,
  listDevicesDef,
  doNotDisturbDef,
  // Proactive - DISABLED
  // getUtilitySuggestionsDef,
  // checkTimerStatusDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'simple-utilities',
  simpleUtilitiesTools
);

export default getToolDefinitions;
