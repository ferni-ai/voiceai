# 🎯 Ferni EvalOps - Evaluation Operations System

> **"Better than human" requires measurement.**

**Created:** December 9, 2025  
**Status:** Complete - Ready for Integration

---

## 🚀 Quick Start

### Dashboard UI
Press `Cmd/Ctrl+Shift+E` or click **🎯 EvalOps** in the Dev Panel → Dashboards section.

### Feature Flags
EvalOps is controlled via feature flags (see `data/feature-flags.json` or `GET /api/evalops/flags`):

| Flag | Default | Description |
|------|---------|-------------|
| `evalops` | `true` | Master toggle |
| `evalops-auto-sampling` | `true` | Sample conversations automatically |
| `evalops-voice-checks` | `true` | Heuristic voice consistency |
| `evalops-llm-evaluation` | `false` | Full LLM-as-judge (costs API tokens) |
| `evalops-scheduled-suites` | `false` | Daily test suite runs |
| `evalops-alerting` | `true` | Alert on flagged responses |
| `evalops-sample-rate` | `5%` | Percentage of convos to evaluate |

### API Endpoints Summary
| Endpoint | Description |
|----------|-------------|
| `GET /api/evalops/health` | System health + metrics |
| `GET /api/evalops/flags` | Get feature flags |
| `PUT /api/evalops/flags` | Update feature flags |
| `GET /api/evalops/metrics` | Evaluation metrics |
| `GET /api/evalops/evaluations` | Recent evaluations |
| `GET /api/evalops/evaluations/flagged` | Flagged responses |
| `POST /api/evalops/evaluate` | Full LLM evaluation |
| `POST /api/evalops/quick-check` | Quick voice check |
| `GET /api/evalops/fingerprints` | Persona fingerprints |
| `GET /api/evalops/scenarios` | Test scenarios |
| `POST /api/evalops/run-suite` | Run test suite |

### Integration Hook
```typescript
import { evalopsHook } from './services/evalops';

// After each AI response
await evalopsHook.afterTurn(
  sessionId,
  personaId,
  userMessage,
  aiResponse,
  {
    conversationHistory,
    userProfile,
    trustContext,
    emotionalContext,
    turnNumber,
    isNewUser,
    hasUserReportedIssue,
  }
);
```

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

EvalOps routes are handled by `evalops-handler.ts` using the raw HTTP handler pattern:

```javascript
// In ui-server.js
import { handleEvalOpsRoutes } from './dist/api/evalops-handler.js';

// In the request handler
if (pathname.startsWith('/api/evalops')) {
  return await handleEvalOpsRoutes(req, res, pathname, parsedUrl);
}
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
├── test-scenarios.ts        # Automated test scenarios
└── automation.ts            # E2E automation hooks, feature flags, metrics

src/api/
└── evalops-handler.ts       # Raw HTTP handler (used by ui-server.js)

apps/web/src/ui/
└── evalops-dashboard.ui.ts  # Dashboard UI component

data/
└── feature-flags.json       # Feature flag configuration

docs/
└── EVALOPS.md               # This documentation
```

---

## Automation System

### Conversation Hooks

Integrate EvalOps into your conversation pipeline:

```typescript
import { evalopsHook } from './services/evalops';

// After generating AI response
const evaluation = await evalopsHook.afterTurn(
  sessionId,      // Unique session ID
  personaId,      // 'ferni', 'peter-john', etc.
  userMessage,    // User's message
  aiResponse,     // AI's generated response
  {
    conversationHistory,  // Previous messages
    userProfile,          // User info if available
    trustContext,         // Boundaries, wins, etc.
    emotionalContext,     // Detected emotions
    turnNumber,           // Current turn
    isNewUser,            // First conversation?
    hasUserReportedIssue, // User complained?
  }
);

if (evaluation?.flagged) {
  // Handle flagged response
  console.log('Response flagged:', evaluation.flagReasons);
}
```

### Quick Voice Check

Lightweight check (no LLM call):

```typescript
const { score, status, issues } = evalopsHook.quickVoiceCheck('ferni', response);
// score: 0-100
// status: 'healthy' | 'warning' | 'critical'
// issues: ['Anti-patterns detected: ...']
```

### Alert on Flagged Responses

```typescript
// Register alert handler
evalopsHook.onFlagged(async (evaluation) => {
  await slack.send(`⚠️ Flagged response for ${evaluation.personaId}`);
  await db.flagged.insert(evaluation);
});
```

### Metrics

