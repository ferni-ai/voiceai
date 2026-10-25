/**
 * The early-warning context injection for the LLM, from the active warnings.
 *
 * It used to show only the first warning at the top severity, in
 * WARNING_PATTERNS order, with crisis_risk listed last: a sleep or hopelessness
 * warning lifted to urgent in the same turn took the slot and dropped the
 * crisis guidance. Now the order is explicit (severity, then a fixed priority
 * with crisis_risk on top), crisis_risk is shown whenever it is active, and
 * the other types at their own top severity are shown after it. Everything the
 * old single slot showed is still shown, a raise of one warning never displaces
 * crisis_risk or a warning main would show, and one warning renders as before.
 */
import type { EarlyWarning, WarningSeverity, WarningType } from './early-warning.js';

const SEVERITY: Record<WarningSeverity, number> = { watch: 1, concern: 2, urgent: 3 };

/** Tie order at equal severity, lowest first. Not WARNING_PATTERNS' order. */
export const WARNING_PRIORITY: Record<WarningType, number> = {
  crisis_risk: 0,
  hopelessness_pattern: 1,
  depression_risk: 2,
  isolation_pattern: 3,
  sleep_deterioration: 4,
  anxiety_spike: 5,
  burnout_trajectory: 6,
  motivation_collapse: 7,
};

const NAMES: Record<WarningType, string> = {
  depression_risk: 'Depression Risk',
  anxiety_spike: 'Anxiety Spike',
  burnout_trajectory: 'Burnout Trajectory',
  isolation_pattern: 'Isolation Pattern',
  sleep_deterioration: 'Sleep Deterioration',
  motivation_collapse: 'Motivation Collapse',
  hopelessness_pattern: 'Hopelessness Pattern',
  crisis_risk: 'Crisis Risk',
};

/** One warning per type (its most severe): crisis_risk first, then the other types at their top severity. */
export function selectWarningsToShow(active: readonly EarlyWarning[]): EarlyWarning[] {
  const byType = new Map<WarningType, EarlyWarning>();
  for (const w of active) {
    const seen = byType.get(w.type);
    if (!seen || SEVERITY[w.severity] > SEVERITY[seen.severity]) byType.set(w.type, w);
  }
  const ordered = [...byType.values()].sort(
    (a, b) =>
      SEVERITY[b.severity] - SEVERITY[a.severity] ||
      WARNING_PRIORITY[a.type] - WARNING_PRIORITY[b.type]
  );
  // The top severity among the OTHER types: a crisis warning is shown on top of
  // them, never in place of one, so a raised crisis_risk cannot displace them.
  const crisis = ordered.filter((w) => w.type === 'crisis_risk');
  const rest = ordered.filter((w) => w.type !== 'crisis_risk');
  const top = rest.length > 0 ? SEVERITY[rest[0].severity] : 0;
  return [...crisis, ...rest.filter((w) => SEVERITY[w.severity] === top)];
}

function block(w: EarlyWarning): string {
  return `Type: ${NAMES[w.type] || w.type}
Severity: ${w.severity.toUpperCase()}

Guidance for you:
${w.recommendations.forFerni.map((r) => `- ${r}`).join('\n')}

${w.recommendations.suggestProfessional ? '⚡ Consider gently suggesting professional support' : ''}`;
}

/** The injection text, or '' when nothing is active. */
export function renderWarningInjection(active: readonly EarlyWarning[]): string {
  const shown = selectWarningsToShow(active);
  if (shown.length === 0) return '';
  return `[⚠️ EARLY WARNING ACTIVE]\n${shown.map(block).join('\n\n')}`;
}
