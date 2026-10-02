/**
 * Dream Persistence
 *
 * Mirrors dreams captured by the dreams domain tools into the canonical
 * aspirations store.
 */

import type { ToolContext } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { upsertAspiration, type AspirationStatus } from '../../../services/aspirations/index.js';

/** Keep the dream in the canonical aspirations store (fire-and-forget). */
export function keepDream(
  ctx: ToolContext,
  title: string,
  extra: { why?: string; note?: string; category?: string; status?: AspirationStatus } = {}
): void {
  if (!ctx.userId || !title.trim()) return;
  void upsertAspiration(ctx.userId, {
    level: 'dream',
    title,
    ...extra,
    source: 'explicit',
    confidence: 1,
    ...(ctx.sessionId ? { sourceConversationIds: [ctx.sessionId] } : {}),
    personaId: ctx.agentId,
  }).then((out) => {
    if (!out.success) getLogger().warn({ error: out.error.message }, 'Could not keep dream');
  });
}
