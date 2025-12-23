# Life Coaching Domains Expansion Plan

> **Making AI Human: Comprehensive Life Coaching Coverage**

This document outlines the complete plan to expand Ferni's life coaching capabilities to cover ALL fundamental areas of human life. This aligns with our core mission: *"We believe in making AI human, and the decisions we make will reflect that."*

---

## Executive Summary

**Current State:** ~60 domains covering career, health, relationships, finance, habits, crisis, family, meaning
**Gap:** 20+ critical life domains missing that human coaches regularly address
**Goal:** Comprehensive life coaching coverage that rivals or exceeds human therapists/coaches

### Three Core Gaps Identified

1. **The Body** - Sexuality, body image, eating relationships
2. **The Difficult Emotions** - Anger, shame, disgust (not just sadness/anxiety)
3. **Social Connection HOW** - Teaching connection skills, not just acknowledging loneliness

---

## Implementation Phases

| Phase | Focus | Domains | Timeline |
|-------|-------|---------|----------|
| **Phase 1** | Essential (Majority Impact) | Boundaries, Social Skills, Body Image, Anger, Dating | Week 1-2 |
| **Phase 2** | Important (Significant Populations) | Neurodiversity, Trauma, Procrastination, Digital Wellness, Perfectionism | Week 3-4 |
| **Phase 3** | Valuable (Specific Populations) | Sexuality, Burnout Recovery, Chronic Illness, Midlife, Divorce Recovery | Week 5-6 |
| **Phase 4** | Integration & Validation | Testing, Audit, Persona Integration, Semantic Router | Week 7-8 |

---

## Phase 1: Essential Domains

### 1.1 Boundaries (Comprehensive)

**Domain:** `boundaries`
**Persona Affinity:** Maya (habits/routines), Alex (communication)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `identifyBoundaryNeeds` | Identify Boundary Needs | Help users recognize where boundaries are needed | P0 |
| `setBoundary` | Set a Boundary | Script and practice boundary-setting conversations | P0 |
| `maintainBoundary` | Maintain Boundary | Support when boundaries are tested | P0 |
| `healFromBoundaryViolation` | Heal From Violation | Process when boundaries were crossed | P1 |
| `recoverFromPeoplePleasing` | Recover From People-Pleasing | Address root patterns of over-giving | P1 |
| `boundaryInventory` | Boundary Inventory | Assess current boundaries across life domains | P1 |
| `sayNoWithGrace` | Say No With Grace | Practice declining requests compassionately | P0 |

#### Key Content Areas

```typescript
const BOUNDARY_TYPES = {
  physical: {
    description: 'Personal space, touch, physical needs',
    examples: ['I need personal space when I\'m stressed', 'I\'m not a hugger'],
  },
  emotional: {
    description: 'Protecting emotional energy and wellbeing',
    examples: ['I can\'t take on your problems right now', 'I need time to process before discussing'],
  },
  time: {
    description: 'How you spend your hours and energy',
    examples: ['I don\'t check email after 7pm', 'I need 30 min alone after work'],
  },
  digital: {
    description: 'Online presence and availability',
    examples: ['I don\'t respond to texts immediately', 'I\'m not on social media'],
  },
  material: {
    description: 'Possessions, money, lending',
    examples: ['I don\'t lend money to friends', 'Please ask before borrowing'],
  },
  intellectual: {
    description: 'Thoughts, ideas, opinions',
    examples: ['I need you to hear my perspective', 'I\'m not open to debate on this'],
  },
  sexual: {
    description: 'Intimacy, touch, consent',
    examples: ['I\'m not ready for that', 'I need to feel safe first'],
  },
};

const BOUNDARY_SCRIPTS = {
  soft: [
    'I appreciate you thinking of me, but I\'m not able to right now.',
    'That doesn\'t work for me, but thank you for asking.',
    'I need some time to think about that.',
  ],
  firm: [
    'No, I\'m not available for that.',
    'I\'ve decided not to do that.',
    'That\'s not something I\'m willing to discuss.',
  ],
  repair: [
    'When you [action], I felt [feeling]. I need [boundary] going forward.',
    'I care about our relationship, and I need to be honest about what I can handle.',
    'This isn\'t about you being bad - it\'s about what I need to be okay.',
  ],
};
```

#### Integration Points
- **Relationships domain:** Cross-reference with conflict resolution
- **Career domain:** Connect with work boundaries tools
- **Wellness domain:** Emotional energy management
- **Communication domain:** Scripts and practice

---

### 1.2 Social Skills & Making Friends

**Domain:** `social-skills`
**Persona Affinity:** Alex (communication), Maya (habits)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `makeFriendsAsAdult` | Make Friends as Adult | Systematic approach to adult friendship | P0 |
| `startConversation` | Start Conversation | Initiate conversations with confidence | P0 |
| `deepenAcquaintance` | Deepen Acquaintance | Move from acquaintance to friend | P0 |
| `navigateSocialAnxiety` | Navigate Social Anxiety | Cope with social situation anxiety | P0 |
| `smallTalkMastery` | Small Talk Mastery | Make small talk feel meaningful | P1 |
| `joinNewGroups` | Join New Groups | Find and integrate into communities | P1 |
| `maintainFriendships` | Maintain Friendships | Keep friendships alive with busy life | P1 |
| `handleSocialRejection` | Handle Social Rejection | Process when connection attempts fail | P1 |
| `networkAuthentically` | Network Authentically | Build genuine professional relationships | P1 |

#### Key Content Areas

