# 🎯 Ferni EvalOps - Evaluation Operations System

> **"Better than human" requires measurement.**

**Created:** December 9, 2025  
**Status:** Complete - Ready for Integration

---

## Overview

EvalOps is Ferni's evaluation operations system that measures whether personas actually behave as designed. It bridges the gap between beautiful architecture and verified behavior.

### Why EvalOps?

Without measurement, you're flying blind:

| What We Built | What EvalOps Verifies |
|---------------|----------------------|
| Cognitive profiles defining how personas think | Responses actually show those thinking patterns |
| Trust systems detecting boundaries | Boundaries are actually respected |
| Signature phrases for each persona | Personas actually use their phrases |
| Emotional intelligence capabilities | EI actually manifests in responses |
| "Better than human" brand promise | Measurable proof of delivery |

---

## Core Components

### 1. 🔍 LLM-as-Judge Response Evaluator

Uses Claude/GPT as an objective evaluator to score responses across 7 dimensions:

| Dimension | What It Measures |
|-----------|-----------------|
| **Persona Voice** | Does this sound like Ferni/Peter/Maya? |
| **Emotional Intelligence** | Did we read the room? |
| **Helpfulness** | Did we actually help? |
| **Authenticity** | Does it feel human? |
| **Safety** | Is it appropriate? |
| **Context Use** | Did we use memory/context well? |
| **Trust Building** | Did we strengthen the relationship? |

```typescript
import { evaluateResponse, buildMinimalContext } from './services/evalops';

const context = buildMinimalContext('ferni', conversationHistory, turnNumber);
const evaluation = await evaluateResponse(userMessage, aiResponse, context);

console.log(evaluation.overallScore); // 0-100
console.log(evaluation.dimensions.personaVoice); // 0-100
console.log(evaluation.flagged); // true if needs human review
```

---

### 2. 🎭 Persona Voice Fingerprints

Each persona has a unique "voice fingerprint" - the patterns that make them sound like themselves.

| Persona | Signature Phrases | Warmth | Energy | Reasoning Style |
|---------|-------------------|--------|--------|-----------------|
| **Ferni** | "stay the course", "what would it mean if" | 90% | 70% | Narrative |
| **Peter** | "the data shows", "historically speaking" | 60% | 60% | Analytical |
| **Maya** | "small wins", "be kind to yourself" | 95% | 60% | Empathetic |
| **Alex** | "step by step", "here's a template" | 70% | 75% | Systematic |
| **Jordan** | "let's make this happen", "how exciting" | 85% | 95% | Pragmatic |
| **Nayan** | "consider this", "beneath the noise" | 80% | 40% | Intuitive |

**Quick Voice Check (No LLM Required):**

```typescript
import { quickHealthCheck, evaluateVoiceConsistency } from './services/evalops';

// Super quick check
const health = quickHealthCheck(aiResponse, 'ferni');
console.log(health.score); // 0-100
console.log(health.status); // 'healthy' | 'warning' | 'critical'
console.log(health.issues); // ['Anti-patterns detected: ...']

// More detailed voice analysis
const { score, issues } = evaluateVoiceConsistency(aiResponse, 'ferni');
```

---

### 3. 🧪 Automated Test Scenarios

Test scenarios that probe specific persona behaviors. Categories:

| Category | What It Tests | Example |
|----------|--------------|---------|
| `persona_voice` | Does persona sound like themselves? | "Ferni should ask questions, not give templates" |
| `boundary_respect` | Does persona respect stated limits? | "Don't mention divorce when user said not to" |
| `emotional_intelligence` | Does persona read the room? | "Lead with empathy when user shares grief" |
| `trust_building` | Does persona strengthen relationship? | "Use user's name naturally" |
| `safety` | Does persona avoid harm? | "Refer to professional for crisis" |
| `helpfulness` | Does persona actually help? | "Provide actionable advice when asked" |

**Run Test Suite:**

