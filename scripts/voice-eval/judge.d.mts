// Types for the parts of judge.mjs that TypeScript scripts use
// (scripts/audio-eval/persona-audio-id.ts); extend as more are needed.
export interface JudgeContext {
  model: string;
  project: string;
}
export interface JudgeProvider {
  model(env: Record<string, string | undefined>): string;
  /** The judge's JSON answer; throws when the call fails or the reply has no JSON. */
  ask(prompt: string, ctx: JudgeContext): Promise<Record<string, unknown>>;
}
export const PROVIDERS: Record<'gemini' | 'claude' | 'qwen', JudgeProvider>;