```typescript
const FRIENDSHIP_DEVELOPMENT_STAGES = {
  stranger: {
    goal: 'Make contact',
    actions: ['Smile', 'Brief greeting', 'Find common ground'],
    timeframe: 'Single interaction',
  },
  acquaintance: {
    goal: 'Create positive associations',
    actions: ['Remember their name', 'Show genuine interest', 'Find shared interests'],
    timeframe: '3-5 interactions',
  },
  casual_friend: {
    goal: 'Establish reliability',
    actions: ['Initiate contact', 'Make plans', 'Show up consistently'],
    timeframe: '2-3 months',
  },
  friend: {
    goal: 'Build trust and reciprocity',
    actions: ['Share vulnerably', 'Be there in hard times', 'Celebrate wins'],
    timeframe: '6-12 months',
  },
  close_friend: {
    goal: 'Deep mutual investment',
    actions: ['Prioritize the relationship', 'Navigate conflict', 'Accept imperfection'],
    timeframe: 'Years',
  },
};

const CONVERSATION_STARTERS = {
  situational: [
    'How do you know [host/organizer]?',
    'What brings you here today?',
    'Have you been here before?',
  ],
  curious: [
    'What\'s keeping you busy these days?',
    'What are you excited about lately?',
    'What do you do for fun?',
  ],
  deeper: [
    'What made you get into [their field/hobby]?',
    'What\'s your story?',
    'What\'s something you\'re working on that excites you?',
  ],
  follow_up: [
    'Tell me more about that.',
    'What was that like?',
    'How did you feel about that?',
  ],
};

const SOCIAL_ANXIETY_COPING = {
  before: [
    'Set a realistic goal (one meaningful conversation)',
    'Prepare 2-3 conversation topics',
    'Remember: most people are also nervous',
    'Plan your exit strategy (reduces trapped feeling)',
  ],
  during: [
    'Focus on the other person, not yourself',
    'Use grounding techniques if overwhelmed',
    'It\'s okay to take bathroom breaks',
    'You can leave early - you showed up, that\'s enough',
  ],
  after: [
    'Acknowledge your courage',
    'Don\'t overanalyze every interaction',
    'Note what went well',
    'Plan recovery time (being social is tiring)',
  ],
};
```

---

### 1.3 Body Image & Eating Relationship

**Domain:** `body-relationship`
**Persona Affinity:** Maya (habits/wellness), Ferni (emotional support)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `exploreBodyImage` | Explore Body Image | Understand relationship with your body | P0 |
| `challengeBodyThoughts` | Challenge Body Thoughts | Cognitive work on body image | P0 |
| `healDietCulture` | Heal from Diet Culture | Recovery from harmful diet messaging | P0 |
| `intuitiveEatingSupport` | Intuitive Eating Support | Reconnect with hunger/fullness cues | P0 |
| `bodyGratitude` | Body Gratitude | Appreciate what your body does | P1 |
| `dressForYou` | Dress for You | Find joy in clothing again | P1 |
| `navigateTriggers` | Navigate Body Triggers | Cope with triggering situations | P1 |
| `movementJoy` | Movement Joy | Exercise for joy, not punishment | P1 |

#### Key Content Areas

```typescript
const BODY_IMAGE_SPECTRUM = {
  body_hatred: {
    signs: ['Constant negative self-talk', 'Avoiding mirrors', 'Shame spiral', 'Body checking'],
    support_needed: 'Professional + daily practices',
  },
  body_dissatisfaction: {
    signs: ['Frequent comparison', 'Conditional self-acceptance', 'Good/bad body days'],
    support_needed: 'Regular practice + awareness',
  },
  body_neutrality: {
    signs: ['Body is a tool, not identity', 'Less emotional about body', 'Focus on function'],
    support_needed: 'Maintenance + trigger navigation',
  },
  body_acceptance: {
    signs: ['Accept body as is', 'Reduced comparison', 'Dress comfortably'],
    support_needed: 'Ongoing self-compassion',
  },
  body_appreciation: {
    signs: ['Gratitude for body', 'Joyful movement', 'Intuitive self-care'],
    support_needed: 'Continued practice',
  },
};

const DIET_CULTURE_LIES = [
  { lie: 'Thinner is healthier', truth: 'Health is complex and weight is one small factor' },
  { lie: 'You need to earn food through exercise', truth: 'Food is not a reward or punishment' },
  { lie: 'Some foods are "good" and some are "bad"', truth: 'All foods fit; morality doesn\'t apply to food' },
  { lie: 'If you just had more willpower...', truth: 'Diets fail 95% of people, it\'s not about willpower' },
  { lie: 'Your worth is tied to your appearance', truth: 'You are worthy exactly as you are' },
];

const INTUITIVE_EATING_PRINCIPLES = [
  'Reject the diet mentality',
  'Honor your hunger',
  'Make peace with food',
  'Challenge the food police',
  'Discover the satisfaction factor',
  'Feel your fullness',
  'Cope with emotions with kindness',
  'Respect your body',
  'Movement - feel the difference',
  'Honor your health with gentle nutrition',
];
```

#### ⚠️ Safety Considerations
- **Red flags for referral:** Severely restrictive eating, purging behaviors, extreme distress
- **Language:** Never use "overweight/underweight", weight loss language, or "healthy weight"
- **Approach:** Body-neutral to body-positive, never weight-focused

---

### 1.4 Anger Management

**Domain:** `anger`
**Persona Affinity:** Ferni (emotional support), Maya (self-regulation)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `understandAnger` | Understand Anger | Explore anger as a valid emotion | P0 |
| `angerInTheMoment` | Anger in the Moment | De-escalation techniques | P0 |
| `expressAngerHealthily` | Express Anger Healthily | Communicate anger without destruction | P0 |
| `angerTriggerMapping` | Map Anger Triggers | Identify what triggers anger | P0 |
| `repairAfterAnger` | Repair After Anger | Heal relationships after outbursts | P1 |
| `angerVsOtherEmotions` | Anger vs Other Emotions | Understand anger as secondary emotion | P1 |
| `chronicAngerPattern` | Chronic Anger Pattern | Address ongoing anger issues | P1 |
| `assertivenessNotAggression` | Assertiveness Not Aggression | Channel anger into advocacy | P1 |

#### Key Content Areas

