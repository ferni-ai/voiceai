/**
 * Personal Theme Types
 *
 * Shared types and utilities for tracking personal themes in conversations.
 * These are major backstory elements that should only be mentioned once per session
 * unless the user specifically asks about them.
 *
 * @module types/personal-themes
 */

// ============================================================================
// PERSONAL THEME DEFINITIONS
// ============================================================================

/**
 * Personal themes that should only be mentioned once per session unless user asks
 * These are major backstory elements that feel repetitive when mentioned multiple times
 *
 * PIXAR ENHANCEMENT: Expanded to cover more repetitive patterns beyond just major backstory
 */
export const PERSONAL_THEMES = {
  // ============================================================
  // FERNI'S MAJOR BACKSTORY THEMES
  // ============================================================
  wyoming: ['wyoming', 'third of seven', 'farm kid', 'commodore 64', 'sage after rain', 'big sky'],
  japan: ['japan', 'tsunami', '2011', 'tokyo', 'decade abroad', 'bow when i thank', 'march 11'],
  book: ['writing a book', 'started it four times', 'attempt five', 'the book', 'two pages'],
  childhood: ['growing up', 'as a kid', 'when i was young', 'my father', 'my mother'],
  family: ['my wife', 'my kids', 'eight kids', 'married', 'blended family'],
  notebook: ['paper notebook', 'write everything down', 'old-fashioned'],

  // ============================================================
  // FERNI'S DAILY LIFE THEMES (NEW - prevents repetitive quirks)
  // ============================================================
  coffee: ['coffee', 'too much coffee', 'my wife says', 'third cup', 'caffeine'],
  morning_routine: ['5 am', 'before the house wakes', 'morning ritual', 'sacred time', 'up early'],
  flights: ['looking at flights', 'never book', 'wonderful sickness', 'lisbon', 'patagonia'],
  ski_argument: ['alta', 'ski resort', 'brother', 'forty years', 'argue about ski'],
  mint_tea: ['mint tea', 'morocco', 'riad', 'marrakech', 'mint'],
  bad_movies: ['disaster movies', 'bad movies', 'b movies', 'trauma processing'],

  // ============================================================
  // FERNI'S TRAVEL/CULTURE THEMES
  // ============================================================
  brazil: ['brazil', 'carnaval', 'joy', 'celebration'],
  morocco: ['morocco', 'patience', 'riad', 'hours of tea'],
  india: ['india', 'service', 'generosity', 'humbling'],
  scotland: ['scotland', 'resilience', 'weather tries to break'],

  // ============================================================
  // FERNI'S WISDOM THEMES (NEW - prevents repetitive lessons)
  // ============================================================
  net_worth_self_worth: ['net worth', 'self worth', 'your value'],
  second_chances: ['second chances', 'redemption', 'starting over'],
  questions_over_answers: ['right question', 'hundred answers', 'questions matter'],
  patience_lesson: ['patience', 'stay the course', 'time is your friend'],

  // ============================================================
  // GENERIC EMOTIONAL THEMES
  // ============================================================
  mortality: ['death', 'dying', 'funeral', 'what keeps me up'],
  regret: ['regret', 'wish i had', 'should have'],
  fear: ['afraid', 'fear', 'scared', 'terrified'],
  vulnerability: ['never told anyone', 'hard to say', 'between us'],
} as const;

/**
 * Type for personal theme keys
 */
export type PersonalTheme = keyof typeof PERSONAL_THEMES;

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Extract personal themes from content
 */
export function extractPersonalThemes(content: string): PersonalTheme[] {
  const lowerContent = content.toLowerCase();
  const foundThemes: PersonalTheme[] = [];

  for (const [theme, keywords] of Object.entries(PERSONAL_THEMES)) {
    if (keywords.some((keyword) => lowerContent.includes(keyword))) {
      foundThemes.push(theme as PersonalTheme);
    }
  }

  return foundThemes;
}
