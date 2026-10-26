/**
 * Billing labels on Vertex Gemini requests, so the GCP billing export says which
 * job spent the money.
 *
 * October 2026: Vertex Gemini cost about $1,580 for voiceai and the export could
 * not say who spent it: its labels column held only goog-vertex-api-location.
 * Vertex generateContent and streamGenerateContent take a `labels` map in the
 * request body, and the billing export copies it into `labels`. Requests through
 * the shared client (getGeminiClient) and the cascade voice LLM now carry:
 *   ferni_job  GEMINI_BILLING_JOB; else the Cloud Run service (K_SERVICE);
 *              `live_agent` in another deployed process; the entry file's name
 *              when run locally (voice-eval-judge); else `unlabelled`
 *   ferni_env  prod | dev | local
 *
 * Only Vertex gets labels: @google/genai throws "labels parameter is not supported
 * in Gemini API" on the API-key path.
 * Values come from env vars and the entry file name only, never from user data.
 *
 * scripts/lib/gemini-billing-labels.mjs is the plain-JS twin for scripts that run
 * under bare node; scripts/lib/__tests__/gemini-billing-labels.test.mjs keeps the
 * two in step.
 *
 * @module config/gemini-billing-labels
 */

export type BillingLabels = Record<string, string>;
type Env = Readonly<Record<string, string | undefined>>;
type Config = Record<string, unknown> | undefined;

/** `value` as a GCP label value: lowercase letters, digits, `_` and `-`, at most 63 chars. */
export function sanitizeLabelValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
}

/** A job name for an entry file: `voice-eval-judge` for scripts/voice-eval/judge.mjs. */
export function jobFromEntry(entry: string | undefined): string | undefined {
  const parts = (entry ?? '').split(/[\\/]/).filter(Boolean);
  const base = (parts.pop() ?? '').replace(/\.[^.]*$/, '');
  if (!base) return undefined;
  const parent = parts.pop() ?? '';
  return ['', 'scripts', 'src', 'dist', 'bin', '.bin'].includes(parent)
    ? base
    : `${parent}-${base}`;
}

/** prod or dev for a deployed process (dev = staging or a non-default Firestore), else local. */
export function billingEnv(env: Env = process.env): 'prod' | 'dev' | 'local' {
  const nodeEnv = env.NODE_ENV;
  if (!env.K_SERVICE && nodeEnv !== 'production' && nodeEnv !== 'staging') return 'local';
  const db = env.FIRESTORE_DATABASE;
  return nodeEnv === 'staging' || (db && db !== '(default)') ? 'dev' : 'prod';
}

/** The labels for this process. */
export function geminiBillingLabels(
  env: Env = process.env,
  entry: string | undefined = process.argv[1]
): BillingLabels {
  const ferniEnv = billingEnv(env);
  const fallback = env.K_SERVICE || (ferniEnv === 'local' ? jobFromEntry(entry) : 'live_agent');
  const job = sanitizeLabelValue(env.GEMINI_BILLING_JOB || fallback || '') || 'unlabelled';
  return { ferni_job: job, ferni_env: ferniEnv };
}

/** `config` with `labels` added; labels the call already sets win. */
export function withBillingLabels(config: Config, labels: BillingLabels): Config {
  const own = config?.labels as BillingLabels | undefined;
  return { ...config, labels: { ...labels, ...own } };
}

type Generate = (req: { model: string; config?: Config }) => Promise<unknown>;

/** Route a Vertex client's generateContent / generateContentStream through withBillingLabels. */
export function applyBillingLabels(
  client: { models: { generateContent: Generate; generateContentStream?: Generate } },
  labels: BillingLabels
): void {
  const { models } = client;
  for (const name of ['generateContent', 'generateContentStream'] as const) {
    const original = models[name];
    if (typeof original !== 'function') continue;
    const bound = original.bind(models);
    models[name] = async (req) => bound({ ...req, config: withBillingLabels(req.config, labels) });
  }
}

/**
 * Label every chat() of a Vertex @livekit/agents-plugin-google LLM. The plugin
 * copies extraKwargs into the generateContentStream config, so `labels` reaches
 * the request body. Returns the same instance. `chat` is typed in method syntax
 * on purpose: that compares bivariantly, so the plugin's chat(ChatOptions) fits.
 */
// eslint-disable-next-line @typescript-eslint/method-signature-style
export function labelLlmChat<T extends { chat(opts: { extraKwargs?: Config }): unknown }>(
  llm: T,
  labels: BillingLabels
): T {
  if (typeof llm.chat !== 'function') return llm;
  const chat = llm.chat.bind(llm);
  llm.chat = ((opts: { extraKwargs?: Config }) =>
    chat({ ...opts, extraKwargs: withBillingLabels(opts.extraKwargs, labels) })) as T['chat'];
  return llm;
}
