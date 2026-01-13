/**
 * 🎲 Text Game Engine
 *
 * Engine for text-based/board games (tic-tac-toe, etc.)
 * Simpler than the music game engine - no audio playback needed.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { createInitialState as createTicTacToeState, describeBoardForVoice, getAIMove, getGameMessage, makeMove, processUserMove as processTicTacToeMove, } from './tic-tac-toe.js';
import { createInitialState as createTwentyQuestionsState, processInput as processTwentyQuestionsInput, describeStateForVoice as describeTwentyQuestionsState, getStartResult as getTwentyQuestionsStart, } from './twenty-questions.js';
import { createInitialState as createWordAssociationState, processInput as processWordAssociationInput, describeStateForVoice as describeWordAssociationState, getStartResult as getWordAssociationStart, } from './word-association.js';
import { createInitialState as createWouldYouRatherState, processInput as processWouldYouRatherInput, describeStateForVoice as describeWouldYouRatherState, getStartResult as getWouldYouRatherStart, } from './would-you-rather.js';
import { createInitialState as createStoryBuilderState, processInput as processStoryBuilderInput, describeStateForVoice as describeStoryBuilderState, getStartResult as getStoryBuilderStart, } from './story-builder.js';
import { createInitialState as createThreeWordDayState, processInput as processThreeWordDayInput, describeStateForVoice as describeThreeWordDayState, getStartResult as getThreeWordDayStart, } from './three-word-day.js';
import { createInitialState as createValuesCardSortState, processInput as processValuesCardSortInput, describeStateForVoice as describeValuesCardSortState, getStartResult as getValuesCardSortStart, } from './values-card-sort.js';
import { createInitialState as createHeadlineWriterState, processInput as processHeadlineWriterInput, describeStateForVoice as describeHeadlineWriterState, getStartResult as getHeadlineWriterStart, } from './headline-writer.js';
import { createInitialState as createEmojiStoryState, processInput as processEmojiStoryInput, describeStateForVoice as describeEmojiStoryState, getStartResult as getEmojiStoryStart, } from './emoji-story.js';
import { createInitialState as createOneWordCheckinState, processInput as processOneWordCheckinInput, describeStateForVoice as describeOneWordCheckinState, getStartResult as getOneWordCheckinStart, } from './one-word-checkin.js';
import { createInitialState as createTinyWinTrackerState, processInput as processTinyWinTrackerInput, describeStateForVoice as describeTinyWinTrackerState, getStartResult as getTinyWinTrackerStart, } from './tiny-win-tracker.js';
import { createInitialState as createFortuneCookieState, processInput as processFortuneCookieInput, describeStateForVoice as describeFortuneCookieState, getStartResult as getFortuneCookieStart, } from './fortune-cookie.js';
const log = getLogger();
// ============================================================================
// TEXT GAME ENGINE
// ============================================================================
export class TextGameEngine {
    state;
    personaId;
    constructor(personaId = 'ferni') {
        this.personaId = personaId;
        this.state = this.createInitialState();
    }
    createInitialState() {
        return {
            gameType: null,
            status: 'idle',
            startedAt: null,
            lastActivityAt: Date.now(),
            gameData: {},
        };
    }
    // ============================================================================
    // PUBLIC INTERFACE
    // ============================================================================
    getState() {
        return { ...this.state };
    }
    async startGame(gameType, config) {
        // End any existing game
        if (this.state.status === 'active') {
            this.endGame();
        }
        log.info({ gameType, personaId: this.personaId }, '🎲 Starting text game');
        switch (gameType) {
            case 'tic-tac-toe':
                return Promise.resolve(this.startTicTacToe(config));
            case '20-questions':
                return Promise.resolve(this.startTwentyQuestions(config));
            case 'word-association':
                return Promise.resolve(this.startWordAssociation());
            case 'would-you-rather':
                return Promise.resolve(this.startWouldYouRather(config));
            case 'story-builder':
                return Promise.resolve(this.startStoryBuilder(config));
            case 'three-word-day':
                return Promise.resolve(this.startThreeWordDay(config));
            case 'values-card-sort':
                return Promise.resolve(this.startValuesCardSort());
            case 'headline-writer':
                return Promise.resolve(this.startHeadlineWriter(config));
            case 'emoji-story':
                return Promise.resolve(this.startEmojiStory(config));
            case 'one-word-checkin':
                return Promise.resolve(this.startOneWordCheckin(config));
            case 'tiny-win-tracker':
                return Promise.resolve(this.startTinyWinTracker());
            case 'fortune-cookie':
                return Promise.resolve(this.startFortuneCookie());
            default:
                return Promise.resolve({
                    message: 'I don\'t know that game. Try "tic-tac-toe", "three word day", "values card sort", or any of our reflection games!',
                    gameOver: false,
                });
        }
    }
    async makeMove(input) {
        if (this.state.status !== 'active' || !this.state.gameType) {
            return Promise.resolve({
                message: "We're not playing a game right now. Want to play tic-tac-toe?",
                gameOver: false,
            });
        }
        this.state.lastActivityAt = Date.now();
        switch (this.state.gameType) {
            case 'tic-tac-toe':
                return Promise.resolve(this.handleTicTacToeMove(input));
            case '20-questions':
                return Promise.resolve(this.handleTwentyQuestionsMove(input));
            case 'word-association':
                return Promise.resolve(this.handleWordAssociationMove(input));
            case 'would-you-rather':
                return Promise.resolve(this.handleWouldYouRatherMove(input));
            case 'story-builder':
                return Promise.resolve(this.handleStoryBuilderMove(input));
            case 'three-word-day':
                return Promise.resolve(this.handleThreeWordDayMove(input));
            case 'values-card-sort':
                return Promise.resolve(this.handleValuesCardSortMove(input));
            case 'headline-writer':
                return Promise.resolve(this.handleHeadlineWriterMove(input));
            case 'emoji-story':
                return Promise.resolve(this.handleEmojiStoryMove(input));
            case 'one-word-checkin':
                return Promise.resolve(this.handleOneWordCheckinMove(input));
            case 'tiny-win-tracker':
                return Promise.resolve(this.handleTinyWinTrackerMove(input));
            case 'fortune-cookie':
                return Promise.resolve(this.handleFortuneCookieMove(input));
            default:
                return Promise.resolve({
                    message: "Something went wrong. Let's start a new game.",
                    gameOver: true,
                });
        }
    }
    describeState() {
        if (this.state.status !== 'active' || !this.state.gameType) {
            return 'No game is active right now.';
        }
        switch (this.state.gameType) {
            case 'tic-tac-toe': {
                const ticTacToeState = this.state.gameData;
                return describeBoardForVoice(ticTacToeState);
            }
            case '20-questions': {
                const twentyQuestionsState = this.state.gameData;
                return describeTwentyQuestionsState(twentyQuestionsState);
            }
            case 'word-association': {
                const wordAssociationState = this.state.gameData;
                return describeWordAssociationState(wordAssociationState);
            }
            case 'would-you-rather': {
                const wouldYouRatherState = this.state.gameData;
                return describeWouldYouRatherState(wouldYouRatherState);
            }
            case 'story-builder': {
                const storyBuilderState = this.state.gameData;
                return describeStoryBuilderState(storyBuilderState);
            }
            case 'three-word-day': {
                const threeWordDayState = this.state.gameData;
                return describeThreeWordDayState(threeWordDayState);
            }
            case 'values-card-sort': {
                const valuesCardSortState = this.state.gameData;
                return describeValuesCardSortState(valuesCardSortState);
            }
            case 'headline-writer': {
                const headlineWriterState = this.state.gameData;
                return describeHeadlineWriterState(headlineWriterState);
            }
            case 'emoji-story': {
                const emojiStoryState = this.state.gameData;
                return describeEmojiStoryState(emojiStoryState);
            }
            case 'one-word-checkin': {
                const oneWordCheckinState = this.state.gameData;
                return describeOneWordCheckinState(oneWordCheckinState);
            }
            case 'tiny-win-tracker': {
                const tinyWinTrackerState = this.state.gameData;
                return describeTinyWinTrackerState(tinyWinTrackerState);
            }
            case 'fortune-cookie': {
                const fortuneCookieState = this.state.gameData;
                return describeFortuneCookieState(fortuneCookieState);
            }
            default:
                return 'Game state unavailable.';
        }
    }
    endGame() {
        log.info({ gameType: this.state.gameType }, '🎲 Text game ended');
        this.state = this.createInitialState();
    }
    isGameActive() {
        return this.state.status === 'active';
    }
    getCurrentGameType() {
        return this.state.gameType;
    }
    setPersonaId(personaId) {
        this.personaId = personaId;
    }
    // ============================================================================
    // TIC-TAC-TOE IMPLEMENTATION
    // ============================================================================
    startTicTacToe(config) {
        const userGoesFirst = config?.userGoesFirst !== false;
        const difficulty = config?.difficulty || 'medium';
        const gameData = createTicTacToeState(userGoesFirst, difficulty);
        this.state = {
            gameType: 'tic-tac-toe',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        // If AI goes first, make the first move
        if (!userGoesFirst) {
            const aiPosition = getAIMove(gameData);
            const newGameData = makeMove(gameData, aiPosition, gameData.aiSymbol);
            this.state.gameData = newGameData;
            return {
                message: getGameMessage(gameData, 'start'),
                boardDescription: describeBoardForVoice(newGameData),
                gameOver: false,
            };
        }
        return {
            message: getGameMessage(gameData, 'start'),
            boardDescription: describeBoardForVoice(gameData),
            gameOver: false,
        };
    }
    handleTicTacToeMove(input) {
        const currentState = this.state.gameData;
        const result = processTicTacToeMove(currentState, input);
        // Update state with the new board
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        // Return without the newState property (internal detail)
        return {
            message: result.message,
            boardDescription: result.boardDescription,
            gameOver: result.gameOver,
            winner: result.winner,
            aiShouldMove: result.aiShouldMove,
        };
    }
    // ============================================================================
    // 20 QUESTIONS IMPLEMENTATION
    // ============================================================================
    startTwentyQuestions(config) {
        const category = config?.category;
        const gameData = createTwentyQuestionsState(category);
        this.state = {
            gameType: '20-questions',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getTwentyQuestionsStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleTwentyQuestionsMove(input) {
        const currentState = this.state.gameData;
        const result = processTwentyQuestionsInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
            winner: result.winner,
        };
    }
    // ============================================================================
    // WORD ASSOCIATION IMPLEMENTATION
    // ============================================================================
    startWordAssociation() {
        const gameData = createWordAssociationState();
        this.state = {
            gameType: 'word-association',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getWordAssociationStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleWordAssociationMove(input) {
        const currentState = this.state.gameData;
        const result = processWordAssociationInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
            winner: result.winner,
        };
    }
    // ============================================================================
    // WOULD YOU RATHER IMPLEMENTATION
    // ============================================================================
    startWouldYouRather(config) {
        const category = config?.category;
        const gameData = createWouldYouRatherState(category);
        this.state = {
            gameType: 'would-you-rather',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getWouldYouRatherStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleWouldYouRatherMove(input) {
        const currentState = this.state.gameData;
        const result = processWouldYouRatherInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
            winner: result.winner,
        };
    }
    // ============================================================================
    // STORY BUILDER IMPLEMENTATION
    // ============================================================================
    startStoryBuilder(config) {
        const genre = config?.genre;
        const gameData = createStoryBuilderState(genre);
        this.state = {
            gameType: 'story-builder',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getStoryBuilderStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleStoryBuilderMove(input) {
        const currentState = this.state.gameData;
        const result = processStoryBuilderInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
            winner: result.winner,
        };
    }
    // ============================================================================
    // THREE WORD DAY IMPLEMENTATION
    // ============================================================================
    startThreeWordDay(config) {
        const promptType = config?.promptType;
        const customPrompt = config?.customPrompt;
        const gameData = createThreeWordDayState(promptType, customPrompt);
        this.state = {
            gameType: 'three-word-day',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getThreeWordDayStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleThreeWordDayMove(input) {
        const currentState = this.state.gameData;
        const result = processThreeWordDayInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
    // ============================================================================
    // VALUES CARD SORT IMPLEMENTATION
    // ============================================================================
    startValuesCardSort() {
        const gameData = createValuesCardSortState();
        this.state = {
            gameType: 'values-card-sort',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getValuesCardSortStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleValuesCardSortMove(input) {
        const currentState = this.state.gameData;
        const result = processValuesCardSortInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
    // ============================================================================
    // HEADLINE WRITER IMPLEMENTATION
    // ============================================================================
    startHeadlineWriter(config) {
        const timeframe = config?.timeframe;
        const gameData = createHeadlineWriterState(timeframe);
        this.state = {
            gameType: 'headline-writer',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getHeadlineWriterStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleHeadlineWriterMove(input) {
        const currentState = this.state.gameData;
        const result = processHeadlineWriterInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
    // ============================================================================
    // EMOJI STORY IMPLEMENTATION
    // ============================================================================
    startEmojiStory(config) {
        const topic = config?.topic;
        const gameData = createEmojiStoryState(topic);
        this.state = {
            gameType: 'emoji-story',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getEmojiStoryStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleEmojiStoryMove(input) {
        const currentState = this.state.gameData;
        const result = processEmojiStoryInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
    // ============================================================================
    // ONE WORD CHECK-IN IMPLEMENTATION
    // ============================================================================
    startOneWordCheckin(config) {
        const context = config?.context;
        const gameData = createOneWordCheckinState(context);
        this.state = {
            gameType: 'one-word-checkin',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getOneWordCheckinStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleOneWordCheckinMove(input) {
        const currentState = this.state.gameData;
        const result = processOneWordCheckinInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
    // ============================================================================
    // TINY WIN TRACKER IMPLEMENTATION
    // ============================================================================
    startTinyWinTracker() {
        const gameData = createTinyWinTrackerState();
        this.state = {
            gameType: 'tiny-win-tracker',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getTinyWinTrackerStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleTinyWinTrackerMove(input) {
        const currentState = this.state.gameData;
        const result = processTinyWinTrackerInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
    // ============================================================================
    // FORTUNE COOKIE IMPLEMENTATION
    // ============================================================================
    startFortuneCookie() {
        const gameData = createFortuneCookieState();
        this.state = {
            gameType: 'fortune-cookie',
            status: 'active',
            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            gameData,
        };
        const startResult = getFortuneCookieStart(gameData);
        return {
            message: startResult.message,
            gameOver: startResult.gameOver,
        };
    }
    handleFortuneCookieMove(input) {
        const currentState = this.state.gameData;
        const result = processFortuneCookieInput(currentState, input);
        this.state.gameData = result.newState;
        if (result.gameOver) {
            this.state.status = 'completed';
        }
        return {
            message: result.message,
            gameOver: result.gameOver,
        };
    }
}
// ============================================================================
// SESSION-SCOPED INSTANCES
// ============================================================================
/**
 * Session-scoped text game engines to prevent state mixing between concurrent sessions.
 * Each session gets its own TextGameEngine instance.
 */
