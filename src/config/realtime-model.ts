/**
 * Realtime (Vertex AI Live API) model selection.
 *
 * Google retired the gemini-2.0-flash line this used to default to, and the
 * Gemini Live pipeline is legacy. So there is no default: selecting
 * VOICE_PIPELINE=gemini-live without LLM_REALTIME_MODEL fails at startup
 * instead of calling a model that 404s mid-call.
 */

export type RealtimeModelEnv = Readonly<Record<string, string | undefined>>;

export function realtimeModelOrFail(env: RealtimeModelEnv = process.env): string {
  const model = env.LLM_REALTIME_MODEL ?? '';
  if (env.VOICE_PIPELINE === 'gemini-live' && !model) {
    throw new Error(
      [
        'Gemini Live voice pipeline is legacy. Google retired the gemini-2.0-flash model line.',
        '',
        'To use Gemini Live, set LLM_REALTIME_MODEL to a Live API model that Vertex AI',
        'currently serves for your project (check the Vertex AI model list first).',
        '',
        'Or use the default pipeline (Cartesia cascade): unset VOICE_PIPELINE.',
      ].join('\n')
    );
  }
  return model;
}
