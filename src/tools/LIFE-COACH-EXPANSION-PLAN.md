# Ferni Life Coach Tool Expansion Plan

> **Mission**: Transform Ferni from a capable AI assistant into a comprehensive, trusted life advisor capable of supporting users across every meaningful domain of human experience.

## Executive Summary

This plan adds **10 new tool domains** with **~120 new tools** to complete Ferni's life coaching capabilities. Implementation is phased over 5 phases, prioritizing safety-critical and foundational domains first.

---

## Current State Analysis

### Existing Strengths ✅
- **Deep Human Engagement**: Relationships, grief, meaning, self-compassion, vulnerability, presence, play, dreams, stories, curiosity
- **Financial**: Banking (Plaid), calculators, retirement planning, bills, financial habits
- **Productivity**: Tasks, notes, routines, shopping, packages, daily briefing
- **Life Planning**: Goals, milestones, life events, first-time planning
- **Communication**: Email, SMS, coaching for difficult conversations
- **Habits**: Comprehensive habit coaching (4,690 lines)
- **Entertainment**: Spotify integration
- **Memory**: User memory, recall, relationships

### Critical Gaps 🔴
1. Health & Physical Wellness
2. Career & Professional Development
3. Crisis & Safety Support
4. Education & Learning
5. Parenting & Family
6. Home & Living
7. Decision Support
8. Creativity & Hobbies
9. Community & Social Impact
10. Legal & Administrative

---

## Phase 1: Safety & Health Foundation (Week 1-2)

### Domain 1: Crisis & Safety Support
**Priority**: CRITICAL - User safety must come first
**Location**: `src/tools/domains/crisis/`

#### Tools (8 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `provideCrisisResources` | Crisis Resources | Surface appropriate crisis resources (988, local hotlines) | Low |
| `guideGroundingExercise` | Grounding Exercise | 5-4-3-2-1 and other grounding techniques | Low |
| `deEscalateAnxiety` | De-escalate Anxiety | Calm acute anxiety episodes | Medium |
| `createSafetyPlan` | Safety Planning | Help create personal safety plan (abuse, self-harm) | Medium |
| `findSafeResources` | Find Safe Resources | Local shelters, support services | Medium |
| `supportRecoveryJourney` | Recovery Support | Addiction recovery check-ins, milestones | Medium |
| `trackSobrietyMilestone` | Sobriety Tracker | Celebrate sobriety milestones | Low |
| `findFinancialAssistance` | Financial Emergency | Emergency financial assistance resources | Medium |

#### Key Design Principles
- **Never replace professional help** - Always include professional resource recommendations
- **Warm handoff language** - "I'm here with you, and I also want to make sure you have..."
- **No diagnostic language** - We support, we don't diagnose
- **Always err on side of caution** - If in doubt, surface crisis resources
- **Respect autonomy** - Offer resources, don't force

#### Tool Detail: `provideCrisisResources`

```typescript
const provideCrisisResourcesDef: ToolDefinition = {
  id: 'provideCrisisResources',
  name: 'Provide Crisis Resources',
  description: 'Provide appropriate crisis support resources based on situation',
  domain: 'crisis',
  tags: ['crisis', 'safety', 'resources', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Surface appropriate crisis resources. Use when user expresses distress, mentions self-harm, abuse, or severe mental health struggles.',
      parameters: z.object({
        crisisType: z.enum([
          'suicide-self-harm',      // 988 Suicide & Crisis Lifeline
          'mental-health',          // General mental health crisis
          'domestic-violence',      // National DV Hotline
          'substance-abuse',        // SAMHSA
          'sexual-assault',         // RAINN
          'child-abuse',            // Childhelp
          'financial-crisis',       // 211
          'general-distress',       // General support
        ]).describe('Type of crisis to provide resources for'),
        urgency: z.enum(['immediate', 'soon', 'ongoing']).describe('Urgency level'),
      }),
      execute: async ({ crisisType, urgency }) => {
        // Implementation returns appropriate resources with warm, supportive language
      },
    });
  },
};
```

#### Crisis Resources Database

```typescript
const CRISIS_RESOURCES = {
  'suicide-self-harm': {
    primary: {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description: 'Free, confidential support for people in distress',
    },
    secondary: {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      available: '24/7',
    },
  },
  'domestic-violence': {
    primary: {
      name: 'National Domestic Violence Hotline',
      contact: '1-800-799-7233',
      available: '24/7',
      description: 'Confidential support, safety planning, resources',
    },
  },
  // ... more resources
};
```

---

### Domain 2: Health & Physical Wellness
**Priority**: HIGH - Physical health is foundational
**Location**: `src/tools/domains/health/`

