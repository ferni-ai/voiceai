/**
 * Which sensitive category (if any) a piece of text belongs to.
 *
 * Used as a gate wherever memory is written from free text (fact extraction,
 * summaries): when a category is off, text that matches it is not stored.
 * Deliberately conservative toward privacy: a false positive only means one
 * memory isn't kept until the user opts in.
 *
 * Health here means medical and mental-health detail (conditions, medicines,
 * symptoms, injuries, appointments, therapy). Everyday mentions of sleep or
 * exercise ("I love running") are interests, not health records; the health
 * memory store gates those separately when it records them as health data.
 *
 * Agents for money and beliefs: extend FINANCES / BELIEFS here (one place).
 *
 * @module services/memory-consent/classifier
 */

import type { SensitiveCategory } from './types.js';

const HEALTH: readonly RegExp[] = [
  /\b(diagnos(?:ed|is)|medical condition|health condition|chronic|disorder|syndrome|disease|illness)\b/i,
  /\b(medication|medicine|meds|prescri(?:bed|ption)|dosage|\d+\s?mg|pills?|inhaler|insulin|antidepressants?)\b/i,
  /\b(doctor|physician|gp|dentist|therapist|psychiatrist|cardiologist|surgeon|clinic|hospital|er visit|urgent care)\b/i,
  /\b(symptoms?|migraines?|headaches?|nausea|fever|dizz(?:y|iness)|insomnia|chronic pain|back pain|panic attacks?)\b/i,
  /\b(diabetes|diabetic|asthma|cancer|tumou?r|arthritis|hypertension|blood pressure|cholesterol|thyroid|epilepsy|ibs|crohn'?s|celiac|covid|long covid|endometriosis|pcos|fibromyalgia|lupus|multiple sclerosis|copd)\b/i,
  /\b(depression|depressed|anxiety disorder|bipolar|ptsd|ocd|adhd|autism|eating disorder|anorexia|bulimia|schizophrenia)\b/i,
  /\b(therapy|counsell?ing|rehab|surgery|chemo(?:therapy)?|physio(?:therapy)?|injur(?:y|ies|ed)|sprain(?:ed)?|fractur(?:e|ed)|broke my)\b/i,
  /\b(pregnan(?:t|cy)|miscarriage|ivf|fertility|menopause)\b/i,
];

const FINANCES: readonly RegExp[] = [
  /\b(salary|income|paycheck|wages?|pay rise|got a raise)\b/i,
  /\b(debts?|loans?|mortgage|credit card|credit score|overdraft|bankrupt(?:cy)?|collections agency)\b/i,
  /\b(savings|401k|ira|pension|retirement fund|investments?|portfolio|stocks?|crypto)\b/i,
  /\b(my rent|pay(?:ing)? rent|budget|i'?m broke|can'?t afford|net worth|inheritance|tax return|tax bill)\b/i,
  /[$£€]\s?\d/,
];

const BELIEFS: readonly RegExp[] = [
  /\b(religio(?:n|us)|faith|spiritual(?:ity)?|atheis[mt]|agnostic|believer)\b/i,
  /\b(church|mosque|synagogue|temple|gurdwara|sabbath|ramadan|passover|diwali)\b/i,
  /\b(pray(?:s|ed|ing|ers?)?|believe in god|god'?s plan|allah|jesus|buddha|bible|quran|koran|torah|scripture)\b/i,
  /\b(christian|catholic|protestant|muslim|islam(?:ic)?|jewish|judaism|hindu(?:ism)?|buddhis[mt]|sikh|mormon|evangelical)\b/i,
];

const RULES: ReadonlyArray<[SensitiveCategory, readonly RegExp[]]> = [
  ['health', HEALTH],
  ['finances', FINANCES],
  ['beliefs', BELIEFS],
];

/** Every sensitive category the text touches (empty when none). */
export function sensitiveCategoriesOf(text: string): SensitiveCategory[] {
  if (!text) return [];
  return RULES.filter(([, patterns]) => patterns.some((p) => p.test(text))).map(([c]) => c);
}

/**
 * Category implied by an extraction fact type, when extraction labels it
 * directly (`health`, `finance`/`finances`, `belief`/`beliefs`).
 */
export function categoryForFactType(factType: string | undefined): SensitiveCategory | null {
  switch ((factType ?? '').toLowerCase()) {
    case 'health':
      return 'health';
    case 'finance':
    case 'finances':
      return 'finances';
    case 'belief':
    case 'beliefs':
      return 'beliefs';
    default:
      return null;
  }
}
