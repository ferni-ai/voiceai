/**
 * Consent model for sensitive memory categories.
 *
 * Health, money and beliefs are special: Ferni only remembers them once the
 * user says yes. GDPR treats health and religious/philosophical beliefs as
 * "special categories" (Art. 9) that need explicit consent; we treat money the
 * same way because it is just as personal.
 *
 * Stored on the user document: `bogle_users/{uid}.memoryConsent`.
 *
 * @module services/memory-consent/types
 */

export const SENSITIVE_CATEGORIES = ['health', 'finances', 'beliefs'] as const;
export type SensitiveCategory = (typeof SENSITIVE_CATEGORIES)[number];

/** Bump when the consent wording changes in a way that needs a fresh answer. */
export const CONSENT_VERSION = 1;

export const USERS_COLLECTION = 'bogle_users';
/** Field on `bogle_users/{uid}` that holds the consent record. */
export const CONSENT_FIELD = 'memoryConsent';

export type ConsentSource = 'page' | 'voice' | 'onboarding';

export interface CategoryConsent {
  readonly enabled: boolean;
  /** ISO time of the last change; null when never set (default off). */
  readonly updatedAt: string | null;
  readonly source: ConsentSource | null;
}

export interface MemoryConsent {
  readonly version: number;
  /** ISO time the user answered the upfront question (yes, no, or per category); null = never asked/answered. */
  readonly answeredAt: string | null;
  readonly categories: Readonly<Record<SensitiveCategory, CategoryConsent>>;
  readonly updatedAt: string | null;
}

export type ConsentErrorCode = 'invalid_user' | 'invalid_category' | 'storage_unavailable';

export interface ConsentError {
  readonly code: ConsentErrorCode;
  readonly message: string;
}

export function isSensitiveCategory(value: unknown): value is SensitiveCategory {
  return typeof value === 'string' && (SENSITIVE_CATEGORIES as readonly string[]).includes(value);
}

const OFF: CategoryConsent = { enabled: false, updatedAt: null, source: null };

/** Everything off and unanswered: the state of every user who hasn't said yes. */
export const DEFAULT_CONSENT: MemoryConsent = {
  version: CONSENT_VERSION,
  answeredAt: null,
  categories: { health: OFF, finances: OFF, beliefs: OFF },
  updatedAt: null,
};

/**
 * Plain-language copy, shared by voice replies and documentation. The web page
 * keeps its own translated strings with the same meaning.
 */
export const CONSENT_COPY = {
  upfront:
    'Some things are more personal: your health, your money, and what you believe. I only remember those if you say yes, and you can switch each one off anytime.',
  categories: {
    health: {
      label: 'Health & mood',
      spoken: 'your health stuff',
      description:
        "Conditions, medications, injuries, appointments, sleep, exercise, energy, and how you've seemed across our talks.",
    },
    finances: {
      label: 'Money',
      spoken: 'money things',
      description: 'Income, debts, savings, spending, and money worries.',
    },
    beliefs: {
      label: 'Faith & beliefs',
      spoken: 'your faith and beliefs',
      description: 'Religion, spirituality, and the beliefs that guide you.',
    },
  },
  /** Kept whatever the switches say. Shown on the memory page. */
  safetyException:
    'I always keep your allergies and food intolerances, even with Health off, so I never suggest something unsafe.',
} as const;