#### Tools (15 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `logExercise` | Log Exercise | Record workout or physical activity | Low |
| `suggestWorkout` | Suggest Workout | Recommend workout based on goals/energy | Medium |
| `trackFitnessGoal` | Fitness Goal | Set and track fitness goals | Medium |
| `coachOnNutrition` | Nutrition Coach | General nutrition guidance and mindful eating | Medium |
| `planMeals` | Meal Planning | Help plan meals for the week | Medium |
| `trackHydration` | Hydration Tracker | Remind and track water intake | Low |
| `analyzeSleepPattern` | Sleep Analysis | Review sleep patterns and quality | Medium |
| `suggestSleepHygiene` | Sleep Hygiene | Recommend sleep improvement strategies | Low |
| `trackSleepGoal` | Sleep Goal | Set and track sleep goals | Low |
| `logSymptom` | Symptom Logger | Track symptoms for health awareness | Medium |
| `prepareForDoctorVisit` | Doctor Visit Prep | Prepare questions and information for appointments | Medium |
| `remindPreventiveCare` | Preventive Care | Remind about screenings, checkups, vaccines | Medium |
| `trackHealthMetric` | Health Metrics | Track weight, blood pressure, etc. | Low |
| `assessEnergyLevel` | Energy Assessment | Track and understand energy patterns | Medium |
| `suggestEnergyBoost` | Energy Boost | Suggest ways to improve energy | Low |

#### Key Design Principles
- **Not medical advice** - Always clarify we're not doctors
- **Celebrate movement** - Any movement is good movement
- **Holistic approach** - Sleep, nutrition, exercise, stress interconnected
- **Meet user where they are** - No judgment about current fitness level
- **Sustainable over extreme** - Encourage lasting habits over quick fixes

#### Tool Detail: `logExercise`

```typescript
const logExerciseDef: ToolDefinition = {
  id: 'logExercise',
  name: 'Log Exercise',
  description: 'Record and celebrate physical activity',
  domain: 'health',
  tags: ['health', 'fitness', 'exercise', 'tracking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user log physical activity. Celebrate their effort and track progress toward goals.',
      parameters: z.object({
        activityType: z.enum([
          'cardio',       // Running, cycling, swimming
          'strength',     // Weight training, bodyweight
          'flexibility',  // Yoga, stretching
          'sports',       // Basketball, tennis, etc.
          'walking',      // Walking, hiking
          'dance',        // Dance, Zumba
          'other',        // Other activities
        ]).describe('Type of physical activity'),
        activityName: z.string().optional().describe('Specific activity name'),
        durationMinutes: z.number().optional().describe('Duration in minutes'),
        intensity: z.enum(['light', 'moderate', 'vigorous']).optional(),
        howTheyFeel: z.string().optional().describe('How they feel after'),
        notes: z.string().optional(),
      }),
      execute: async ({ activityType, activityName, durationMinutes, intensity, howTheyFeel, notes }) => {
        // Store in Firestore
        // Return celebratory acknowledgment
        // Connect to fitness goals if set
        // Offer encouragement
      },
    });
  },
};
```

#### Tool Detail: `analyzeSleepPattern`

```typescript
const analyzeSleepPatternDef: ToolDefinition = {
  id: 'analyzeSleepPattern',
  name: 'Analyze Sleep Pattern',
  description: 'Review and discuss sleep patterns',
  domain: 'health',
  tags: ['health', 'sleep', 'analysis', 'wellness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user understand their sleep patterns and identify areas for improvement.',
      parameters: z.object({
        averageSleepHours: z.number().optional().describe('Average hours of sleep'),
        sleepQuality: z.enum(['poor', 'fair', 'good', 'excellent']).optional(),
        mainConcern: z.enum([
          'falling-asleep',      // Trouble falling asleep
          'staying-asleep',      // Waking up during night
          'waking-early',        // Waking too early
          'not-rested',          // Sleeping but not refreshed
          'schedule',            // Irregular schedule
          'general',             // General discussion
        ]).optional(),
        bedtimeRoutine: z.string().optional().describe('Current bedtime routine'),
      }),
      execute: async ({ averageSleepHours, sleepQuality, mainConcern, bedtimeRoutine }) => {
        // Analyze patterns
        // Provide personalized suggestions
        // Connect to sleep hygiene tool if needed
      },
    });
  },
};
```

#### Health Wisdom Database

