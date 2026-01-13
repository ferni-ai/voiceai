/**
 * 🎮 Tic-Tac-Toe Implementation
 *
 * Classic 3x3 tic-tac-toe with AI opponent.
 * Optimized for voice interaction with natural position descriptions.
 *
 * Board layout (numbered 1-9 for voice):
 * ```
 *  1 | 2 | 3
 * -----------
 *  4 | 5 | 6
 * -----------
 *  7 | 8 | 9
 * ```
 *
 * Voice commands supported:
 * - Numbers: "1", "5", "9"
 * - Positions: "top left", "center", "bottom right"
 * - Descriptions: "the middle", "upper right corner"
 */
// ============================================================================
// CONSTANTS
// ============================================================================
const WINNING_COMBINATIONS = [
    [0, 1, 2], // Top row
    [3, 4, 5], // Middle row
    [6, 7, 8], // Bottom row
    [0, 3, 6], // Left column
    [1, 4, 7], // Center column
    [2, 5, 8], // Right column
    [0, 4, 8], // Diagonal top-left to bottom-right
    [2, 4, 6], // Diagonal top-right to bottom-left
];
const POSITION_NAMES = [
    'top left',
    'top center',
    'top right',
    'middle left',
    'center',
    'middle right',
    'bottom left',
    'bottom center',
    'bottom right',
];
// ============================================================================
// GAME CREATION
// ============================================================================
export function createInitialState(userGoesFirst = true, difficulty = 'medium') {
    const userSymbol = userGoesFirst ? 'X' : 'O';
    const aiSymbol = userGoesFirst ? 'O' : 'X';
    return {
        board: {
            cells: [null, null, null, null, null, null, null, null, null],
        },
        currentPlayer: 'X', // X always goes first
        userSymbol,
        aiSymbol,
        winner: null,
        moveHistory: [],
        difficulty,
    };
}
// ============================================================================
// MOVE PARSING (Voice-friendly)
// ============================================================================
/**
 * Parse a voice command into a board position (0-8)
 */
export function parsePosition(input) {
    const normalized = input.toLowerCase().trim();
    // Import position map from types
    const positionMap = {
        // Numbered positions (1-9)
        '1': 0,
        '2': 1,
        '3': 2,
        '4': 3,
        '5': 4,
        '6': 5,
        '7': 6,
        '8': 7,
        '9': 8,
        one: 0,
        two: 1,
        three: 2,
        four: 3,
        five: 4,
        six: 5,
        seven: 6,
        eight: 7,
        nine: 8,
        // Descriptive positions
        'top left': 0,
        'top-left': 0,
        'upper left': 0,
        'top left corner': 0,
        'top center': 1,
        'top-center': 1,
        'top middle': 1,
        top: 1,
        'top right': 2,
        'top-right': 2,
        'upper right': 2,
        'top right corner': 2,
        'middle left': 3,
        'middle-left': 3,
        'center left': 3,
        left: 3,
        center: 4,
        middle: 4,
        'the middle': 4,
        'the center': 4,
        'middle right': 5,
        'middle-right': 5,
        'center right': 5,
        right: 5,
        'bottom left': 6,
        'bottom-left': 6,
        'lower left': 6,
        'bottom left corner': 6,
        'bottom center': 7,
        'bottom-center': 7,
        'bottom middle': 7,
        bottom: 7,
        'bottom right': 8,
        'bottom-right': 8,
        'lower right': 8,
        'bottom right corner': 8,
    };
    // Direct lookup
    if (normalized in positionMap) {
        return positionMap[normalized];
    }
    // Try to find partial match
    for (const [key, value] of Object.entries(positionMap)) {
        if (normalized.includes(key)) {
            return value;
        }
    }
    // Try to extract a single digit
    const digitMatch = normalized.match(/\d/);
    if (digitMatch) {
        const num = parseInt(digitMatch[0], 10);
        if (num >= 1 && num <= 9) {
            return num - 1;
        }
    }
    return null;
}
// ============================================================================
// GAME LOGIC
// ============================================================================
/**
 * Check if a position is valid (empty)
 */
export function isValidMove(state, position) {
    return position >= 0 && position < 9 && state.board.cells[position] === null;
}
/**
 * Make a move on the board
 */
export function makeMove(state, position, player) {
    if (!isValidMove(state, position)) {
        return state;
    }
    const newCells = [...state.board.cells];
    newCells[position] = player;
    const newState = {
        ...state,
        board: { cells: newCells },
        currentPlayer: player === 'X' ? 'O' : 'X',
        moveHistory: [...state.moveHistory, position],
    };
    // Check for winner
    const winner = checkWinner(newState.board);
    if (winner) {
        newState.winner = winner;
    }
    else if (isBoardFull(newState.board)) {
        newState.winner = 'draw';
    }
    return newState;
}
/**
 * Check for a winner
 */
