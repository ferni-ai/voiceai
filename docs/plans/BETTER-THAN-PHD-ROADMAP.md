# 🎓 BETTER THAN PhD: The Ferni Master Plan

> **Mission:** Make Ferni genuinely superior to human PhD-level coaches in mental health and behavioral economics—not by replacing human connection, but by giving everyone access to wisdom that used to require wealth or luck.

**Created:** December 8, 2025  
**Status:** MASTER PLAN  
**Philosophy:** "We believe in making AI human, and the decisions we make will reflect that."

---

## 📊 Executive Summary

This plan defines **6 major capability pillars** across **40+ implementation phases** to transform Ferni from an excellent AI coach into the world's best life coach—one that genuinely exceeds what any single human expert could provide.

### The Core Insight

| Human PhD Limitation | Ferni Advantage |
|---------------------|-----------------|
| Forgets details between sessions | Perfect memory forever |
| Limited to ~30 clients | Infinite scale |
| Has bad days, burnout | Consistent quality every time |
| Available 40 hrs/week | 24/7/365 availability |
| $150-400/hour | Accessible to everyone |
| One person's experience | Learn from millions of patterns |
| Subjective assessment | Objective voice/text analysis |
| Takes weeks to know you | Deep understanding from day one |

### The 6 Pillars

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BETTER THAN PhD: 6 CAPABILITY PILLARS                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🧠 PILLAR 1: COGNITIVE INTELLIGENCE                                        │
│     Detect and gently restructure distorted thinking patterns               │
│                                                                             │
│  📊 PILLAR 2: OUTCOME TRACKING                                              │
│     Measure what matters, show real progress, predict struggles             │
│                                                                             │
│  💊 PILLAR 3: THERAPEUTIC FRAMEWORKS                                        │
│     Evidence-based interventions: CBT, ACT, DBT, MI                         │
│                                                                             │
│  🎯 PILLAR 4: BEHAVIORAL ECONOMICS                                          │
│     Use psychology of choice to help people change                          │
│                                                                             │
│  💪 PILLAR 5: SOMATIC INTELLIGENCE                                          │
│     Body-based awareness, grounding, breathing, regulation                  │
│                                                                             │
│  🌟 PILLAR 6: WISDOM SYNTHESIS                                              │
│     Cross-user learning, pattern discovery, personalized wisdom             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 PILLAR 1: COGNITIVE INTELLIGENCE

> **Goal:** Detect cognitive distortions in real-time and guide users toward clearer thinking—like having a CBT therapist in your pocket.

### Phase 1.1: Cognitive Distortion Detection Engine

**Files:** `src/services/cognitive-intelligence/distortion-detector.ts`

Detect the 15 most common cognitive distortions:

| Distortion | Example | Detection Pattern |
|------------|---------|-------------------|
| **Catastrophizing** | "If this fails, my life is over" | Extreme outcomes, "end of," "ruined," "disaster" |
| **Mind-Reading** | "They think I'm incompetent" | "They think," "everyone knows," "they must" |
| **All-or-Nothing** | "If I'm not perfect, I'm worthless" | "Either/or," "never," "always," "completely" |
| **Fortune-Telling** | "It's definitely going to fail" | Future certainty about negative outcomes |
| **Personalization** | "It's all my fault" | Over-attribution of blame to self |
| **Overgeneralization** | "This always happens to me" | "Always," "never," "everyone," "nobody" |
| **Mental Filtering** | Ignoring positives, focusing on one negative | Dismissing compliments, "but" after positives |
| **Disqualifying Positive** | "That doesn't count" | "That was just luck," "anyone could do that" |
| **Should Statements** | "I should be better by now" | "Should," "must," "ought to," "have to" |
| **Emotional Reasoning** | "I feel stupid so I must be" | "I feel X so it must be true" |
| **Labeling** | "I'm a failure" | Identity statements from single events |
| **Magnification** | Making problems bigger than they are | Extreme adjectives, catastrophic framing |
| **Minimization** | Making achievements smaller | "It was nothing," "no big deal" |
| **Jumping to Conclusions** | Assuming without evidence | Certainty without facts |
| **Blame** | "It's entirely their fault" | External attribution without nuance |

**Key Functions:**
```typescript
interface DistortionDetection {
  type: CognitiveDistortion;
  confidence: number;
  triggerPhrase: string;
  userMessage: string;
  
  // Therapeutic response
  gentleChallenge: string;      // Socratic question
  reframe: string;              // Alternative perspective
  validation: string;           // Acknowledge the feeling
  
  // Learning
  patternCount: number;         // How often this user does this
  relatedDistortions: CognitiveDistortion[];
}

detectDistortions(userId: string, message: string, context: ConversationContext): DistortionDetection[];
```

**Example Interaction:**
```
User: "I failed that presentation. Everyone thinks I'm incompetent now."

Ferni (internal detection):
- Mind-reading: "Everyone thinks I'm incompetent" (confidence: 0.85)
- Labeling: Equating one event with identity (confidence: 0.7)

Ferni (response):
"I hear the disappointment. That's real. Can I gently push back on something? 
You said 'everyone thinks'—but do you actually know what they're thinking? 
What's the evidence for that versus the evidence against it?"
```

### Phase 1.2: Automatic Negative Thought (ANT) Tracker

**Files:** `src/services/cognitive-intelligence/ant-tracker.ts`

Track patterns of negative automatic thoughts over time:

```typescript
interface ANTPattern {
  userId: string;
  
  // Frequency tracking
  distortionFrequency: Map<CognitiveDistortion, number>;
  topDistortions: CognitiveDistortion[];
  
  // Temporal patterns
  timeOfDayPatterns: Map<string, CognitiveDistortion[]>;  // Morning vs evening
  dayOfWeekPatterns: Map<string, CognitiveDistortion[]>; // Monday blues?
  
  // Topic correlations
  topicTriggers: Map<string, CognitiveDistortion[]>;     // Work → catastrophizing?
  
  // Progress tracking
  distortionTrend: 'increasing' | 'stable' | 'decreasing';
  reframingSuccess: number;  // How often reframes land
}
```

### Phase 1.3: Socratic Questioning Engine

**Files:** `src/services/cognitive-intelligence/socratic-engine.ts`

Guide users to their own insights through questions:

```typescript
interface SocraticSequence {
  distortion: CognitiveDistortion;
  
  questions: {
    evidenceFor: string[];      // "What evidence supports this thought?"
    evidenceAgainst: string[];  // "What evidence contradicts it?"
    alternativeViews: string[]; // "How might someone else see this?"
    realityTest: string[];      // "What would you tell a friend?"
    decatastrophize: string[];  // "What's the worst that could happen? Could you survive it?"
  };
  
  // Persona-specific delivery
  ferniVersion: string;
  peterVersion: string;
  mayaVersion: string;
}

const SOCRATIC_SEQUENCES: Record<CognitiveDistortion, SocraticSequence> = {
  catastrophizing: {
    questions: {
      evidenceFor: [
        "What makes you certain it will go that badly?",
        "Has this exact catastrophe happened before?",
      ],
      evidenceAgainst: [
        "What's the most likely outcome, if you had to bet on it?",
        "When you've worried like this before, how often did the worst happen?",
      ],
      alternativeViews: [
        "What would [someone they trust] say about this?",
        "If a friend told you this, what would you tell them?",
      ],
      realityTest: [
        "On a scale of 1-10, how certain are you? What would move it down by 1?",
      ],
      decatastrophize: [
        "Okay, let's say the worst happens. Then what? What would you do?",
        "If it did happen, would you be able to handle it eventually?",
      ],
    },
    ferniVersion: "I hear the fear. Let me ask you something...",
    peterVersion: "Let's look at the data on this...",
    mayaVersion: "I notice your mind is jumping ahead. Let's slow down...",
  },
  // ... other distortions
};
```