const sessionTextGameEngines = new Map();
/**
 * Get or create a TextGameEngine for a specific session.
 * This prevents persona/state mixing between concurrent sessions.
 *
 * @param sessionId - The session ID (required for proper isolation)
 * @param personaId - Optional persona ID for the engine
 */
export function getSessionTextGameEngine(sessionId, personaId) {
    let engine = sessionTextGameEngines.get(sessionId);
    if (!engine) {
        engine = new TextGameEngine(personaId);
        sessionTextGameEngines.set(sessionId, engine);
    }
    else if (personaId) {
        engine.setPersonaId(personaId);
    }
    return engine;
}
/**
 * Reset and remove a session's TextGameEngine.
 * Call this when a session ends to prevent memory leaks.
 */
export function resetSessionTextGameEngine(sessionId) {
    const engine = sessionTextGameEngines.get(sessionId);
    if (engine) {
        if (engine.isGameActive()) {
            engine.endGame();
        }
        sessionTextGameEngines.delete(sessionId);
    }
}
/**
 * Get count of active session text game engines (for monitoring).
 */
export function getActiveTextGameEngineCount() {
    return sessionTextGameEngines.size;
}
/**
 * Reset all text game engines (for testing only).
 */
export function resetAllTextGameEngines() {
    for (const [sessionId, engine] of sessionTextGameEngines) {
        if (engine.isGameActive()) {
            engine.endGame();
        }
    }
    sessionTextGameEngines.clear();
}
// ============================================================================
// LEGACY SINGLETON (DEPRECATED)
// ============================================================================
let textGameEngineInstance = null;
/**
 * @deprecated Use getSessionTextGameEngine(sessionId) instead to prevent state mixing.
 */
export function getTextGameEngine(personaId) {
    if (!textGameEngineInstance) {
        textGameEngineInstance = new TextGameEngine(personaId);
    }
    else if (personaId) {
        textGameEngineInstance.setPersonaId(personaId);
    }
    return textGameEngineInstance;
}
/**
 * @deprecated Use resetSessionTextGameEngine(sessionId) instead.
 */
export function resetTextGameEngine() {
    if (textGameEngineInstance?.isGameActive()) {
        textGameEngineInstance.endGame();
    }
    textGameEngineInstance = null;
}
//# sourceMappingURL=text-game-engine.js.map