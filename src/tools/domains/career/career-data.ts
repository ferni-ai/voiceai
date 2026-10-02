/**
 * Career Wisdom Data
 *
 * Static reference data used by the career domain tools (interview question
 * banks, burnout assessment rubric, salary negotiation tips).
 */

// ============================================================================
// CAREER WISDOM DATABASES
// ============================================================================

export const INTERVIEW_QUESTIONS = {
  behavioral: [
    {
      question: 'Tell me about a time you faced a significant challenge at work.',
      hint: 'Use STAR: Situation, Task, Action, Result',
    },
    {
      question: 'Describe a situation where you had to work with a difficult colleague.',
      hint: 'Focus on your approach and resolution',
    },
    {
      question: 'Give me an example of when you showed leadership.',
      hint: 'Leadership can be informal - influence without authority',
    },
    {
      question: 'Tell me about a time you failed and what you learned.',
      hint: 'Show self-awareness and growth',
    },
    {
      question: 'Describe your most significant professional accomplishment.',
      hint: 'Quantify impact if possible',
    },
    {
      question: 'Tell me about a time you had to make a decision with incomplete information.',
      hint: 'Show judgment and decision-making process',
    },
    {
      question: 'Describe a situation where you had to persuade someone.',
      hint: 'Focus on understanding their perspective first',
    },
  ],
  culture_fit: [
    {
      question: 'Why are you interested in this role?',
      hint: 'Connect your goals to what the role offers',
    },
    {
      question: 'What kind of work environment do you thrive in?',
      hint: 'Be honest - fit matters for both sides',
    },
    { question: 'How do you handle feedback?', hint: "Show you're coachable and growth-oriented" },
    {
      question: 'Where do you see yourself in 5 years?',
      hint: 'Show ambition while being realistic',
    },
    { question: 'What motivates you?', hint: 'Be authentic - this reveals values' },
    {
      question: 'Why are you leaving your current role?',
      hint: "Stay positive, focus on what you're moving toward",
    },
  ],
  technical: [
    {
      question: 'Walk me through your experience with [skill].',
      hint: 'Use specific examples and projects',
    },
    { question: 'How do you stay current in your field?', hint: 'Show continuous learning' },
    {
      question: 'Describe a technical problem you solved.',
      hint: 'Walk through your problem-solving process',
    },
  ],
};

export const BURNOUT_ASSESSMENT = {
  symptoms: {
    exhaustion: {
      weight: 3,
      description: "Physical and emotional exhaustion that doesn't improve with rest",
    },
    cynicism: {
      weight: 3,
      description: 'Detachment, negativity about work, colleagues, or career',
    },
    inefficacy: { weight: 2, description: "Feeling ineffective or that your work doesn't matter" },
    sleep_issues: { weight: 2, description: 'Trouble sleeping due to work thoughts or stress' },
    physical_symptoms: {
      weight: 2,
      description: 'Headaches, illness, physical tension from work stress',
    },
    dread: { weight: 3, description: 'Persistent dread about going to work' },
    isolation: { weight: 1, description: 'Withdrawing from colleagues and work relationships' },
    concentration: { weight: 1, description: 'Difficulty focusing or completing tasks' },
  },
  levels: {
    mild: {
      threshold: 4,
      description: 'Early burnout signs - time to intervene',
      recommendations: [
        'Set firm end-of-day boundaries starting today',
        'Take your full lunch break away from work',
        'Schedule one restorative activity this week',
        'Delegate or postpone one non-essential task',
      ],
    },
    moderate: {
      threshold: 8,
      description: 'Significant burnout - needs attention',
      recommendations: [
        'Have a conversation with your manager about workload',
        'Take PTO if possible, even just a long weekend',
        "Evaluate what's sustainable long-term",
        'Consider talking to a therapist about stress management',
      ],
    },
    severe: {
      threshold: 12,
      description: 'Severe burnout - your health is at risk',
      recommendations: [
        'This is your body telling you something needs to change',
        'Speak with a therapist or counselor',
        'Consider medical leave if available',
        'Evaluate whether this job is sustainable for you',
      ],
    },
  },
};

export const SALARY_NEGOTIATION_TIPS = [
  'Never give the first number if you can avoid it',
  'Research thoroughly - know the market rate for your role, location, and experience',
  'Consider total compensation: base, bonus, equity, benefits, flexibility',
  'Practice saying your number out loud - it should feel comfortable',
  'Silence is powerful - make your ask and wait',
  'Have a walk-away number in mind',
  'Get the offer in writing before accepting',
  "Express enthusiasm while negotiating - it's not adversarial",
];