```typescript
const ANGER_MYTHS_AND_TRUTHS = [
  { myth: 'Anger is bad', truth: 'Anger is information - it signals your boundaries were crossed' },
  { myth: 'I should suppress anger', truth: 'Suppressed anger often explodes or becomes depression' },
  { myth: 'Venting helps (punching pillows)', truth: 'Venting often increases anger; regulation helps more' },
  { myth: 'I can\'t control my anger', truth: 'You can learn to respond differently to anger' },
  { myth: 'Some people just make me angry', truth: 'Anger is your response - you can change your responses' },
];

const ANGER_ESCALATION_LADDER = {
  level_1: {
    physical: 'Slight tension, faster heartbeat',
    mental: 'Minor irritation, can still think clearly',
    intervention: 'Notice and name it, deep breaths',
  },
  level_2: {
    physical: 'Increased tension, warming face, clenched jaw',
    mental: 'Frustration, thoughts speeding up',
    intervention: 'Take a break, walk away briefly, cold water',
  },
  level_3: {
    physical: 'Heart pounding, shallow breathing, muscle tension',
    mental: 'Racing thoughts, black/white thinking, blame',
    intervention: 'Must exit situation, intense physical release',
  },
  level_4: {
    physical: 'Full fight-or-flight, tunnel vision',
    mental: 'Flooded - logical brain offline',
    intervention: 'Remove self immediately, 20+ minutes to reset',
  },
};

const HEALTHY_ANGER_EXPRESSION = {
  statements: [
    'I feel angry when [situation] because [need not being met].',
    'I need [specific request] to feel okay about this.',
    'I\'m too angry to discuss this well right now. I need [time] and then I want to talk.',
  ],
  physical_releases: [
    'Intense exercise (running, weights)',
    'Screaming into pillow (not AT someone)',
    'Cold shower or ice on wrists',
    'Hard manual labor',
  ],
  cognitive_techniques: [
    'Challenge catastrophic thinking',
    'Consider alternative explanations',
    'Ask: will this matter in 5 years?',
    'What would I tell a friend in this situation?',
  ],
};
```

---

### 1.5 Dating & Modern Relationships

**Domain:** `dating`
**Persona Affinity:** Ferni (emotional support), Alex (communication)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `datingReadinessAssessment` | Dating Readiness | Assess readiness for dating | P0 |
| `navigateOnlineDating` | Navigate Online Dating | Strategy for apps and burnout prevention | P0 |
| `firstDatePrep` | First Date Prep | Prepare for and debrief first dates | P0 |
| `identifyRedFlags` | Identify Red Flags | Recognize warning signs early | P0 |
| `defineWhatYouWant` | Define What You Want | Clarify relationship desires | P0 |
| `handleRejection` | Handle Rejection | Process dating rejection healthily | P1 |
| `paceNewRelationship` | Pace New Relationship | Healthy relationship pacing | P1 |
| `navigateDatingAnxiety` | Navigate Dating Anxiety | Cope with dating-specific anxiety | P1 |
| `recognizeAttachment` | Recognize Attachment Patterns | Understand your attachment style in dating | P1 |

#### Key Content Areas

```typescript
const DATING_READINESS_CHECKLIST = {
  emotional: [
    'Have processed past relationship(s)',
    'Have a life you enjoy independent of dating',
    'Can handle rejection without spiraling',
    'Know your patterns and blind spots',
  ],
  practical: [
    'Have time and energy for dating',
    'Know what you\'re looking for (roughly)',
    'Have boundaries you can maintain',
    'Have support system for processing',
  ],
  mindset: [
    'See dating as discovery, not audition',
    'Can be curious about people without judgment',
    'Value your own company',
    'Ready to be vulnerable again',
  ],
};

const RED_FLAGS = {
  early_warning: [
    'Love-bombing (excessive affection too soon)',
    'Isolating you from friends/family',
    'Inconsistent behavior or stories',
    'Disrespecting your boundaries',
    'Speaking badly of all exes',
  ],
  serious: [
    'Any form of aggression or intimidation',
    'Controlling behavior',
    'Dismissing your feelings',
    'Lying or deception',
    'Pressuring physical intimacy',
  ],
  context_dependent: [
    'Moving very fast (depends on situation)',
    'Heavy drinking/substance use',
    'Poor relationship with family (need context)',
    'Recently ended long relationship',
  ],
};

const ONLINE_DATING_STRATEGY = {
  profile_tips: [
    'Show don\'t tell (activities over adjectives)',
    'Include conversation starters',
    'Recent, clear photos including full body',
    'Be specific about interests',
    'Show personality, not resume',
  ],
  messaging_tips: [
    'Reference something specific from their profile',
    'Ask open-ended questions',
    'Move to meeting within 1-2 weeks',
    'Voice/video before in-person if anxious',
  ],
  burnout_prevention: [
    'Limit time on apps (30 min/day max)',
    'Take breaks (1 week off every month)',
    'Quality over quantity of matches',
    'Remember: apps are a tool, not a verdict on you',
  ],
};

const ATTACHMENT_STYLES_IN_DATING = {
  secure: {
    patterns: 'Comfortable with intimacy and independence',
    dating_behavior: 'Consistent, communicative, can handle uncertainty',
    growth_edge: 'May need patience with non-secure partners',
  },
  anxious: {
    patterns: 'Fear abandonment, need reassurance',
    dating_behavior: 'May over-analyze texts, move fast, fear rejection',
    growth_edge: 'Self-soothing, slowing down, building self-worth outside relationship',
  },
  avoidant: {
    patterns: 'Fear engulfment, value independence highly',
    dating_behavior: 'May pull back when things get close, fear commitment',
    growth_edge: 'Tolerating intimacy, communicating needs, not dismissing feelings',
  },
  disorganized: {
    patterns: 'Both crave and fear intimacy',
    dating_behavior: 'Hot/cold, push-pull, confusion',
    growth_edge: 'Usually needs therapy to rewire patterns',
  },
};
```

---

## Phase 2: Important Domains

### 2.1 Neurodiversity Support

**Domain:** `neurodiversity`
**Persona Affinity:** Maya (habits/routines), Peter (research/strategies)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `adhdDailyStrategies` | ADHD Daily Strategies | Day-to-day ADHD management | P0 |
| `adhdProductivity` | ADHD Productivity | Work and task completion with ADHD | P0 |
| `autismSocialSupport` | Autism Social Support | Navigate social situations | P0 |
| `sensorySupport` | Sensory Support | Manage sensory overwhelm | P0 |
| `executiveFunctionSupport` | Executive Function Support | Planning, starting, completing tasks | P0 |
| `maskingRecovery` | Masking Recovery | Recover from neurodivergent masking | P1 |
| `accommodationsAdvocacy` | Accommodations Advocacy | Request and get accommodations | P1 |
| `neurodivergentStrengths` | Neurodivergent Strengths | Leverage unique abilities | P1 |

