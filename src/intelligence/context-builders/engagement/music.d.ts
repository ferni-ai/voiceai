import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare const STOP_MUSIC_PATTERNS: RegExp;
/**
 * Build music-related context injections
 *
 * NOTE: We no longer auto-stop music here. The agent should use the
 * musicControl tool with action "stop" when the user explicitly asks.
 * The patterns were too aggressive and would stop music when the user
 * said "stop" in unrelated contexts (like "stop worrying").
 */
declare function buildMusicContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildMusicContext, STOP_MUSIC_PATTERNS };
//# sourceMappingURL=music.d.ts.map