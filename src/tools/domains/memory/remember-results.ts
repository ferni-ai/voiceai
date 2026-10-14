/**
 * rememberAboutUser's results (tools.ts and tools-unified.ts): short, honest,
 * and not something to read out. Never empty, since an empty result reads to
 * the model as "nothing happened" (agents/personas/tool-output-guard.ts).
 *
 * @module tools/domains/memory/remember-results
 */
export const REMEMBERED = 'Saved for next time. Carry on; no need to mention it.';
export const REMEMBERED_THIS_CALL =
  "Noted for this call, but it couldn't be saved for next time. Carry on; no need to mention it.";