#### Key Content Areas

```typescript
const ADHD_STRATEGIES = {
  task_initiation: [
    'Body double (work alongside someone)',
    'Set timer for just 5 minutes',
    'Change environment',
    'Make it novel or gamified',
    'Pair with music or podcast',
  ],
  time_management: [
    'Time blocking (but flexible)',
    'Visual timers',
    'Buffer time between tasks',
    'Routines over willpower',
    'Calendar everything',
  ],
  focus: [
    'Remove phone from room',
    'Use website blockers',
    'Work in sprints (Pomodoro)',
    'Match task to energy level',
    'Movement breaks',
  ],
  emotional_regulation: [
    'Recognize ADHD makes emotions intense',
    'Pause before responding when upset',
    'Physical movement to process',
    'Label the emotion',
    'ADHD isn\'t a character flaw',
  ],
};

const AUTISM_SUPPORT = {
  social_situations: {
    preparation: 'Script conversations, plan exit, know what to expect',
    during: 'Stimming is okay, take breaks, you don\'t have to make eye contact',
    recovery: 'Plan decompression time, honor your limits',
  },
  sensory_management: {
    identify: 'Map your sensory profile - what overwhelms, what soothes?',
    tools: 'Noise-canceling headphones, sunglasses, fidgets, weighted items',
    environment: 'Control lighting, reduce visual clutter, create quiet space',
  },
  masking: {
    awareness: 'Notice when you\'re performing vs. being authentic',
    cost: 'Masking causes burnout - it\'s not sustainable',
    recovery: 'Safe spaces to be fully yourself, unmask with trusted people',
  },
};

const EXECUTIVE_FUNCTION_SCAFFOLDS = {
  planning: [
    'Brain dump everything first',
    'Use visual planning tools',
    'Break into tiny steps',
    'Front-load decisions',
  ],
  organizing: [
    'Everything has a home',
    'Use clear containers',
    'Less is more',
    'Put things away immediately',
  ],
  starting: [
    'Lowest possible first step',
    'Just put your body in the place',
    'Set up environment for success',
    'Use implementation intentions (when X, then Y)',
  ],
  completing: [
    'Define "done" clearly',
    'Set artificial deadlines',
    'External accountability',
    'Celebrate finishing',
  ],
};
```

---

### 2.2 Trauma-Informed Support

**Domain:** `trauma-support`
**Persona Affinity:** Ferni (emotional support), Nayan (wisdom/perspective)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `traumaAwareness` | Trauma Awareness | Understand how trauma affects you | P0 |
| `triggerManagement` | Trigger Management | Navigate and recover from triggers | P0 |
| `nervousSystemRegulation` | Nervous System Regulation | Calm the fight/flight/freeze response | P0 |
| `traumaAnniversarySupport` | Trauma Anniversary Support | Navigate difficult dates | P1 |
| `windowOfTolerance` | Window of Tolerance | Stay within manageable activation | P1 |
| `groundingAdvanced` | Advanced Grounding | Beyond basic grounding techniques | P1 |
| `selfCompassionForSurvivors` | Self-Compassion for Survivors | Combat survivor guilt and shame | P1 |

#### Key Content Areas

```typescript
const TRAUMA_RESPONSES = {
  fight: {
    looks_like: 'Anger, aggression, need to control, arguing',
    underneath: 'Protection response - trying to create safety',
    support: 'Channel energy safely, recognize the protection, breathwork',
  },
  flight: {
    looks_like: 'Anxiety, overthinking, can\'t sit still, escape behaviors',
    underneath: 'The body wants to run from perceived danger',
    support: 'Movement, reassurance of safety, orient to present',
  },
  freeze: {
    looks_like: 'Shutdown, numbness, dissociation, can\'t think/act',
    underneath: 'System overwhelmed, playing dead',
    support: 'Gentle sensation, warmth, slow movement, no pressure',
  },
  fawn: {
    looks_like: 'People-pleasing, over-agreeing, loss of self',
    underneath: 'Safety through appeasement',
    support: 'Practice small nos, reconnect with own needs, boundaries work',
  },
};

const WINDOW_OF_TOLERANCE = {
  hyperarousal: {
    signs: 'Racing heart, can\'t calm down, panic, rage',
    practices: 'Slow exhales, cold water, grounding, movement',
  },
  within_window: {
    signs: 'Can think and feel, present, regulated',
    practices: 'This is the goal - expand through gradual practice',
  },
  hypoarousal: {
    signs: 'Numb, disconnected, foggy, shutdown',
    practices: 'Stimulation, movement, strong sensation, connection',
  },
};

const TRIGGER_RECOVERY = {
  recognize: 'This is a trauma response, not present danger',
  regulate: 'Breathe, ground, orient to now',
  relate: 'Connect with safe person or part of self',
  return: 'Come back to present moment gently',
  reflect: 'Later - what was the trigger? What need does it reveal?',
};
```

#### ⚠️ Safety Considerations
- **Not therapy:** We support, not process trauma. Refer to professionals for processing.
- **Language:** Never push for details, always validate, respect pace
- **Crisis protocol:** Active suicidality/self-harm → crisis resources immediately

---

### 2.3 Procrastination Psychology

**Domain:** `procrastination`
**Persona Affinity:** Maya (habits), Peter (analysis)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `procrastinationRootCause` | Procrastination Root Cause | Understand WHY you procrastinate | P0 |
| `getStarted` | Get Started | Overcome the starting barrier | P0 |
| `emotionalProcrastination` | Emotional Procrastination | Address avoidance of feelings | P0 |
| `perfectionismProcrastination` | Perfectionism → Procrastination | Break the perfectionism link | P0 |
| `urgencyCreation` | Create Urgency | Manufacture motivation | P1 |
| `taskAversion` | Overcome Task Aversion | Work with tasks you hate | P1 |
| `procrastinationPatterns` | Procrastination Patterns | Identify your specific type | P1 |