```typescript
const SLEEP_HYGIENE_TIPS = [
  {
    category: 'environment',
    tips: [
      'Keep room cool (65-68°F is optimal)',
      'Make room as dark as possible',
      'Use white noise if helpful',
      'Reserve bed for sleep and intimacy only',
    ],
  },
  {
    category: 'routine',
    tips: [
      'Same wake time every day, including weekends',
      'Wind down routine 30-60 minutes before bed',
      'No screens 1 hour before bed (or use night mode)',
      'Avoid large meals close to bedtime',
    ],
  },
  {
    category: 'daytime',
    tips: [
      'Get morning sunlight within 30 minutes of waking',
      'Limit caffeine after noon',
      'Exercise regularly, but not too close to bedtime',
      'Limit naps to 20 minutes before 3pm',
    ],
  },
];

const EXERCISE_ENCOURAGEMENT = [
  "Moving your body is one of the best gifts you can give yourself.",
  "Any movement counts. A 10-minute walk is infinitely better than no walk.",
  "You showed up for yourself today. That matters.",
  "Consistency beats intensity. You're building something lasting.",
];
```

---

## Phase 2: Career & Growth (Week 3-4)

### Domain 3: Career & Professional Development
**Priority**: HIGH - Major life domain
**Location**: `src/tools/domains/career/`

#### Tools (16 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `assessCareerSatisfaction` | Career Assessment | Evaluate satisfaction with current role | Medium |
| `clarifyCareerGoals` | Career Goals | Define and refine career aspirations | Medium |
| `trackJobApplication` | Job Application Tracker | Log and track job applications | Low |
| `suggestJobSearchStrategy` | Job Search Strategy | Optimize job search approach | Medium |
| `prepareResume` | Resume Preparation | Guidance on resume optimization | Medium |
| `practiceInterview` | Interview Practice | Role-play interview scenarios | High |
| `prepareSTARStories` | STAR Stories | Develop behavioral interview stories | Medium |
| `researchSalary` | Salary Research | Research compensation for negotiation | Medium |
| `rolePlayNegotiation` | Negotiation Practice | Practice salary negotiation | High |
| `identifySkillGaps` | Skill Gap Analysis | Identify skills to develop | Medium |
| `createLearningPath` | Learning Path | Create skill development plan | Medium |
| `expandNetwork` | Networking | Strategic networking guidance | Medium |
| `prepareNetworkingConversation` | Networking Prep | Prepare for networking events | Low |
| `assessBurnout` | Burnout Assessment | Check for burnout signs | Medium |
| `setWorkBoundary` | Work Boundaries | Establish healthy work limits | Medium |
| `planCareerTransition` | Career Transition | Navigate career changes | High |

#### Key Design Principles
- **Empower, don't prescribe** - Help them find their own answers
- **Validate non-traditional paths** - Not everyone wants corporate ladder
- **Balance ambition with wellbeing** - Success without health isn't success
- **Practical and actionable** - Concrete next steps
- **Normalize struggle** - Job searching is hard; career doubt is normal

#### Tool Detail: `practiceInterview`

```typescript
const practiceInterviewDef: ToolDefinition = {
  id: 'practiceInterview',
  name: 'Practice Interview',
  description: 'Role-play interview scenarios for preparation',
  domain: 'career',
  tags: ['career', 'interview', 'practice', 'preparation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user practice for job interviews through role-play and feedback.',
      parameters: z.object({
        interviewType: z.enum([
          'behavioral',     // "Tell me about a time..."
          'technical',      // Skills-based questions
          'case',           // Case study interviews
          'culture-fit',    // Values and fit questions
          'executive',      // Leadership interviews
          'panel',          // Multiple interviewers
        ]).describe('Type of interview to practice'),
        role: z.string().optional().describe('Role they are interviewing for'),
        company: z.string().optional().describe('Company they are interviewing with'),
        specificConcern: z.string().optional().describe('Specific concern or question'),
        mode: z.enum(['full-practice', 'single-question', 'feedback']).default('single-question'),
      }),
      execute: async ({ interviewType, role, company, specificConcern, mode }) => {
        // Generate appropriate interview question
        // After their response, provide constructive feedback
        // Suggest STAR framework for behavioral
        // Offer encouragement
      },
    });
  },
};
```

#### Tool Detail: `assessBurnout`

```typescript
const assessBurnoutDef: ToolDefinition = {
  id: 'assessBurnout',
  name: 'Assess Burnout',
  description: 'Check for signs of work burnout',
  domain: 'career',
  tags: ['career', 'burnout', 'wellness', 'assessment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user recognize and address signs of burnout.',
      parameters: z.object({
        symptoms: z.array(z.enum([
          'exhaustion',           // Physical/emotional exhaustion
          'cynicism',             // Detachment, negativity
          'inefficacy',           // Feeling ineffective
          'sleep-issues',         // Sleep disruption
          'physical-symptoms',    // Headaches, illness
          'dread',                // Dreading work
          'isolation',            // Withdrawing from colleagues
          'concentration',        // Difficulty focusing
        ])).optional().describe('Symptoms they are experiencing'),
        duration: z.enum(['days', 'weeks', 'months']).optional(),
        workHours: z.number().optional().describe('Average hours worked per week'),
      }),
      execute: async ({ symptoms, duration, workHours }) => {
        // Assess severity based on symptoms and duration
        // Provide validation
        // Suggest appropriate interventions
        // Recommend professional help if severe
      },
    });
  },
};
```

