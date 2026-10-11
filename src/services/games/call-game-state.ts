/**
 * The game being played on this call, kept the way a friend keeps it: whose
 * turn it is, the score, what has already been asked or said (so nothing is
 * repeated), and in 20 questions the thing Ferni is thinking of.
 *
 * The model runs the game itself (any game: would-you-rather, 20 questions,
 * trivia, story-building, word games) and records it with the gameState tool
 * (tools/domains/games/game-state-tool.ts); while a game is on, each request
 * carries a short note of it (gameTurnNote, added in turn-request.ts). The note
 * never carries the secret: only the tool's get and end answers do.
 *
 * Keyed by the AgentSession object, like the director's notes and the turn
 * tool retrieval: one game per call, gone with the call. Behind GAME_STATE=on.
 *
 * @module services/games/call-game-state
 */

export const CALL_GAME_TYPES = [
  'would-you-rather',
  '20-questions',
  'trivia',
  'story',
  'word-game',
  'other',
] as const;
export type CallGameType = (typeof CALL_GAME_TYPES)[number];

/** Items kept (questions asked, guesses, dilemmas, story lines); the oldest go first. */
export const MAX_USED_ITEMS = 50;
/** Longest item kept, in characters. */
export const MAX_ITEM_CHARS = 160;
/** Most players tracked (a family on speaker, not a stadium). */
export const MAX_PLAYERS = 8;
/** Longest secret kept, in characters. */
const MAX_SECRET_CHARS = 80;
/** The note lists only the latest few items, shortened. */
const NOTE_RECENT_ITEMS = 6;
const NOTE_ITEM_CHARS = 60;

export const DEFAULT_PLAYERS = ['caller', 'Ferni'] as const;

export interface CallGame {
  readonly type: CallGameType;
  readonly players: string[];
  /** Whose turn it is now; one of players. */
  turn: string;
  /** Starts at 1; goes up each time the turn comes back to the first player. */
  round: number;
  readonly scores: Record<string, number>;
  /** Most recent last, at most MAX_USED_ITEMS. */
  readonly used: string[];
  /** Everything ever recorded, including items dropped by the cap. */
  usedTotal: number;
  /** What Ferni is thinking of (20 questions); never in the per-turn note. */
  secret?: string;
  readonly startedAt: number;
}

export function gameStateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GAME_STATE?.trim().toLowerCase() === 'on';
}

const games = new WeakMap<object, CallGame>();

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const clean = (text: string | undefined, max: number): string =>
  clip((text ?? '').replace(/\s+/g, ' ').trim(), max);

/** The tracked name for this player, adding them if there is room. */
function playerName(game: CallGame, name: string): string | undefined {
  const wanted = clean(name, 40);
  if (!wanted) return undefined;
  const known = game.players.find((p) => p.toLowerCase() === wanted.toLowerCase());
  if (known) return known;
  if (game.players.length >= MAX_PLAYERS) return undefined;
  game.players.push(wanted);
  game.scores[wanted] = 0;
  return wanted;
}

export interface StartCallGameInput {
  type: CallGameType;
  players?: string[];
  secret?: string;
  /** Who goes first; the first player when unset. */
  turn?: string;
  now?: number;
}

/** Starts a game on this call, replacing any game already on. */
export function startCallGame(session: object, input: StartCallGameInput): CallGame {
  const names = (input.players ?? [])
    .map((p) => clean(p, 40))
    .filter((p, i, all) => p && all.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i)
    .slice(0, MAX_PLAYERS);
  const players = names.length > 0 ? names : [...DEFAULT_PLAYERS];
  const game: CallGame = {
    type: input.type,
    players,
    turn: players[0],
    round: 1,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    used: [],
    usedTotal: 0,
    startedAt: input.now ?? Date.now(),
  };
  const secret = clean(input.secret, MAX_SECRET_CHARS);
  if (secret) game.secret = secret;
  if (input.turn) game.turn = playerName(game, input.turn) ?? game.turn;
  games.set(session, game);
  return game;
}

export interface UpdateCallGameInput {
  /** Whose turn it is now. */
  turn?: string;
  /** Pass the turn to the next player. */
  nextTurn?: boolean;
  scorePlayer?: string;
  /** Added to scorePlayer's score; 1 when unset. */
  scorePoints?: number;
  /** A question asked, guess, dilemma, trivia question, story line or word. */
  used?: string;
  /** Set once; a game's secret never changes mid-game. */
  secret?: string;
}

