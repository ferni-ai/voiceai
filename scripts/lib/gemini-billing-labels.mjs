/**
 * Billing labels for Vertex Gemini requests made by scripts (evals, judges,
 * replays), so the GCP billing export says which job spent the money. About 85%
 * of October 2026's Vertex Gemini requests came from scripts on a developer's
 * gcloud credentials, and the export could not tell them apart.
 *
 * Plain JS so .mjs scripts under bare node can import it. It mirrors
 * src/config/gemini-billing-labels.ts (the shared client's labels); the test
 * beside it keeps the two in step.
 *   ferni_job  GEMINI_BILLING_JOB, else the entry file's name (voice-eval-judge
 *              for scripts/voice-eval/judge.mjs), else `unlabelled`
 *   ferni_env  local (scripts run on a laptop)
 * Only for Vertex (aiplatform) requests:
 * the Gemini API (generativelanguage) does not take labels.
 */

/** `value` as a GCP label value: lowercase letters, digits, `_` and `-`, at most 63 chars. */
export function sanitizeLabelValue(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
}

/** A job name for an entry file: `voice-eval-judge` for scripts/voice-eval/judge.mjs. */
export function jobFromEntry(entry) {
  const parts = String(entry ?? '')
    .split(/[\\/]/)
    .filter(Boolean);
  const base = (parts.pop() ?? '').replace(/\.[^.]*$/, '');
  if (!base) return undefined;
  const parent = parts.pop() ?? '';
  return ['', 'scripts', 'src', 'dist', 'bin', '.bin'].includes(parent)
    ? base
    : `${parent}-${base}`;
}

/** This script's labels. */
export function scriptBillingLabels(env = process.env, entry = process.argv[1]) {
  const job =
    sanitizeLabelValue(env.GEMINI_BILLING_JOB || jobFromEntry(entry) || '') || 'unlabelled';
  return { ferni_job: job, ferni_env: 'local' };
}

/** A Vertex generateContent request body with `labels` added; labels it already sets win. */
export function withBillingLabels(body, labels = scriptBillingLabels()) {
  return { ...body, labels: { ...labels, ...body?.labels } };
}
