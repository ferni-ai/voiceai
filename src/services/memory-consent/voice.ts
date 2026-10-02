/**
 * Voice control of sensitive memory: "stop remembering my health stuff",
 * "yes, you can remember that kind of thing", "delete my health memories too".
 *
 * Backs the `setMemoryConsent` tool. Turning a category off stops capture at
 * once and offers (never forces) deleting what's stored; deletion happens only
 * when the user confirms (`deleteExisting: true`).
 *
 * @module services/memory-consent/voice
 */

import { createLogger } from '../../utils/safe-logger.js';
import { deleteCategoryData, summarizeCategoryData } from './category-data.js';
import { answerUpfrontConsent, setCategoryConsent } from './store.js';
import {
  CONSENT_COPY,
  SENSITIVE_CATEGORIES,
  isSensitiveCategory,
  type SensitiveCategory,
} from './types.js';

const log = createLogger({ module: 'MemoryConsentVoice' });

export interface VoiceConsentArgs {
  /** health | finances | beliefs | all */
  readonly category: string;
  readonly enabled?: boolean;
  /** true only after the user said yes to "want me to delete what I have?" */
  readonly deleteExisting?: boolean;
}

export const VOICE_CONSENT_COPY = {
  noUser: "I can't change that right now. Try again in a moment?",
  failed: "I couldn't save that just now. Mind trying again?",
  unknown: 'Do you mean health, money, or faith and beliefs?',
  onAll:
    "Thank you for trusting me. I'll remember health, money and faith things you share. You can switch any of them off anytime.",
  on: (spoken: string) =>
    `Thank you for trusting me. I'll remember ${spoken} now. You can switch it off anytime.`,
  off: (spoken: string) => `Okay, I've stopped remembering ${spoken}.`,
  offAll: "Okay, I won't remember health, money or faith things.",
  offerDelete: (n: number) =>
    ` I still have ${n} ${n === 1 ? 'thing' : 'things'} from before. Want me to delete ${n === 1 ? 'it' : 'those'} too?`,
  allergies: ' I’ll still keep your allergies so I never suggest something unsafe.',
  deleted: (n: number) =>
    n === 0
      ? " There wasn't anything stored."
      : ` And I've deleted the ${n} ${n === 1 ? 'thing' : 'things'} I had.`,
} as const;

function spokenFor(categories: readonly SensitiveCategory[]): string {
  return categories.map((c) => CONSENT_COPY.categories[c].spoken).join(' and ');
}

/** Handle one voice request. Returns what to say. Never throws. */
export async function handleConsentVoice(
  userId: string | undefined,
  args: VoiceConsentArgs
): Promise<string> {
  if (!userId || userId === 'anonymous') return VOICE_CONSENT_COPY.noUser;
  const raw = (args.category ?? '').toLowerCase().trim();
  const all = raw === 'all' || raw === 'everything' || raw === 'sensitive';
  const alias: Record<string, SensitiveCategory> = {
    money: 'finances',
    finance: 'finances',
    faith: 'beliefs',
    belief: 'beliefs',
    religion: 'beliefs',
    mood: 'health',
  };
  const one = isSensitiveCategory(raw) ? raw : alias[raw];
  if (!all && !one) return VOICE_CONSENT_COPY.unknown;
  const categories: SensitiveCategory[] = all
    ? [...SENSITIVE_CATEGORIES]
    : [one as SensitiveCategory];

  try {
    // Deleting what's stored (after the user said yes to the offer).
    if (args.deleteExisting === true && args.enabled !== true) {
      let deleted = 0;
      for (const c of categories) {
        const r = await setCategoryConsent(userId, c, false, 'voice');
        if (!r.success) return VOICE_CONSENT_COPY.failed;
        deleted += (await deleteCategoryData(userId, c)).total;
      }
      const base = all ? VOICE_CONSENT_COPY.offAll : VOICE_CONSENT_COPY.off(spokenFor(categories));
      const keep = categories.includes('health') ? VOICE_CONSENT_COPY.allergies : '';
      return `${base}${VOICE_CONSENT_COPY.deleted(deleted)}${keep}`;
    }

    const enabled = args.enabled !== false;
    const result = all
      ? await answerUpfrontConsent(userId, enabled, 'voice')
      : await setCategoryConsent(userId, categories[0] as SensitiveCategory, enabled, 'voice');
    if (!result.success) return VOICE_CONSENT_COPY.failed;

    if (enabled) {
      return all ? VOICE_CONSENT_COPY.onAll : VOICE_CONSENT_COPY.on(spokenFor(categories));
    }
    let stored = 0;
    for (const c of categories) stored += (await summarizeCategoryData(userId, c)).total;
    const base = all ? VOICE_CONSENT_COPY.offAll : VOICE_CONSENT_COPY.off(spokenFor(categories));
    const keep = categories.includes('health') ? VOICE_CONSENT_COPY.allergies : '';
    return `${base}${keep}${stored > 0 ? VOICE_CONSENT_COPY.offerDelete(stored) : ''}`;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Voice consent change failed');
    return VOICE_CONSENT_COPY.failed;
  }
}
