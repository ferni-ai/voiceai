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
 */
export const PERSONAL_THEMES = {
  // Ferni's major themes
  wyoming: ['wyoming', 'third of seven', 'farm kid', 'commodore 64', 'sage after rain'],
  japan: ['japan', 'tsunami', '2011', 'tokyo', 'decade abroad', 'bow when i thank'],
  book: ['writing a book', 'started it four times', 'attempt five', 'the book'],
  childhood: ['growing up', 'as a kid', 'when i was young', 'my father', 'my mother'],
  family: ['my wife', 'my kids', 'eight kids', 'married'],
  notebook: ['paper notebook', 'write everything down', 'old-fashioned'],
  // Generic themes that apply to any persona
  mortality: ['death', 'dying', 'funeral', 'what keeps me up'],
  regret: ['regret', 'wish i had', 'should have'],
  fear: ['afraid', 'fear', 'scared', 'terrified'],
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