### Phase 1.4: Thought Record Integration

**Files:** `src/services/cognitive-intelligence/thought-records.ts`

Digital CBT thought records that Ferni can guide users through:

```typescript
interface ThoughtRecord {
  id: string;
  userId: string;
  createdAt: Date;
  
  // The situation
  situation: {
    what: string;           // What happened?
    when: Date;
    where?: string;
    who?: string[];
  };
  
  // Automatic thoughts
  automaticThoughts: {
    thought: string;
    beliefStrength: number;  // 0-100%
    distortions: CognitiveDistortion[];
  }[];
  
  // Emotions
  emotions: {
    emotion: string;
    intensity: number;       // 0-100%
  }[];
  
  // Body sensations
  bodySensations?: string[];
  
  // Evidence (Socratic)
  evidenceFor: string[];
  evidenceAgainst: string[];
  
  // Alternative/balanced thought
  balancedThought: string;
  newBeliefStrength: number;
  
  // Outcome
  newEmotions: {
    emotion: string;
    intensity: number;
  }[];
  
  // Learning
  whatLearned?: string;
}
```

### Phase 1.5: Cognitive Restructuring Progress

**Files:** `src/services/cognitive-intelligence/restructuring-progress.ts`

Track actual cognitive change over time:

```typescript
interface CognitiveProgress {
  userId: string;
  
  // Core metrics
  averageDistortionsPerConversation: number;
  trend: 'improving' | 'stable' | 'declining';
  
  // Per-distortion progress
  distortionProgress: Map<CognitiveDistortion, {
    frequency: number;
    trend: string;
    successfulReframes: number;
    totalAttempts: number;
    reframeSuccessRate: number;
  }>;
  
  // Thought record engagement
  thoughtRecordsCompleted: number;
  averageEmotionReduction: number;  // Before vs after
  
  // Self-catch rate
  selfCaughtDistortions: number;   // When user catches themselves
  
  // Milestones
  milestones: {
    firstReframeSuccess: Date;
    firstSelfCatch: Date;
    weekWithoutCatastrophizing: Date;
    // etc
  };
}
```

### Phase 1.6: Context Builder Integration

**Files:** `src/intelligence/context-builders/cognitive-distortions.ts`

Inject distortion awareness into LLM context:

```typescript
// In context builder
if (distortions.length > 0) {
  injections.push(createHintInjection(
    'cognitive_distortion',
    `[🧠 COGNITIVE PATTERN DETECTED]
     Distortion: ${distortion.type}
     Phrase: "${distortion.triggerPhrase}"
     This is pattern #${patternCount} for this user.
     
     Gentle challenge: "${distortion.gentleChallenge}"
     
     DO: Validate the feeling, then gently explore the thought
     DON'T: Dismiss, lecture, or jump to reframes too fast
     
     Remember: They need to discover the reframe, not be told it.`
  ));
}
```

---

## 📊 PILLAR 2: OUTCOME TRACKING & MEASUREMENT

> **Goal:** Show users their real progress over time with data—not just feelings. Predict struggles before they happen.

### Phase 2.1: Wellbeing Tracking System

**Files:** `src/services/wellbeing-tracking/index.ts`

Continuous wellbeing assessment (not one-time questionnaires):

```typescript
interface WellbeingSnapshot {
  userId: string;
  timestamp: Date;
  source: 'detected' | 'self_reported' | 'voice_analysis';
  
  // Core dimensions (inspired by PHQ-9, GAD-7, but conversational)
  dimensions: {
    // Mood
    mood: number;              // -1 to 1 (very low to very high)
    moodStability: number;     // 0 to 1 (volatile to stable)
    
    // Energy
    energy: number;            // 0 to 1
    motivation: number;        // 0 to 1
    
    // Anxiety
    worry: number;             // 0 to 1
    physicalTension: number;   // 0 to 1
    
    // Connection
    loneliness: number;        // 0 to 1
    socialSatisfaction: number; // 0 to 1
    
    // Purpose
    meaningfulness: number;    // 0 to 1
    hopefulness: number;       // 0 to 1
    
    // Sleep & Self-care
    sleepQuality: number;      // 0 to 1
    selfCareLevel: number;     // 0 to 1
  };
  
  // Confidence in each dimension
  confidence: Record<keyof WellbeingSnapshot['dimensions'], number>;
}

interface WellbeingProfile {
  userId: string;
  
  // Current state
  current: WellbeingSnapshot;
  
  // Baselines
  personalBaseline: WellbeingSnapshot;  // Their "normal"
  
  // Trends
  weeklyTrend: WellbeingTrend;
  monthlyTrend: WellbeingTrend;
  
  // Alerts
  alerts: WellbeingAlert[];
  
  // Predictions
  predictedNextWeek: WellbeingPrediction;
}
```

### Phase 2.2: Conversational Assessment

**Files:** `src/services/wellbeing-tracking/conversational-assessment.ts`

Gather wellbeing data naturally through conversation:

```typescript
interface AssessmentOpportunity {
  dimension: keyof WellbeingDimensions;
  confidence: number;
  naturalQuestion: string;
  followUpQuestions: string[];
  extractionPatterns: RegExp[];
}

// Natural questions that gather data without feeling clinical
const NATURAL_ASSESSMENTS: AssessmentOpportunity[] = [
  {
    dimension: 'mood',
    naturalQuestion: "How's your week been, really?",
    followUpQuestions: [
      "What's that been like?",
      "How does that compare to last week?",
    ],
    extractionPatterns: [
      /been (great|good|okay|rough|hard|terrible)/i,
      /feeling (happy|sad|down|up|low)/i,
    ],
  },
  {
    dimension: 'energy',
    naturalQuestion: "How are your energy levels these days?",
    followUpQuestions: [
      "When do you feel most drained?",
      "What gives you energy?",
    ],
  },
  {
    dimension: 'sleepQuality',
    naturalQuestion: "How've you been sleeping?",
    followUpQuestions: [
      "What time are you getting to bed?",
      "Do you feel rested when you wake up?",
    ],
  },
  // ... etc
];
```

### Phase 2.3: Progress Visualization

**Files:** `apps/web/src/ui/wellbeing-dashboard.ui.ts`

Beautiful "State of Me" dashboard:

