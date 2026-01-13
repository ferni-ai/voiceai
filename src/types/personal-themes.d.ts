/**
 * Personal Theme Types
 *
 * Shared types and utilities for tracking personal themes in conversations.
 * These are major backstory elements that should only be mentioned once per session
 * unless the user specifically asks about them.
 *
 * @module types/personal-themes
 */
/**
 * Personal themes that should only be mentioned once per session unless user asks
 * These are major backstory elements that feel repetitive when mentioned multiple times
 *
 * PIXAR ENHANCEMENT: Expanded to cover more repetitive patterns beyond just major backstory
 */
export declare const PERSONAL_THEMES: {
    readonly wyoming: readonly ["wyoming", "third of seven", "farm kid", "commodore 64", "sage after rain", "big sky"];
    readonly japan: readonly ["japan", "tsunami", "2011", "tokyo", "decade abroad", "bow when i thank", "march 11"];
    readonly book: readonly ["writing a book", "started it four times", "attempt five", "the book", "two pages"];
    readonly childhood: readonly ["growing up", "as a kid", "when i was young", "my father", "my mother"];
    readonly family: readonly ["my wife", "my kids", "eight kids", "married", "blended family"];
    readonly notebook: readonly ["paper notebook", "write everything down", "old-fashioned"];
    readonly coffee: readonly ["coffee", "too much coffee", "my wife says", "third cup", "caffeine"];
    readonly morning_routine: readonly ["5 am", "before the house wakes", "morning ritual", "sacred time", "up early"];
    readonly flights: readonly ["looking at flights", "never book", "wonderful sickness", "lisbon", "patagonia"];
    readonly ski_argument: readonly ["alta", "ski resort", "brother", "forty years", "argue about ski"];
    readonly mint_tea: readonly ["mint tea", "morocco", "riad", "marrakech", "mint"];
    readonly bad_movies: readonly ["disaster movies", "bad movies", "b movies", "trauma processing"];
    readonly brazil: readonly ["brazil", "carnaval", "joy", "celebration"];
    readonly morocco: readonly ["morocco", "patience", "riad", "hours of tea"];
    readonly india: readonly ["india", "service", "generosity", "humbling"];
    readonly scotland: readonly ["scotland", "resilience", "weather tries to break"];
    readonly net_worth_self_worth: readonly ["net worth", "self worth", "your value"];
    readonly second_chances: readonly ["second chances", "redemption", "starting over"];
    readonly questions_over_answers: readonly ["right question", "hundred answers", "questions matter"];
    readonly patience_lesson: readonly ["patience", "stay the course", "time is your friend"];
    readonly mortality: readonly ["death", "dying", "funeral", "what keeps me up"];
    readonly regret: readonly ["regret", "wish i had", "should have"];
    readonly fear: readonly ["afraid", "fear", "scared", "terrified"];
    readonly vulnerability: readonly ["never told anyone", "hard to say", "between us"];
};
/**
 * Type for personal theme keys
 */
export type PersonalTheme = keyof typeof PERSONAL_THEMES;
/**
 * Extract personal themes from content
 */
export declare function extractPersonalThemes(content: string): PersonalTheme[];
//# sourceMappingURL=personal-themes.d.ts.map