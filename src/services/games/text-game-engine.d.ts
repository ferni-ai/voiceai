/**
 * 🎲 Text Game Engine
 *
 * Engine for text-based/board games (tic-tac-toe, etc.)
 * Simpler than the music game engine - no audio playback needed.
 */
import type { TextGameEngineContract, TextGameResult, TextGameState, TextGameType } from './text-game-types.js';
export declare class TextGameEngine implements TextGameEngineContract {
    private state;
    private personaId;
    constructor(personaId?: string);
    private createInitialState;
    getState(): TextGameState;
    startGame(gameType: TextGameType, config?: Record<string, unknown>): Promise<TextGameResult>;
    makeMove(input: string): Promise<TextGameResult>;
    describeState(): string;
    endGame(): void;
    isGameActive(): boolean;
    getCurrentGameType(): TextGameType | null;
    setPersonaId(personaId: string): void;
    private startTicTacToe;
    private handleTicTacToeMove;
    private startTwentyQuestions;
    private handleTwentyQuestionsMove;
    private startWordAssociation;
    private handleWordAssociationMove;
    private startWouldYouRather;
    private handleWouldYouRatherMove;
    private startStoryBuilder;
    private handleStoryBuilderMove;
    private startThreeWordDay;
    private handleThreeWordDayMove;
    private startValuesCardSort;
    private handleValuesCardSortMove;
    private startHeadlineWriter;
    private handleHeadlineWriterMove;
    private startEmojiStory;
    private handleEmojiStoryMove;
    private startOneWordCheckin;
    private handleOneWordCheckinMove;
    private startTinyWinTracker;
    private handleTinyWinTrackerMove;
    private startFortuneCookie;
    private handleFortuneCookieMove;
}
/**
 * Get or create a TextGameEngine for a specific session.
 * This prevents persona/state mixing between concurrent sessions.
 *
 * @param sessionId - The session ID (required for proper isolation)
 * @param personaId - Optional persona ID for the engine
 */
export declare function getSessionTextGameEngine(sessionId: string, personaId?: string): TextGameEngine;
/**
 * Reset and remove a session's TextGameEngine.
 * Call this when a session ends to prevent memory leaks.
 */
export declare function resetSessionTextGameEngine(sessionId: string): void;
/**
 * Get count of active session text game engines (for monitoring).
 */
export declare function getActiveTextGameEngineCount(): number;
/**
 * Reset all text game engines (for testing only).
 */
export declare function resetAllTextGameEngines(): void;
/**
 * @deprecated Use getSessionTextGameEngine(sessionId) instead to prevent state mixing.
 */
export declare function getTextGameEngine(personaId?: string): TextGameEngine;
/**
 * @deprecated Use resetSessionTextGameEngine(sessionId) instead.
 */
export declare function resetTextGameEngine(): void;
//# sourceMappingURL=text-game-engine.d.ts.map