#### Key Content Areas

```typescript
const PROCRASTINATION_TYPES = {
  anxious: {
    cause: 'Fear of failure, fear of judgment, overwhelm',
    pattern: 'Avoid starting because outcome feels scary',
    intervention: 'Address the fear first, then the task',
  },
  perfectionist: {
    cause: 'Fear of not doing it perfectly',
    pattern: '"If I can\'t do it right, why start?"',
    intervention: 'Permission to do it badly, "B- work"',
  },
  rebel: {
    cause: 'Resistance to obligation, resentment of "have to"',
    pattern: 'Delay as assertion of autonomy',
    intervention: 'Reframe as choice, connect to personal values',
  },
  dreamer: {
    cause: 'Prefer imagining to doing, overwhelmed by details',
    pattern: 'Great ideas, no execution',
    intervention: 'Concrete next steps, accountability, structure',
  },
  crisis_maker: {
    cause: 'Only feel motivated under pressure',
    pattern: 'Wait until last minute, then perform',
    intervention: 'Create artificial deadlines, examine cost of pattern',
  },
  busy: {
    cause: 'Fill time with easy tasks to avoid hard ones',
    pattern: '"I\'m so busy" but not on important things',
    intervention: 'Prioritize ruthlessly, eat the frog',
  },
};

const GET_STARTED_TECHNIQUES = {
  micro_commitment: 'Just open the document. Just write one sentence.',
  temptation_bundling: 'Pair unpleasant task with something enjoyable',
  implementation_intention: 'At [time], in [place], I will [tiny action]',
  environment_design: 'Make starting easy, make distraction hard',
  body_first: 'Put your body in the location, brain follows',
  fake_deadline: 'Tell someone you\'ll have it done by X',
  pre_decision: 'Decide the night before exactly what you\'ll do',
  worst_first: 'Do the dreaded thing first thing in the day',
};

const PROCRASTINATION_TRUTHS = [
  'Procrastination is an emotional regulation problem, not a time management problem',
  'You\'re not lazy - you\'re avoiding a feeling',
  'Forgiveness for past procrastination reduces future procrastination',
  'The pain of doing is usually less than the pain of avoiding',
  'Starting is the hardest part - momentum helps once you begin',
];
```

---

### 2.4 Digital Wellness

**Domain:** `digital-wellness`
**Persona Affinity:** Maya (habits), Ferni (boundaries)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `assessDigitalHealth` | Assess Digital Health | Evaluate relationship with technology | P0 |
| `screenTimeIntervention` | Screen Time Intervention | Reduce excessive screen use | P0 |
| `socialMediaImpact` | Social Media Impact | Understand and manage social media effects | P0 |
| `digitalBoundaries` | Digital Boundaries | Set healthy tech limits | P0 |
| `phoneAddiction` | Phone Addiction | Break compulsive phone checking | P1 |
| `fomoRecovery` | FOMO Recovery | Heal fear of missing out | P1 |
| `digitalDetoxPlan` | Digital Detox Plan | Structured break from technology | P1 |
| `mindfulTechUse` | Mindful Tech Use | Intentional technology relationship | P1 |

#### Key Content Areas

```typescript
const DIGITAL_HEALTH_ASSESSMENT = {
  questions: [
    'First thing I do in the morning: check phone?',
    'Last thing before sleep: scroll?',
    'How I feel after 30 min on social media?',
    'Can I eat a meal without looking at screen?',
    'Do I reach for phone in any moment of boredom?',
    'Do I feel anxious if I can\'t check my phone?',
    'Has anyone commented on my phone use?',
  ],
  scoring: {
    healthy: 'Tech is a tool, you control it',
    concerning: 'Some compulsive patterns, worth addressing',
    problematic: 'Tech is controlling you, significant intervention needed',
  },
};

const SOCIAL_MEDIA_REALITIES = [
  'What you see is curated, not real life',
  'Comparison is the thief of joy - and social media is a comparison machine',
  'Algorithms are designed to maximize engagement, not your wellbeing',
  'The people posting most aren\'t necessarily the happiest',
  'Your worth isn\'t measured in likes',
  'FOMO is manufactured - you\'re not missing as much as it feels',
];

const DIGITAL_BOUNDARY_SCRIPTS = {
  self: [
    'No phone in bedroom',
    'No screens first/last hour of day',
    'One screen at a time',
    'Scheduled social media times only',
    'App limits and screen time tracking',
  ],
  others: [
    'I don\'t check work email after 6pm',
    'I take time to respond to texts - not an emergency response service',
    'I\'m not on social media much - best way to reach me is...',
    'I do digital sabbaths on weekends',
  ],
};

const PHONE_ADDICTION_RECOVERY = {
  awareness: [
    'Track actual screen time for a week',
    'Notice what triggers pickup (boredom, anxiety, habit)',
    'Count how often you reach for phone without reason',
  ],
  friction: [
    'Remove social apps from phone',
    'Turn off all non-essential notifications',
    'Grayscale mode',
    'Keep phone in another room',
    'Use a physical alarm clock',
  ],
  replacement: [
    'What will you do instead of scroll?',
    'Boredom is okay - practice sitting with it',
    'Carry a book instead',
    'Keep phone in bag when out',
  ],
};
```

---

### 2.5 Perfectionism & Imposter Syndrome

**Domain:** `perfectionism`
**Persona Affinity:** Maya (self-compassion), Ferni (emotional support)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `perfectionismAwareness` | Perfectionism Awareness | Identify perfectionist patterns | P0 |
| `goodEnoughPractice` | Good Enough Practice | Learn to accept "B- work" | P0 |
| `imposterSyndromeSupport` | Imposter Syndrome Support | Navigate feeling like a fraud | P0 |
| `failureFriendship` | Failure as Friend | Reframe relationship with failure | P0 |
| `selfCriticism Softening` | Soften Self-Criticism | Transform harsh inner critic | P1 |
| `worthBeyondAchievement` | Worth Beyond Achievement | Decouple identity from performance | P1 |
| `celebrateProgress` | Celebrate Progress | Acknowledge growth and effort | P1 |

#### Key Content Areas

