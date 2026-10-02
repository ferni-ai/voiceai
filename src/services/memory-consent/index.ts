/**
 * Sensitive-memory consent (health, money, beliefs).
 *
 * Public API for every memory area that stores sensitive data:
 *
 *   isCategoryEnabled(userId, 'finances')          // gate every write; false = don't store
 *   getConsent(userId)                             // Result<MemoryConsent>
 *   setCategoryConsent(userId, 'beliefs', false, 'page' | 'voice' | 'onboarding')
 *   answerUpfrontConsent(userId, true, 'page')     // the one upfront question
 *   onConsentChange((uid, category, enabled) => …) // drop in-memory buffers on "off"
 *   registerCategoryStore({ category, name, count, deleteAll }) // offer deletion on "off"
 *   sensitiveCategoriesOf(text)                    // classify free text before storing it
 *
 * See docs/architecture/USER-MEMORY-CONTROL.md ("Sensitive memory consent").
 *
 * @module services/memory-consent
 */

export * from './types.js';
export {
  answerUpfrontConsent,
  clearConsentCache,
  getConsent,
  isCategoryEnabled,
  onConsentChange,
  parseConsent,
  setCategoryConsent,
  updateConsent,
  type ConsentChange,
  type ConsentChangeListener,
} from './store.js';
export { categoryForFactType, sensitiveCategoriesOf } from './classifier.js';
export {
  deleteCategoryData,
  registerCategoryStore,
  resetCategoryStores,
  summarizeCategoryData,
  type CategoryDataReport,
  type CategoryStore,
} from './category-data.js';
export { handleConsentVoice, VOICE_CONSENT_COPY, type VoiceConsentArgs } from './voice.js';
