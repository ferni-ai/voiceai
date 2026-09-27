/**
 * One voice per call when the model speaks for itself.
 *
 * With Gemini native audio, replies come out of the model in its (possibly
 * replicated) voice, but scripted lines go through session.say(): greetings,
 * handoff lines, recovery lines, tool confirmations. say() is voiced by the
 * session TTS (Cartesia) or plays pre-rendered Cartesia audio, so a call
 * alternated between two voices. Routing say() through the model keeps every
 * line in the model's voice and bypasses the Cartesia caches.
 *
 * @module agents/shared/native-speech
 */

interface SayCapableSession {
  say: (text: string | ReadableStream<string>, options?: SayOptions) => unknown;
  generateReply: (options: { instructions: string; allowInterruptions?: boolean }) => unknown;
}

interface SayOptions {
  audio?: unknown;
  allowInterruptions?: boolean;
  addToChatCtx?: boolean;
}

const TAG = /<\/?[A-Za-z][^>]*>/g;
const CUE = /\[[A-Za-z][A-Za-z ]{0,30}\]/g;

function plainText(text: string): string {
  return text.replace(TAG, ' ').replace(CUE, ' ').replace(/\s+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
}

export function sayExactlyInstruction(text: string): string {
  return `Say exactly the following, word for word, in your own voice, and nothing else: "${plainText(text)}"`;
}

/** Make session.say() speak through the model. Streamed text keeps the original path. */
export function routeSayThroughModel(session: SayCapableSession): void {
  const originalSay = session.say.bind(session);
  session.say = (text, options) => {
    if (typeof text !== 'string') return originalSay(text, options);
    // Any pre-rendered audio (options.audio) is Cartesia's voice: drop it.
    return session.generateReply({
      instructions: sayExactlyInstruction(text),
      allowInterruptions: options?.allowInterruptions,
    });
  };
}