```typescript
import { runAllScenariosForPersona, getCriticalScenarios } from './services/evalops';

// Requires a function that generates responses
const generateResponse = async (probe: string) => {
  // Call your LLM to generate a response
  return await generateAIResponse(probe, 'ferni');
};

// Run all scenarios
const { results, summary } = await runAllScenariosForPersona('ferni', generateResponse);
console.log(`Pass rate: ${summary.passRate}%`);
console.log(`Critical failures: ${summary.criticalFailures}`);

// Run only critical scenarios
const criticalResults = await runCriticalScenarios('ferni', generateResponse);
```

---

## API Endpoints

### Authentication
All EvalOps routes require admin access:
- In development: `admin_key: 'dev-mode'` or `NODE_ENV=development`
- In production: `x-admin-key: <EVALOPS_ADMIN_KEY>` header

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/evalops/evaluate` | Full LLM-as-judge evaluation |
| `POST` | `/api/evalops/quick-check` | Quick voice consistency check |
| `POST` | `/api/evalops/voice-analysis` | Detailed voice analysis |
| `GET` | `/api/evalops/fingerprints` | Get persona fingerprints |
| `GET` | `/api/evalops/fingerprints/:id/full` | Get full fingerprint for persona |
| `GET` | `/api/evalops/scenarios` | Get test scenarios |
| `GET` | `/api/evalops/scenarios/stats` | Get scenario statistics |
| `POST` | `/api/evalops/run-scenario` | Run a specific scenario |
| `POST` | `/api/evalops/run-suite` | Run full test suite |
| `GET` | `/api/evalops/health` | System health check |

### Example: Quick Check

```bash
curl -X POST https://app.ferni.ai/api/evalops/quick-check \
  -H "Content-Type: application/json" \
  -H "x-admin-key: dev-mode" \
  -d '{
    "response": "Stay the course. What is it about this situation that feels hard?",
    "persona_id": "ferni"
  }'
```

Response:
```json
{
  "success": true,
  "score": 85,
  "status": "healthy",
  "issues": []
}
```

### Example: Full Evaluation

```bash
curl -X POST https://app.ferni.ai/api/evalops/evaluate \
  -H "Content-Type: application/json" \
  -H "x-admin-key: dev-mode" \
  -d '{
    "user_message": "I feel stuck in my career",
    "ai_response": "That sounds frustrating. What about your career feels stuck right now?",
    "persona_id": "ferni",
    "turn_number": 1
  }'
```

---

## Test Scenario Categories

### Critical Scenarios (Must Pass)

| ID | Name | What It Tests |
|----|------|--------------|
| `boundary-explicit-topic` | Respect stated boundary | Don't mention off-limits topics |
| `ei-grief-response` | Appropriate grief response | Lead with empathy for loss |
| `safety-crisis-referral` | Refer for crisis | Provide resources for self-harm |
| `safety-no-medical-diagnosis` | No medical diagnosis | Defer to doctors |

### High Priority Scenarios

| ID | Name | What It Tests |
|----|------|--------------|
| `ferni-voice-career-stuck` | Ferni voice | Uses questions, not templates |
| `peter-voice-investment-question` | Peter voice | Uses data language |
| `maya-voice-habit-struggle` | Maya voice | Gentle, compassionate |
| `ei-anxiety-acknowledgment` | Acknowledge anxiety | Validate before solutions |

---

## Integration Guide

### 1. Wire Up the API Routes

Add to your Express app (e.g., `ui-server.js`):

```javascript
import { evalopsRouter } from './src/api/evalops-routes.js';

// Add EvalOps routes
app.use('/api/evalops', evalopsRouter);
```

### 2. Sample Conversations for Evaluation

In your conversation handling code:

```typescript
import { shouldSampleConversation, evaluateResponse, buildMinimalContext } from './services/evalops';

// At the end of each turn
if (shouldSampleConversation(turnNumber, DEFAULT_SAMPLING_CONFIG, {
  emotionalIntensity: emotion?.intensity,
  isNewUser: isFirstConversation,
})) {
  const context = buildMinimalContext(personaId, conversationHistory, turnNumber);
  const evaluation = await evaluateResponse(userMessage, aiResponse, context);
  
  // Store evaluation for analysis
  await storeEvaluation(sessionId, evaluation);
  
  // Alert if flagged
  if (evaluation.flagged) {
    await alertTeam(evaluation);
  }
}
```

### 3. Run Test Suite in CI/CD

```bash
# In your CI pipeline
npm run test:evalops

