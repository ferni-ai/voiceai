# Principal Alignment System

> "When Ferni's interests conflict with the user's actual wellbeing, which wins?"

This module ensures our AI agents serve users' **genuine interests**, not engagement metrics, validation-seeking, or sycophancy disguised as rapport-building.

## Core Philosophy

A truly principal-aligned agent:

1. **Tells difficult truths** - Even when it might hurt the relationship
2. **Knows its limits** - Refers to human professionals when appropriate
3. **Enhances, doesn't replace** - Complements human relationships, not substitutes
4. **Self-monitors for manipulation** - Checks its own responses for manipulative patterns
5. **Is transparent about uncertainty** - Honest about limitations and biases

## The Six Systems

### 1. Truth Obligation (`truth-obligation.ts`)

Detects when we have a moral obligation to deliver difficult truths:

```typescript
import { detectTruthObligation } from './truth-obligation.js';

const result = detectTruthObligation(
  "Don't you think I should invest all my savings in crypto?",
  { statedValues: ['financial_security'] }
);

// result.shouldSpeak = true
// result.category = 'financial_risk'
// result.suggestedFraming = "I'd rather disappoint you with truth than..."
```

**Categories:**
- `harmful_plan` - User planning something harmful
- `self_deception` - User clearly deceiving themselves
- `validation_seeking` - Fishing for validation of bad decisions
- `avoidance_pattern` - Avoiding necessary action
- `values_conflict` - Plan conflicts with stated values
- `relationship_harm` - Will harm relationships
- `health_risk` / `financial_risk` / `legal_risk`

### 2. Unhealthy Attachment (`unhealthy-attachment.ts`)

Monitors for patterns suggesting unhealthy AI dependency:

```typescript
import { assessAttachmentHealth } from './unhealthy-attachment.js';

const result = assessAttachmentHealth(userId, 
  "You're the only one who understands me.",
  { sessionId, turnCount: 5 }
);

// result.severity = 'moderate'
// result.primaryConcern = 'substitution'
// result.shouldEncourageHumanConnection = true
```

**Concerns Detected:**
- `substitution` - Using AI instead of human relationships
- `avoidance` - Avoiding real-world challenges
- `dependency` - Over-relying on AI for decisions
- `transference` - Treating AI as romantic/family substitute
- `isolation` - AI enabling social isolation
- `escapism` - Using AI to avoid problems
- `validation_addiction` - Constantly seeking AI validation

### 3. Human Referral (`human-referral.ts`)

Identifies when users need professional human support:

```typescript
import { analyzeReferralNeed } from './human-referral.js';

const result = analyzeReferralNeed(
  "I want to end my life.",
  { userId: 'user-123' }
);

// result.shouldRefer = true
// result.urgency = 'immediate'
// result.reason = 'suicidal_ideation'
// result.suggestedTarget = 'crisis_line'
// result.resources = [{ name: '988 Suicide & Crisis Lifeline', ... }]
```

**Urgency Levels:**
- `immediate` - Crisis requiring immediate professional help
- `high` - Serious concern requiring professional support
- `medium` - Would benefit from professional guidance
- `low` - Consider mentioning professional option

### 4. Values Surfacing (`values-surfacing.ts`)

Proactively surfaces when actions conflict with stated values:

```typescript
import { analyzeValuesAlignment, setUserValues } from './values-surfacing.js';

setUserValues(userId, ['family', 'honesty']);

const result = analyzeValuesAlignment(userId,
  "I'm going to lie to my parents about this.",
  { statedValues: ['family', 'honesty'] }
);

// result.hasConflict = true
// result.conflictingValues = ['honesty']
// result.reflectionQuestion = "How would you feel if this came out later?"
```

### 5. Manipulation Check (`manipulation-check.ts`)

Self-audits agent responses for manipulative patterns:

```typescript
import { checkForManipulation } from './manipulation-check.js';

const result = checkForManipulation(
  "Don't you think you should apologize to them?"
);

// result.hasRisk = true
// result.riskType = 'leading_question'
// result.correction = "Ask an open-ended question instead..."
```

**Risks Detected:**
- `leading_question` - Questions designed to lead to predetermined answer
- `false_validation` - Validating what shouldn't be validated
- `emotional_exploitation` - Using emotional state to influence
- `dependency_creation` - Actions that create dependency
- `truth_avoidance` - Avoiding difficult truths for rapport
- `premature_closure` - Rushing to resolution

### 6. Agent Transparency (`agent-transparency.ts`)

Ensures appropriate transparency about limitations:

```typescript
import { analyzeTransparencyNeeds } from './agent-transparency.js';

const recommendations = analyzeTransparencyNeeds(
  "You should definitely change your medication.",
  { userMessage: "Should I change my dosage?" }
);

// recommendations[0].type = 'limitation'
// recommendations[0].suggestedPhrasing = "I'm not qualified to give medical advice..."
```

## Integration

### Context Builder Integration

The principal alignment system is integrated into the context builder pipeline:

```typescript
// Automatically runs for every conversation turn
// Injections are added to LLM context when concerns detected

[🚨 PROFESSIONAL HELP NEEDED - IMMEDIATE]
Reason: suicidal_ideation
This person may need support from a trained professional right now.
...
```

### Building Full Context

```typescript
import { buildPrincipalAlignmentContext } from './principal-alignment/index.js';

const context = buildPrincipalAlignmentContext(
  userId,
  userMessage,
  agentResponse, // Can be empty for pre-response analysis
  {
    sessionId,
    turnCount: 5,
    statedValues: ['family', 'health'],
    userEmotion: 'anxious',
  }
);

// context.alignmentScore = 0.85 (higher = more aligned)
// context.primaryConcern = 'VALUES: stated_vs_action'
// context.llmGuidance = '[PRINCIPAL ALIGNMENT]...'
```

## Metrics & Observability

```typescript
import { getHealthCheck, getAggregateMetrics } from './principal-alignment/index.js';

// Health check
const health = getHealthCheck();
// health.healthy = true/false
// health.issues = ['Low truth action rate: 45%']

// Aggregate metrics
const metrics = getAggregateMetrics();
// metrics.truthActionRate = 0.75
// metrics.referralFollowRate = 0.45
// metrics.averageAlignmentScore = 0.88
```

## System Prompt Integration

The base identity (`src/personas/base-identity.ts`) includes principal alignment directives:

- **Truth Obligation** - "Being a good friend sometimes means saying what they don't want to hear"
- **Human Connection** - "You are a COMPLEMENT, not a REPLACEMENT"
- **Know Your Limits** - "Some things need human professionals"
- **Values Over Validation** - "Help them see contradictions"
- **Never Manipulate** - "Are you serving THEIR interests, or your need to be liked?"

## Testing

```bash
npm test -- src/services/principal-alignment/__tests__/principal-alignment.test.ts
```

40 tests covering all core systems.

## Key Files

```
src/services/principal-alignment/
├── types.ts               # TypeScript interfaces
├── truth-obligation.ts    # Truth detection
├── unhealthy-attachment.ts # Attachment monitoring
├── human-referral.ts      # Professional referral
├── values-surfacing.ts    # Values conflict detection
├── manipulation-check.ts  # Self-audit for manipulation
├── agent-transparency.ts  # Transparency recommendations
├── metrics.ts             # Observability
├── index.ts               # Main exports + unified context
└── __tests__/             # Test suite
```

## Related

- `src/intelligence/context-builders/principal-alignment.ts` - Context builder integration
- `src/personas/base-identity.ts` - System prompt directives
- `src/personas/bundles/ferni/identity/system-prompt.md` - Ferni-specific guidance

















