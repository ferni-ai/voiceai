export const JUDGE_FLASH: 'gemini-3.5-flash';
export const JUDGE_PRO: 'gemini-3.1-pro-preview';
export function judgeModel(
  env?: Record<string, string | undefined>,
  fallback?: 'flash' | 'pro' | (string & {})
): string;
