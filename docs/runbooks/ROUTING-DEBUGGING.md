# Routing Debugging Runbook

> Troubleshooting guide for the Semantic Tool Router

## Quick Diagnostics

### 1. Check Routing Health
```bash
# Basic metrics
curl -s http://localhost:8080/api/observability/semantic-routing | jq '.aggregate'

# Full dashboard with defense stats
curl -s http://localhost:8080/api/observability/routing-dashboard | jq '.'
```

### 2. Check Defense Stats
```bash
curl -s http://localhost:8080/api/observability/routing-dashboard | jq '.defense'
```

Expected output:
```json
{
  "totalInputs": 1234,
  "threatsDetected": 5,
  "inputsBlocked": 2,
  "blockRate": "0.16%",
  "avgRiskScore": "0.045",
  "threatsByType": { "prompt_injection": 3, "homoglyph": 2 },
  "threatsBySeverity": { "medium": 4, "high": 1 }
}
```

---

## Common Issues

### Issue: Tool Not Being Routed

**Symptoms:**
- User says "play jazz" but music doesn't play
- Tool executes via LLM instead of direct routing

**Debug Steps:**

1. **Check if routing is enabled:**
   ```typescript
   import { semanticRoutingConfig } from '../tools/semantic-router/config.js';
   console.log(semanticRoutingConfig.enabled); // Should be true
   ```

2. **Check tool definition:**
   ```typescript
   import { getToolRegistry } from '../tools/semantic-router/registry.js';
   const registry = getToolRegistry();
   const tool = registry.getById('playMusic');
   console.log(tool?.triggers); // Check phrases, keywords, patterns
   ```

3. **Test routing directly:**
   ```typescript
   import { routeUserInput } from '../tools/semantic-router/index.js';
   const result = await routeUserInput('play jazz music');
   console.log(result.action); // Should be 'execute' with toolId 'playMusic'
   ```

**Common Fixes:**
- Add the phrase to `triggers.phrases` in tool definition
- Add keywords to `triggers.keywords`
- Regenerate embeddings: `pnpm run semantic-router:rebuild-embeddings`

---

### Issue: Wrong Tool Being Routed

**Symptoms:**
- User says "call mom" → routes to `playMusic` instead of `makePhoneCall`
- Confidence is high but tool is wrong

**Debug Steps:**

1. **Check match scores:**
   ```typescript
   import { routeUserInput } from '../tools/semantic-router/index.js';
   const result = await routeUserInput('call mom', { debug: true });
   console.log(result.debug.matchScores); // See all tool scores
   ```

2. **Check for keyword conflicts:**
   - Both tools might share keywords
   - Check `antiKeywords` to add negative signals

3. **Review examples:**
   - Tool examples might be too similar
   - Add more distinctive examples

**Common Fixes:**
- Add `antiKeywords` to the wrong tool (e.g., `antiKeywords: ['call', 'phone']` for music)
- Add more distinctive phrases to the correct tool
- Increase the correct tool's keyword weights

---

### Issue: Inputs Being Blocked by Defense

**Symptoms:**
- Legitimate user input rejected
- Logs show `🛡️ INPUT BLOCKED by adversarial defense`

**Debug Steps:**

1. **Check what was detected:**
   ```typescript
   import { sanitizeInput } from '../tools/semantic-router/defense/index.js';
   const result = sanitizeInput(userInput);
   console.log(result.threats); // See detected threats
   console.log(result.riskScore); // See risk score
   ```

2. **Check thresholds:**
   ```typescript
   import { shouldBlockInput } from '../tools/semantic-router/defense/index.js';
   // Default threshold is 0.7
   console.log(shouldBlockInput(result, 0.9)); // Try higher threshold
   ```

3. **Common false positives:**
   - Song titles with suspicious words (e.g., "Ignore All Rules" by a band)
   - Technical questions mentioning "system" or "admin"
   - Foreign language text with confusable characters

**Common Fixes:**
- Add to allowlist if legitimate pattern
- Adjust risk scoring weights
- Add context-aware bypass for known safe patterns

---

### Issue: High Latency

**Symptoms:**
- Routing taking >100ms
- P95 latency spiking

**Debug Steps:**

1. **Check which layer is slow:**
   ```typescript
   const result = await routeUserInput(input, { timing: true });
   console.log(result.timing);
   // {
   //   patternMatch: 0.5,  // ms
   //   keywordScore: 1.2,  // ms
   //   embedding: 45.3,    // ms  <-- Usually the culprit
   //   total: 47.0
   // }
   ```

