/**
 * Finance Domain Tool Executor
 *
 * Handles all finance-related tools: banking, budgeting, calculators, debt planning.
 * Maps FTIS semantic IDs to actual domain tool implementations.
 *
 * @module agents/shared/tool-executors/finance-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'FinanceExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Domain tool names (lowercase)
  // Banking/Plaid
  'bankaccount',
  'bankdata',
  'financialhealth',
  // Calculators
  'investmentcalc',
  'housingcalc',
  'savingscalc',
  // Personal Finance
  'debtpayoff',
  'budgetplanner',
  'financeeducation',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // budget category
  'finance_budget',
  'finance_spending',
  // bills category
  'finance_bills',
  'finance_payments',
] as const;

/** Map FTIS tool IDs to canonical handler names */
const TOOL_ALIASES: Record<string, string> = {
  // budget mapping
  finance_budget: 'budgetplanner',
  finance_spending: 'bankdata',
  // bills mapping
  finance_bills: 'debtpayoff',
  finance_payments: 'debtpayoff',
};

/**
 * Execute finance-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  let fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // Resolve FTIS aliases to canonical tool names
  if (TOOL_ALIASES[fnLower]) {
    log.debug(
      { original: fnLower, resolved: TOOL_ALIASES[fnLower] },
      '🔀 Resolving FTIS tool alias'
    );
    fnLower = TOOL_ALIASES[fnLower];
  }

  // Dynamically import finance tools to avoid circular dependencies
  const financeModule = await import('../../../tools/domains/finance/index.js');
  const toolDefinitions = await financeModule.getToolDefinitions();

  // Find the matching tool definition
  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fn, fnLower }, '⚠️ Finance tool definition not found');
    return null;
  }

  // Create tool context with required fields
  const toolCtx = {
    userId: ctx.userId || '',
    sessionId: ctx.sessionId,
    agentId: ctx.personaId || 'ferni',
    agentDisplayName: ctx.personaId || 'Ferni',
  };

  // Create and execute the tool
  try {
    const tool = toolDef.create(toolCtx);
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '💰 Executing finance tool');

    // Tools created by llm.tool have an execute method
    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    log.warn({ toolId: toolDef.id }, '⚠️ Finance tool has unexpected structure');
    return null;
  } catch (error) {
    log.error({ error: String(error), toolId: toolDef.id }, '❌ Finance tool execution failed');
    throw error;
  }
}

/** Finance domain executor */
const financeExecutor: DomainExecutor = {
  domain: 'finance',
  handles: HANDLED_TOOLS,
  execute,
};

export default financeExecutor;