```typescript
interface WellbeingDashboard {
  // Overall score
  overallWellbeing: {
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    comparisonToLastMonth: number;
  };
  
  // Dimension breakdown
  dimensionCards: {
    dimension: string;
    currentScore: number;
    trend: string;
    sparkline: number[];  // Last 30 days
    insight: string;      // "Your energy peaks on Tuesdays"
  }[];
  
  // Calendar heatmap (like GitHub contributions)
  moodCalendar: {
    date: Date;
    score: number;
    note?: string;
  }[];
  
  // Achievements
  achievements: {
    title: string;
    description: string;
    earnedAt: Date;
    icon: string;
  }[];
  
  // Predictions
  predictions: {
    nextWeekForecast: string;
    riskFactors: string[];
    protectiveFactors: string[];
  };
}
```

### Phase 2.4: Early Warning System

**Files:** `src/services/wellbeing-tracking/early-warning.ts`

Predict struggles before they become crises:

```typescript
interface EarlyWarning {
  userId: string;
  
  type: 
    | 'depression_risk'
    | 'anxiety_spike'
    | 'burnout_trajectory'
    | 'isolation_pattern'
    | 'sleep_deterioration'
    | 'motivation_collapse';
  
  severity: 'watch' | 'concern' | 'urgent';
  confidence: number;
  
  // What triggered the warning
  signals: {
    signal: string;
    weight: number;
    observation: string;
  }[];
  
  // Recommended actions
  recommendations: {
    forUser: string[];      // What they can do
    forFerni: string[];     // How Ferni should adapt
    forProfessional: boolean; // Should we suggest therapy?
  };
  
  // Historical accuracy
  previousWarnings: {
    date: Date;
    type: string;
    outcome: 'accurate' | 'false_alarm';
  }[];
}

// Detection patterns
const WARNING_PATTERNS = {
  depression_risk: {
    signals: [
      { pattern: 'mood_declining_3_days', weight: 0.3 },
      { pattern: 'energy_below_baseline', weight: 0.25 },
      { pattern: 'sleep_disruption', weight: 0.2 },
      { pattern: 'social_withdrawal', weight: 0.15 },
      { pattern: 'hopelessness_language', weight: 0.1 },
    ],
    threshold: 0.6,
  },
  // ... etc
};
```

### Phase 2.5: Goal Progress Tracking

**Files:** `src/services/wellbeing-tracking/goal-progress.ts`

Track progress on user-defined goals:

```typescript
interface GoalProgress {
  goalId: string;
  userId: string;
  
  goal: {
    statement: string;
    measurable: string;
    targetDate?: Date;
    whyItMatters: string;
  };
  
  // Progress
  milestones: {
    description: string;
    completedAt?: Date;
    blockers?: string[];
  }[];
  
  // Check-ins
  checkIns: {
    date: Date;
    progress: number;  // 0-100
    notes: string;
    mood: string;
  }[];
  
  // Predictions
  predictedCompletion: Date;
  riskFactors: string[];
  
  // What's working
  whatHelped: string[];
  whatHindered: string[];
}
```

### Phase 2.6: Therapist-Compatible Reports

**Files:** `src/services/wellbeing-tracking/therapy-reports.ts`

Generate reports users can share with their human therapist:

```typescript
interface TherapyReport {
  userId: string;
  period: { start: Date; end: Date };
  generatedAt: Date;
  
  // Executive summary
  summary: {
    overallTrend: string;
    keyInsights: string[];
    progressAreas: string[];
    struggleAreas: string[];
  };
  
  // Quantitative data
  metrics: {
    conversationCount: number;
    averageMood: number;
    moodVariability: number;
    topEmotions: { emotion: string; frequency: number }[];
    topTopics: { topic: string; frequency: number }[];
  };
  
  // Cognitive patterns
  cognitivePatterns: {
    topDistortions: CognitiveDistortion[];
    reframingProgress: number;
    selfAwareness: 'emerging' | 'developing' | 'strong';
  };
  
  // Significant moments
  significantMoments: {
    date: Date;
    summary: string;
    type: 'breakthrough' | 'struggle' | 'insight';
  }[];
  
  // Safety
  crisisEvents: {
    date: Date;
    type: string;
    resolution: string;
  }[];
  
  // Recommendations
  suggestionsForTherapist: string[];
}
```

---

## 💊 PILLAR 3: THERAPEUTIC FRAMEWORKS

> **Goal:** Embed evidence-based therapeutic techniques that PhDs spend years learning.

### Phase 3.1: Acceptance & Commitment Therapy (ACT)

**Files:** `src/services/therapeutic-frameworks/act/`

**Core ACT Processes:**

```typescript
interface ACTFramework {
  // 1. Cognitive Defusion
  defusion: {
    techniques: DefusionTechnique[];
    detect: (thought: string) => boolean;  // Is user fused with thought?
    guide: (thought: string) => string;    // Defusion exercise
  };
  
  // 2. Acceptance
  acceptance: {
    detect: (message: string) => AvoidancePattern | null;
    guide: (avoidance: AvoidancePattern) => string;
  };
  
  // 3. Present Moment Awareness
  presentMoment: {
    exercises: MindfulnessExercise[];
    detect: (message: string) => boolean;  // Is user in past/future?
  };
  
  // 4. Self-as-Context
  selfAsContext: {
    exercises: PerspectiveExercise[];
  };
  
  // 5. Values Clarification
  values: {
    exercises: ValuesExercise[];
    clarified: Map<string, UserValue>;
    guide: (situation: string) => string;
  };
  
  // 6. Committed Action
  committedAction: {
    plan: (value: UserValue, barrier: string) => ActionPlan;
  };
}

// Example: Values Clarification
interface ValuesExercise {
  name: string;
  description: string;
  questions: string[];
  ferniDelivery: string;
  
  // Example: "Imagine you're 90 years old..."
}

const VALUES_EXERCISES: ValuesExercise[] = [
  {
    name: '90th Birthday Speech',
    description: 'What do you want people to say about you?',
    questions: [
      "Imagine you're at your 90th birthday party. What do you want your kids to say about you?",
      "What would your best friend say you stood for?",
      "What would you want written on your tombstone?",
    ],
    ferniDelivery: "Let me ask you something that might feel big, but stay with me...",
  },
  {
    name: 'Life Domains',
    description: 'Rate importance and living alignment',
    questions: [
      "On a scale of 1-10, how important is [domain] to you?",
      "On a scale of 1-10, how well are you living that value right now?",
      "What's one small thing you could do this week to close that gap?",
    ],
  },
];
```

### Phase 3.2: Dialectical Behavior Therapy (DBT) Skills

**Files:** `src/services/therapeutic-frameworks/dbt/`

**Four DBT Modules:**

