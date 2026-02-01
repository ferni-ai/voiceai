# FTIS V5-860: End-to-End Implementation Plan

> Training started: 2026-01-29 11:51 UTC
> Expected completion: ~2026-01-29 23:30 UTC (~12 hours)

## Current Training Status

```
Model: Qwen3-1.7B + LoRA (r=16, alpha=32)
Labels: 860 tool classes
Data: 399,452 train / 49,932 validation / 49,932 test
Total steps: 37,449 (3 epochs)
```

## Phase 1: Training Completion ⏳

### Monitor Training
```bash
# Check progress
./train_gce_v5_860.sh --status

# Follow logs
./train_gce_v5_860.sh --logs-follow

# Check for errors
./train_gce_v5_860.sh --logs | grep -i error
```

### Expected Metrics (Based on V5-150 baseline)
| Metric | V5-150 (baseline) | V5-860 Target |
|--------|-------------------|---------------|
| Top-1 Accuracy | 79.8% | >85% |
| Top-3 Accuracy | 97.7% | >95% |
| F1 Score | 81.1% | >80% |

## Phase 2: Download & Evaluate

### 2.1 Download Model
```bash
./train_gce_v5_860.sh --download
# Downloads to: outputs/ferni-router-v5-860-gce/
```

### 2.2 Review Test Results
```bash
cat outputs/ferni-router-v5-860-gce/test_results.json
```

### 2.3 Stop VM (Save Costs)
```bash
./train_gce_v5_860.sh --stop
# Cost: ~$0.70/hr, total ~$8-9 for full training
```

## Phase 3: ONNX Export

### 3.1 Export Script
```bash
cd apps/ml-training/router
source .venv/bin/activate

python export_onnx.py \
  --checkpoint outputs/ferni-router-v5-860-gce/final \
  --label-map outputs/ferni-router-v5-860-gce/label_map.json \
  --output outputs/ferni-router-v5-860.onnx \
  --quantize int8
```

### 3.2 Validate ONNX
```bash
python -c "
import onnxruntime as ort
import numpy as np

session = ort.InferenceSession('outputs/ferni-router-v5-860.onnx')
print('Input:', session.get_inputs()[0].name, session.get_inputs()[0].shape)
print('Output:', session.get_outputs()[0].name, session.get_outputs()[0].shape)
"
```

## Phase 4: Integration

### 4.1 Update Model Config
**File:** `data/model-config.json`
```json
{
  "router": {
    "modelPath": "models/ferni-router-v5-860.onnx",
    "labelMapPath": "models/label_map_v5_860.json",
    "numLabels": 860,
    "version": "v5-860"
  }
}
```

### 4.2 Copy Model Files
```bash
# Copy ONNX model
cp apps/ml-training/router/outputs/ferni-router-v5-860.onnx models/

# Copy label map
cp apps/ml-training/router/outputs/ferni-router-v5-860-gce/label_map.json models/label_map_v5_860.json
```

### 4.3 Update Semantic Router
**File:** `src/tools/semantic-router/matcher.ts`
```typescript
// Update to use new model
const ROUTER_CONFIG = {
  modelPath: 'models/ferni-router-v5-860.onnx',
  labelMap: 'models/label_map_v5_860.json',
  numLabels: 860,
  topK: 5,
  threshold: 0.3,
};
```

## Phase 5: E2E Testing

### 5.1 Unit Tests
```bash
# Run semantic router tests
pnpm vitest run src/tools/semantic-router/__tests__/

# Run tool orchestrator tests
pnpm vitest run src/tools/orchestrator/__tests__/
```

### 5.2 Integration Tests
```bash
# Test router with real queries
pnpm vitest run src/tests/integration/tool-routing.test.ts
```

