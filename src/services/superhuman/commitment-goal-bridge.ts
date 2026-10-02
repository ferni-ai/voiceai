/**
 * Commitment Keeper → aspirations: commitments of type 'goal' ("my goal is
 * to…") are goals, so they're mirrored into the canonical aspirations store
 * (level 'goal'), and completing/abandoning them updates the goal's status.
 * Other commitment types (promises, conversations, boundaries) stay
 * commitments only.
 *
 * @module services/superhuman/commitment-goal-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  findByLegacyId,
  saveAspiration,
  upsertAspiration,
  type AspirationStatus,
} from '../aspirations/index.js';
import type { Commitment, CommitmentStatus } from './commitment-keeper.js';

const log = createLogger({ module: 'commitment-goal-bridge' });

const STATUS: Partial<Record<CommitmentStatus, AspirationStatus>> = {
  active: 'active',
  completed: 'achieved',
  abandoned: 'let-go',
  deferred: 'paused',
};

export async function mirrorGoalCommitment(c: Commitment): Promise<void> {
  if (c.type !== 'goal' || !c.userId) return;
  try {
    const out = await upsertAspiration(c.userId, {
      level: 'goal',
      title: c.summary || c.statement,
      source: 'explicit',
      confidence: 0.8,
      ...(c.targetDate ? { targetDate: new Date(c.targetDate).toISOString().slice(0, 10) } : {}),
      ...(c.personaId ? { personaId: c.personaId } : {}),
      legacyId: c.id,
    });
    if (!out.success) log.debug({ error: out.error.message }, 'Goal commitment not mirrored');
  } catch (error) {
    log.debug({ error: String(error) }, 'Goal commitment mirror failed');
  }
}

export async function mirrorGoalCommitmentStatus(
  userId: string,
  commitmentId: string,
  status: CommitmentStatus
): Promise<void> {
  const next = STATUS[status];
  if (!next) return;
  try {
    const record = await findByLegacyId(userId, commitmentId);
    if (!record || record.userEdited || record.status === next) return;
    const now = new Date().toISOString();
    await saveAspiration(userId, { ...record, status: next, statusChangedAt: now, updatedAt: now });
  } catch (error) {
    log.debug({ error: String(error) }, 'Goal commitment status mirror failed');
  }
}