export function checkWinner(board) {
    for (const [a, b, c] of WINNING_COMBINATIONS) {
        if (board.cells[a] && board.cells[a] === board.cells[b] && board.cells[a] === board.cells[c]) {
            return board.cells[a];
        }
    }
    return null;
}
/**
 * Check if board is full
 */
export function isBoardFull(board) {
    return board.cells.every((cell) => cell !== null);
}
/**
 * Get empty positions
 */
export function getEmptyPositions(board) {
    return board.cells
        .map((cell, index) => (cell === null ? index : -1))
        .filter((index) => index !== -1);
}
// ============================================================================
// AI OPPONENT
// ============================================================================
/**
 * Get AI's move based on difficulty
 */
export function getAIMove(state) {
    const emptyPositions = getEmptyPositions(state.board);
    if (emptyPositions.length === 0) {
        return -1;
    }
    switch (state.difficulty) {
        case 'easy':
            return getRandomMove(emptyPositions);
        case 'medium':
            // 50% optimal, 50% random
            return Math.random() < 0.5 ? getOptimalMove(state) : getRandomMove(emptyPositions);
        case 'hard':
            return getOptimalMove(state);
        default:
            return getOptimalMove(state);
    }
}
function getRandomMove(emptyPositions) {
    return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
}
/**
 * Minimax algorithm for optimal play
 */
function getOptimalMove(state) {
    const emptyPositions = getEmptyPositions(state.board);
    // First move optimization
    if (emptyPositions.length === 9) {
        // Take center or corner
        return Math.random() < 0.5 ? 4 : [0, 2, 6, 8][Math.floor(Math.random() * 4)];
    }
    if (emptyPositions.length === 8 && state.board.cells[4] === null) {
        // If center is open, take it
        return 4;
    }
    let bestScore = -Infinity;
    let bestMove = emptyPositions[0];
    for (const position of emptyPositions) {
        const newState = makeMove(state, position, state.aiSymbol);
        const score = minimax(newState, 0, false, state.userSymbol, state.aiSymbol);
        if (score > bestScore) {
            bestScore = score;
            bestMove = position;
        }
    }
    return bestMove;
}
function minimax(state, depth, isMaximizing, userSymbol, aiSymbol) {
    const winner = checkWinner(state.board);
    if (winner === aiSymbol)
        return 10 - depth;
    if (winner === userSymbol)
        return depth - 10;
    if (isBoardFull(state.board))
        return 0;
    const emptyPositions = getEmptyPositions(state.board);
    if (isMaximizing) {
        let bestScore = -Infinity;
        for (const position of emptyPositions) {
            const newState = makeMove(state, position, aiSymbol);
            const score = minimax(newState, depth + 1, false, userSymbol, aiSymbol);
            bestScore = Math.max(score, bestScore);
        }
        return bestScore;
    }
    else {
        let bestScore = Infinity;
        for (const position of emptyPositions) {
            const newState = makeMove(state, position, userSymbol);
            const score = minimax(newState, depth + 1, true, userSymbol, aiSymbol);
            bestScore = Math.min(score, bestScore);
        }
        return bestScore;
    }
}
// ============================================================================
// VOICE-FRIENDLY DESCRIPTIONS
// ============================================================================
/**
 * Describe the board in a speakable format
 */
export function describeBoardForVoice(state) {
    const { cells } = state.board;
    // Describe each row
    const describeCell = (cell) => {
        if (cell === null)
            return 'empty';
        return cell;
    };
    const topRow = `Top row: ${describeCell(cells[0])}, ${describeCell(cells[1])}, ${describeCell(cells[2])}`;
    const midRow = `Middle row: ${describeCell(cells[3])}, ${describeCell(cells[4])}, ${describeCell(cells[5])}`;
    const botRow = `Bottom row: ${describeCell(cells[6])}, ${describeCell(cells[7])}, ${describeCell(cells[8])}`;
    return `${topRow}. ${midRow}. ${botRow}`;
}
/**
 * Describe a single move
 */
export function describeMoveForVoice(position, player) {
    return `${player} in ${POSITION_NAMES[position]}`;
}
/**
 * Get available positions as speakable list
 */
export function describeAvailablePositions(state) {
    const empty = getEmptyPositions(state.board);
    if (empty.length === 0)
        return 'No positions available';
    if (empty.length === 9)
        return 'All positions are open';
    const positions = empty.map((i) => POSITION_NAMES[i]);
    if (positions.length === 1)
        return `Only ${positions[0]} is open`;
    if (positions.length === 2)
        return `${positions[0]} and ${positions[1]} are open`;
    const last = positions.pop();
    return `${positions.join(', ')}, and ${last} are open`;
}
/**
 * Generate a fun, conversational response for game events
 */