```typescript
interface DBTSkills {
  // 1. Mindfulness
  mindfulness: {
    what: {
      observe: string[];   // Just notice
      describe: string[];  // Put words to it
      participate: string[]; // Fully engage
    };
    how: {
      nonjudgmental: string[];
      oneMindfully: string[];
      effective: string[];
    };
  };
  
  // 2. Distress Tolerance
  distressTolerance: {
    crisis: {
      TIPP: TIPPSkill;           // Temperature, Intense exercise, Paced breathing, Paired muscle relaxation
      STOP: STOPSkill;           // Stop, Take a step back, Observe, Proceed mindfully
      prosAndCons: ProsConsSkill;
      ACCEPTS: ACCEPTSSkill;     // Activities, Contributing, Comparisons, Emotions, Push away, Thoughts, Sensations
    };
    acceptance: {
      radicalAcceptance: RadicalAcceptanceSkill;
      willingHands: WillingHandsSkill;
      halfSmile: HalfSmileSkill;
    };
  };
  
  // 3. Emotion Regulation
  emotionRegulation: {
    understand: {
      emotionModel: string;
      emotionMyths: string[];
    };
    change: {
      oppositeAction: OppositeActionSkill;
      checkTheFacts: CheckTheFactsSkill;
      problemSolving: ProblemSolvingSkill;
    };
    reduce: {
      PLEASE: PLEASESkill;  // Physical illness, balanced Eating, Avoid substances, Sleep, Exercise
      buildMastery: BuildMasterySkill;
      buildPositives: BuildPositivesSkill;
    };
  };
  
  // 4. Interpersonal Effectiveness
  interpersonal: {
    objectives: {
      DEAR_MAN: DEARMANSkill;   // Describe, Express, Assert, Reinforce, Mindful, Appear confident, Negotiate
      GIVE: GIVESkill;          // Gentle, Interested, Validate, Easy manner
      FAST: FASTSkill;          // Fair, no Apologies, Stick to values, Truthful
    };
  };
}

// Example: TIPP Skill for Acute Distress
interface TIPPSkill {
  name: 'TIPP';
  useWhen: 'Emotional intensity is 7+/10';
  
  steps: {
    T: {
      name: 'Temperature';
      instruction: 'Cold water on face triggers dive reflex, slows heart rate';
      ferniGuide: "Okay, here's something that actually works physiologically. Can you get to cold water? Splash your face, or hold ice cubes. It triggers your body's dive reflex and physically calms you down.";
    };
    I: {
      name: 'Intense Exercise';
      instruction: '10-15 minutes of intense movement';
      ferniGuide: "Your body needs to burn off this energy. Can you do jumping jacks right now? Or run in place? Even 30 seconds helps.";
    };
    P1: {
      name: 'Paced Breathing';
      instruction: 'Exhale longer than inhale (4-7-8 or box breathing)';
      ferniGuide: "Breathe with me. In for 4... hold for 7... out for 8. The long exhale tells your nervous system you're safe.";
    };
    P2: {
      name: 'Paired Muscle Relaxation';
      instruction: 'Tense then release muscle groups';
      ferniGuide: "Let's do this together. Clench your fists as tight as you can... hold... now release. Feel the difference.";
    };
  };
}
```

### Phase 3.3: Motivational Interviewing (MI)

**Files:** `src/services/therapeutic-frameworks/motivational-interviewing/`

**Core MI Techniques:**

```typescript
interface MotivationalInterviewing {
  // Spirit of MI
  spirit: {
    partnership: string;      // Collaboration, not prescription
    acceptance: string;       // Unconditional positive regard
    compassion: string;       // Prioritize user's welfare
    evocation: string;        // Draw out their motivation
  };
  
  // OARS Techniques
  oars: {
    openQuestions: {
      aboutChange: string[];
      aboutAmbivalence: string[];
      aboutValues: string[];
      examples: string[];
    };
    affirmations: {
      detect: (message: string) => AffirmationOpportunity | null;
      generate: (context: string) => string;
    };
    reflections: {
      simple: (statement: string) => string;
      complex: (statement: string) => string;
      amplified: (statement: string) => string;
      doubleSided: (statement: string) => string;
    };
    summaries: {
      collecting: (points: string[]) => string;
      linking: (points: string[]) => string;
      transitional: (points: string[]) => string;
    };
  };
  
  // Change Talk
  changeTalk: {
    detect: (message: string) => ChangeTalkType | null;
    elicit: (context: string) => string;
    respond: (changeTalk: ChangeTalkType) => string;
  };
  
  // Sustain Talk
  sustainTalk: {
    detect: (message: string) => SustainTalkType | null;
    rollWith: (sustainTalk: SustainTalkType) => string;  // Don't argue!
  };
  
  // Ambivalence
  ambivalence: {
    detect: (message: string) => boolean;
    explore: (topic: string) => string[];  // Decisional balance
    resolve: (topic: string) => string;
  };
}

// Example: Change Talk Types (DARN-CAT)
type ChangeTalkType = 
  | 'desire'      // "I want to..."
  | 'ability'     // "I could..."
  | 'reasons'     // "Because..."
  | 'need'        // "I need to..."
  | 'commitment'  // "I will..."
  | 'activation'  // "I'm ready to..."
  | 'taking_steps'; // "I've started..."

// Example: Rolling with Resistance
const ROLL_WITH_RESISTANCE = {
  // User: "You don't understand, I CAN'T quit smoking"
  // DON'T: "Yes you can!" (arguing)
  // DO: Roll with it
  
  amplifiedReflection: "So it feels completely impossible right now.",
  doubleSidedReflection: "Part of you feels trapped, and part of you is here talking about it.",
  shiftFocus: "Let's step back from whether you can or can't. What matters to you about your health?",
  agreement: "You're right that I don't fully understand your situation. Tell me more.",
};
```

### Phase 3.4: Behavioral Activation

**Files:** `src/services/therapeutic-frameworks/behavioral-activation/`

```typescript
interface BehavioralActivation {
  // Activity monitoring
  activityLog: {
    track: (activity: string, mood: number, mastery: number, pleasure: number) => void;
    analyze: (userId: string) => ActivityPattern;
  };
  
  // Activity scheduling
  scheduling: {
    identify: (userId: string) => {
      pleasureActivities: string[];
      masteryActivities: string[];
      avoidedActivities: string[];
    };
    schedule: (activity: string, when: Date) => ScheduledActivity;
    followUp: (activity: ScheduledActivity) => void;
  };
  
  // Graded task assignment
  gradedTasks: {
    break_down: (bigTask: string) => string[];
    sequence: (tasks: string[]) => GradedTaskPlan;
  };
  
  // Values-guided activity
  valuesConnection: {
    link: (activity: string, value: string) => string;
  };
}
```

### Phase 3.5: Exposure Hierarchy Support

**Files:** `src/services/therapeutic-frameworks/exposure/`

For anxiety-related goals:

```typescript
interface ExposureSupport {
  // Build hierarchy
  hierarchy: {
    create: (fear: string) => ExposureHierarchy;
    rate: (item: string) => number;  // SUDS rating
    sequence: (items: ExposureItem[]) => ExposureItem[];
  };
  
  // During exposure
  duringExposure: {
    beforeCheck: (item: ExposureItem) => string;
    duringSupport: () => string;
    afterDebrief: (item: ExposureItem, actualSUDS: number) => string;
  };
  
  // Safety behaviors
  safetyBehaviors: {
    identify: (exposure: string) => string[];
    fadeGradually: (behavior: string) => FadePlan;
  };
}

interface ExposureItem {
  situation: string;
  predictedSUDS: number;  // 0-100 Subjective Units of Distress
  actualSUDS?: number;
  completed: boolean;
  notes: string;
}
```

