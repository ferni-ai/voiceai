/**
 * Settings Executor - Language, Behavior, and System Configuration Tools
 *
 * Handles:
 * - Language settings (setspokenlanguage, listsupportedlanguages, getcurrentlanguage)
 * - Behavior pseudo-tools (shiftmode, processing, holdspace, expresspresence, adjustpacing)
 * - Utility pseudo-tools (speak, wrapupconversation, calculatetip)
 *
 * These are tools that affect HOW the AI behaves, not WHAT it does with external systems.
 *
 * @module agents/shared/tool-executors/settings-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'SettingsExecutor' });

const HANDLED_TOOLS = [
  // Language settings
  'setspokenlanguage',
  'listsupportedlanguages',
  'getsupportedlanguages',
  'getcurrentlanguage',
  'getspokenlanguage',
  // Behavior pseudo-tools (affect HOW the AI speaks)
  'shiftmode',
  'processing',
  'holdspace',
  'expresspresence',
  'adjustpacing',
  // Conversation control
  'wrapupconversation',
  // Utilities
  'calculatetip',
  // Apple-specific redirects (route to canonical tools)
  'searchapplemusic',
  'getappleweather',
] as const;

/**
 * Execute settings and behavior tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // ========================================
  // LANGUAGE SETTINGS
  // ========================================
  if (fnLower === 'setspokenlanguage') {
    const { language, languageCode } = args as { language?: string; languageCode?: string };
    const targetLanguage = language || languageCode;

    log.info(
      { language: targetLanguage, userId: ctx.userId, sessionId: ctx.sessionId },
      '🗣️ Set spoken language'
    );

    if (!targetLanguage) {
      return `Which language would you like me to speak? I support English, Spanish, Japanese, German, French, and more.`;
    }

    const { languageService } = await import('../../../services/language/index.js');
    const result = await languageService().setLanguage(
      ctx.userId || 'anonymous',
      targetLanguage,
      ctx.sessionId
    );

    if (result.success) {
      return result.confirmationMessage || `I'll speak ${targetLanguage} now.`;
    }
    return result.error || `I couldn't switch to that language.`;
  }

  if (fnLower === 'listsupportedlanguages' || fnLower === 'getsupportedlanguages') {
    log.info('🗣️ List supported languages');
    const { languageService } = await import('../../../services/language/index.js');
    const languages = await languageService().getSupportedLanguages();
    return `I can speak: ${languages.map((l) => l.displayName).join(', ')}. Which would you like?`;
  }

  if (fnLower === 'getcurrentlanguage' || fnLower === 'getspokenlanguage') {
    log.info({ userId: ctx.userId }, '🗣️ Get current language');
    const { languageService } = await import('../../../services/language/index.js');
    const current = await languageService().getCurrentLanguage(ctx.userId || 'anonymous');
    return `I'm currently speaking ${current.displayName || 'English'}.`;
  }

  // ========================================
  // BEHAVIOR PSEUDO-TOOLS
  // These affect HOW the AI speaks, not WHAT it does
  // They return empty strings (silent) - behavior is handled internally
  // ========================================
  if (fnLower === 'shiftmode') {
    const mode = args.mode as string;
    log.info({ mode }, '🎭 Shifting presence mode');
    // Silent - mode shift is internal behavior
    return '';
  }

  if (fnLower === 'processing') {
    const type = (args.type as string) || 'thinking';
    log.info({ type }, '🤔 Processing...');
    // Return minimal vocal filler if needed
    if (type === 'tool_call') return 'Let me check...';
    if (type === 'thinking') return 'Hmm...';
    return '';
  }

  if (fnLower === 'holdspace') {
    const reason = args.reason as string;
    log.info({ reason }, '🕯️ Holding space');
    // Silent - intentional pause
    return '';
  }

  if (fnLower === 'expresspresence') {
    const type = (args.type as string) || 'breath';
    log.info({ type }, '✨ Expressing presence');
    // Minimal sounds for presence
    if (type === 'hum') return 'Mmm...';
    if (type === 'soft_sound') return 'Mm-hmm...';
    return '';
  }

  if (fnLower === 'adjustpacing') {
    log.info({ speed: args.speed, pauses: args.pauses }, '⏱️ Adjusting pacing');
    // Silent - pacing adjustment is internal
    return '';
  }

  // ========================================
  // CONVERSATION CONTROL
  // ========================================
  if (fnLower === 'wrapupconversation') {
    log.info({ reason: args.reason }, '👋 Wrap up conversation requested');
    // Return empty - the wrap up should be handled naturally
    return '';
  }

  // ========================================
  // UTILITIES
  // ========================================
  if (fnLower === 'calculatetip') {
    const amount = args.amount as number;
    const percentage = (args.percentage as number) || 20;
    const split = (args.split as number) || 1;

    if (!amount || amount <= 0) {
      return "What's the bill amount?";
    }

    const tip = amount * (percentage / 100);
    const total = amount + tip;
    const perPerson = total / split;

    log.info({ amount, percentage, split }, '💰 Calculate tip');

    if (split > 1) {
      return `On a $${amount.toFixed(2)} bill with ${percentage}% tip: The tip is $${tip.toFixed(2)}, total is $${total.toFixed(2)}. Split ${split} ways, that's $${perPerson.toFixed(2)} each.`;
    }
    return `On a $${amount.toFixed(2)} bill with ${percentage}% tip: The tip is $${tip.toFixed(2)}, making the total $${total.toFixed(2)}.`;
  }

  // ========================================
  // APPLE-SPECIFIC REDIRECTS
  // Route to canonical tools
  // ========================================
  if (fnLower === 'searchapplemusic') {
    const { query } = args as { query?: string };
    log.info({ query }, '🎵 Search Apple Music → playmusic');
    // Route to music executor
    const { musicExecutor } = await import('./music-executor.js');
    return musicExecutor.execute('playmusic', { query: query || '' }, ctx);
  }

  if (fnLower === 'getappleweather') {
    const { location } = args as { location?: string };
    log.info({ location }, '🌤️ Apple Weather → getweather');
    // Route to information executor
    const { informationExecutor } = await import('./information-executor.js');
    return informationExecutor.execute('getweather', { location: location || 'current' }, ctx);
  }

  // Should not reach here
  return null;
}

export const settingsExecutor: DomainExecutor = {
  domain: 'settings',
  handles: HANDLED_TOOLS,
  execute,
};

export default settingsExecutor;
