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

/** Display names read aloud: "Chinese (Mandarin)" becomes "Chinese". */
function spoken(displayName: string): string {
  return displayName.replace(/\s*\([^)]*\)/g, '').trim();
}

/** Spoken reply when someone asks for a language calls can't do yet. */
export function languageNotLiveMessage(name: string): string {
  const displayName = spoken(name);
  return `I can't do ${displayName} out loud yet. Calls are English only for now. But I'll remember you'd like it. Want a few ${displayName} words to practise in the meantime?`;
}

/**
 * True answer to "what language are we speaking?". `autoDetected` means we only
 * heard the language, so we don't claim they asked for it.
 */
export function currentCallLanguageMessage(
  code: string,
  name: string,
  autoDetected = false
): string {
  const displayName = spoken(name);
  if (canSpeakLanguageLive(code)) return `We're speaking ${displayName}.`;
  const why = autoDetected
    ? `I could hear some ${displayName} in how you were talking, though.`
    : `I remember you'd like ${displayName}, though.`;
  return `We're speaking English. Calls are English only for now. ${why}`;
}

/** Spoken answer to "what languages do you know?": only languages we can help with. */
export function languageHelpListMessage(languages: Array<{ code: string; name: string }>): string {
  const all = [
    ...new Set(languages.filter((l) => !canSpeakLanguageLive(l.code)).map((l) => spoken(l.name))),
  ];
  // Short enough to say aloud: a few names, then "and more".
  const names = all.length > 6 ? [...all.slice(0, 6), 'more'] : all;
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
      : names[0];
  const help = list ? ` I can help with words and phrases in ${list}.` : '';
  return `I only speak English on calls for now.${help} Tell me which one you'd like and I'll remember it.`;
}