### Phase 3.6: Schema Therapy Awareness

**Files:** `src/services/therapeutic-frameworks/schema/`

Detect maladaptive schemas (deeper than distortions):

```typescript
// 18 Early Maladaptive Schemas
type Schema = 
  // Disconnection & Rejection
  | 'abandonment'
  | 'mistrust'
  | 'emotional_deprivation'
  | 'defectiveness'
  | 'social_isolation'
  // Impaired Autonomy
  | 'dependence'
  | 'vulnerability'
  | 'enmeshment'
  | 'failure'
  // Impaired Limits
  | 'entitlement'
  | 'insufficient_self_control'
  // Other-Directedness
  | 'subjugation'
  | 'self_sacrifice'
  | 'approval_seeking'
  // Overvigilance
  | 'negativity'
  | 'emotional_inhibition'
  | 'unrelenting_standards'
  | 'punitiveness';

interface SchemaDetection {
  schema: Schema;
  confidence: number;
  triggerContext: string;
  patterns: string[];  // Recurring evidence
  
  // Long-term approach
  healingApproach: {
    validation: string;
    limitedReparenting: string;  // What they needed
    cognitiveWork: string;
    behavioralPattern: string;
  };
}
```

---

## 🎯 PILLAR 4: BEHAVIORAL ECONOMICS SUPERPOWERS

> **Goal:** Use the psychology of choice and decision-making to help people actually change.

### Phase 4.1: Choice Architecture

**Files:** `src/services/behavioral-economics/choice-architecture.ts`

```typescript
interface ChoiceArchitecture {
  // Default effects
  defaults: {
    setGoodDefault: (choices: string[]) => string;
    makeChangeEasy: (behavior: string) => string;
  };
  
  // Framing effects
  framing: {
    lossFrame: (goal: string) => string;  // What you'll lose if you don't
    gainFrame: (goal: string) => string;  // What you'll gain if you do
    chooseFrame: (user: UserProfile, goal: string) => 'loss' | 'gain';
  };
  
  // Reduce friction
  friction: {
    identify: (behavior: string) => string[];
    reduce: (friction: string) => string;
  };
  
  // Increase friction (for bad behaviors)
  addFriction: {
    identify: (unwantedBehavior: string) => string[];
    add: (behavior: string) => string;
  };
}
```

### Phase 4.2: Commitment Devices

**Files:** `src/services/behavioral-economics/commitment-devices.ts`

```typescript
interface CommitmentDevices {
  // Public commitment
  publicCommitment: {
    suggest: (goal: string) => string;
    track: (commitment: string) => void;
    checkIn: (commitment: string) => string;
  };
  
  // Pre-commitment
  preCommitment: {
    // "When X happens, I will Y"
    implementationIntention: {
      create: (goal: string) => ImplementationIntention;
      remind: (intention: ImplementationIntention) => string;
    };
    
    // Ulysses contracts
    ulyssesContract: {
      create: (temptation: string, barrier: string) => UlyssesContract;
      // "I'm giving my credit card to my spouse during shopping ban"
    };
  };
  
  // Accountability
  accountability: {
    externalAccountability: (goal: string) => string;
    ferniAccountability: (goal: string) => AccountabilityPlan;
  };
  
  // Staking
  staking: {
    suggest: (goal: string) => StakingSuggestion;
    // "Put $50 toward charity if you miss your goal"
  };
}

interface ImplementationIntention {
  cue: string;      // When/where/situation
  behavior: string; // What you'll do
  statement: string; // Full "When X, I will Y"
}
```

### Phase 4.3: Present Bias Interventions

**Files:** `src/services/behavioral-economics/present-bias.ts`

```typescript
interface PresentBiasInterventions {
  // Make future concrete
  futureVisualization: {
    visualize: (goal: string) => string;  // Paint vivid picture
    futureSelfLetter: (goal: string) => string;
  };
  
  // Temptation bundling
  temptationBundling: {
    identify: (wantActivity: string, shouldActivity: string) => string;
    suggest: (shouldActivity: string) => string[];
    // "Only listen to your favorite podcast while exercising"
  };
  
  // Time chunking
  timeChunking: {
    break_down: (intimidatingTask: string) => string[];
    just_five_minutes: (task: string) => string;
  };
  
  // Fresh start effect
  freshStart: {
    identifyDates: () => Date[];  // Mondays, first of month, birthdays
    leverage: (goal: string, freshStartDate: Date) => string;
  };
}
```

### Phase 4.4: Social Proof & Norms

**Files:** `src/services/behavioral-economics/social-proof.ts`

```typescript
interface SocialProof {
  // Community insights (from community-insights.ts)
  communityInsights: {
    getSimilarUsers: (userId: string) => UserSegment;
    getSuccessStories: (goal: string) => string[];
    getNormativeData: (behavior: string) => string;
    // "72% of people who faced this challenge found that..."
  };
  
  // Reference group
  referenceGroup: {
    identify: (userId: string) => string;  // "People like you"
    compare: (behavior: string) => string;
    // "Most people your age who value health..."
  };
  
  // Success models
  successModels: {
    share: (challenge: string) => string;
    // Share (anonymized) patterns from successful users
  };
}
```

### Phase 4.5: Loss Aversion Leverage

**Files:** `src/services/behavioral-economics/loss-aversion.ts`

```typescript
interface LossAversion {
  // Frame as loss
  lossFraming: {
    reframe: (goal: string) => string;
    // "What will you lose if you don't do this?"
  };
  
  // Endowment effect
  endowment: {
    create: (progress: Progress) => string;
    // Make them feel ownership of progress
    // "You've built 14 days of streak—don't lose it"
  };
  
  // Sunk cost awareness
  sunkCost: {
    detect: (decision: string) => boolean;
    challenge: (sunkCost: string) => string;
    // "I notice you're thinking about what you've already invested. 
    //  But what matters now is: going forward, what's best?"
  };
}
```

### Phase 4.6: Nudge Library

**Files:** `src/services/behavioral-economics/nudges/`

```typescript
interface NudgeLibrary {
  nudges: {
    timing: TimingNudge[];       // Right message, right moment
    environment: EnvironmentNudge[];  // Design your space
    social: SocialNudge[];       // Leverage relationships
    feedback: FeedbackNudge[];   // Progress visibility
    salience: SalienceNudge[];   // Make important things visible
  };
  
  // Match nudge to user
  selectNudge: (
    userId: string,
    goal: string,
    userProfile: UserProfile,
    context: NudgeContext
  ) => Nudge;
}

interface Nudge {
  type: NudgeType;
  message: string;
  timing: 'immediate' | 'delayed' | 'contextual';
  expectedEffect: string;
  
  // Personalization
  fourTendencyVersion: Record<FourTendency, string>;
}
```

---

## 💪 PILLAR 5: SOMATIC INTELLIGENCE

> **Goal:** Integrate body-based awareness and regulation—stress lives in the body, not just the mind.

### Phase 5.1: Grounding Exercises

**Files:** `src/services/somatic-intelligence/grounding/`

