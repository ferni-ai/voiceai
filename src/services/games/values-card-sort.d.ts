/**
 * 🎴 Values Card Sort Implementation
 *
 * A self-discovery game where users sort through value "cards"
 * to identify their core values. Based on evidence-based values
 * clarification exercises from ACT (Acceptance and Commitment Therapy).
 *
 * Perfect for: self-discovery, decision-making clarity, life direction
 */
import type { TextGameResult } from './text-game-types.js';
export interface ValueCard {
    id: string;
    name: string;
    description: string;
    category: 'relationships' | 'achievement' | 'growth' | 'wellbeing' | 'meaning' | 'pleasure';
}
export interface ValuesCardSortState {
    /** Current phase of the game */
    phase: 'intro' | 'sorting' | 'narrowing' | 'ranking' | 'reflection' | 'complete';
    /** All cards in the deck */
    deck: ValueCard[];
    /** Cards sorted as "important" */
    importantPile: ValueCard[];
    /** Cards sorted as "not as important" */
    notAsPile: ValueCard[];
    /** Final top 5 values */
    topFive: ValueCard[];
    /** Current card being considered */
    currentCard: ValueCard | null;
    /** Index in the deck */
    deckIndex: number;
    /** Comparison pairs for ranking */
    comparisonPair?: [ValueCard, ValueCard];
    /** Notes/reflections captured */
    reflections: string[];
}
export interface ValuesCardSortResult extends TextGameResult {
    newState: ValuesCardSortState;
}
export declare function createInitialState(): ValuesCardSortState;
export declare function processInput(state: ValuesCardSortState, input: string): ValuesCardSortResult;
/**
 * Describe the current game state for voice
 */
export declare function describeStateForVoice(state: ValuesCardSortState): string;
/**
 * Get the game start result
 */
export declare function getStartResult(state: ValuesCardSortState): ValuesCardSortResult;
/**
 * Get the user's final top 5 values (for saving)
 */
export declare function getTopFiveValues(state: ValuesCardSortState): ValueCard[];
//# sourceMappingURL=values-card-sort.d.ts.map