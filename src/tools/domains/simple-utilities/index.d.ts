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
import type { ToolDefinition } from '../../registry/types.js';
import { calculatePercentageDef, calculateTipDef, mathToolDefinitions, quickMathDef, splitBillDef } from './math-tools.js';
import { conversionToolDefinitions, convertTemperatureDef, convertUnitsDef } from './conversion-tools.js';
import { calculateAgeDef, dateFromNowDef, dateToolDefinitions, daysUntilDef } from './date-tools.js';
import { bestTimeToCallDef, timeInCityDef, timezoneToolDefinitions } from './timezone-tools.js';
import { decisionToolDefinitions, flipCoinDef, helpMeDecideDef, pickRandomDef, rollDiceDef } from './decision-tools.js';
import { timerToolDefinitions } from './timer-tools.js';
import { clearNotesDef, notesToolDefinitions, quickNoteDef, recallNoteDef } from './notes-tools.js';
import { culturalContextDef, detectLanguageDef, learnPhrasesDef, pronounceDef, translateDef, translationToolDefinitions } from './translation-tools.js';
import { appSettingsToolDefinitions, setAppLanguageDef } from './app-settings-tools.js';
import { dictionaryToolDefinitions, defineWordDef, getSynonymsDef, wordOfDayDef } from './dictionary-tools.js';
import { currencyToolDefinitions, convertCurrencyDef, getExchangeRateDef, listCurrenciesDef } from './currency-tools.js';
import { alarmToolDefinitions, setAlarmDef, getAlarmsDef, deleteAlarmDef, snoozeAlarmDef } from './alarm-tools.js';
import { listToolDefinitions, createListDef, addToListDef, viewListDef, getAllListsDef, checkOffItemDef, removeFromListDef, deleteListDef } from './list-tools.js';
import { smsReadingToolDefinitions, readSMSDef, checkNewMessagesDef, searchMessagesDef } from './sms-reading-tools.js';
import { voiceMemosToolDefinitions, saveVoiceMemoDef, listVoiceMemosDef, recallVoiceMemoDef, deleteVoiceMemoDef, searchVoiceMemosDef } from './voice-memos-tools.js';
import { essentialsToolDefinitions, whatCanYouDoDef, quickCaptureDef, recentContextDef, setPreferenceDef, getPreferencesDef } from './essentials-tools.js';
import { humorToolDefinitions, tellJokeDef, getFunFactDef, tellMiniStoryDef } from './humor-tools.js';
import { winddownToolDefinitions, windDownDef, bedtimeCheckInDef, sleepAffirmationDef } from './winddown-tools.js';
import { shortcutsToolDefinitions, quickAlarmDef, quickTimerDef, quickWeatherDef, quickMusicDef, quickCalendarDef, quickSmartHomeDef, quickCallDef, quickTextDef, quickEmailDef, trackCapabilityUsage, getTopCapabilities, getRecentCapabilities } from './shortcuts-tools.js';
import { knowledgeToolDefinitions, spellDef } from './knowledge-tools.js';
import { advancedReminderDefinitions, locationReminderDef, listLocationRemindersDef, recurringReminderDef, listRecurringRemindersDef, cancelReminderDef } from './advanced-reminders.js';
import { deviceToolDefinitions, findMyPhoneDef, stopRingingDef, checkBatteryDef, listDevicesDef, doNotDisturbDef } from './device-tools.js';
export { generateInsight, getProactiveSuggestions, getTimerFollowUp, getUserPatterns, recordUsage, } from './pattern-intelligence.js';
export { onTimerComplete, registerVoiceCallbackHandler, speakDuration, type VoiceCallback, } from './voice-callbacks.js';
export { enrichCountdownWithContext, enrichTimerWithContext, enrichTimezoneWithContext, loadLifeContext, } from './context-integration.js';
export { loadPatternsFromFirestore, trackCountdown, updateTimerPreferences, updateTimezonePreferences, updateTipPreferences, } from './persistence.js';
export { getProactiveOpener } from './proactive-hooks.js';
export { activeTimers, quickNotes } from './shared-state.js';
export { initializeUtilitiesForSession, onConversationEnd, onConversationStart, onConversationTick, } from './session-init.js';
export { bestTimeToCallDef, calculateAgeDef, calculatePercentageDef, calculateTipDef, clearNotesDef, convertTemperatureDef, convertUnitsDef, dateFromNowDef, daysUntilDef, flipCoinDef, helpMeDecideDef, pickRandomDef, quickMathDef, quickNoteDef, recallNoteDef, rollDiceDef, splitBillDef, timeInCityDef, };
export { conversionToolDefinitions, dateToolDefinitions, decisionToolDefinitions, mathToolDefinitions, notesToolDefinitions, timerToolDefinitions, timezoneToolDefinitions, translationToolDefinitions, dictionaryToolDefinitions, currencyToolDefinitions, alarmToolDefinitions, listToolDefinitions, smsReadingToolDefinitions, voiceMemosToolDefinitions, };
export { culturalContextDef, detectLanguageDef, learnPhrasesDef, pronounceDef, translateDef };
export { appSettingsToolDefinitions, setAppLanguageDef };
export { defineWordDef, getSynonymsDef, wordOfDayDef };
export { convertCurrencyDef, getExchangeRateDef, listCurrenciesDef };
export { setAlarmDef, getAlarmsDef, deleteAlarmDef, snoozeAlarmDef };
export { createListDef, addToListDef, viewListDef, getAllListsDef, checkOffItemDef, removeFromListDef, deleteListDef, };
export { readSMSDef, checkNewMessagesDef, searchMessagesDef };
export { saveVoiceMemoDef, listVoiceMemosDef, recallVoiceMemoDef, deleteVoiceMemoDef, searchVoiceMemosDef, };
export { essentialsToolDefinitions, whatCanYouDoDef, quickCaptureDef, recentContextDef, setPreferenceDef, getPreferencesDef, };
export { humorToolDefinitions, tellJokeDef, getFunFactDef, tellMiniStoryDef };
export { winddownToolDefinitions, windDownDef, bedtimeCheckInDef, sleepAffirmationDef };
export { shortcutsToolDefinitions, quickAlarmDef, quickTimerDef, quickWeatherDef, quickMusicDef, quickCalendarDef, quickSmartHomeDef, quickCallDef, quickTextDef, quickEmailDef, trackCapabilityUsage, getTopCapabilities, getRecentCapabilities, };
export { knowledgeToolDefinitions, spellDef };
export { advancedReminderDefinitions, locationReminderDef, listLocationRemindersDef, recurringReminderDef, listRecurringRemindersDef, cancelReminderDef, };
export { deviceToolDefinitions, findMyPhoneDef, stopRingingDef, checkBatteryDef, listDevicesDef, doNotDisturbDef, };
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map