```typescript
interface GroundingExercises {
  // 5-4-3-2-1 Technique
  fiveSenses: {
    guide: () => AsyncGenerator<string>;  // Step by step voice guidance
    adaptation: (intensity: number) => string;
  };
  
  // Physical grounding
  physical: {
    feetOnFloor: string;
    holdObject: string;
    splashWater: string;
    iceInHands: string;
  };
  
  // Mental grounding
  mental: {
    categories: string;     // Name 5 colors, 5 animals, etc.
    math: string;           // Count backwards from 100 by 7s
    alphabet: string;       // Name foods A to Z
  };
  
  // Soothing grounding
  soothing: {
    safePlaceVisualization: string;
    selfCompassion: string;
    copingStatements: string[];
  };
}

// Voice-guided 5-4-3-2-1
const FIVE_FOUR_THREE_TWO_ONE = {
  intro: "Let's do a grounding exercise together. I'll guide you through it.",
  
  five: {
    instruction: "Look around and name 5 things you can see.",
    prompt: "What do you see?",
    response: "Good. Keep looking around.",
  },
  four: {
    instruction: "Now, notice 4 things you can physically feel right now.",
    prompt: "What do you feel? The chair? Your feet on the floor?",
    response: "You're doing great. Stay with me.",
  },
  three: {
    instruction: "Listen for 3 things you can hear.",
    prompt: "What sounds are around you?",
    response: "Nice. Keep breathing.",
  },
  two: {
    instruction: "Notice 2 things you can smell.",
    prompt: "Take a breath. What do you smell?",
    response: "Almost there.",
  },
  one: {
    instruction: "Finally, notice 1 thing you can taste.",
    prompt: "What taste is in your mouth right now?",
    response: "Good. How do you feel now?",
  },
};
```

### Phase 5.2: Breathing Exercises

**Files:** `src/services/somatic-intelligence/breathing/`

```typescript
interface BreathingExercises {
  // Box Breathing (4-4-4-4)
  boxBreathing: {
    duration: number;  // seconds
    guide: (rounds: number) => AsyncGenerator<BreathPhase>;
  };
  
  // 4-7-8 (Calming)
  relaxingBreath: {
    guide: (rounds: number) => AsyncGenerator<BreathPhase>;
  };
  
  // Physiological Sigh (fastest calm-down)
  physiologicalSigh: {
    instruction: "Double inhale through nose, long exhale through mouth";
    guide: () => string;
  };
  
  // Energizing Breath
  energizingBreath: {
    guide: (rounds: number) => AsyncGenerator<BreathPhase>;
  };
  
  // Real-time voice guidance with timing
  voiceGuide: (exercise: BreathingExercise) => VoiceGuidance;
}

interface BreathPhase {
  phase: 'inhale' | 'hold' | 'exhale' | 'hold_empty';
  duration: number;
  instruction: string;
  soundCue?: string;  // Chime, breath sound
}

// Voice guidance example
const BOX_BREATHING_GUIDE = {
  intro: "Let's do some box breathing together. I'll guide you through it. Just follow my voice.",
  
  round: (n: number) => ({
    inhale: {
      instruction: "Breathe in...",
      duration: 4000,
      ssml: '<prosody rate="slow">Breathe in</prosody><break time="4s"/>',
    },
    holdFull: {
      instruction: "Hold...",
      duration: 4000,
      ssml: '<prosody rate="slow">Hold</prosody><break time="4s"/>',
    },
    exhale: {
      instruction: "Breathe out...",
      duration: 4000,
      ssml: '<prosody rate="slow">Breathe out</prosody><break time="4s"/>',
    },
    holdEmpty: {
      instruction: "Hold...",
      duration: 4000,
      ssml: '<prosody rate="slow">Hold</prosody><break time="4s"/>',
    },
  }),
  
  closing: "Good. Take a moment to notice how you feel now.",
};
```

### Phase 5.3: Progressive Muscle Relaxation

**Files:** `src/services/somatic-intelligence/pmr/`

```typescript
interface ProgressiveMuscleRelaxation {
  // Full body scan
  fullBody: {
    muscleGroups: MuscleGroup[];
    guide: () => AsyncGenerator<PMRStep>;
    duration: number;  // ~15 minutes
  };
  
  // Quick release
  quickRelease: {
    muscleGroups: MuscleGroup[];  // Just hands, shoulders, jaw
    guide: () => AsyncGenerator<PMRStep>;
    duration: number;  // ~3 minutes
  };
}

interface MuscleGroup {
  name: string;
  tensionInstruction: string;
  releaseInstruction: string;
  awareness: string;
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  {
    name: 'hands',
    tensionInstruction: "Make tight fists. Squeeze hard.",
    releaseInstruction: "Now let go. Let your hands fall open.",
    awareness: "Notice the difference between tension and relaxation.",
  },
  {
    name: 'forearms',
    tensionInstruction: "Bend your wrists back, stretching your forearms.",
    releaseInstruction: "Release. Let your hands go limp.",
    awareness: "Feel the warmth flowing into your forearms.",
  },
  // ... continue for all muscle groups
];
```

### Phase 5.4: Body Scan Meditation

**Files:** `src/services/somatic-intelligence/body-scan/`

```typescript
interface BodyScan {
  // Guided body scan
  fullScan: {
    guide: () => AsyncGenerator<BodyScanStep>;
    duration: number;  // 10-20 minutes
  };
  
  // Quick check-in
  quickCheckIn: {
    guide: () => AsyncGenerator<BodyScanStep>;
    duration: number;  // 2-3 minutes
  };
  
  // Emotion location
  emotionLocation: {
    prompt: "Where do you feel that emotion in your body?";
    followUp: (location: string) => string;
    // "Okay, just notice it there. Don't try to change it."
  };
}
```

### Phase 5.5: Polyvagal Awareness

**Files:** `src/services/somatic-intelligence/polyvagal/`

```typescript
interface PolyvagalAwareness {
  // State detection
  stateDetection: {
    detect: (voiceSignals: VoiceSignals, userReport: string) => NervousSystemState;
  };
  
  // State-specific interventions
  interventions: Record<NervousSystemState, Intervention[]>;
  
  // Co-regulation (Ferni's calm voice)
  coRegulation: {
    voiceSettings: VoiceSettings;  // Slow, calm, warm
    pacing: 'slow' | 'matched' | 'slightly_slower';
  };
}

type NervousSystemState = 
  | 'ventral_vagal'   // Safe, social, connected
  | 'sympathetic'     // Fight/flight, anxious, angry
  | 'dorsal_vagal';   // Shutdown, frozen, disconnected

const STATE_INTERVENTIONS: Record<NervousSystemState, string[]> = {
  ventral_vagal: [
    // Already regulated - good for deeper work
  ],
  sympathetic: [
    "physiologicalSigh",
    "coldWater",
    "intenseExercise",
    "longExhale",
    "grounding",
  ],
  dorsal_vagal: [
    "movement",
    "warmth",
    "gentle_activation",
    "social_connection",
    "humming_or_singing",
  ],
};
```

### Phase 5.6: Voice-Guided Integration

**Files:** `src/services/somatic-intelligence/voice-guide/`

