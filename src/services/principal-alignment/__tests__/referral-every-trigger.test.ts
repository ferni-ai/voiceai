/**
 * Every referral trigger is pinned: each row is a line that only that trigger matches, with the
 * referral it must give (reason, target, urgency, confidence) written out by hand. Deleting or
 * breaking any one trigger turns its row red. Before this, 5 of the 11 high triggers and every
 * medium and low one could be deleted with all referral tests still green.
 *
 * The lines are written for this test and fictional. No held-out, retired or blind crisis sets.
 */
import { describe, expect, it } from 'vitest';

import { analyzeReferralNeed, REFERRAL_TRIGGERS } from '../human-referral.js';
import type { ReferralReason, ReferralTarget } from '../types.js';

type Urgency = 'low' | 'medium' | 'high' | 'immediate';
type Row = [
  line: string,
  reason: ReferralReason,
  target: ReferralTarget,
  urgency: Urgency,
  confidence: number,
];

const ROWS: Row[] = [
  // Crisis: immediate, the crisis line
  ['some nights i want to end it all', 'suicidal_ideation', 'crisis_line', 'immediate', 0.95],
  ["i don't want to exist anymore", 'suicidal_ideation', 'crisis_line', 'immediate', 0.9],
  ["i feel like i'd be better off dead", 'suicidal_ideation', 'crisis_line', 'immediate', 0.85],
  // Self-harm
  ['i cut my arms again last night', 'self_harm', 'therapist', 'high', 0.9],
  ['i wanted to harm myself after the call', 'self_harm', 'therapist', 'high', 0.85],
  ['i keep starving myself to feel in control', 'self_harm', 'therapist', 'high', 0.85],
  // Abuse
  [
    'my partner chokes me when he gets angry',
    'relationship_abuse',
    'domestic_violence_hotline',
    'high',
    0.9,
  ],
  [
    "i'm scared of going home tonight",
    'relationship_abuse',
    'domestic_violence_hotline',
    'high',
    0.7,
  ],
  [
    'he monitors my phone every night',
    'relationship_abuse',
    'domestic_violence_hotline',
    'high',
    0.6,
  ],
  // Eating disorders
  ["i haven't eaten in days", 'eating_disorder', 'eating_disorder_specialist', 'high', 0.85],
  [
    'i keep making myself throw up after meals',
    'eating_disorder',
    'eating_disorder_specialist',
    'high',
    0.9,
  ],
  ['i binged and then felt awful', 'eating_disorder', 'eating_disorder_specialist', 'high', 0.8],
  // Addiction
  ["i'm addicted to pills", 'addiction', 'addiction_counselor', 'high', 0.85],
  ['the withdrawal is brutal this week', 'addiction', 'addiction_counselor', 'high', 0.8],
  ['i relapsed last weekend', 'addiction', 'addiction_counselor', 'medium', 0.75],
  // Trauma
  ["i can't stop thinking about what happened", 'trauma', 'therapist', 'medium', 0.8],
  ['i was emotionally abused as a kid', 'trauma', 'therapist', 'medium', 0.85],
  ["my counselor thinks it's ptsd", 'trauma', 'therapist', 'medium', 0.7],
  // Grief
  ['my dad just passed away', 'grief_acute', 'grief_counselor', 'medium', 0.7],
  ["i can't get out of bed since she left", 'grief_acute', 'grief_counselor', 'medium', 0.75],
  // Medical
  ['i got my test results back today', 'medical', 'doctor', 'medium', 0.5],
  ['the side effects are rough', 'medication', 'doctor', 'medium', 0.6],
  ['i have chest pain right now', 'medical', 'doctor', 'high', 0.8],
  // Legal
  ['i have a court date next week', 'legal', 'lawyer', 'medium', 0.7],
  ["we're going through a divorce", 'legal', 'lawyer', 'medium', 0.65],
  // Financial
  ['we got an eviction notice', 'financial_complex', 'financial_advisor', 'medium', 0.7],
  ['i owe the irs money', 'financial_complex', 'financial_advisor', 'medium', 0.6],
  // Persistent struggle
  ["i've been struggling for years", 'persistent_struggle', 'therapist', 'low', 0.6],
  ['nothing helps anymore', 'persistent_struggle', 'therapist', 'low', 0.55],
];

describe('every referral trigger gives its referral', () => {
  it('has one row per trigger, so a new trigger needs a row too', () => {
    expect(ROWS).toHaveLength(29);
    expect(REFERRAL_TRIGGERS).toHaveLength(ROWS.length);
  });

  it.each(ROWS)('"%s": %s, %s, %s', (line, reason, target, urgency, confidence) => {
    const referral = analyzeReferralNeed(line, { userId: 'u' });
    expect(referral).toMatchObject({
      shouldRefer: true,
      reason,
      suggestedTarget: target,
      urgency,
      confidence,
      shouldFollowUp: urgency !== 'immediate',
    });
    const phones = referral.resources.map((r) => r.phone);
    if (urgency === 'immediate') expect(phones).toContain('988');
    else expect(phones).not.toContain('988');
  });
});