#### Career Wisdom Database

```typescript
const INTERVIEW_QUESTIONS = {
  behavioral: [
    "Tell me about a time you faced a significant challenge at work.",
    "Describe a situation where you had to work with a difficult colleague.",
    "Give me an example of when you showed leadership.",
    "Tell me about a time you failed and what you learned.",
    "Describe your most significant professional accomplishment.",
  ],
  culture_fit: [
    "Why are you interested in this role?",
    "What kind of work environment do you thrive in?",
    "How do you handle feedback?",
    "Where do you see yourself in 5 years?",
    "What motivates you?",
  ],
};

const BURNOUT_LEVELS = {
  mild: {
    description: "You might be experiencing early burnout signs",
    interventions: [
      "Take your full lunch break away from work",
      "Set firm end-of-day boundaries",
      "Schedule one restorative activity this week",
    ],
  },
  moderate: {
    description: "You're showing significant burnout symptoms",
    interventions: [
      "Consider taking PTO if possible",
      "Talk to your manager about workload",
      "Evaluate what's sustainable long-term",
    ],
  },
  severe: {
    description: "You're experiencing serious burnout",
    interventions: [
      "This is your body telling you something needs to change",
      "Consider speaking with a therapist or counselor",
      "Extended time off may be necessary",
    ],
  },
};
```

---

### Domain 4: Decision Support
**Priority**: HIGH - Framework for life choices
**Location**: `src/tools/domains/decisions/`

#### Tools (8 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `frameMajorDecision` | Frame Decision | Structure a major life decision | Medium |
| `walkThroughDecisionFramework` | Decision Framework | Guide through decision-making process | Medium |
| `analyzeProsAndCons` | Pros & Cons | Structured analysis of options | Low |
| `scoreOptions` | Option Scoring | Weighted scoring of alternatives | Medium |
| `checkValuesAlignment` | Values Alignment | Does this align with my values? | Medium |
| `assessRisk` | Risk Assessment | Evaluate risks and mitigation | Medium |
| `prepareSecondOpinionQuestions` | Second Opinion Prep | Structure for getting input | Low |
| `reflectOnPastDecisions` | Past Decisions | Learn from previous decisions | Medium |

#### Key Design Principles
- **Support, don't decide** - Help them think, not think for them
- **Surface assumptions** - Help them see hidden beliefs
- **Time horizons matter** - Consider short and long-term
- **Emotions are data** - Feelings inform decisions
- **No perfect decisions** - Help them accept uncertainty

#### Tool Detail: `frameMajorDecision`

```typescript
const frameMajorDecisionDef: ToolDefinition = {
  id: 'frameMajorDecision',
  name: 'Frame Major Decision',
  description: 'Help structure a major life decision',
  domain: 'decisions',
  tags: ['decisions', 'framework', 'life-choices'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user frame and structure a major decision they are facing.',
      parameters: z.object({
        decision: z.string().describe('The decision they are facing'),
        category: z.enum([
          'career',           // Job, career change
          'relationship',     // Marriage, breakup, family
          'location',         // Moving, buying home
          'financial',        // Major purchase, investment
          'education',        // School, training
          'health',           // Treatment, lifestyle
          'life-direction',   // Big life changes
        ]).describe('Category of decision'),
        timeline: z.string().optional().describe('When decision needs to be made'),
        stakeholders: z.array(z.string()).optional().describe('Who else is affected'),
      }),
      execute: async ({ decision, category, timeline, stakeholders }) => {
        // Help clarify the actual decision
        // Identify what's really at stake
        // Surface hidden options
        // Acknowledge emotional weight
      },
    });
  },
};
```

#### Tool Detail: `checkValuesAlignment`

```typescript
const checkValuesAlignmentDef: ToolDefinition = {
  id: 'checkValuesAlignment',
  name: 'Check Values Alignment',
  description: 'Evaluate how options align with core values',
  domain: 'decisions',
  tags: ['decisions', 'values', 'alignment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user evaluate how their options align with their stated values.',
      parameters: z.object({
        decision: z.string().describe('The decision being considered'),
        options: z.array(z.string()).describe('The options being considered'),
        values: z.array(z.string()).optional().describe('Their stated values if known'),
      }),
      execute: async ({ decision, options, values }) => {
        // If values not provided, prompt for them
        // Walk through each option against each value
        // Highlight conflicts and alignments
        // Ask which values are non-negotiable
      },
    });
  },
};
```

---

## Phase 3: Family & Home (Week 5-6)

