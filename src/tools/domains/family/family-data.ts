/**
 * Family Guidance Data
 *
 * Static reference data used by the family domain tools (developmental
 * stages and discipline approaches).
 */

// ============================================================================
// DEVELOPMENTAL GUIDANCE DATABASE
// ============================================================================

export const DEVELOPMENTAL_STAGES = {
  infant: {
    ages: '0-12 months',
    normalBehaviors: [
      "Crying is their only way to communicate - it's not manipulation",
      "Sleep patterns are erratic and that's normal",
      'They need constant connection and responsiveness',
    ],
    commonChallenges: ['sleep deprivation', 'feeding issues', 'adjustment to parenthood'],
    keyNeeds: ['Secure attachment', 'Responsive caregiving', 'Routine (flexible)'],
  },
  toddler: {
    ages: '1-3 years',
    normalBehaviors: [
      "Tantrums are developmentally normal - they can't regulate emotions yet",
      'Saying "no" is them developing autonomy - it\'s healthy',
      "They can't truly share yet - their brains aren't ready",
      'Testing limits is how they learn where boundaries are',
    ],
    commonChallenges: ['tantrums', 'sleep regression', 'picky eating', 'potty training'],
    keyNeeds: ['Safe exploration', 'Consistent limits', 'Patience with emotional outbursts'],
  },
  preschool: {
    ages: '3-5 years',
    normalBehaviors: [
      'Imaginary friends and magical thinking are healthy',
      "They're starting to understand others have feelings",
      'Big fears (dark, monsters) are normal',
      'They may lie to avoid punishment - testing cause/effect',
    ],
    commonChallenges: ['fears', 'aggression', 'school readiness', 'sibling rivalry'],
    keyNeeds: ['Play', 'Socialization', 'Emotional vocabulary'],
  },
  elementary: {
    ages: '6-11 years',
    normalBehaviors: [
      'Friends become increasingly important',
      'Rules and fairness become big concerns',
      "They're developing their own interests and identity",
      'Comparison to peers increases',
    ],
    commonChallenges: ['homework', 'friendships', 'activities balance', 'screen time'],
    keyNeeds: ['Competence building', 'Belonging', 'Increasing independence'],
  },
  tween: {
    ages: '11-13 years',
    normalBehaviors: [
      'Moodiness and emotional volatility (hormones + brain development)',
      'Privacy becomes very important',
      'Peer influence increases dramatically',
      'May seem embarrassed by parents',
    ],
    commonChallenges: ['puberty', 'social media', 'school pressure', 'identity'],
    keyNeeds: ['Autonomy with guardrails', 'Open communication', 'Respect'],
  },
  teen: {
    ages: '13-18 years',
    normalBehaviors: [
      "Pulling away is developmentally appropriate - they're individuating",
      'Emotional volatility is partly biological (prefrontal cortex still developing)',
      'Risk-taking is normal (brain prioritizes reward over risk)',
      'They need privacy and space',
    ],
    commonChallenges: [
      'independence battles',
      'risky behavior',
      'academic pressure',
      'mental health',
    ],
    keyNeeds: ['Trust', 'Independence', 'Continued connection', 'Safety'],
  },
  'young-adult': {
    ages: '18+',
    normalBehaviors: [
      'Still need support, differently',
      'May struggle with adulting',
      'Relationship dynamics shift',
    ],
    commonChallenges: ['launching', 'financial independence', 'relationship changes'],
    keyNeeds: ['Advice (when asked)', 'Unconditional love', 'Healthy boundaries'],
  },
};

export const DISCIPLINE_APPROACHES = {
  'natural-consequences': {
    description: 'Let natural outcomes teach the lesson',
    example: "Didn't bring a jacket? They'll be cold.",
    when: 'Safe situations where consequences teach',
    limit: 'Not when dangerous or consequences affect others',
  },
  'logical-consequences': {
    description: 'Create reasonable consequences connected to behavior',
    example: 'Misused toy? Toy goes away temporarily.',
    when: "When natural consequences aren't appropriate",
    limit: 'Must be related, reasonable, and respectful',
  },
  'positive-reinforcement': {
    description: 'Catch them being good, praise effort',
    example: 'I noticed you shared with your brother. That was kind.',
    when: 'Always - build on positives',
    limit: "Don't overpraise or make everything conditional",
  },
  'time-in': {
    description: 'Stay with them through big emotions',
    example: "I can see you're upset. I'm here with you.",
    when: "When they're overwhelmed and need co-regulation",
    limit: "Not effective when you're also dysregulated",
  },
  'problem-solving': {
    description: 'Work together to find solutions',
    example: "This isn't working. What could we try instead?",
    when: 'When child is calm and can participate',
    limit: 'Requires developmental readiness',
  },
};
