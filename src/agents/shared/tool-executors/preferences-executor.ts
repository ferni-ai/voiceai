/**
 * Preferences Executor — JSON-workaround route (Gemini Live) for the
 * preference profile tools. Same service functions as the native tools in
 * src/tools/domains/simple-utilities/preference-tools.ts.
 *
 * Handles: setPreference, getPreferences
 *
 * @module agents/shared/tool-executors/preferences-executor
 */

import {
  describePreferencesForVoice,
  setPreferenceFromVoice,
  VOICE_PREFERENCE_TYPES,
} from '../../../services/user-preferences/index.js';
import type {
  SetPreferenceArgs,
  VoicePreferenceType,
} from '../../../services/user-preferences/voice.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'PreferencesExecutor' });

const HANDLED_TOOLS = ['setpreference', 'getpreferences'] as const;
const LIKE_CATEGORIES = new Set(['food', 'diet', 'music', 'activity', 'brand', 'place', 'other']);

function asType(value: unknown): VoicePreferenceType | undefined {
  return typeof value === 'string' && (VOICE_PREFERENCE_TYPES as readonly string[]).includes(value)
    ? (value as VoicePreferenceType)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Coerce untrusted JSON args into the voice service's argument shape. */
export function toSetPreferenceArgs(args: Record<string, unknown>): SetPreferenceArgs {
  const category = asString(args.category);
  return {
    preferenceType: asType(args.preferenceType) ?? asType(args.type),
    value: asString(args.value),
    customKey: asString(args.customKey),
    detail: asString(args.detail),
    status: asString(args.status),
    category: category && LIKE_CATEGORIES.has(category) ? category : undefined,
    action: args.action === 'forget' ? 'forget' : 'set',
    statement: asString(args.statement),
  };
}

async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const name = fn.toLowerCase();
  if (name === 'setpreference') {
    const parsed = toSetPreferenceArgs(args);
    log.info(
      { userId: ctx.userId, type: parsed.preferenceType, action: parsed.action },
      'setPreference (JSON)'
    );
    return setPreferenceFromVoice(ctx.userId, parsed);
  }
  if (name === 'getpreferences') {
    return describePreferencesForVoice(ctx.userId);
  }
  return null;
}

export const preferencesExecutor: DomainExecutor = {
  domain: 'preferences',
  handles: HANDLED_TOOLS,
  execute,
};

export default preferencesExecutor;
