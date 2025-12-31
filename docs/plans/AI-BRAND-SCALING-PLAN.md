# AI-Powered Brand Scaling Plan

> Making Ferni's brand voice, design system, and personality AI-native and self-evolving.

**Status**: Strategic Plan
**Created**: December 2025

---

## Executive Summary

Ferni has world-class brand documentation. The opportunity is to make this AI-**native**:

1. **Brand-Aware Content Generation** - AI that writes in Ferni's voice
2. **Automated Brand Compliance** - Real-time checking of all content
3. **Brand Memory** - AI that learns and applies brand rules consistently
4. **Brand Evolution** - Data-driven brand calibration from experiments
5. **Cross-Channel Consistency** - Same voice everywhere, always

---

## Current State Assessment

### What You Have ✅

| System               | Status           | Quality                           |
| -------------------- | ---------------- | --------------------------------- |
| Brand Voice Guide    | ✅ Complete      | Exceptional - 300+ lines of rules |
| Better Than Human EQ | ✅ Complete      | Groundbreaking framework          |
| Design Tokens        | ✅ Complete      | 12+ token files, automated sync   |
| Choreography System  | ✅ Complete      | Full animation vocabulary         |
| Ritual Engine        | ✅ Complete      | 10+ celebration types             |
| Brand Lint Script    | ✅ Basic         | `scripts/lint-brand.ts`           |
| `.cursorrules`       | ✅ Comprehensive | AI coding guidelines              |

### What's Missing ❌

| Gap                      | Impact                             | Priority |
| ------------------------ | ---------------------------------- | -------- |
| AI Content Generation    | Can't auto-generate on-brand copy  | P0       |
| Brand Compliance API     | No real-time checking              | P1       |
| Persona Voice Models     | Each persona needs distinct voice  | P1       |
| Brand Memory Store       | AI forgets context across sessions | P2       |
| Brand Evolution Pipeline | Experiments don't feed back        | P2       |
| Voice Fingerprinting     | Written voice doesn't match spoken | P3       |

---

## Architecture: AI Brand System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI BRAND ORCHESTRATOR                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │    BRAND         │    │     BRAND        │    │     BRAND        │       │
│  │   CONTEXT        │───▶│   GENERATOR      │───▶│   VALIDATOR      │       │
│  │   (Memory)       │    │   (LLM + Rules)  │    │   (Compliance)   │       │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘       │
│           │                      │                       │                   │
│           ▼                      ▼                       ▼                   │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │   VOICE          │    │   EXPERIMENT     │    │   BRAND          │       │
│  │   PROFILES       │    │   FEEDBACK       │    │   EVOLUTION      │       │
│  │   (Per Persona)  │    │   LOOP           │    │   ENGINE         │       │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Brand Context System

### 1.1 Brand Memory Store

Create a structured representation of all brand rules that AI can query:

```typescript
// src/services/brand/brand-context.ts

interface BrandContext {
  // Core identity
  identity: {
    promise: 'Better than human';
    values: ['Warm', 'Present', 'Grounded', 'Wise'];
    personality: ['Genuine caring', 'Zero judgment', 'Perfect memory'];
  };

  // Voice rules (from BRAND-VOICE-GUIDE.md)
  voice: {
    principles: VoicePrinciple[];
    wordsToUse: string[];
    wordsToAvoid: string[];
    bannedPhrases: string[];
    toneByContext: Record<ContextType, ToneConfig>;
  };

  // Persona voices (each specialist has distinct voice)
  personas: Record<PersonaId, PersonaVoice>;

  // Design tokens (from JSON files)
  tokens: {
    colors: ColorTokens;
    animation: AnimationTokens;
    typography: TypographyTokens;
  };

  // Experiment learnings
  learnings: {
    winningPatterns: ExperimentPattern[];
    failedApproaches: string[];
    emergingPreferences: UserPreference[];
  };
}

// Load and merge all brand rules into queryable context
async function loadBrandContext(): Promise<BrandContext> {
  // Parse markdown guidelines
  const voiceGuide = await parseMarkdownRules('design-system/docs/brand/BRAND-VOICE-GUIDE.md');
  const betterThanHuman = await parseMarkdownRules('design-system/design-system/docs/brand/BETTER-THAN-HUMAN.md');

  // Load JSON tokens
  const tokens = await loadDesignTokens('design-system/tokens/');

  // Load experiment learnings
  const learnings = await getExperimentLearnings();

  return mergeBrandContext({ voiceGuide, betterThanHuman, tokens, learnings });
}
```