2. **Check embedding cache:**
   ```typescript
   import { getEmbeddingCacheStats } from '../tools/semantic-router/index.js';
   console.log(getEmbeddingCacheStats());
   // { size: 5000, hitRate: 0.92, maxSize: 10000 }
   ```

3. **Check if embeddings are precomputed:**
   - Tool definitions should have `embedding` field pre-filled
   - If not, embeddings are computed at runtime (slow)

**Common Fixes:**
- Precompute embeddings: `pnpm run semantic-router:precompute`
- Increase cache size in config
- Check embedding provider health (API limits)

---

### Issue: Corrections Not Being Learned

**Symptoms:**
- Users correct routing repeatedly
- Same mistakes keep happening

**Debug Steps:**

1. **Check learning loop status:**
   ```typescript
   import { getOnlineLearningStats } from '../tools/semantic-router/learning/online-learning-loop.js';
   console.log(getOnlineLearningStats());
   // { isActive: true, pendingExamples: 15, adjustedTools: ['playMusic', 'makeCall'] }
   ```

2. **Check if corrections are recorded:**
   ```bash
   curl -s http://localhost:8080/api/observability/routing-dashboard | jq '.learning'
   ```

3. **Check Firestore for correction data:**
   ```typescript
   import { getCorrections } from '../tools/semantic-router/learning/correction-store.js';
   const corrections = getCorrections({ userId: 'userId', limit: 20 });
   console.log(corrections);
   ```

4. **Check retraining pipeline status:**
   ```typescript
   import { getRetrainingPipeline } from '../tools/semantic-router/learning/retraining-pipeline.js';
   const pipeline = getRetrainingPipeline();
   const status = await pipeline.getStatus();
   console.log(status);
   // { isRunning: false, pendingCorrections: 42, totalRetrains: 15, totalRollbacks: 1 }
   ```

**Common Fixes:**
- Ensure learning is enabled: `setConfig({ enableLearning: true })`
- Check Firestore permissions
- Manually trigger retraining: `await pipeline.runManualRetrain()`
- Check Cloud Scheduler jobs: `gcloud scheduler jobs list --location=us-central1 | grep semantic`

---

### Issue: Retraining Pipeline Failing

**Symptoms:**
- Retraining jobs showing errors in Cloud Scheduler
- Embeddings not being updated

**Debug Steps:**

1. **Check pipeline status:**
   ```bash
   curl -s http://localhost:8080/api/jobs/semantic-router-health | jq '.'
   ```

2. **Check for rollbacks:**
   ```typescript
   const status = await pipeline.getStatus();
   console.log(status.totalRollbacks); // High number = safety checks failing
   console.log(status.lastResult?.safetyChecks); // See which check failed
   ```

3. **Check safety thresholds:**
   - Max embedding delta: 0.3 (30%)
   - Max tools modified: 25%
   - If these are being exceeded, the pipeline will rollback

**Common Fixes:**
- Reduce correction batch size for gentler updates
- Check for anomalous corrections (spam, attacks)
- Adjust safety thresholds if too strict:
  ```typescript
  pipeline.updateConfig({ maxEmbeddingDeltaNorm: 0.4 });
  ```

---

## Log Analysis

### Key Log Patterns

| Pattern | Meaning |
|---------|---------|
| `🔍 Routing user input` | Routing started |
| `✅ Semantic routing result: execute` | High confidence, direct execution |
| `💡 Semantic routing result: hint` | Medium confidence, LLM hint |
| `💬 Semantic routing result: conversation` | Low confidence, LLM handles |
| `🛡️ INPUT BLOCKED` | Defense blocked input |
| `⚠️ Low confidence routing` | Routing uncertain |
| `📈 Correction recorded` | User correction saved |

### Log Locations

```bash
# Voice agent logs
pnpm ops:logs

# Semantic routing specific
grep "Routing user input\|Semantic routing result" ~/.ferni/logs/agent.log
```

---

## Testing

### Run All Routing Tests
```bash
pnpm vitest run src/tools/semantic-router/
```

### Run Defense Tests
```bash
pnpm vitest run src/tools/semantic-router/defense/__tests__/
```

### Run Comprehensive E2E
```bash
pnpm vitest run src/tools/semantic-router/integration/__tests__/semantic-routing-comprehensive.test.ts
```

### Run Benchmark
```bash
pnpm test:semantic-benchmark
```

---

## Escalation

If issues persist after following this guide:

1. Check `src/tools/semantic-router/CLAUDE.md` for detailed architecture
2. Review recent changes to routing code
3. Check for upstream embedding provider issues
4. Contact the routing team with:
   - Input that fails
   - Expected vs actual behavior
   - Relevant log snippets
   - Defense stats if blocking issue

---

*Last updated: January 2026*