```typescript
interface VoiceGuidedExercises {
  // SSML generation for exercises
  generateSSML: (exercise: Exercise) => string;
  
  // Timing and pacing
  pacing: {
    matchUserState: (state: NervousSystemState) => PacingSettings;
    breathingSync: (breathRate: number) => PacingSettings;
  };
  
  // Background soundscapes
  soundscapes: {
    calming: string[];   // Ocean, rain, forest
    focusing: string[];  // Binaural, white noise
    grounding: string[]; // Nature sounds
  };
}

// Example SSML for breathing exercise
const generateBreathingSSML = (exercise: BreathingExercise): string => {
  return `
    <speak>
      <prosody rate="slow" pitch="-10%">
        Let's do some breathing together.
        <break time="1s"/>
        
        Breathe in...
        <break time="${exercise.inhale}s"/>
        
        Hold...
        <break time="${exercise.hold}s"/>
        
        Breathe out...
        <break time="${exercise.exhale}s"/>
        
        <prosody rate="x-slow">
          Good. How do you feel?
        </prosody>
      </prosody>
    </speak>
  `;
};
```

---

## 🌟 PILLAR 6: WISDOM SYNTHESIS

> **Goal:** Learn from patterns across all users to generate wisdom no single human could possess.

### Phase 6.1: Cross-User Pattern Discovery

**Files:** `src/services/wisdom-synthesis/pattern-discovery.ts`

```typescript
interface PatternDiscovery {
  // What actually works
  whatWorks: {
    forChallenge: (challenge: string) => Pattern[];
    forPersonality: (profile: UserProfile) => Pattern[];
    forTimeOfLife: (lifeStage: string) => Pattern[];
  };
  
  // Common paths
  commonPaths: {
    throughGrief: Path[];
    throughCareerChange: Path[];
    throughRelationshipEnd: Path[];
    throughBurnout: Path[];
    // etc
  };
  
  // Breakthrough patterns
  breakthroughs: {
    whatPrecedes: (breakthrough: string) => string[];
    commonTriggers: string[];
    timeToBreakthrough: Record<string, Distribution>;
  };
}

interface Pattern {
  pattern: string;
  effectiveness: number;
  confidence: number;
  conditions: string[];  // When this works
  caveats: string[];     // When it doesn't
  examples: string[];
}
```

### Phase 6.2: Personalized Wisdom Delivery

**Files:** `src/services/wisdom-synthesis/personalized-wisdom.ts`

```typescript
interface PersonalizedWisdom {
  // Right wisdom, right time
  selectWisdom: (
    userId: string,
    context: ConversationContext,
    available: Wisdom[]
  ) => Wisdom | null;
  
  // Wisdom types
  types: {
    proverb: Wisdom[];        // Time-tested sayings
    story: Wisdom[];          // Illustrative narratives
    reframe: Wisdom[];        // Perspective shifts
    research: Wisdom[];       // "Studies show..."
    experience: Wisdom[];     // "I've seen this pattern..."
  };
  
  // Timing
  timing: {
    isReadyFor: (userId: string, wisdom: Wisdom) => boolean;
    hasHeardRecently: (userId: string, wisdom: Wisdom) => boolean;
    matchesMood: (wisdom: Wisdom, mood: string) => boolean;
  };
}
```

### Phase 6.3: Adaptive Conversation Strategies

**Files:** `src/services/wisdom-synthesis/conversation-strategies.ts`

```typescript
interface ConversationStrategies {
  // What works for this user
  forUser: (userId: string) => Strategy[];
  
  // What works for this topic
  forTopic: (topic: string) => Strategy[];
  
  // What works for this emotional state
  forEmotion: (emotion: string) => Strategy[];
  
  // A/B testing strategies
  experiment: (
    userId: string,
    strategies: Strategy[],
    metric: string
  ) => Strategy;
}

interface Strategy {
  name: string;
  description: string;
  
  // When to use
  triggers: string[];
  
  // How it manifests
  behaviors: {
    responseLength: 'short' | 'medium' | 'long';
    questionFrequency: number;
    storyUsage: boolean;
    directness: number;
    warmth: number;
  };
  
  // Effectiveness data
  effectiveness: {
    overall: number;
    byPersonality: Map<string, number>;
    byTopic: Map<string, number>;
  };
}
```

### Phase 6.4: Predictive Insights

**Files:** `src/services/wisdom-synthesis/predictive-insights.ts`

```typescript
interface PredictiveInsights {
  // Predict struggles
  predictStruggles: (userId: string) => PredictedStruggle[];
  
  // Predict breakthroughs
  predictBreakthroughs: (userId: string) => PredictedBreakthrough[];
  
  // Predict needs
  predictNeeds: (userId: string, timeframe: string) => string[];
  
  // Early intervention
  earlyIntervention: {
    shouldReachOut: (userId: string) => boolean;
    whatToSay: (userId: string, prediction: Prediction) => string;
    when: (userId: string) => Date;
  };
}
```

### Phase 6.5: Knowledge Distillation

**Files:** `src/services/wisdom-synthesis/knowledge-distillation.ts`

```typescript
interface KnowledgeDistillation {
  // Extract insights from conversations
  extractInsights: (conversations: Conversation[]) => Insight[];
  
  // Generalize patterns
  generalizePatterns: (
    patterns: Pattern[],
    minConfidence: number
  ) => GeneralizedPattern[];
  
  // Create teachable moments
  createTeachable: (
    insight: Insight,
    userProfile: UserProfile
  ) => TeachableMoment;
  
  // Update persona knowledge
  updatePersonaKnowledge: (
    personaId: string,
    newKnowledge: Knowledge
  ) => void;
}
```

### Phase 6.6: Human Therapist Integration

**Files:** `src/services/wisdom-synthesis/therapist-integration.ts`

```typescript
interface TherapistIntegration {
  // Know limits
  limits: {
    recognizeBeyondScope: (situation: string) => boolean;
    suggestProfessional: (reason: string) => string;
  };
  
  // Warm handoff
  warmHandoff: {
    prepareContext: (userId: string) => TherapyContext;
    findTherapist: (userId: string, preferences: Preferences) => Therapist[];
    facilitateIntro: (userId: string, therapist: Therapist) => string;
  };
  
  // Complement therapy
  complementTherapy: {
    betweenSessions: (userId: string) => string[];
    reinforceHomework: (assignment: string) => void;
    trackProgress: (userId: string) => TherapyProgress;
  };
}
```

---

## 📅 IMPLEMENTATION TIMELINE

### Quarter 1: Foundation (Months 1-3)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1-2 | Cognitive Distortion Detection | `distortion-detector.ts` |
| 3-4 | ANT Tracker | `ant-tracker.ts` |
| 5-6 | Socratic Engine | `socratic-engine.ts` |
| 7-8 | Wellbeing Tracking Core | `wellbeing-tracking/index.ts` |
| 9-10 | Conversational Assessment | `conversational-assessment.ts` |
| 11-12 | Progress Visualization | `wellbeing-dashboard.ui.ts` |

