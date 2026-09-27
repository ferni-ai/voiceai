/**
 * The director: turns a cue into the character's own line.
 *
 * A fast model gets the character's brief, the last few turns of the
 * conversation, the stage direction and the allowed facts, and writes the
 * next spoken line. If it is late (over the cue's budget), fails, or writes
 * something unspeakable, the cue's fallback is used, so a cue never costs
 * dead air.
 *
 * DIRECTED_SPEECH: 'on' (default) speaks the actor's line; 'shadow' writes
 * it and logs it beside the fallback but speaks the fallback; 'off' skips
 * the actor entirely.
 *
 * @module speech/direction/director
 */

import { getGenerativeModel } from '../../config/generative-model.js';
import { createLogger } from '../../utils/safe-logger.js';
import { acceptLine, CUE_BUDGET_MS, type Cue } from './cue.js';

const log = createLogger({ module: 'Director' });

export type DirectionMode = 'on' | 'shadow' | 'off';

export function directionMode(
  env: Record<string, string | undefined> = process.env
): DirectionMode {
  const mode = env.DIRECTED_SPEECH;
  return mode === 'off' || mode === 'shadow' ? mode : 'on';
}

export interface Scene {
  /** Character name as the user knows them ("Ferni"). */
  character: string;
  /** One or two sentences on how the character talks. */
  brief: string;
  /** Last few turns, oldest first. */
  recentTurns: Array<{ speaker: 'user' | 'character'; text: string }>;
  /** What the user is called, if known. */
  userName?: string;
}

export interface DirectedLine {
  text: string;
  source: 'actor' | 'understudy';
  ms: number;
  reason?: string;
}

/** Writes a line from a prompt; injectable so tests need no model. */
export type Actor = (system: string, prompt: string) => Promise<string | undefined>;

const ACTOR_MODEL = () => process.env.DIRECTED_SPEECH_MODEL || 'gemini-2.5-flash-lite';

const defaultActor: Actor = async (system, prompt) => {
  const model = await getGenerativeModel({
    model: ACTOR_MODEL(),
    systemInstruction: system,
    generationConfig: { temperature: 0.9, maxOutputTokens: 120 },
  });
  if (!model) return undefined;
  const result = await model.generateContent(prompt);
  return result.response.text();
};

export function buildDirection(cue: Cue, scene: Scene): { system: string; prompt: string } {
  const system = [
    `You are ${scene.character}, speaking in a live voice conversation. ${scene.brief}`,
    `Write only the exact words ${scene.character} says next. No quotes, no labels, no stage directions, no brackets, no emojis.`,
    'Talk the way people talk: contractions, plain words, one or two short sentences.',
    'Never invent facts, memories or plans beyond what you are given. Never repeat a line from the recent conversation.',
  ].join('\n');

  const turns = scene.recentTurns
    .slice(-6)
    .map((t) => `${t.speaker === 'user' ? scene.userName || 'User' : scene.character}: ${t.text}`)
    .join('\n');
  const facts = Object.entries(cue.facts ?? {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const prompt = [
    turns ? `Recent conversation:\n${turns}` : 'The conversation has just started.',
    `Moment: ${cue.moment}`,
    `Direction: ${cue.direction}`,
    facts ? `Facts you may use:\n${facts}` : '',
    cue.mustInclude?.length ? `Your line must mention: ${cue.mustInclude.join(', ')}` : '',
    `Write ${scene.character}'s line.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, prompt };
}

function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | 'late'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Warm the actor at call start. The first model call in a call job pays for
 * client setup and auth; on dev it pushed the greeting past its budget, so
 * the scripted greeting played. Never throws.
 */
export async function prewarmDirector(actor: Actor = defaultActor): Promise<void> {
  const started = Date.now();
  try {
    await actor('Reply with the single word: ok', 'ok');
    log.debug({ ms: Date.now() - started }, 'Director prewarmed');
  } catch (error) {
    log.debug({ error: String(error) }, 'Director prewarm failed (non-critical)');
  }
}

/**
 * Get the line for a cue: the actor's if it arrives in time and is usable,
 * otherwise the cue's fallback.
 */
export async function directLine(
  cue: Cue,
  scene: Scene,
  opts: { actor?: Actor; mode?: DirectionMode; budgetMs?: number } = {}
): Promise<DirectedLine> {
  const mode = opts.mode ?? directionMode();
  const started = Date.now();
  const understudy = (reason: string): DirectedLine => ({
    text: cue.fallback,
    source: 'understudy',
    ms: Date.now() - started,
    reason,
  });
  if (mode === 'off') return understudy('off');

  const { system, prompt } = buildDirection(cue, scene);
  const actor = opts.actor ?? defaultActor;
  const budget = opts.budgetMs ?? CUE_BUDGET_MS[cue.urgency];

  let raw: string | undefined | 'late';
  try {
    raw = await withinBudget(actor(system, prompt), budget);
  } catch (error) {
    log.warn(
      { moment: cue.moment, error: String(error) },
      'Director: actor failed, using understudy'
    );
    return understudy('error');
  }
  if (raw === 'late') {
    log.info({ moment: cue.moment, budgetMs: budget }, 'Director: actor late, using understudy');
    return understudy('late');
  }

  const recentLines = scene.recentTurns.filter((t) => t.speaker === 'character').map((t) => t.text);
  const line = acceptLine(raw, cue, recentLines);
  if (!line) {
    log.info(
      { moment: cue.moment, raw: raw?.slice(0, 200) },
      'Director: line rejected, using understudy'
    );
    return understudy('rejected');
  }

  const ms = Date.now() - started;
  if (mode === 'shadow') {
    log.info({ moment: cue.moment, actor: line, spoken: cue.fallback, ms }, 'Director (shadow)');
    return { ...understudy('shadow'), ms };
  }
  log.info({ moment: cue.moment, line, ms }, 'Director: actor line');
  return { text: line, source: 'actor', ms };
}
