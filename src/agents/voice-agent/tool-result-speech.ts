/**
 * Whether we must ask the model for a reply after a tool result.
 *
 * LiveKit's session continues on its own after a tool call for the cascade's
 * text LLM and for Gemini's realtime models. OpenAI Realtime runs with
 * createResponse=false and stays silent until asked. Asking a model that
 * already continues produces a second, concurrent reply, which on a live call
 * re-ran the user's request (playMusic three times for one ask).
 *
 * @module agents/voice-agent/tool-result-speech
 */

export function needsExplicitToolResultReply(providerId: string): boolean {
  return providerId === 'openai-realtime';
}
