/**
 * Live call language capability: the one place that decides whether a call can
 * actually hear and speak a language, and the true things to say when it can't.
 *
 * @module services/language/live-capability
 */

/**
 * Languages the call TTS can speak. Mirrors the hard-coded `language: 'en'` in
 * src/speech/tts-gateway/providers/cartesia.ts and src/speech/tts/persona-aware.ts.
 */
const LIVE_TTS_LANGUAGES: ReadonlySet<string> = new Set(['en']);

function baseLanguage(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Whether a live call can actually hear AND speak `code` right now.
 *
 * Single source of truth for every caller-facing language claim. Calls are
 * English-only end to end today: STT is `CASCADE_STT_LANGUAGE || 'en'`
 * (src/agents/model-provider/cartesia-cascade.ts) and TTS is hard-coded 'en'.
 * When multilingual calls ship (STT/TTS driven by getStt/TtsLanguageForSession),
 * update LIVE_TTS_LANGUAGES / this check and every message follows.
 */
export function canSpeakLanguageLive(
  code: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  const lang = baseLanguage(code);
  const sttLang = baseLanguage(env.CASCADE_STT_LANGUAGE || 'en');
  return lang === sttLang && LIVE_TTS_LANGUAGES.has(lang);
}

/** What to tell a caller who asked for a language calls can't do yet. */
export function languageNotLiveMessage(displayName: string): string {
  return `I can only talk in English on calls for now, so I'll keep going in English. I've noted you'd like ${displayName} for when that changes, and I can help with ${displayName} words or phrases anytime.`;
}

/** True answer to "what language are we speaking?" given the saved preference. */
export function currentCallLanguageMessage(code: string, displayName: string): string {
  return canSpeakLanguageLive(code)
    ? `We're speaking ${displayName}.`
    : `We're speaking English; calls are English-only for now. I have ${displayName} noted as your preferred language.`;
}