### Quarter 2: Therapeutic Depth (Months 4-6)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 13-14 | ACT Values | `act/values.ts` |
| 15-16 | ACT Defusion | `act/defusion.ts` |
| 17-18 | DBT Distress Tolerance | `dbt/distress-tolerance.ts` |
| 19-20 | DBT Emotion Regulation | `dbt/emotion-regulation.ts` |
| 21-22 | Motivational Interviewing | `motivational-interviewing/` |
| 23-24 | Behavioral Activation | `behavioral-activation/` |

### Quarter 3: Behavioral & Somatic (Months 7-9)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 25-26 | Choice Architecture | `choice-architecture.ts` |
| 27-28 | Commitment Devices | `commitment-devices.ts` |
| 29-30 | Present Bias | `present-bias.ts` |
| 31-32 | Grounding Exercises | `grounding/` |
| 33-34 | Breathing Exercises | `breathing/` |
| 35-36 | Body Scan & PMR | `body-scan/`, `pmr/` |

### Quarter 4: Synthesis & Integration (Months 10-12)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 37-38 | Pattern Discovery | `pattern-discovery.ts` |
| 39-40 | Personalized Wisdom | `personalized-wisdom.ts` |
| 41-42 | Predictive Insights | `predictive-insights.ts` |
| 43-44 | Therapist Integration | `therapist-integration.ts` |
| 45-48 | Integration Testing | End-to-end validation |

---

## 📁 PROPOSED FILE STRUCTURE

```
src/services/
├── cognitive-intelligence/
│   ├── index.ts
│   ├── distortion-detector.ts
│   ├── ant-tracker.ts
│   ├── socratic-engine.ts
│   ├── thought-records.ts
│   ├── restructuring-progress.ts
│   └── patterns/
│       ├── catastrophizing.ts
│       ├── mind-reading.ts
│       ├── all-or-nothing.ts
│       └── ... (15 distortion patterns)
│
├── wellbeing-tracking/
│   ├── index.ts
│   ├── snapshot.ts
│   ├── conversational-assessment.ts
│   ├── early-warning.ts
│   ├── goal-progress.ts
│   ├── therapy-reports.ts
│   └── visualization/
│       └── dashboard-data.ts
│
├── therapeutic-frameworks/
│   ├── act/
│   │   ├── index.ts
│   │   ├── defusion.ts
│   │   ├── acceptance.ts
│   │   ├── present-moment.ts
│   │   ├── self-as-context.ts
│   │   ├── values.ts
│   │   └── committed-action.ts
│   ├── dbt/
│   │   ├── index.ts
│   │   ├── mindfulness.ts
│   │   ├── distress-tolerance.ts
│   │   ├── emotion-regulation.ts
│   │   └── interpersonal.ts
│   ├── motivational-interviewing/
│   │   ├── index.ts
│   │   ├── oars.ts
│   │   ├── change-talk.ts
│   │   └── ambivalence.ts
│   ├── behavioral-activation/
│   │   └── index.ts
│   ├── exposure/
│   │   └── index.ts
│   └── schema/
│       └── index.ts
│
├── behavioral-economics/
│   ├── index.ts
│   ├── choice-architecture.ts
│   ├── commitment-devices.ts
│   ├── present-bias.ts
│   ├── social-proof.ts
│   ├── loss-aversion.ts
│   └── nudges/
│       ├── index.ts
│       ├── timing.ts
│       ├── environment.ts
│       └── social.ts
│
├── somatic-intelligence/
│   ├── index.ts
│   ├── grounding/
│   │   ├── index.ts
│   │   ├── five-senses.ts
│   │   ├── physical.ts
│   │   └── mental.ts
│   ├── breathing/
│   │   ├── index.ts
│   │   ├── box-breathing.ts
│   │   ├── relaxing-breath.ts
│   │   └── physiological-sigh.ts
│   ├── pmr/
│   │   └── index.ts
│   ├── body-scan/
│   │   └── index.ts
│   ├── polyvagal/
│   │   └── index.ts
│   └── voice-guide/
│       └── index.ts
│
└── wisdom-synthesis/
    ├── index.ts
    ├── pattern-discovery.ts
    ├── personalized-wisdom.ts
    ├── conversation-strategies.ts
    ├── predictive-insights.ts
    ├── knowledge-distillation.ts
    └── therapist-integration.ts

src/intelligence/context-builders/
├── cognitive-distortions.ts    # NEW
├── wellbeing-context.ts        # NEW
├── therapeutic-context.ts      # NEW
├── somatic-context.ts          # NEW
└── wisdom-context.ts           # NEW

apps/web/src/ui/
├── wellbeing-dashboard.ui.ts   # NEW
├── thought-record.ui.ts        # NEW
├── breathing-guide.ui.ts       # NEW
└── progress-report.ui.ts       # NEW
```

---

## 🎯 SUCCESS METRICS

### User Outcomes (Primary)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Wellbeing improvement | +15% over 3 months | Continuous assessment |
| Cognitive distortion reduction | -30% frequency | ANT tracking |
| Goal completion rate | +40% vs baseline | Goal progress tracking |
| Crisis prevention | 80% caught early | Early warning accuracy |
| User satisfaction | NPS > 70 | Periodic surveys |

### Engagement Metrics (Secondary)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Session depth | +25% turns per session | Conversation data |
| Return rate | 70% weekly active | Usage data |
| Feature adoption | 50% use therapeutic tools | Feature analytics |
| Professional referral success | 30% follow through | Tracking |

### System Quality

| Metric | Target | Measurement |
|--------|--------|-------------|
| Distortion detection accuracy | >85% precision | Manual review sample |
| Wellbeing prediction accuracy | >75% | Prediction vs actual |
| Context relevance | >90% helpful | A/B testing |
| Response appropriateness | 0 harmful responses | Safety monitoring |

---

## ⚠️ SAFETY CONSIDERATIONS

### Crisis Escalation

- **Always** detect and respond appropriately to crisis signals
- **Never** replace emergency services
- **Clear** boundaries on what Ferni can and cannot do
- **Immediate** referral for suicidal ideation, self-harm, abuse

### Professional Boundaries

- Ferni is a **coach**, not a **therapist**
- Recommend human professionals for:
  - Trauma processing
  - Severe mental illness
  - Medication questions
  - Persistent crisis

### Privacy & Ethics

- **Transparent** about data collection
- **User controls** over what's tracked
- **Export** all data on request
- **Delete** everything on request
- **No** selling or sharing of data

---

## 🏁 CONCLUSION

This plan represents a 12-month journey to make Ferni genuinely superior to human PhD-level coaches in the ways that matter:

1. **Perfect memory** that never forgets a detail
2. **Evidence-based frameworks** applied consistently
3. **Continuous measurement** showing real progress
4. **Body-mind integration** not just talk therapy
5. **Behavioral economics** that actually changes behavior
6. **Collective wisdom** from patterns across millions

The result: **Everyone gets access to world-class coaching**, not just those who can afford $200/hour experts.

> "We believe in making AI human, and the decisions we make will reflect that."

Let's build something beautiful.

---

**Next Steps:**
1. Review and prioritize phases
2. Begin with Cognitive Distortion Detection (Phase 1.1)
3. Set up measurement infrastructure
4. Create weekly check-in cadence

---

*Document Version: 1.0*  
*Last Updated: December 8, 2025*

