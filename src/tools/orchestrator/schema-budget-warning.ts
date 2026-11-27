/**
 * The "tool schema is over its token budget" warning, once per persona per process.
 *
 * It used to fire on every selection (409 times in 3 days at 310% of the budget) and advised
 * "consider reducing maxTools" while maxTools was 0 on purpose (no cap; the router is the only
 * limit). The per-selection size is still logged by "Tool selection complete".
 *
 * @module tools/orchestrator/schema-budget-warning
 */

type Warn = { warn: (fields: Record<string, unknown>, message: string) => void };

const warned = new Set<string>();

export function warnSchemaBudget(
  log: Warn,
  f: { personaId: string; toolCount: number; tokens: number; percent: number; maxTools: number }
): void {
  if (warned.has(f.personaId)) return;
  warned.add(f.personaId);
  const lever =
    f.maxTools > 0
      ? `maxTools is ${f.maxTools}: lower it`
      : 'maxTools is 0 (no cap): the semantic router returned this set, so narrowing it is the lever (#4399)';
  log.warn(
    {
      personaId: f.personaId,
      toolCount: f.toolCount,
      estimatedTokens: f.tokens,
      usagePercent: f.percent,
      maxTools: f.maxTools,
    },
    `Tool schema at ${f.percent}% of its budget, first seen for this persona in this process; ${lever}`
  );
}