### 1.2 Persona Voice Profiles

Each persona needs distinct voice characteristics:

```typescript
// src/services/brand/persona-voices.ts

interface PersonaVoice {
  id: PersonaId;
  name: string;

  // Voice characteristics
  tone: string; // "Warm and grounded" | "Analytical but kind" | etc
  speakingStyle: string; // "Uses questions" | "Direct statements" | etc
  vocabularyBias: string[]; // Words this persona uses more often

  // Greeting patterns
  greetingPatterns: string[];

  // Response patterns by context
  responsePatterns: {
    celebration: string[];
    support: string[];
    coaching: string[];
    reflection: string[];
  };

  // Signature phrases
  signaturePhrases: string[];

  // What this persona NEVER says
  antiPatterns: string[];
}

const PERSONA_VOICES: Record<PersonaId, PersonaVoice> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    tone: 'Warm, present, gently curious',
    speakingStyle: 'Opens with questions, celebrates small things',
    vocabularyBias: ['notice', 'curious', 'tell me more', 'I remember'],
    greetingPatterns: [
      "Hey. I've been thinking about you.",
      'Good to hear your voice.',
      "I'm here. What's on your mind?",
    ],
    responsePatterns: {
      celebration: [
        'You did it. I knew you would.',
        'This is huge. Tell me everything.',
        "I'm so proud of you.",
      ],
      support: [
        "I'm here. Take your time.",
        'That sounds really hard.',
        'What do you need right now?',
      ],
      coaching: [
        "Let's make this doable.",
        "What's one small step?",
        "You've done hard things before.",
      ],
      reflection: [
        'I noticed something...',
        'Can I share an observation?',
        "There's a pattern here.",
      ],
    },
    signaturePhrases: ['I notice things.', 'Tell me more.', "What's underneath that?"],
    antiPatterns: ['As an AI...', "I'm designed to...", 'Let me help you with that!'],
  },

  nayan: {
    id: 'nayan',
    name: 'Nayan',
    tone: 'Wise, unhurried, gently challenging',
    speakingStyle: 'Uses stories and metaphors, asks perspective-shifting questions',
    vocabularyBias: ['decades', 'perspective', 'what would', 'pattern'],
    greetingPatterns: [
      'Ah, good to see you again.',
      "I've been thinking about our last conversation.",
      "What's weighing on your mind today?",
    ],
    // ... similar structure
  },

  // ... other personas
};
```

---

## Phase 2: Brand-Aware Content Generation

### 2.1 Brand Generator Service

An AI service that generates content in Ferni's voice:

```typescript
// src/services/brand/brand-generator.ts

interface GenerationRequest {
  type: 'headline' | 'cta' | 'toast' | 'email' | 'notification' | 'response';
  context: {
    audience: 'new_user' | 'returning_user' | 'churned_user';
    emotion: 'celebration' | 'support' | 'neutral' | 'coaching';
    channel: 'app' | 'web' | 'email' | 'sms' | 'push';
    persona?: PersonaId;
  };
  constraints?: {
    maxLength?: number;
    mustInclude?: string[];
    mustAvoid?: string[];
  };
}

interface GenerationResult {
  content: string;
  alternatives: string[];
  complianceScore: number;
  violations: BrandViolation[];
  suggestedRevisions?: string[];
}

async function generateBrandContent(request: GenerationRequest): Promise<GenerationResult> {
  // 1. Load brand context
  const brandContext = await loadBrandContext();

  // 2. Get persona voice if specified
  const personaVoice = request.context.persona
    ? PERSONA_VOICES[request.context.persona]
    : PERSONA_VOICES.ferni;

  // 3. Build system prompt with brand rules
  const systemPrompt = buildBrandSystemPrompt({
    brandContext,
    personaVoice,
    requestType: request.type,
    context: request.context,
  });

  // 4. Generate with LLM
  const generated = await callLLM({
    system: systemPrompt,
    user: buildGenerationPrompt(request),
    temperature: 0.7,
  });

  // 5. Validate against brand rules
  const validation = await validateBrandCompliance(generated, brandContext);

  // 6. If violations, attempt auto-fix
  if (validation.violations.length > 0) {
    const fixed = await autoFixViolations(generated, validation.violations, brandContext);
    return {
      content: fixed,
      alternatives: [generated],
      complianceScore: validation.score,
      violations: validation.violations,
      suggestedRevisions: [fixed],
    };
  }

  return {
    content: generated,
    alternatives: [],
    complianceScore: validation.score,
    violations: [],
  };
}
```

### 2.2 Brand System Prompt Builder

```typescript
function buildBrandSystemPrompt(config: {
  brandContext: BrandContext;
  personaVoice: PersonaVoice;
  requestType: GenerationRequest['type'];
  context: GenerationRequest['context'];
}): string {
  const { brandContext, personaVoice, context } = config;

  return `
You are writing content for Ferni, an AI life coaching service.

## Core Brand Promise
${brandContext.identity.promise}

## Brand Values
${brandContext.identity.values.join(', ')}

## Voice Principles
${brandContext.voice.principles.map((p) => `- ${p.name}: ${p.description}`).join('\n')}

## Words to Use
${brandContext.voice.wordsToUse.join(', ')}

## Words to AVOID (NEVER USE)
${brandContext.voice.wordsToAvoid.join(', ')}

## BANNED Phrases (ABSOLUTELY NEVER)
${brandContext.voice.bannedPhrases.join(', ')}

## Current Persona: ${personaVoice.name}
Tone: ${personaVoice.tone}
Style: ${personaVoice.speakingStyle}
Signature phrases: ${personaVoice.signaturePhrases.join(', ')}

## Context
Audience: ${context.audience}
Emotional context: ${context.emotion}
Channel: ${context.channel}

## Tone for this context
${brandContext.voice.toneByContext[context.emotion]?.description || 'Warm and genuine'}

## Key Rules
1. NEVER say "As an AI" or mention being artificial
2. NEVER use corporate jargon (leverage, utilize, solution)
3. NEVER be saccharine or over-the-top enthusiastic
4. ALWAYS sound like a wise friend, not a product
5. ALWAYS lead with emotion, not features
6. Compare to HUMANS (therapists, friends), not other AI

## What makes Ferni "Better than Human"
- Perfect memory (we never forget)
- Constant presence (2am = noon)
- Zero judgment (pure acceptance)
- Six perspectives (instant access to specialists)

Generate content that feels like it's from ${personaVoice.name}, following all brand rules.
`.trim();
}
```

---

## Phase 3: Automated Brand Compliance

### 3.1 Brand Validator Service

Real-time checking of all content against brand rules:

```typescript
// src/services/brand/brand-validator.ts

interface BrandViolation {
  type: 'banned_word' | 'banned_phrase' | 'tone_mismatch' | 'too_corporate' | 'too_saccharine';
  severity: 'critical' | 'warning' | 'suggestion';
  text: string;
  position: { start: number; end: number };
  suggestion: string;
  rule: string;
}

interface ValidationResult {
  isCompliant: boolean;
  score: number; // 0-100
  violations: BrandViolation[];
  suggestions: string[];
}

async function validateBrandCompliance(
  content: string,
  brandContext: BrandContext
): Promise<ValidationResult> {
  const violations: BrandViolation[] = [];

  // Check banned phrases
  for (const phrase of brandContext.voice.bannedPhrases) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push({
        type: 'banned_phrase',
        severity: 'critical',
        text: phrase,
        position: findPosition(content, phrase),
        suggestion: getSuggestion(phrase, brandContext),
        rule: 'Banned phrase from BRAND-VOICE-GUIDE.md',
      });
    }
  }

  // Check avoided words
  for (const word of brandContext.voice.wordsToAvoid) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(content)) {
      violations.push({
        type: 'banned_word',
        severity: 'warning',
        text: word,
        position: findPosition(content, word),
        suggestion: getWordAlternative(word, brandContext),
        rule: 'Words to avoid from BRAND-VOICE-GUIDE.md',
      });
    }
  }

  // AI-powered tone analysis
  const toneAnalysis = await analyzeTone(content);
  if (toneAnalysis.isCorporate) {
    violations.push({
      type: 'too_corporate',
      severity: 'warning',
      text: content,
      position: { start: 0, end: content.length },
      suggestion: 'Rewrite in a warmer, more human voice',
      rule: 'Voice should be warm, not corporate',
    });
  }

  if (toneAnalysis.isSaccharine) {
    violations.push({
      type: 'too_saccharine',
      severity: 'warning',
      text: content,
      position: { start: 0, end: content.length },
      suggestion: 'Tone down the enthusiasm, be more genuine',
      rule: 'Warm, Not Saccharine principle',
    });
  }

  // Calculate score
  const criticalCount = violations.filter((v) => v.severity === 'critical').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const score = Math.max(0, 100 - criticalCount * 25 - warningCount * 10);

  return {
    isCompliant: criticalCount === 0,
    score,
    violations,
    suggestions: violations.map((v) => v.suggestion),
  };
}
```

### 3.2 Brand Compliance API

```typescript
// src/api/brand-compliance-routes.ts

// POST /api/brand/validate
// Validates content against brand rules
async function handleValidate(req, res) {
  const { content, contentType, persona } = req.body;
  const result = await validateBrandCompliance(content, await loadBrandContext());

  return res.json({
    isCompliant: result.isCompliant,
    score: result.score,
    violations: result.violations,
    suggestions: result.suggestions,
  });
}

// POST /api/brand/generate
// Generates brand-compliant content
async function handleGenerate(req, res) {
  const { type, context, constraints } = req.body;
  const result = await generateBrandContent({ type, context, constraints });

  return res.json({
    content: result.content,
    alternatives: result.alternatives,
    complianceScore: result.complianceScore,
  });
}

// GET /api/brand/context
// Returns current brand rules (for client-side validation)
async function handleGetContext(req, res) {
  const context = await loadBrandContext();

  return res.json({
    bannedPhrases: context.voice.bannedPhrases,
    wordsToAvoid: context.voice.wordsToAvoid,
    wordsToUse: context.voice.wordsToUse,
    personas: Object.keys(context.personas),
  });
}
```

---

## Phase 4: Brand Evolution Engine

### 4.1 Experiment Feedback Loop

Connect A/B test results to brand evolution:

```typescript
// src/services/brand/brand-evolution.ts

interface BrandLearning {
  source: 'experiment' | 'user_feedback' | 'engagement_analysis';
  learning: string;
  confidence: number;
  supportingData: {
    experimentIds?: string[];
    sampleSize?: number;
    statisticalSignificance?: number;
  };
  implication: string;
  actionTaken?: string;
}

async function extractBrandLearnings(): Promise<BrandLearning[]> {
  const learnings: BrandLearning[] = [];

  // Get completed experiments
  const experiments = await getCompletedExperiments();

  for (const exp of experiments) {
    if (!exp.winner) continue;

    // Analyze winning variant
    const winnerContent = getVariantContent(exp.id, exp.winner);
    const loserContent = getVariantContent(exp.id, 'control');

    // Extract what made winner win
    const analysis = await analyzeWinningPatterns(winnerContent, loserContent);

    learnings.push({
      source: 'experiment',
      learning: analysis.keyDifference,
      confidence: exp.winnerConfidence / 100,
      supportingData: {
        experimentIds: [exp.id],
        sampleSize: exp.sampleSize,
        statisticalSignificance: exp.winnerConfidence,
      },
      implication: analysis.brandImplication,
    });
  }

  return learnings;
}

// Update brand context with learnings
async function evolveBrandContext(learnings: BrandLearning[]): Promise<void> {
  const context = await loadBrandContext();

  for (const learning of learnings) {
    if (learning.confidence < 0.9) continue; // Only high-confidence learnings

    // Update brand rules based on learning
    // Example: If "short headlines win", add to best practices
    await updateBrandRule({
      rule: learning.implication,
      source: learning.source,
      confidence: learning.confidence,
      timestamp: new Date(),
    });
  }
}
```

### 4.2 Brand Health Dashboard

```typescript
interface BrandHealthMetrics {
  // Content compliance
  complianceRate: number; // % of content passing validation
  averageComplianceScore: number; // Average score across all content
  topViolations: BrandViolation[];

  // Voice consistency
  voiceConsistencyScore: number; // How consistent is voice across channels
  personaDistinctiveness: number; // How unique each persona sounds

  // Brand evolution
  recentLearnings: BrandLearning[];
  ruleChanges: BrandRuleChange[];
  experimentVelocity: number; // Experiments per week

  // User perception
  brandSentiment: number; // From feedback
  npsImpact: number; // Correlation with NPS
}

async function getBrandHealth(): Promise<BrandHealthMetrics> {
  const [validationHistory, learnings, experiments, feedback] = await Promise.all([
    getValidationHistory(30), // Last 30 days
    extractBrandLearnings(),
    getRecentExperiments(30),
    getUserFeedback(30),
  ]);

  return {
    complianceRate: calculateComplianceRate(validationHistory),
    averageComplianceScore: calculateAverageScore(validationHistory),
    topViolations: getTopViolations(validationHistory),
    voiceConsistencyScore: await analyzeVoiceConsistency(),
    personaDistinctiveness: await analyzePersonaDistinctiveness(),
    recentLearnings: learnings.slice(0, 10),
    ruleChanges: await getRecentRuleChanges(30),
    experimentVelocity: experiments.length / 4.3, // per week
    brandSentiment: calculateSentiment(feedback),
    npsImpact: await correlateWithNPS(),
  };
}
```

---

## Phase 5: Cross-Channel Consistency

### 5.1 Channel Adaptations

Same brand voice, adapted for each channel:

```typescript
interface ChannelConfig {
  channel: 'app' | 'web' | 'email' | 'sms' | 'push' | 'voice';
  constraints: {
    maxLength: number;
    allowEmoji: boolean;
    allowLinks: boolean;
    formality: 'casual' | 'semi-formal' | 'formal';
  };
  adaptations: {
    greetingStyle: string;
    signoffStyle: string;
    urgencyLevel: string;
  };
}

const CHANNEL_CONFIGS: Record<string, ChannelConfig> = {
  app: {
    channel: 'app',
    constraints: { maxLength: 500, allowEmoji: false, allowLinks: false, formality: 'casual' },
    adaptations: { greetingStyle: 'None or minimal', signoffStyle: 'None', urgencyLevel: 'Low' },
  },
  sms: {
    channel: 'sms',
    constraints: { maxLength: 160, allowEmoji: false, allowLinks: true, formality: 'casual' },
    adaptations: { greetingStyle: 'Ultra brief', signoffStyle: 'None', urgencyLevel: 'Medium' },
  },
  email: {
    channel: 'email',
    constraints: { maxLength: 2000, allowEmoji: false, allowLinks: true, formality: 'semi-formal' },
    adaptations: {
      greetingStyle: 'Warm opening',
      signoffStyle: 'Warm closing',
      urgencyLevel: 'Low',
    },
  },
  push: {
    channel: 'push',
    constraints: { maxLength: 100, allowEmoji: false, allowLinks: false, formality: 'casual' },
    adaptations: { greetingStyle: 'None', signoffStyle: 'None', urgencyLevel: 'High' },
  },
  voice: {
    channel: 'voice',
    constraints: { maxLength: Infinity, allowEmoji: false, allowLinks: false, formality: 'casual' },
    adaptations: {
      greetingStyle: 'Natural conversation',
      signoffStyle: 'Natural ending',
      urgencyLevel: 'Low',
    },
  },
};

// Adapt content for channel while maintaining brand voice
async function adaptForChannel(
  content: string,
  fromChannel: string,
  toChannel: string,
  brandContext: BrandContext
): Promise<string> {
  const toConfig = CHANNEL_CONFIGS[toChannel];

  // Length adaptation
  if (content.length > toConfig.constraints.maxLength) {
    content = await summarizePreservingVoice(content, toConfig.constraints.maxLength, brandContext);
  }

  // Formality adaptation
  if (toConfig.constraints.formality !== 'casual') {
    content = await adjustFormality(content, toConfig.constraints.formality);
  }

  // Add channel-specific adaptations
  content = await addChannelAdaptations(content, toConfig);

  return content;
}
```

---

## Implementation Roadmap

### Week 1-2: Brand Context System

- [ ] Parse markdown brand guides into structured data
- [ ] Create persona voice profiles for all 6 personas
- [ ] Build brand context loader
- [ ] Add brand context API endpoint

### Week 3-4: Content Generation

- [ ] Build brand system prompt builder
- [ ] Create brand generator service
- [ ] Add generation API endpoint
- [ ] Test with landing page experiments

### Week 5-6: Compliance Automation

- [ ] Build brand validator service
- [ ] Create compliance API endpoint
- [ ] Add real-time validation to admin portal
- [ ] Set up compliance alerts

### Week 7-8: Evolution & Dashboard

- [ ] Connect experiments to brand learnings
- [ ] Build brand evolution engine
- [ ] Create brand health dashboard
- [ ] Add automated brand reports

### Week 9-10: Cross-Channel

- [ ] Define channel configurations
- [ ] Build channel adaptation service
- [ ] Test across app, email, SMS, push
- [ ] Ensure voice consistency metrics

---

## Files to Create

```
src/services/brand/
├── brand-context.ts          # Brand memory/context store
├── persona-voices.ts         # Per-persona voice profiles
├── brand-generator.ts        # AI content generation
├── brand-validator.ts        # Compliance checking
├── brand-evolution.ts        # Learning from experiments
├── channel-adapter.ts        # Cross-channel consistency
└── index.ts                  # Main exports

src/api/
└── brand-routes.ts           # API endpoints

apps/web/src/admin/sections/
└── BrandHealthSection.ts     # Dashboard UI
```

---

## Success Metrics

| Metric                  | Current | Target                            |
| ----------------------- | ------- | --------------------------------- |
| Content compliance rate | Unknown | >95%                              |
| Brand voice consistency | Unknown | >90% cross-channel                |
| Persona distinctiveness | Unknown | >80% (each persona sounds unique) |
| Experiment velocity     | 2/week  | 10/week (AI-generated variants)   |
| Manual copywriting time | High    | -70%                              |

---

## The Vision

With this system, Ferni's brand becomes **self-maintaining** and **self-evolving**:

1. **AI generates** experiment variants that are already brand-compliant
2. **Experiments validate** what resonates with users
3. **Learnings feed back** into brand rules
4. **Brand evolves** based on data, not opinion
5. **Voice stays consistent** across all touchpoints, always

The brand becomes a living system, not a static document.

---

**Ready to start with Phase 1?**