```typescript
const PERFECTIONISM_TYPES = {
  self_oriented: {
    description: 'Demanding perfection of yourself',
    thoughts: '"I must not make mistakes", "If it\'s not perfect, I failed"',
    cost: 'Burnout, procrastination, anxiety',
  },
  other_oriented: {
    description: 'Demanding perfection of others',
    thoughts: '"Why can\'t they get it right?", "I have to do everything myself"',
    cost: 'Relationship damage, isolation, resentment',
  },
  socially_prescribed: {
    description: 'Believing others demand perfection of you',
    thoughts: '"Everyone expects me to be perfect", "I can\'t let them see me fail"',
    cost: 'Anxiety, people-pleasing, hiding true self',
  },
};

const PERFECTIONISM_COSTS = [
  'Procrastination (if I can\'t do it perfectly, why start?)',
  'Burnout (never-ending striving)',
  'Missed opportunities (too scared to try)',
  'Damaged relationships (harsh standards applied to others)',
  'Lost joy (can\'t appreciate what you\'ve done)',
  'Imposter syndrome (any success feels like luck)',
  'Anxiety and depression',
];

const GOOD_ENOUGH_PRACTICES = {
  reframes: [
    'Done is better than perfect',
    'B- work that exists > A+ work that doesn\'t',
    'Perfect is the enemy of good',
    'My best right now, given the constraints',
  ],
  experiments: [
    'Intentionally submit something "imperfect"',
    'Share something unpolished',
    'Do something you\'re bad at for fun',
    'Leave something at 80%',
  ],
  questions: [
    'What would "good enough" look like here?',
    'Who am I trying to impress and why?',
    'What\'s the cost of perfecting this further?',
    'Will the extra 20% effort yield 20% better results?',
  ],
};

const IMPOSTER_SYNDROME_REFRAMES = {
  evidence_gathering: 'List concrete evidence of your competence',
  normalize: '70% of people experience imposter feelings - it\'s not unique to you',
  reframe_doubt: 'Feeling like an imposter might mean you\'re growing into new territory',
  external_validation: 'Would you doubt someone else with your qualifications?',
  acknowledge_luck: 'Yes, luck played a role. AND you also worked hard and have skills',
};
```

---

## Phase 3: Valuable Domains

### 3.1 Sexuality & Intimacy

**Domain:** `intimacy`
**Persona Affinity:** Ferni (emotional support), Maya (wellness)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `sexualWellnessCheckin` | Sexual Wellness Check-in | Assess sexual health and satisfaction | P0 |
| `intimacyInRelationship` | Intimacy in Relationship | Support intimate connection | P0 |
| `desireDiscrepancy` | Desire Discrepancy | Navigate different libido levels | P0 |
| `communicateSexualNeeds` | Communicate Sexual Needs | Talk about sex with partner | P0 |
| `healSexualShame` | Heal Sexual Shame | Address shame around sexuality | P1 |
| `reconnectWithBody` | Reconnect With Body | Embodiment and pleasure | P1 |
| `sexualIdentityExploration` | Sexual Identity Exploration | Understand sexual orientation/identity | P1 |

#### ⚠️ Safety & Approach
- **Age verification:** Ensure user is adult
- **Consent focus:** Always emphasize consent and safety
- **No graphic content:** Support conversation, not explicit material
- **Referral ready:** Sex therapy resources for complex issues
- **LGBTQ+ inclusive:** All orientations and identities valid

---

### 3.2 Burnout Recovery

**Domain:** `burnout-recovery`
**Persona Affinity:** Maya (rest/wellness), Ferni (emotional support)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `burnoutRecoveryJourney` | Burnout Recovery Journey | Structured recovery path | P0 |
| `restAsSkill` | Rest as Skill | Learn to actually rest | P0 |
| `rebuildAfterBurnout` | Rebuild After Burnout | Return to productivity sustainably | P0 |
| `preventBurnoutRecurrence` | Prevent Recurrence | Avoid future burnout | P1 |
| `burnoutIdentityCrisis` | Burnout Identity Crisis | Who am I without constant work? | P1 |

---

### 3.3 Chronic Illness & Disability

**Domain:** `chronic-conditions`
**Persona Affinity:** Ferni (support), Maya (adaptation)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `livingWellWithCondition` | Living Well with Condition | Quality of life with chronic illness | P0 |
| `paceAndEnergy` | Pace and Energy | Spoon theory, energy management | P0 |
| `griefOfAbility` | Grief of Ability | Process ability loss | P0 |
| `advocateForYourself` | Self-Advocacy | Medical and accommodation advocacy | P1 |
| `chronicIllnessMentalHealth` | Chronic Illness Mental Health | Mind-body connection | P1 |

---

### 3.4 Midlife & Aging

**Domain:** `midlife`
**Persona Affinity:** Nayan (wisdom), Jordan (life planning)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `midlifeReflection` | Midlife Reflection | Navigate midlife transition | P0 |
| `agingGracefully` | Aging Gracefully | Accept and embrace aging | P0 |
| `legacyPlanning` | Legacy Planning | What do you want to leave behind? | P0 |
| `emptyNestTransition` | Empty Nest | Transition when kids leave | P1 |
| `retirementIdentity` | Retirement Identity | Who am I without work? | P1 |

---

### 3.5 Divorce & Breakup Recovery

**Domain:** `breakup-recovery`
**Persona Affinity:** Ferni (emotional support), Jordan (rebuilding)

#### Tools to Implement

| Tool ID | Name | Description | Priority |
|---------|------|-------------|----------|
| `breakupRecoveryJourney` | Breakup Recovery Journey | Structured healing path | P0 |
| `processBreakupEmotions` | Process Emotions | Work through grief, anger, relief | P0 |
| `rebuildAfterBreakup` | Rebuild Self | Rediscover identity post-relationship | P0 |
| `coparentingSupport` | Coparenting Support | Navigate co-parenting | P1 |
| `whenReadyToDateAgain` | Ready to Date Again? | Assess readiness for new relationship | P1 |

---

## Phase 4: Integration & Validation

### 4.1 Semantic Router Integration

Each new domain needs to be integrated into the semantic router for proper tool routing.

#### Updates Required