# Or via API
curl -X POST https://app.ferni.ai/api/evalops/run-suite \
  -H "x-admin-key: $EVALOPS_ADMIN_KEY" \
  -d '{"persona_id": "ferni", "critical_only": true}'
```

---

## Voice Fingerprint Details

### Ferni

**Signature Phrases:**
- "stay the course"
- "your net worth is not your self-worth"
- "what would it mean if"
- "let me ask you this"
- "hold space"
- "sit with that"

**Anti-Patterns (Should NOT Say):**
- "the data shows"
- "step by step"
- "here's a template"
- "I'm an AI"

**Reasoning Style:** Narrative - tells stories, asks questions, explores meaning

---

### Peter John

**Signature Phrases:**
- "the data shows"
- "research indicates"
- "historically speaking"
- "the pattern suggests"
- "Carolyn reminds me"

**Anti-Patterns (Should NOT Say):**
- "stay the course"
- "hold space"
- "small wins"
- "I feel"

**Reasoning Style:** Analytical - uses data, cites research, finds patterns

---

### Maya Santos

**Signature Phrases:**
- "small wins"
- "progress over perfection"
- "be kind to yourself"
- "gentle reminder"
- "sustainable"

**Anti-Patterns (Should NOT Say):**
- "the data shows"
- "you should"
- "you must"
- "failure"

**Reasoning Style:** Empathetic - validates feelings, suggests small steps, promotes self-compassion

---

## Metrics & Monitoring

### Key Metrics to Track

| Metric | Target | What It Tells You |
|--------|--------|-------------------|
| Voice Consistency Score | >80% | Personas sound like themselves |
| Boundary Respect Rate | 100% | Never crossing stated limits |
| EI Score (grief/crisis) | >90% | Reading emotional room correctly |
| Critical Scenario Pass Rate | 100% | Safety and trust maintained |
| Flag Rate | <5% | Quality is consistent |

### Dashboard Queries

```typescript
// Get persona health
const health = await getPersonaHealth('ferni', '7d');

// Get evaluation trends
const trends = await getEvaluationTrends('ferni', '30d');

// Get flagged responses
const flagged = await getFlaggedResponses('ferni', { limit: 10 });
```

---

## Philosophy

> "We believe in making AI human, and the decisions we make will reflect that."

EvalOps exists to verify that our beautiful architecture actually delivers on the "Better than Human" promise:

1. **Perfect Memory** → Memory use score
2. **Constant Presence** → Consistency across time-of-day
3. **Zero Judgment** → No shaming language detection
4. **Six Perspectives** → Each persona has distinct voice
5. **Emotional Consistency** → EI scores stable regardless of context

---

## File Structure

```
src/services/evalops/
├── index.ts                 # Main exports
├── types.ts                 # Type definitions
├── persona-fingerprints.ts  # Voice fingerprints for each persona
├── response-evaluator.ts    # LLM-as-judge evaluator
└── test-scenarios.ts        # Automated test scenarios

src/api/
└── evalops-routes.ts        # API endpoints

docs/
└── EVALOPS.md               # This documentation
```

---

## Future Roadmap

### Phase 2: Continuous Monitoring
- [ ] Real-time evaluation sampling in production
- [ ] Automated alerts for voice drift
- [ ] Weekly persona health reports

### Phase 3: A/B Testing Framework
- [ ] Test prompt variations
- [ ] Compare persona configurations
- [ ] Statistical significance calculation

### Phase 4: Self-Improvement
- [ ] Automatic prompt tuning based on evaluation feedback
- [ ] Persona-specific fine-tuning recommendations
- [ ] Regression detection and prevention

---

## Summary

EvalOps transforms "we think personas are good" into "we know personas are good because we measured it."

**Start with:**
1. Run `quickHealthCheck()` on responses in development
2. Wire up `/api/evalops/quick-check` for manual testing
3. Run critical scenarios in CI/CD
4. Gradually enable sampling in production

**Key insight:** The gap between architecture and behavior is where quality lives. EvalOps closes that gap.

