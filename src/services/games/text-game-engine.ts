/**
 * 🎲 Text Game Engine
 *
 * Engine for text-based/board games (tic-tac-toe, etc.)
 * Simpler than the music game engine - no audio playback needed.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  TextGameEngineContract,
  TextGameResult,
  TextGameState,
  TextGameType,
  TicTacToeState,
} from './text-game-types.js';
import {
  createInitialState as createTicTacToeState,
  describeBoardForVoice,
  getAIMove,
  getGameMessage,
  makeMove,
  processUserMove as processTicTacToeMove,
} from './tic-tac-toe.js';

const log = getLogger();

// ============================================================================
// TEXT GAME ENGINE
// ============================================================================

export class TextGameEngine implements TextGameEngineContract {
  private state: TextGameState;
  private personaId: string;

  constructor(personaId = 'ferni') {
    this.personaId = personaId;
    this.state = this.createInitialState();
  }

  private createInitialState(): TextGameState {
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

  getState(): TextGameState {
    return { ...this.state };
  }

  async startGame(
    gameType: TextGameType,
    config?: Record<string, unknown>
  ): Promise<TextGameResult> {
    // End any existing game
    if (this.state.status === 'active') {
      this.endGame();
    }

    log.info({ gameType, personaId: this.personaId }, '🎲 Starting text game');

    switch (gameType) {
      case 'tic-tac-toe':
        return Promise.resolve(this.startTicTacToe(config));

      case '20-questions':
      case 'word-association':
      case 'would-you-rather':
      case 'story-builder':
        // Placeholder for future games
        return Promise.resolve({
          message: `${gameType} is coming soon! For now, let's play tic-tac-toe. Say "tic tac toe" to start!`,
          gameOver: false,
        });

      default:
        return Promise.resolve({
          message: 'I don\'t know that game. Try "tic-tac-toe"!',
          gameOver: false,
        });
    }
  }

  async makeMove(input: string): Promise<TextGameResult> {
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

      default:
        return Promise.resolve({
          message: "Something went wrong. Let's start a new game.",
          gameOver: true,
        });
    }
  }

  describeState(): string {
    if (this.state.status !== 'active' || !this.state.gameType) {
      return 'No game is active right now.';
    }

    switch (this.state.gameType) {
      case 'tic-tac-toe': {
        const ticTacToeState = this.state.gameData as TicTacToeState;
        return describeBoardForVoice(ticTacToeState);
      }

      default:
        return 'Game state unavailable.';
    }
  }

  endGame(): void {
    log.info({ gameType: this.state.gameType }, '🎲 Text game ended');
    this.state = this.createInitialState();
  }

  isGameActive(): boolean {
    return this.state.status === 'active';
  }

  getCurrentGameType(): TextGameType | null {
    return this.state.gameType;
  }

  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  // ============================================================================
  // TIC-TAC-TOE IMPLEMENTATION
  // ============================================================================

  private startTicTacToe(config?: Record<string, unknown>): TextGameResult {
    const userGoesFirst = config?.userGoesFirst !== false;
    const difficulty = (config?.difficulty as 'easy' | 'medium' | 'hard') || 'medium';

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

  private handleTicTacToeMove(input: string): TextGameResult {
    const currentState = this.state.gameData as TicTacToeState;
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
}

// ============================================================================
// SINGLETON
// ============================================================================

let textGameEngineInstance: TextGameEngine | null = null;

export function getTextGameEngine(personaId?: string): TextGameEngine {
  if (!textGameEngineInstance) {
    textGameEngineInstance = new TextGameEngine(personaId);
  } else if (personaId) {
    textGameEngineInstance.setPersonaId(personaId);
  }
  return textGameEngineInstance;
}

export function resetTextGameEngine(): void {
  if (textGameEngineInstance?.isGameActive()) {
    textGameEngineInstance.endGame();
  }
  textGameEngineInstance = null;
}
