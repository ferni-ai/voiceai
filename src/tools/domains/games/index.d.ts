/**
 * Games Domain Tools
 *
 * Interactive games for engaging conversations.
 *
 * DOMAIN: games
 * TOOLS:
 *   Music Games: startGame, submitAnswer, getHint, skipRound, endGame
 *   Text Games: startTextGame, makeTextGameMove, getTextGameBoard, endTextGame
 *   Game Info: getGameStatus, getGameHistory, suggestGame
 *
 * AVAILABLE MUSIC GAMES:
 *   - Name That Tune: Play a clip, guess the song
 *   - One Word Song: Say a word, find a song with it
 *   - Desert Island Discs: Pick 5 songs for an island
 *   - This or That: Choose between two songs
 *   - Mood DJ Challenge: Describe mood, agent picks song
 *
 * AVAILABLE TEXT GAMES:
 *   - Tic-Tac-Toe: Classic 3x3 grid game
 *   - (More coming: 20 Questions, Word Association, Would You Rather)
 */
import type { ToolDefinition } from '../../registry/types.js';
declare function createGameToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { createGameToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map