**File:** `src/tools/semantic-router/advanced/datasets.ts`

```typescript
// Add to toolbenchMappings
const NEW_DOMAIN_MAPPINGS = [
  {
    category: 'Boundaries',
    queries: [
      'I need to set a boundary',
      'How do I say no',
      'They keep crossing my limits',
      'I\'m a people pleaser',
      'How to tell them I can\'t',
    ],
    mapToTool: 'setBoundary',
  },
  {
    category: 'Social/Friends',
    queries: [
      'How do I make friends as an adult',
      'I\'m lonely and don\'t know how to connect',
      'How to start conversations',
      'Social anxiety',
      'I don\'t have any close friends',
    ],
    mapToTool: 'makeFriendsAsAdult',
  },
  // ... add for each domain
];

// Add to synthetic examples
const NEW_SYNTHETIC_TEMPLATES = [
  {
    patterns: [
      'I need to set a boundary with {person}',
      'How do I tell {person} no',
      'I can\'t keep saying yes to {person}',
    ],
    toolId: 'setBoundary',
    slots: {
      person: ['my mom', 'my boss', 'my partner', 'my friend', 'them'],
    },
  },
  // ... add for each domain
];
```

### 4.2 Function Calling Integration

**Updates Required:**

1. **`src/personas/bundles/shared/function-calling-base.md`**
   - Add new tool definitions with trigger patterns

2. **`src/agents/shared/tool-call-sanitizer.ts`**
   - Add new tool names to `TOOL_NAME_PATTERNS`

3. **`src/agents/shared/json-function-executor.ts`**
   - Add routes in `routeToTool()` for each new tool

4. **`src/agents/shared/function-call-format.ts`**
   - Add to `REGISTERED_TOOLS` array

### 4.3 Persona Integration

Each domain maps to specific personas:

| Domain | Primary Persona | Secondary |
|--------|----------------|-----------|
| boundaries | Maya | Alex |
| social-skills | Alex | Ferni |
| body-relationship | Maya | Ferni |
| anger | Ferni | Maya |
| dating | Ferni | Alex |
| neurodiversity | Maya | Peter |
| trauma-support | Ferni | Nayan |
| procrastination | Maya | Peter |
| digital-wellness | Maya | Ferni |
| perfectionism | Maya | Ferni |
| intimacy | Ferni | Maya |
| burnout-recovery | Maya | Ferni |
| chronic-conditions | Ferni | Maya |
| midlife | Nayan | Jordan |
| breakup-recovery | Ferni | Jordan |

**Updates Required:**
- `src/personas/bundles/{persona}/identity/function-calling-specialty.md`
- `src/personas/bundles/{persona}/content/behaviors/superhuman-insights.json`

### 4.4 Tool Descriptions Configuration

**File:** `src/tools/config/tool-descriptions.json`

Add descriptions for each new tool that help the LLM understand when to use them.

```json
{
  "setBoundary": "Help the user set or communicate a boundary. Use when: they mention limits, saying no, feeling taken advantage of, people-pleasing, or someone crossing lines.",
  "makeFriendsAsAdult": "Guide the user in making friends as an adult. Use when: they mention loneliness, not having friends, wanting connection, moving to a new place, or struggling to meet people.",
  // ... for each tool
}
```

---

## Validation Strategy

### 5.1 Unit Tests

For each domain, create test file:
`src/tools/domains/{domain}/__tests__/{domain}.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToolDefinitions } from '../index.js';

describe('Boundaries Domain Tools', () => {
  let toolDefinitions;
  let mockContext;

  beforeEach(async () => {
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all expected tools', () => {
      const toolIds = toolDefinitions.map(t => t.id);
      expect(toolIds).toContain('setBoundary');
      expect(toolIds).toContain('identifyBoundaryNeeds');
      // ... all expected tools
    });
  });

  describe('setBoundary', () => {
    it('should provide boundary scripts for soft boundaries', async () => {
      const tool = toolDefinitions.find(t => t.id === 'setBoundary');
      const result = await tool.create(mockContext).execute({
        boundaryType: 'time',
        firmness: 'soft',
        situation: 'boss asking to work weekends',
      });
      
      expect(result).toContain('boundary');
      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should handle all boundary types', async () => {
      const tool = toolDefinitions.find(t => t.id === 'setBoundary');
      const types = ['physical', 'emotional', 'time', 'digital', 'material', 'intellectual', 'sexual'];
      
      for (const type of types) {
        const result = await tool.create(mockContext).execute({
          boundaryType: type,
          firmness: 'firm',
        });
        expect(result.length).toBeGreaterThan(100);
      }
    });
  });
});
```

### 5.2 Integration Tests

**File:** `src/tests/new-domains-integration.test.ts`

```typescript
describe('New Domains Integration', () => {
  describe('Semantic Router', () => {
    it('should route boundary queries to boundary tools', async () => {
      const queries = [
        'I need to set a boundary',
        'How do I say no to my boss',
        'They keep ignoring my limits',
      ];
      
      for (const query of queries) {
        const result = await semanticRouter.route(query);
        expect(result.domain).toBe('boundaries');
      }
    });
  });

  describe('Tool Chain Flows', () => {
    it('should support boundary → relationship → wellness chain', async () => {
      // Test that tools can flow into each other naturally
    });
  });
});
```

### 5.3 E2E Voice Tests

**File:** `src/tests/new-domains-e2e.test.ts`

```typescript
describe('New Domains E2E Voice', () => {
  it('should handle boundary conversation naturally', async () => {
    const conversation = [
      { user: 'I need help saying no to people' },
      { expectTool: 'identifyBoundaryNeeds' },
      { user: 'My mom keeps showing up unannounced' },
      { expectTool: 'setBoundary' },
    ];
    
    await runVoiceConversationTest(conversation);
  });
});
```

---

## Critical Audit Checklist

### 6.1 Pre-Launch Audit

For each domain, verify:

#### Code Quality
- [ ] All tools have proper TypeScript types
- [ ] No `any` types used
- [ ] Proper error handling
- [ ] Logging uses `createLogger()`
- [ ] Files under 500 lines
- [ ] Tests exist and pass
- [ ] No console.log statements