export interface UpdateResult {
  game: CallGame;
  /** The item was already used this game (not recorded again). */
  repeated: boolean;
  /** A different secret was asked for and refused. */
  secretKept: boolean;
}

/** Records a move; undefined when no game is on. */
export function updateCallGame(
  session: object,
  input: UpdateCallGameInput
): UpdateResult | undefined {
  const game = games.get(session);
  if (!game) return undefined;
  let repeated = false;
  let secretKept = false;

  const item = clean(input.used, MAX_ITEM_CHARS);
  if (item) {
    repeated = game.used.some((u) => u.toLowerCase() === item.toLowerCase());
    if (!repeated) {
      game.used.push(item);
      game.usedTotal += 1;
      if (game.used.length > MAX_USED_ITEMS) game.used.splice(0, game.used.length - MAX_USED_ITEMS);
    }
  }

  if (input.scorePlayer) {
    const who = playerName(game, input.scorePlayer);
    const points = Number.isFinite(input.scorePoints) ? Number(input.scorePoints) : 1;
    if (who) game.scores[who] = (game.scores[who] ?? 0) + points;
  }

  const secret = clean(input.secret, MAX_SECRET_CHARS);
  if (secret) {
    if (!game.secret) game.secret = secret;
    else if (game.secret.toLowerCase() !== secret.toLowerCase()) secretKept = true;
  }

  if (input.turn) {
    game.turn = playerName(game, input.turn) ?? game.turn;
  } else if (input.nextTurn) {
    const next = (game.players.indexOf(game.turn) + 1) % game.players.length;
    if (next === 0) game.round += 1;
    game.turn = game.players[next];
  }
  return { game, repeated, secretKept };
}

export function getCallGame(session: object): CallGame | undefined {
  return games.get(session);
}

/** Ends this call's game and returns it as it finished; undefined when none was on. */
export function endCallGame(session: object): CallGame | undefined {
  const game = games.get(session);
  games.delete(session);
  return game;
}

function scoreLine(game: CallGame): string {
  return game.players.map((p) => `${p} ${game.scores[p] ?? 0}`).join(', ');
}

/** The game as the gameState tool reports it to the model; the secret only when asked for. */
export function describeCallGame(game: CallGame, options: { withSecret: boolean }): string {
  const lines = [
    `Game: ${game.type}, round ${game.round}, ${game.turn}'s turn.`,
    `Score: ${scoreLine(game)}.`,
    game.used.length > 0
      ? `Already used (${game.usedTotal}${game.usedTotal > game.used.length ? `, latest ${game.used.length} kept` : ''}): ${game.used.join(' | ')}`
      : 'Nothing used yet.',
  ];
  if (game.secret && options.withSecret) {
    lines.push(
      `Secret answer (only you know it; don't say it until the game ends): ${game.secret}`
    );
  }
  return lines.join('\n');
}

/**
 * A few lines for this request while a game is on: the type, round, turn,
 * score and latest items, so the model keeps the game in mind and doesn't
 * repeat itself. Empty when the flag is off or no game is on. Never names the
 * secret, not even inside a recorded item.
 */
export function gameTurnNote(
  session: object,
  env: Record<string, string | undefined> = process.env
): string {
  if (!gameStateEnabled(env)) return '';
  const game = games.get(session);
  if (!game) return '';
  const secret = game.secret?.toLowerCase();
  const recent = game.used
    .filter((u) => !secret || !u.toLowerCase().includes(secret))
    .slice(-NOTE_RECENT_ITEMS)
    .map((u) => clip(u, NOTE_ITEM_CHARS));
  const older = game.usedTotal - recent.length;
  const parts = [
    `Game on: ${game.type}, round ${game.round}, ${game.turn}'s turn. Score: ${scoreLine(game)}.`,
    recent.length > 0
      ? `Already used, don't repeat: ${recent.join(' | ')}${older > 0 ? ` (+${older} earlier; gameState get lists them)` : ''}.`
      : '',
    game.secret
      ? "You're holding the secret answer: stay consistent with it (gameState get) and don't say it until the game ends."
      : '',
    'Record each move with gameState.',
  ];
  return parts.filter(Boolean).join(' ');
}