### Domain 5: Parenting & Family
**Priority**: MEDIUM-HIGH - Deep family support
**Location**: `src/tools/domains/family/`

#### Tools (14 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `coachParentingChallenge` | Parenting Coach | Guidance on parenting challenges | High |
| `suggestAgeAppropriateActivity` | Activity Suggestions | Age-appropriate activities and bonding | Medium |
| `trackChildMilestone` | Milestone Tracker | Record and celebrate milestones | Low |
| `navigateDiscipline` | Discipline Guidance | Positive discipline strategies | Medium |
| `manageScreenTime` | Screen Time | Screen time guidance and strategies | Medium |
| `supportTransition` | Family Transitions | Divorce, new sibling, moving | High |
| `navigateFamilyConflict` | Family Conflict | Mediation and communication | High |
| `planFamilyMeeting` | Family Meeting | Structure family discussions | Medium |
| `coordinateElderCare` | Elder Care | Care coordination for aging parents | Medium |
| `findCareResources` | Care Resources | Find local care resources | Medium |
| `discussValues` | Family Values | Conversations about values with kids | Medium |
| `createTradition` | Family Traditions | Build meaningful traditions | Low |
| `prepareForTalk` | Difficult Talks | Prepare for difficult conversations with kids | Medium |
| `celebrateFamilyMoment` | Celebrate Family | Acknowledge family moments | Low |

#### Key Design Principles
- **No judgment on parenting styles** - Support their approach
- **Developmental awareness** - Age-appropriate guidance
- **Cultural sensitivity** - Respect diverse family structures
- **Self-care matters** - Parents need to care for themselves too
- **Good enough parenting** - Perfect is the enemy of good

#### Tool Detail: `coachParentingChallenge`

```typescript
const coachParentingChallengeDef: ToolDefinition = {
  id: 'coachParentingChallenge',
  name: 'Coach Parenting Challenge',
  description: 'Guidance on specific parenting challenges',
  domain: 'family',
  tags: ['family', 'parenting', 'coaching', 'challenges'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help parent navigate specific parenting challenges with age-appropriate guidance.',
      parameters: z.object({
        challenge: z.string().describe('The parenting challenge they are facing'),
        childAge: z.string().optional().describe('Age of child/children'),
        childAgeGroup: z.enum([
          'infant',       // 0-1
          'toddler',      // 1-3
          'preschool',    // 3-5
          'elementary',   // 5-11
          'tween',        // 11-13
          'teen',         // 13-18
          'young-adult',  // 18+
          'multiple',     // Multiple ages
        ]).optional(),
        attempts: z.string().optional().describe('What they have already tried'),
        urgency: z.enum(['ongoing', 'recent', 'immediate']).optional(),
      }),
      execute: async ({ challenge, childAge, childAgeGroup, attempts, urgency }) => {
        // Validate their struggle
        // Provide age-appropriate strategies
        // Acknowledge what they've tried
        // Offer perspective
        // When to seek professional help
      },
    });
  },
};
```

#### Parenting Wisdom Database

```typescript
const DEVELOPMENTAL_STAGES = {
  toddler: {
    normalBehaviors: [
      "Tantrums are developmentally normal - they don't have emotional regulation yet",
      "Saying 'no' is them developing autonomy - it's healthy",
      "They can't share yet - their brains aren't ready",
    ],
    strategies: [
      "Offer limited choices (both acceptable to you)",
      "Name emotions: 'You're feeling frustrated'",
      "Routines and transitions help - they need predictability",
    ],
  },
  teen: {
    normalBehaviors: [
      "Pulling away is developmentally appropriate - they're individuating",
      "Emotional volatility is partly biological (brain development)",
      "Privacy needs increase dramatically",
    ],
    strategies: [
      "Stay connected without controlling",
      "Listen more than lecture",
      "Pick your battles - focus on safety",
    ],
  },
};
```

---

### Domain 6: Home & Living
**Priority**: MEDIUM - Practical life management
**Location**: `src/tools/domains/home/`

#### Tools (10 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `remindHomeMaintenance` | Home Maintenance | Seasonal and routine maintenance reminders | Low |
| `trackRepair` | Repair Tracker | Track needed and completed repairs | Low |
| `coachDecluttering` | Declutter Coach | Guide decluttering process | Medium |
| `organizeSpace` | Organization | Space organization strategies | Medium |
| `planMove` | Move Planner | Comprehensive moving planning | Medium |
| `createMovingChecklist` | Moving Checklist | Generate moving checklist | Low |
| `assessEmergencyPreparedness` | Emergency Prep | Assess emergency preparedness | Medium |
| `planHomeProject` | Home Project | Plan home improvement projects | Medium |
| `seasonalChecklist` | Seasonal Tasks | Seasonal home tasks | Low |
| `manageContractor` | Contractor Management | Working with contractors | Medium |