#### Content Quality
- [ ] Language is warm and human (not clinical)
- [ ] No jargon without explanation
- [ ] Actionable advice, not just information
- [ ] Appropriate for voice delivery (not too long)
- [ ] No placeholder text
- [ ] Culturally inclusive language

#### Safety
- [ ] Crisis handoffs work for severe cases
- [ ] No medical/legal/financial advice given
- [ ] Appropriate disclaimers where needed
- [ ] Red flags trigger appropriate response
- [ ] Professional referral suggestions included

#### Integration
- [ ] Registered in domain index
- [ ] Semantic router trained
- [ ] Function calling definitions added
- [ ] Tool descriptions configured
- [ ] Persona mappings correct
- [ ] Works in voice flow

### 6.2 Post-Launch Monitoring

Track for first 2 weeks:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Tool trigger rate | >5% for new tools | <1% (tool not routing) |
| User satisfaction | >4.0/5 | <3.5 |
| Conversation completion | >80% | <60% |
| Crisis escalation rate | <5% | >10% (content too heavy) |
| Error rate | <1% | >5% |

### 6.3 Audit Report Template

```markdown
# Domain Audit: {Domain Name}
Date: {Date}
Auditor: {Name}

## Summary
- Tools implemented: X/Y
- Tests passing: X/Y
- Integration complete: Yes/No

## Tool-by-Tool Review

### {Tool ID}
- [ ] Code quality: Pass/Fail
- [ ] Content quality: Pass/Fail  
- [ ] Safety review: Pass/Fail
- [ ] Voice test: Pass/Fail
- Issues found:
- Remediation:

## Integration Verification
- [ ] Semantic router: Tested
- [ ] Function calling: Tested
- [ ] Persona handoff: Tested

## Safety Review
- [ ] Crisis paths work
- [ ] Disclaimers present
- [ ] No harmful advice

## Sign-off
Ready for production: Yes/No
Conditions:
```

---

## Timeline & Resources

### Implementation Schedule

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Phase 1a | Boundaries, Social Skills domains |
| 2 | Phase 1b | Body Image, Anger, Dating domains |
| 3 | Phase 2a | Neurodiversity, Trauma Support |
| 4 | Phase 2b | Procrastination, Digital Wellness, Perfectionism |
| 5 | Phase 3a | Intimacy, Burnout Recovery |
| 6 | Phase 3b | Chronic Conditions, Midlife, Breakup Recovery |
| 7 | Integration | Semantic router, function calling, personas |
| 8 | Validation | Full test suite, E2E testing, audit |

### Estimated Effort

| Component | Hours per Domain |
|-----------|-----------------|
| Tool implementation | 4-8 hrs |
| Content creation | 4-6 hrs |
| Tests | 2-4 hrs |
| Integration | 2-3 hrs |
| Review & polish | 2 hrs |
| **Total per domain** | **14-23 hrs** |

**15 domains × 18 hrs avg = ~270 hours total**

---

## Success Criteria

The expansion is successful when:

1. **Coverage:** All 15 new domains implemented and integrated
2. **Quality:** All domains pass audit checklist
3. **Routing:** >90% of relevant queries route to correct domain
4. **Safety:** Zero harmful responses in testing
5. **Usability:** Users can naturally access new capabilities
6. **Performance:** No latency regression from increased tool set

---

## Appendix A: File Structure

```
src/tools/domains/
├── boundaries/
│   ├── index.ts              # Tool definitions
│   ├── scripts.ts            # Boundary scripts database
│   ├── types.ts              # TypeScript types
│   └── __tests__/
│       └── boundaries.test.ts
├── social-skills/
│   ├── index.ts
│   ├── conversation-starters.ts
│   ├── friendship-stages.ts
│   └── __tests__/
├── body-relationship/
│   ├── index.ts
│   ├── diet-culture.ts
│   ├── intuitive-eating.ts
│   └── __tests__/
├── anger/
│   ├── index.ts
│   ├── escalation-ladder.ts
│   ├── expression-scripts.ts
│   └── __tests__/
├── dating/
│   ├── index.ts
│   ├── red-flags.ts
│   ├── attachment-styles.ts
│   ├── online-dating.ts
│   └── __tests__/
├── neurodiversity/
│   ├── index.ts
│   ├── adhd-strategies.ts
│   ├── autism-support.ts
│   ├── executive-function.ts
│   └── __tests__/
├── trauma-support/
│   ├── index.ts
│   ├── responses.ts
│   ├── regulation.ts
│   └── __tests__/
├── procrastination/
│   ├── index.ts
│   ├── types.ts
│   ├── techniques.ts
│   └── __tests__/
├── digital-wellness/
│   ├── index.ts
│   ├── assessment.ts
│   ├── boundaries.ts
│   └── __tests__/
├── perfectionism/
│   ├── index.ts
│   ├── types.ts
│   ├── practices.ts
│   └── __tests__/
├── intimacy/
│   ├── index.ts
│   ├── communication.ts
│   └── __tests__/
├── burnout-recovery/
│   ├── index.ts
│   ├── stages.ts
│   └── __tests__/
├── chronic-conditions/
│   ├── index.ts
│   ├── energy-management.ts
│   └── __tests__/
├── midlife/
│   ├── index.ts
│   ├── transitions.ts
│   └── __tests__/
└── breakup-recovery/
    ├── index.ts
    ├── stages.ts
    └── __tests__/
```

---

## Appendix B: Semantic Router Training Data

See separate file: `docs/SEMANTIC-ROUTER-TRAINING-DATA.md`

---

## Appendix C: Crisis Escalation Paths

| Domain | Trigger | Action |
|--------|---------|--------|
| anger | Violence mention | Crisis resources + safety check |
| body-relationship | ED behaviors | Referral to ED specialist |
| trauma-support | Active flashback | Grounding + crisis resources |
| intimacy | Assault disclosure | RAINN + crisis resources |
| breakup-recovery | Self-harm mention | 988 + safety planning |
| All | Suicidal ideation | Immediate crisis protocol |

---

*Document created: [Date]*
*Last updated: [Date]*
*Owner: Life Coaching Domain Expansion Team*