```typescript
const metrics = evalopsHook.getMetrics();
console.log({
  totalEvaluations: metrics.totalEvaluations,
  flaggedResponses: metrics.flaggedResponses,
  averageScore: metrics.averageScore,
});
```

---

## Feature Flags API

### Get Flags
```bash
curl https://app.ferni.ai/api/evalops/flags \
  -H "x-admin-key: dev-mode"
```

### Update Flags
```bash
curl -X PUT https://app.ferni.ai/api/evalops/flags \
  -H "Content-Type: application/json" \
  -H "x-admin-key: dev-mode" \
  -d '{
    "enabled": true,
    "autoSampling": true,
    "llmEvaluation": false,
    "sampleRateOverride": 10
  }'
```

### Available Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch |
| `autoSampling` | boolean | `true` | Auto-sample conversations |
| `voiceChecks` | boolean | `true` | Heuristic voice checks |
| `llmEvaluation` | boolean | `false` | Full LLM evaluation |
| `scheduledSuites` | boolean | `false` | Daily test runs |
| `alerting` | boolean | `true` | Alert on flagged |
| `sampleRateOverride` | number | `null` | Override sample rate |
| `enabledPersonas` | string[] | `[]` | Restrict to personas |

---

## Dashboard UI

### Opening the Dashboard

**Method 1:** Keyboard shortcut
- Mac: `Cmd+Shift+E`
- Windows: `Ctrl+Shift+E`

**Method 2:** Dev Panel
1. Open Dev Panel (`Cmd/Ctrl+Shift+D`)
2. Scroll to "Dashboards & Tools"
3. Click "🎯 EvalOps"

### Dashboard Tabs

| Tab | Content |
|-----|---------|
| **Overview** | Health scores, passing scenarios, flagged count |
| **Personas** | Per-persona voice health and fingerprint details |
| **Scenarios** | Test scenario results by category |
| **Flagged** | Responses that need human review |
| **Config** | Toggle features, adjust sample rate |

### Programmatic Access

```typescript
// Show dashboard
window.evalopsDashboard.show();

// Hide dashboard
window.evalopsDashboard.hide();

// Refresh data
window.evalopsDashboard.refresh();

// Quick check
await window.evalopsDashboard.runQuickCheck('ferni', 'response text');
```

---

## Implementation Status

### ✅ Phase 1: Core System (Complete)
- [x] LLM-as-Judge response evaluator
- [x] Persona voice fingerprints (all 6 personas)
- [x] Test scenario framework (30+ scenarios)
- [x] API endpoints
- [x] Dashboard UI
- [x] Feature flag integration
- [x] Conversation hooks for automation
- [x] Metrics tracking

### 🔄 Phase 2: E2E Integration (In Progress)
- [x] Automation hooks (`evalopsHook.afterTurn`)
- [x] Feature flags for gradual rollout
- [x] Dashboard with real-time data
- [ ] Integration into voice agent pipeline
- [ ] Scheduled test suite runs (daily)
- [ ] Slack/Discord alerting for flagged responses

### 📋 Phase 3: A/B Testing Framework
- [ ] Test prompt variations
- [ ] Compare persona configurations
- [ ] Statistical significance calculation

### 📋 Phase 4: Self-Improvement
- [ ] Automatic prompt tuning based on evaluation feedback
- [ ] Persona-specific fine-tuning recommendations
- [ ] Regression detection and prevention

---

## Summary

EvalOps transforms "we think personas are good" into "we know personas are good because we measured it."

**Start with:**
1. Run `quickHealthCheck()` on responses in development
2. Open Dashboard (`Cmd/Ctrl+Shift+E`) to monitor quality
3. Wire up `evalopsHook.afterTurn()` in your conversation pipeline
4. Run critical scenarios in CI/CD
5. Gradually increase sampling in production

**Deployment Checklist:**
- [ ] API routes registered in `ui-server.js` ✅
- [ ] Feature flags configured in `data/feature-flags.json` ✅
- [ ] Dashboard accessible via dev panel ✅
- [ ] Automation hooks available ✅

**Key insight:** The gap between architecture and behavior is where quality lives. EvalOps closes that gap.

---

## Verification

### Health Check
```bash
curl https://app.ferni.ai/api/evalops/health \
  -H "x-admin-key: dev-mode"
```

### Quick Voice Test
```bash
curl -X POST https://app.ferni.ai/api/evalops/quick-check \
  -H "Content-Type: application/json" \
  -H "x-admin-key: dev-mode" \
  -d '{
    "response": "Stay the course. What about this feels hard?",
    "persona_id": "ferni"
  }'
```

Expected: `{"success":true,"score":85,"status":"healthy","issues":[]}`