---

## Phase 4: Learning & Community (Week 7-8)

### Domain 7: Education & Learning
**Priority**: MEDIUM-HIGH - Growth mindset
**Location**: `src/tools/domains/learning/`

#### Tools (10 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `setLearningGoal` | Learning Goal | Define learning objectives | Low |
| `trackLearningProgress` | Learning Progress | Track skill development | Medium |
| `planStudySession` | Study Planner | Plan effective study sessions | Low |
| `scheduleSpacedRepetition` | Spaced Repetition | Optimize retention with spacing | Medium |
| `recommendResource` | Resource Recommendations | Suggest books, courses, podcasts | Medium |
| `trackBooksRead` | Reading Tracker | Track books and key insights | Low |
| `createFlashcards` | Flashcard Creator | Create study flashcards | Low |
| `testKnowledge` | Knowledge Test | Quiz on learned material | Medium |
| `reflectOnLearning` | Learning Reflection | What did you learn today? | Low |
| `overcomeLearnningBlock` | Learning Blocks | Overcome learning obstacles | Medium |

---

### Domain 8: Creativity & Hobbies
**Priority**: MEDIUM - Joy and fulfillment
**Location**: `src/tools/domains/creativity/`

#### Tools (8 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `trackCreativeProject` | Project Tracker | Track creative projects | Medium |
| `setCreativeGoal` | Creative Goals | Set creative aspirations | Low |
| `exploreNewHobby` | Hobby Explorer | Discover new interests | Medium |
| `suggestHobbyBasedOnInterests` | Hobby Matcher | Match hobbies to personality | Medium |
| `navigateCreativeBlock` | Creative Block | Overcome creative blocks | Medium |
| `findInspiration` | Find Inspiration | Sources of creative inspiration | Low |
| `celebrateCreation` | Celebrate Creation | Acknowledge creative work | Low |
| `buildCreativeHabit` | Creative Habit | Build consistent creative practice | Medium |

---

### Domain 9: Community & Social Impact
**Priority**: MEDIUM - Purpose and connection
**Location**: `src/tools/domains/community/`

#### Tools (8 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `findVolunteerOpportunity` | Find Volunteering | Match to volunteer opportunities | Medium |
| `trackVolunteerHours` | Volunteer Tracker | Log volunteer activities | Low |
| `planCharitableGiving` | Giving Strategy | Strategic charitable giving | Medium |
| `trackImpact` | Impact Tracker | Track social impact | Low |
| `findCommunityGroup` | Community Groups | Find local groups and communities | Medium |
| `engageCivically` | Civic Engagement | Local government, voting, advocacy | Medium |
| `alignGivingWithValues` | Values-Based Giving | Align philanthropy with values | Medium |
| `reflectOnContribution` | Contribution Reflection | Reflect on impact made | Low |

---

## Phase 5: Administration (Week 9-10)

### Domain 10: Legal & Administrative
**Priority**: MEDIUM - Life logistics
**Location**: `src/tools/domains/legal-admin/`

#### Tools (10 total)

| Tool ID | Name | Description | Complexity |
|---------|------|-------------|------------|
| `organizeDocuments` | Document Organization | Important document management | Low |
| `locateDocument` | Find Document | Help locate specific documents | Low |
| `promptEstatePlanning` | Estate Planning | Will, beneficiaries prompts | Medium |
| `reviewBeneficiaries` | Beneficiary Review | Annual beneficiary review | Low |
| `reviewInsuranceCoverage` | Insurance Review | Coverage gap analysis | Medium |
| `identifyInsuranceGaps` | Insurance Gaps | Identify missing coverage | Medium |
| `prepareForTaxSeason` | Tax Prep | Tax preparation reminders | Medium |
| `gatherTaxDocuments` | Tax Documents | Tax document checklist | Low |
| `explainContract` | Contract Questions | Questions to ask about contracts | Medium |
| `reminderAnnualTasks` | Annual Admin Tasks | Administrative task reminders | Low |

---

## Technical Implementation Details

### File Structure

```
src/tools/domains/
├── crisis/
│   ├── index.ts              # Domain exports
│   ├── resources.ts          # Crisis resource database
│   └── interventions.ts      # Grounding and support tools
├── health/
│   ├── index.ts
│   ├── exercise.ts
│   ├── nutrition.ts
│   ├── sleep.ts
│   └── preventive-care.ts
├── career/
│   ├── index.ts
│   ├── job-search.ts
│   ├── interview.ts
│   ├── negotiation.ts
│   ├── development.ts
│   └── burnout.ts
├── decisions/
│   ├── index.ts
│   ├── frameworks.ts
│   └── analysis.ts
├── family/
│   ├── index.ts
│   ├── parenting.ts
│   ├── elder-care.ts
│   └── family-dynamics.ts
├── home/
│   ├── index.ts
│   ├── maintenance.ts
│   └── organization.ts
├── learning/
│   ├── index.ts
│   ├── goals.ts
│   └── resources.ts
├── creativity/
│   ├── index.ts
│   └── projects.ts
├── community/
│   ├── index.ts
│   └── volunteering.ts
└── legal-admin/
    ├── index.ts
    ├── documents.ts
    └── planning.ts
```