### 5.3 E2E Validation Script
Create: `scripts/validate-ftis-v5-860.ts`
```typescript
import { SemanticRouter } from '../src/tools/semantic-router/index.js';

const TEST_CASES = [
  // Music
  { query: "play some jazz", expected: ["music_play", "music_search"] },
  { query: "turn up the volume", expected: ["music_volume", "audio_control"] },

  // Calendar
  { query: "schedule a meeting tomorrow", expected: ["calendar_create", "calendar_schedule"] },
  { query: "what's on my calendar", expected: ["calendar_list", "calendar_today"] },

  // Weather
  { query: "will it rain today", expected: ["weather_forecast", "weather_current"] },

  // Communication
  { query: "send a text to mom", expected: ["sms_send", "contact_message"] },
  { query: "call John", expected: ["phone_call", "contact_call"] },

  // Smart Home
  { query: "turn off the lights", expected: ["smart_home_lights", "home_control"] },
  { query: "set thermostat to 72", expected: ["smart_home_thermostat", "climate_control"] },

  // Finance
  { query: "check my bank balance", expected: ["finance_balance", "banking_check"] },
  { query: "how much did I spend on food", expected: ["finance_spending", "budget_category"] },

  // Health
  { query: "log my workout", expected: ["health_workout", "fitness_log"] },
  { query: "how many steps today", expected: ["health_steps", "fitness_activity"] },

  // Productivity
  { query: "add to my todo list", expected: ["tasks_create", "todo_add"] },
  { query: "set a reminder", expected: ["reminder_create", "tasks_remind"] },

  // Research
  { query: "what's the latest news", expected: ["news_headlines", "news_search"] },
  { query: "search for recipes", expected: ["search_web", "recipes_search"] },
];

async function validateRouter() {
  const router = new SemanticRouter();
  await router.initialize();

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    const results = await router.route(test.query, { topK: 5 });
    const topTools = results.map(r => r.tool);

    const hasExpected = test.expected.some(exp =>
      topTools.some(tool => tool.includes(exp) || exp.includes(tool))
    );

    if (hasExpected) {
      console.log(`✅ "${test.query}" → ${topTools.slice(0, 3).join(', ')}`);
      passed++;
    } else {
      console.log(`❌ "${test.query}" → ${topTools.slice(0, 3).join(', ')}`);
      console.log(`   Expected one of: ${test.expected.join(', ')}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} tests passed (${(passed / (passed + failed) * 100).toFixed(1)}%)`);
}

validateRouter();
```

### 5.4 Voice Agent Integration Test
```bash
# Start voice agent with new router
USE_FTIS_V5=true pnpm dev

# Test queries manually:
# - "Play some music"
# - "What's on my calendar"
# - "Set a reminder for 3pm"
# - "Turn off the lights"
```

### 5.5 Performance Benchmarks
```bash
# Run latency benchmark
pnpm tsx scripts/benchmark-router.ts

# Expected: <50ms for semantic routing
```

## Phase 6: Production Deployment

### 6.1 Pre-Deploy Checklist
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E validation passes >90%
- [ ] Latency <50ms on test queries
- [ ] Model size acceptable (<500MB)
- [ ] No regressions on existing tools

### 6.2 Deploy
```bash
# Deploy with new model
ferni deploy gce

# Verify
curl http://34.134.186.63:8080/health/ready
```

### 6.3 Monitor
```bash
# Watch for tool routing errors
pnpm ops:logs | grep -i "router\|tool\|semantic"

# Check metrics
curl http://34.134.186.63:8080/api/observability | jq '.toolRouting'
```

## Rollback Plan

If issues arise:
```bash
# Revert to previous router version
git checkout HEAD~1 -- models/ferni-router-*.onnx models/label_map*.json
ferni deploy gce
```

## Timeline

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 1 | Training | ~12 hours | ⏳ In Progress |
| 2 | Download & Evaluate | 15 min | ⬜ Pending |
| 3 | ONNX Export | 10 min | ⬜ Pending |
| 4 | Integration | 30 min | ⬜ Pending |
| 5 | E2E Testing | 1 hour | ⬜ Pending |
| 6 | Production Deploy | 30 min | ⬜ Pending |

**Total: ~14 hours from training start to production**

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `models/ferni-router-v5-860.onnx` | Create | ONNX model |
| `models/label_map_v5_860.json` | Create | Label mapping |
| `data/model-config.json` | Modify | Router config |
| `src/tools/semantic-router/matcher.ts` | Modify | Load new model |
| `scripts/validate-ftis-v5-860.ts` | Create | E2E validation |
| `src/tools/semantic-router/__tests__/v5-860.test.ts` | Create | Unit tests |
