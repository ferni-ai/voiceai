/**
 * User context blocks for the live (multi-agent) path.
 *
 * Preference profile, health & mood, work & places, life story & values and
 * money memory are each a bounded, never-throwing, char-budgeted block. Their
 * loads start together before the prompts are read (`startUserContextBlockLoads`),
 * and are appended to the model-level instructions in a fixed order once the
 * prompts are ready (`appendUserContextBlocks`).
 *
 * @module agents/multi-agent/user-context-blocks
 */

import { loadPreferenceBlock } from '../../services/user-preferences/context-block.js';
import { loadHealthMoodBlock } from '../../services/health-memory/context-block.js';
import { loadWorkAndPlacesBlock } from '../../services/work-and-places/context-block.js';
import { loadLifeStoryBlock } from '../../services/life-story/context-block.js';
import { loadFinanceBlock } from '../../services/finance-memory/context-block.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/** In-flight loads for each user context block (each resolves to '' when empty). */
export interface PendingUserContextBlocks {
  readonly preference: Promise<string>;
  readonly health: Promise<string>;
  readonly workPlaces: Promise<string>;
  readonly lifeStory: Promise<string>;
  readonly finance: Promise<string>;
}

/** Start every block load now (in this order); await them later with `appendUserContextBlocks`. */
export function startUserContextBlockLoads(userId: string | undefined): PendingUserContextBlocks {
  // User preference profile: fetched alongside the prompts (bounded, never throws)
  const preference = userId ? loadPreferenceBlock(userId) : Promise.resolve('');
  // Health & mood (only with Health consent; otherwise at most a one-line consent hint)
  const health = userId ? loadHealthMoodBlock(userId) : Promise.resolve('');
  // Work & places (current job, upcoming trips, follow-ups): bounded, never throws
  const workPlaces = loadWorkAndPlacesBlock(userId);
  // Life story & values (faith only with consent): bounded, never throws
  const lifeStory = loadLifeStoryBlock(userId);
  // Money (only with Money consent; respects "don't bring up" boundaries): bounded, never throws
  const finance = userId ? loadFinanceBlock(userId) : Promise.resolve('');
  return { preference, health, workPlaces, lifeStory, finance };
}

/** Await each block in order and append the non-empty ones to `instructions`. */
export async function appendUserContextBlocks(
  instructions: string,
  pending: PendingUserContextBlocks,
  personaId: string
): Promise<string> {
  let result = instructions;

  // HOW THEY LIKE TO BE TALKED TO - name, style, boundaries (persona-agnostic,
  // char-budgeted; see services/user-preferences/context-block.ts)
  const preferenceBlock = await pending.preference;
  if (preferenceBlock) {
    result += preferenceBlock;
    log.info({ personaId, chars: preferenceBlock.length }, '🎛️ User preference profile injected');
  }
  const healthBlock = await pending.health;
  if (healthBlock) {
    result += healthBlock;
    log.info({ personaId, chars: healthBlock.length }, 'Health & mood memory injected');
  }

  // THEIR WORK & PLACES - job (with history), projects, trips, home; char-budgeted
  // (see services/work-and-places/context-block.ts)
  const workPlacesBlock = await pending.workPlaces;
  if (workPlacesBlock) {
    result += workPlacesBlock;
    log.info({ personaId, chars: workPlacesBlock.length }, '💼 Work & places context injected');
  }

  // THEIR STORY & VALUES - roots, stories told, turning points, values, faith (consent);
  // char-budgeted (see services/life-story/context-block.ts)
  const lifeStoryBlock = await pending.lifeStory;
  if (lifeStoryBlock) {
    result += lifeStoryBlock;
    log.info(
      { personaId, chars: lifeStoryBlock.length },
      '📖 Life story & values context injected'
    );
  }

  // THEIR MONEY - debts, savings, bills, worries and wins; rounded amounts, kind
  // follow-ups (see services/finance-memory/context-block.ts)
  const financeBlock = await pending.finance;
  if (financeBlock) {
    result += financeBlock;
    log.info({ personaId, chars: financeBlock.length }, 'Money memory injected');
  }

  return result;
}