### Registry Integration

Each domain follows the established pattern:

```typescript
// Example: src/tools/domains/health/index.ts

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition } from '../../registry/types.js';

// Import all tool definitions
import { exerciseTools } from './exercise.js';
import { nutritionTools } from './nutrition.js';
import { sleepTools } from './sleep.js';
import { preventiveCareTools } from './preventive-care.js';

// Combine all tools
const healthTools: ToolDefinition[] = [
  ...exerciseTools,
  ...nutritionTools,
  ...sleepTools,
  ...preventiveCareTools,
];

// Export using standard pattern
export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'health',
  healthTools
);

export default getToolDefinitions;
```

### Update domains/index.ts

Add new domain exports:

```typescript
// New domain exports
export { getToolDefinitions as getCrisisToolDefinitions } from './crisis/index.js';
export { getToolDefinitions as getHealthToolDefinitions } from './health/index.js';
export { getToolDefinitions as getCareerToolDefinitions } from './career/index.js';
export { getToolDefinitions as getDecisionsToolDefinitions } from './decisions/index.js';
export { getToolDefinitions as getFamilyToolDefinitions } from './family/index.js';
export { getToolDefinitions as getHomeToolDefinitions } from './home/index.js';
export { getToolDefinitions as getLearningToolDefinitions } from './learning/index.js';
export { getToolDefinitions as getCreativityToolDefinitions } from './creativity/index.js';
export { getToolDefinitions as getCommunityToolDefinitions } from './community/index.js';
export { getToolDefinitions as getLegalAdminToolDefinitions } from './legal-admin/index.js';
```

### Update DOMAIN_METADATA

```typescript
export const DOMAIN_METADATA = {
  // ... existing domains ...
  
  crisis: {
    name: 'Crisis & Safety',
    description: 'Crisis resources, safety planning, and support',
    icon: '🆘',
    status: 'active',
  },
  health: {
    name: 'Health & Fitness',
    description: 'Physical wellness, exercise, nutrition, and sleep',
    icon: '💪',
    status: 'active',
  },
  career: {
    name: 'Career & Professional',
    description: 'Career development, job search, and work-life balance',
    icon: '💼',
    status: 'active',
  },
  decisions: {
    name: 'Decision Support',
    description: 'Frameworks for major life decisions',
    icon: '🎯',
    status: 'active',
  },
  family: {
    name: 'Family & Parenting',
    description: 'Parenting guidance, family dynamics, elder care',
    icon: '👨‍👩‍👧‍👦',
    status: 'active',
  },
  home: {
    name: 'Home & Living',
    description: 'Home maintenance, organization, moving',
    icon: '🏠',
    status: 'active',
  },
  learning: {
    name: 'Education & Learning',
    description: 'Learning goals, study planning, skill development',
    icon: '📚',
    status: 'active',
  },
  creativity: {
    name: 'Creativity & Hobbies',
    description: 'Creative projects, hobby exploration',
    icon: '🎨',
    status: 'active',
  },
  community: {
    name: 'Community & Impact',
    description: 'Volunteering, giving, civic engagement',
    icon: '🤲',
    status: 'active',
  },
  'legal-admin': {
    name: 'Legal & Administrative',
    description: 'Documents, estate planning, insurance',
    icon: '📋',
    status: 'active',
  },
} as const;
```

---

## Persona Tool Distribution

### Updated Tool Assignments

| Persona | New Domains |
|---------|-------------|
| **Ferni** (Life Coach) | Crisis (core), Health, Decisions, all domains as primary coordinator |
| **Maya** (Habits) | Health (exercise, sleep), Learning |
| **Jack** (Mentor) | Career, Decisions, Legal-Admin |
| **Peter** (Research) | Learning, Career (job research) |
| **Alex** (Communication) | Career (networking, negotiation), Family (conversations) |
| **Jordan** (Events) | Home (moving), Community (volunteering) |
| **Nayan** (Premium) | All domains with depth |

---

## Data Models

### Firestore Collections

