/**
 * What theory of mind needs from storage, and the shape check every store
 * applies on the way out. The Firestore adapter (L1, memory/storage/mind-store.ts,
 * bogle_users/{userId}/mind_model/current) implements it; the session layer
 * hands it in (agents/theory-of-mind-register.ts, multi-agent/mind-note-hook.ts).
 *
 * @module intelligence/theory-of-mind/store
 */

import type { MindModel } from './types.js';

export interface MindStore {
  load: (userId: string) => Promise<MindModel | null>;
  save: (model: MindModel) => Promise<void>;
}

/** Plain JSON: drops undefined fields, as a real store would. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A stored model is used only if it has the shape this version writes. */
export function asMindModel(data: unknown, userId: string): MindModel | null {
  const d = data as Partial<MindModel> | undefined;
  if (!d || d.version !== 1) return null;
  if (!Array.isArray(d.toldFerni) || !Array.isArray(d.patterns) || !Array.isArray(d.sensitivities))
    return null;
  return { ...(d as MindModel), userId };
}

/** For tests and local runs: the same contract, in memory. */
export function memoryMindStore(): MindStore & { models: Map<string, MindModel> } {
  const models = new Map<string, MindModel>();
  return {
    models,
    load: (userId) => {
      const m = models.get(userId);
      return Promise.resolve(m ? asMindModel(plain(m), userId) : null);
    },
    save: (model) => {
      models.set(model.userId, plain(model));
      return Promise.resolve();
    },
  };
}