export function getGameMessage(state, event, position) {
    const userIsX = state.userSymbol === 'X';
    switch (event) {
        case 'start': {
            if (userIsX) {
                return 'Alright, let\'s play tic-tac-toe! You\'re X, so you go first. The board is numbered 1 through 9, starting top-left. Say a number or position like "center" or "top right".';
            }
            else {
                return "Let's play! I'll be X and go first. You're O. I'll put my X in the center. Your turn - say a position like \"top left\" or just a number 1 through 9.";
            }
        }
        case 'user_move': {
            const userPosName = position !== undefined ? POSITION_NAMES[position] : 'there';
            const responses = [
                `Nice! ${state.userSymbol} in ${userPosName}.`,
                `Got it, ${userPosName}.`,
                `${userPosName}. Good choice.`,
                `${state.userSymbol} goes to ${userPosName}.`,
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        case 'ai_move': {
            const aiPosName = position !== undefined ? POSITION_NAMES[position] : 'there';
            const aiResponses = [
                `I'll take ${aiPosName}.`,
                `Hmm... I'll go ${aiPosName}.`,
                `${aiPosName} for me.`,
                `I'm putting my ${state.aiSymbol} in ${aiPosName}.`,
            ];
            return aiResponses[Math.floor(Math.random() * aiResponses.length)];
        }
        case 'invalid_move':
            return `That spot's already taken! ${describeAvailablePositions(state)}`;
        case 'user_wins': {
            const winResponses = [
                'You got me! Three in a row. Well played!',
                'Nicely done! You win this one.',
                "And that's a win for you! Good game.",
                'You beat me! Rematch?',
            ];
            return winResponses[Math.floor(Math.random() * winResponses.length)];
        }
        case 'ai_wins': {
            const loseResponses = [
                'Three in a row! I got lucky. Want to play again?',
                "That's a win for me. Good game though!",
                'I won this time. Best two out of three?',
            ];
            return loseResponses[Math.floor(Math.random() * loseResponses.length)];
        }
        case 'draw': {
            const drawResponses = [
                "It's a draw! Classic tic-tac-toe ending. Another round?",
                "Cat's game! Nobody wins. Want to try again?",
                "A tie! We're evenly matched. Rematch?",
            ];
            return drawResponses[Math.floor(Math.random() * drawResponses.length)];
        }
        default:
            return 'Your turn!';
    }
}
/**
 * Process a user's move and return the result with updated state
 */
export function processUserMove(state, input) {
    const position = parsePosition(input);
    if (position === null) {
        return {
            message: `I didn't understand that position. Try saying a number 1-9, or something like "top left", "center", or "bottom right". ${describeAvailablePositions(state)}`,
            boardDescription: describeBoardForVoice(state),
            gameOver: false,
            newState: state,
        };
    }
    if (!isValidMove(state, position)) {
        return {
            message: getGameMessage(state, 'invalid_move'),
            boardDescription: describeBoardForVoice(state),
            gameOver: false,
            newState: state,
        };
    }
    // Make user's move
    let newState = makeMove(state, position, state.userSymbol);
    let message = getGameMessage(newState, 'user_move', position);
    // Check if user won
    if (newState.winner === state.userSymbol) {
        return {
            message: getGameMessage(newState, 'user_wins'),
            boardDescription: describeBoardForVoice(newState),
            gameOver: true,
            winner: 'user',
            newState,
        };
    }
    // Check for draw
    if (newState.winner === 'draw') {
        return {
            message: getGameMessage(newState, 'draw'),
            boardDescription: describeBoardForVoice(newState),
            gameOver: true,
            winner: 'draw',
            newState,
        };
    }
    // AI makes its move
    const aiPosition = getAIMove(newState);
    newState = makeMove(newState, aiPosition, newState.aiSymbol);
    message = `${message} ${getGameMessage(newState, 'ai_move', aiPosition)}`;
    // Check if AI won
    if (newState.winner === state.aiSymbol) {
        return {
            message: `${message} ${getGameMessage(newState, 'ai_wins')}`,
            boardDescription: describeBoardForVoice(newState),
            gameOver: true,
            winner: 'ai',
            newState,
        };
    }
    // Check for draw after AI move
    if (newState.winner === 'draw') {
        return {
            message: `${message} ${getGameMessage(newState, 'draw')}`,
            boardDescription: describeBoardForVoice(newState),
            gameOver: true,
            winner: 'draw',
            newState,
        };
    }
    // Game continues
    return {
        message: `${message} Your turn!`,
        boardDescription: describeBoardForVoice(newState),
        gameOver: false,
        aiShouldMove: false,
        newState,
    };
}
//# sourceMappingURL=tic-tac-toe.js.map