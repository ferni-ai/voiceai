/**
 * Memory Consent Executor — JSON-workaround route for `setMemoryConsent`
 * ("stop remembering my health stuff"). The tool lives in the memory domain.
 *
 * @module agents/shared/tool-executors/memory-consent-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'MemoryConsentExecutor' });

const HANDLED_TOOLS = ['setmemoryconsent'] as const;

async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  if (fn.toLowerCase() !== 'setmemoryconsent') return null;
  const tool = await import('../../../tools/domains/memory/consent-tool.js');
  const parsed = tool.setMemoryConsentSchema.safeParse(args);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues.length }, 'Bad setMemoryConsent args');
    return 'Do you mean health, money, or faith and beliefs?';
  }
  return tool.setMemoryConsent(parsed.data, { userId: ctx.userId });
}

export const memoryConsentExecutor: DomainExecutor = {
  domain: 'memory-consent',
  handles: HANDLED_TOOLS,
  execute,
};
