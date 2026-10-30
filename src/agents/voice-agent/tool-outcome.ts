/**
 * What a music tool call came to, for the "Tool execution tracked" log line.
 *
 * The agent counts a tool error only when the tool throws, so "Spotify isn't
 * connected" counted as a success: 11 prod music calls in 7 days all read as
 * fine while every one fell back to a 30-second iTunes preview (integration
 * audit, 2026-10-29). `outcome` is `error` when the tool threw, `unavailable`
 * when its reply says Spotify or the audio system could not be used, `ok`
 * otherwise. Only music tools get an ok/unavailable verdict; for any other
 * tool a non-error call has no outcome, since nothing here checked it.
 *
 * @module agents/voice-agent/tool-outcome
 */

export type ToolOutcome = 'ok' | 'unavailable' | 'error';

/** What music replies say when Spotify or the audio system could not be used (tools/domains/entertainment: music.ts, ambient-play.ts, music-honesty.ts). */
const UNAVAILABLE =
  /spotify isn't (connected|linked)|link your (spotify|account)|isn't available in this session|playback is currently disabled|audio system (isn't ready|didn't)/i;

function readable(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result) ?? '';
  } catch {
    return '';
  }
}

export function toolOutcome(
  isMusicTool: boolean,
  result: unknown,
  hasError: boolean
): ToolOutcome | undefined {
  if (hasError) return 'error';
  if (!isMusicTool) return undefined;
  return UNAVAILABLE.test(readable(result)) ? 'unavailable' : 'ok';
}