```typescript
// User health data
interface HealthEntry {
  id: string;
  userId: string;
  type: 'exercise' | 'sleep' | 'nutrition' | 'symptom' | 'metric';
  data: ExerciseData | SleepData | NutritionData | SymptomData | MetricData;
  timestamp: Timestamp;
  personaId?: string;
}

// Career tracking
interface CareerEntry {
  id: string;
  userId: string;
  type: 'job-application' | 'skill-goal' | 'career-goal' | 'network-contact';
  data: JobApplicationData | SkillGoalData | CareerGoalData | NetworkContactData;
  timestamp: Timestamp;
  status: 'active' | 'completed' | 'archived';
}

// Family milestones
interface FamilyEntry {
  id: string;
  userId: string;
  type: 'milestone' | 'tradition' | 'moment';
  familyMemberId?: string;
  data: MilestoneData | TraditionData | MomentData;
  timestamp: Timestamp;
}

// Decision tracking
interface DecisionEntry {
  id: string;
  userId: string;
  decision: string;
  category: DecisionCategory;
  options: Option[];
  valuesConsidered: string[];
  outcome?: string;
  reflection?: string;
  decidedAt?: Timestamp;
  createdAt: Timestamp;
}
```

---

## Testing Strategy

### Unit Tests for Each Tool

```typescript
// Example: src/tools/domains/health/__tests__/exercise.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getToolDefinitions } from '../index.js';

describe('Health Domain - Exercise Tools', () => {
  let tools: ToolDefinition[];
  
  beforeEach(async () => {
    tools = await getToolDefinitions();
  });
  
  describe('logExercise', () => {
    it('should log exercise successfully', async () => {
      const logExercise = tools.find(t => t.id === 'logExercise');
      expect(logExercise).toBeDefined();
      
      const tool = logExercise!.create(mockContext);
      const result = await tool.execute({
        activityType: 'cardio',
        durationMinutes: 30,
        intensity: 'moderate',
      });
      
      expect(result).toContain('logged');
    });
    
    it('should celebrate any movement', async () => {
      const logExercise = tools.find(t => t.id === 'logExercise');
      const tool = logExercise!.create(mockContext);
      const result = await tool.execute({
        activityType: 'walking',
        durationMinutes: 10,
      });
      
      expect(result).not.toContain('only');
      expect(result).toContain('great');
    });
  });
});
```

### Integration Tests

```typescript
// Test domain registration
describe('New Domains Registration', () => {
  it('should register all new domains', async () => {
    await initializeToolRegistry();
    
    const domains = [
      'crisis', 'health', 'career', 'decisions', 
      'family', 'home', 'learning', 'creativity',
      'community', 'legal-admin'
    ];
    
    for (const domain of domains) {
      const tools = await loadToolDomain(domain);
      expect(tools.length).toBeGreaterThan(0);
    }
  });
});
```

---

## Rollout Plan

### Week 1-2: Phase 1 (Safety & Health)
- [ ] Implement Crisis domain
- [ ] Implement Health domain
- [ ] Add crisis detection to conversation flow
- [ ] Test safety resource accuracy
- [ ] Deploy to staging

### Week 3-4: Phase 2 (Career & Decisions)
- [ ] Implement Career domain
- [ ] Implement Decision Support domain
- [ ] Integration tests
- [ ] Deploy to staging

### Week 5-6: Phase 3 (Family & Home)
- [ ] Implement Family domain
- [ ] Implement Home domain
- [ ] Test with sample users
- [ ] Deploy to staging

### Week 7-8: Phase 4 (Learning & Community)
- [ ] Implement Learning domain
- [ ] Implement Creativity domain
- [ ] Implement Community domain
- [ ] Deploy to staging

### Week 9-10: Phase 5 (Administration & Polish)
- [ ] Implement Legal-Admin domain
- [ ] Cross-domain integration testing
- [ ] Documentation update
- [ ] Production deployment

---

## Success Metrics

### Coverage Metrics
- [ ] 10 new domains implemented
- [ ] ~120 new tools available
- [ ] All major life domains covered

### Quality Metrics
- [ ] 100% unit test coverage for new tools
- [ ] Zero safety-critical bugs in Crisis domain
- [ ] Response latency < 200ms for all tools

### User Metrics (post-launch)
- [ ] New tool usage tracked
- [ ] User satisfaction with new domains
- [ ] Conversation completion rates

---

## Appendix: Tool Count Summary

| Domain | Tool Count | Status |
|--------|------------|--------|
| Crisis & Safety | 8 | Planned |
| Health & Fitness | 15 | Planned |
| Career & Professional | 16 | Planned |
| Decision Support | 8 | Planned |
| Family & Parenting | 14 | Planned |
| Home & Living | 10 | Planned |
| Education & Learning | 10 | Planned |
| Creativity & Hobbies | 8 | Planned |
| Community & Impact | 8 | Planned |
| Legal & Administrative | 10 | Planned |
| **TOTAL NEW** | **107** | |

Combined with existing ~200+ tools = **~300+ total tools** for comprehensive life coaching.

