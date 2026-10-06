/**
 * Live-voice context builder for the world-model snapshot.
 *
 * Registers like other memory builders. Loaded via a side-effect import
 * from unified-memory-orchestrator (already on the MEMORY manifest).
 *
 * @module intelligence/world-model/builder
 */

import { BuilderCategory } from '../context-builders/core/categories.js';
import type {
  ContextBuilder,
  ContextBuilderInput,
  ContextInjection,
} from '../context-builders/core/types.js';
import { createStandardInjection, registerContextBuilder } from '../context-builders/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getCachedWorldModel, setCachedWorldModel } from './cache.js';
import { renderWorldModelSection } from './render.js';
import { buildWorldModelSnapshot } from './snapshot.js';
import type { WorldModelSources } from './sources.js';
import { isEmptySnapshot } from './types.js';

const log = createLogger({ module: 'world-model:builder' });

export interface BuildWorldModelContextOptions {
  sources?: WorldModelSources;
  nowMs?: number;
  skipCache?: boolean;
}

export async function buildWorldModelContext(
  input: ContextBuilderInput,
  options: BuildWorldModelContextOptions = {}
): Promise<ContextInjection[]> {
  const userId = input.services?.userId;
  if (!userId) {
    return [];
  }

  const sessionId = input.services?.sessionId;
  const nowMs = options.nowMs ?? Date.now();

  try {
    if (!options.skipCache && !options.sources) {
      const cached = getCachedWorldModel(userId, sessionId, nowMs);
      if (cached && !isEmptySnapshot(cached)) {
        const content = renderWorldModelSection(cached);
        if (!content) return [];
        return [
          createStandardInjection('world-model', content, {
            category: 'memory',
            confidence: 0.75,
          }),
        ];
      }
    }

    const emotion = input.analysis?.emotion;
    const voice = input.voiceEmotion;
    const snapshot = await buildWorldModelSnapshot({
      userId,
      sessionId,
      nowMs,
      sources: options.sources,
      emotionRegister: voice?.emotion ?? emotion?.primary,
      emotionValence: emotion?.valence,
    });

    if (!options.sources) {
      setCachedWorldModel(snapshot, sessionId, nowMs);
    }

    if (isEmptySnapshot(snapshot)) {
      return [];
    }

    const content = renderWorldModelSection(snapshot);
    if (!content) {
      return [];
    }

    log.debug(
      {
        userId,
        people: snapshot.people.length,
        relations: snapshot.relations.length,
        goals: snapshot.goals.length,
        negatives: snapshot.negatives.length,
      },
      'Injected world-model snapshot'
    );

    return [
      createStandardInjection('world-model', content, {
        category: 'memory',
        confidence: 0.8,
      }),
    ];
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'World-model snapshot failed');
    return [];
  }
}

export const worldModelBuilder: ContextBuilder = {
  name: 'world-model',
  description: 'Cached per-user world-model snapshot for the live voice prompt',
  priority: 73,
  category: BuilderCategory.MEMORY,
  build: buildWorldModelContext,
};

registerContextBuilder(worldModelBuilder);
