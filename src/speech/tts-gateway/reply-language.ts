/**
 * Voice a reply in its spoken language (#4062).
 *
 * Every reply is English except the Spanish crisis lines, which the speech
 * pass marks (services/safety/crisis-line-speech-es.ts). The gateway node
 * wraps its provider and cache once per node, so no call site changes:
 *
 * - the provider gets the language on every request: a non-English language
 *   as an extra last argument (providers/cartesia.ts takes it), English with
 *   none, so English requests are exactly as before;
 * - the cache keys non-English audio apart (`voice#es`), so a Spanish reply is
 *   never served the English audio for the same words. English keys are unchanged.
 *
 * The language is read at each request, never when the node is built.
 *
 * @module speech/tts-gateway/reply-language
 */

export type TTSLanguage = 'en' | 'es';

type Method = (...args: unknown[]) => unknown;

/**
 * `target`, with the named methods replaced. Each replacement is built from
 * the target's own method (bound), and only while the target has that method,
 * so an absent optional method stays absent. Everything else passes through.
 */
function overriding<T extends object>(
  target: T,
  overrides: Record<string, (own: Method) => Method>
): T {
  const replace = new Map(Object.entries(overrides));
  return new Proxy(target, {
    get(obj, key) {
      const value: unknown = Reflect.get(obj, key, obj);
      if (typeof value !== 'function') return value;
      const own = (value as Method).bind(obj);
      const build = typeof key === 'string' ? replace.get(key) : undefined;
      return build ? build(own) : own;
    },
  });
}

/**
 * The node's cache and provider, voicing and caching each request in the
 * reply's language. Without a language, both come back untouched.
 */
export function inReplyLanguage<C extends object, P extends object>(
  cache: C,
  provider: P,
  language?: () => TTSLanguage
): { cache: C; provider: P } {
  if (!language) return { cache, provider };
  const spoken = (): unknown[] => (language() === 'en' ? [] : [language()]);
  const voiceKey = (voiceId: unknown): unknown =>
    language() === 'en' ? voiceId : `${String(voiceId)}#${language()}`;
  // synthesize / synthesizeStreaming: (text, voiceId, prosody, language?)
  const withLanguage =
    (own: Method): Method =>
    (text, voiceId, prosody) =>
      own(text, voiceId, prosody, ...spoken());
  // cache get / set: (text, voiceId, ...rest)
  const keyed =
    (own: Method): Method =>
    (text, voiceId, ...rest) =>
      own(text, voiceKey(voiceId), ...rest);
  return {
    cache: overriding(cache, { get: keyed, set: keyed }),
    provider: overriding(provider, {
      synthesize: withLanguage,
      synthesizeStreaming: withLanguage,
      openReplyStream: (own) => (voiceId) => own(voiceId, language),
    }),
  };
}
