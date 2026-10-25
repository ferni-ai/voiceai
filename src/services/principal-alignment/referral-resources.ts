/**
 * Which resources a referral carries.
 *
 * analyzeReferralNeed's best match is the single highest-confidence trigger
 * (ties to the first listed). On its own that loses something whenever a
 * crisis-line trigger and another trigger both match: a 0.9 abuse, self-harm
 * or eating trigger outranks a 0.85 crisis trigger (988 lost), and a crisis
 * trigger wins a tie with a 0.85 addiction trigger (the specific line lost).
 * So an immediate (crisis-line) match carries the crisis line first, then the
 * top non-crisis match's resources (never a crisis-line entry, so no repeats).
 * Anything below immediate keeps exactly the best match's resources.
 */
import type { ReferralResource, ReferralTarget } from './types.js';

interface Match {
  target: ReferralTarget;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  confidence: number;
}

export function referralResources(
  table: Record<ReferralTarget, ReferralResource[]>,
  urgency: 'low' | 'medium' | 'high' | 'immediate',
  best: Match,
  matched: readonly Match[]
): ReferralResource[] {
  if (urgency !== 'immediate') return table[best.target];
  // The best match is then a crisis trigger or this top non-crisis match (same tie-break).
  const others = matched.filter((m) => m.urgency !== 'immediate');
  const top = others.reduce<Match | null>(
    (a, m) => (!a || m.confidence > a.confidence ? m : a),
    null
  );
  return [...table.crisis_line, ...(top ? table[top.target] : [])];
}
