# BTH (Better Than Human) Deployment Runbook

This runbook documents the deployment steps for the BTH remediation plan.
All phases are now implemented. Follow these steps to deploy to production.

## Pre-Deployment Checklist

- [ ] Run `pnpm typecheck` - all TypeScript errors resolved
- [ ] Run `pnpm lint` - no lint errors
- [ ] Run `pnpm test` - all tests passing
- [ ] Run `pnpm vitest run src/tests/e2e/bth-capabilities-e2e.test.ts` - BTH E2E tests passing

## Phase 1: Learning Engine Integration (Code Already Deployed)

The Learning Engine is now wired into the turn processing flow:

**Files Changed:**
- `src/memory/learning-engine.ts` - Added reaction inference functions
- `src/agents/shared/types.ts` - Added surfaced memory tracking to UserData
- `src/agents/processors/types.ts` - Added surfacedMemory to TurnProcessorResult
- `src/agents/processors/turn-processor.ts` - Returns surfaced memory info
- `src/agents/voice-agent/transcript-handler.ts` - Records user reactions
- `src/agents/voice-agent/turn-handler.ts` - Propagates surfaced memory to userData
- `src/services/unified-memory-service.ts` - Exported reaction recording functions

**Verification:**
```bash
# Check logs for Learning Engine activity
ferni logs agent --grep "Learning Engine"
```

## Phase 2: Proactive Outreach Activation

Deploy the outreach Cloud Function and Cloud Scheduler job.

**Deploy Command:**
```bash
ferni deploy outreach
```

**What This Does:**
1. Creates `outreach-trigger` Pub/Sub topic
2. Deploys `outreachScheduler` Cloud Function
3. Creates `outreach-check` Cloud Scheduler job (runs every 15 min)

**Verification:**
```bash
# Check Cloud Function status
gcloud functions describe outreachScheduler --gen2 --region=us-central1

# Check Scheduler job
gcloud scheduler jobs describe outreach-check --location=us-central1

# Check Pub/Sub topic
gcloud pubsub topics describe outreach-trigger
```

**Files:**
- `functions/outreach-scheduler.ts`
- `apps/cli/src/commands/deploy/deploy-outreach.ts`
- `src/services/trust-systems/outreach-integration.ts` - Now persists to Firestore

## Phase 3: Memory Lifecycle Activation

**Deploy Memory Maintenance Worker:**
```bash
# Deploy the Cloud Function
gcloud functions deploy memoryMaintenanceWorker \
  --gen2 --runtime=nodejs20 \
  --trigger-topic=memory-maintenance-trigger \
  --entry-point memoryMaintenanceWorker \
  --timeout=540s --memory=1GB --region=us-central1 \
  --source=./dist

# Create the Pub/Sub topic
gcloud pubsub topics create memory-maintenance-trigger

# Create the Scheduler job (runs daily at 3 AM)
gcloud scheduler jobs create pubsub memory-maintenance \
  --schedule="0 3 * * *" \
  --topic=memory-maintenance-trigger \
  --message-body="{}" \
  --time-zone="America/New_York" \
  --location=us-central1
```

**Files:**
- `src/memory/memory-lifecycle.ts` - Consolidation, decay, graph pruning
- `src/workers/memory-maintenance-worker.ts` - Daily maintenance worker
- `src/services/session-manager/end-session.ts` - Calls consolidation on session end

**Verification:**
```bash
# Manually trigger maintenance for testing
gcloud pubsub topics publish memory-maintenance-trigger --message='{}'

# Check function logs
gcloud functions logs read memoryMaintenanceWorker --gen2 --region=us-central1
```

## Phase 4: Follow-up System Wiring (Code Already Deployed)

The follow-up system is now wired in session initialization.

**Files Changed:**
- `src/agents/voice-agent/session-init-handler.ts` - Loads commitment follow-ups and Our Songs

**Verification:**
```bash
# Check logs for commitment and Our Songs loading
ferni logs agent --grep "Commitment Keeper\|Our Songs"
```

## Phase 5: UI Capability Hub (Code Already Deployed)

New UI components are available for frontend integration.

**New Files:**
- `apps/web/src/ui/capability-hub.ui.ts` - BTH capabilities discovery
- `apps/web/src/ui/life-coaching-hub.ui.ts` - Life coaching toolkit
- `apps/web/src/ui/superhuman-dashboard.ui.ts` - Admin dashboard

**To Integrate:**
```typescript
// In your main app entry point
import { initCapabilityHub } from './ui/capability-hub.ui.js';
import { initLifeCoachingHub } from './ui/life-coaching-hub.ui.js';

// Initialize in appropriate containers
initCapabilityHub(document.getElementById('capability-hub'));
initLifeCoachingHub(document.getElementById('life-coaching-hub'));
```

## Phase 6: E2E Testing

Run the comprehensive BTH test suite.

**Run Tests:**
```bash
# Run all BTH E2E tests
pnpm vitest run src/tests/e2e/bth-capabilities-e2e.test.ts

# Run with verbose output
pnpm vitest run src/tests/e2e/bth-capabilities-e2e.test.ts --reporter=verbose
```

**Test Coverage:**
- Perfect Memory (5 tests)
- Learning Engine (5 tests)
- Commitment Keeper (5 tests)
- Proactive Outreach (3 tests)
- Our Songs (3 tests)
- Memory Lifecycle (2 tests)
- Cross-Persona Intelligence (2 tests)
- Emotional Intelligence (3 tests)
- Superhuman Services Integration (2 tests)
- Performance Requirements (2 tests)

## Phase 7: Validation API (Code Already Deployed)

New API endpoints are available.

**Endpoints:**
- `GET /api/bth/health` - Health status of all services
- `GET /api/bth/capabilities` - List capabilities for current user
- `GET /api/bth/validation/:userId` - Validate BTH for specific user
- `POST /api/admin/bth/test/:serviceId` - Test specific service
- `GET /api/admin/bth/health` - Admin health dashboard data

**To Register Routes:**
```typescript
// In your Express app setup
import { bthValidationRoutes } from './api/bth-validation-routes.js';
app.use('/api/bth', bthValidationRoutes);
```

**Verification:**
```bash
# Test health endpoint
curl https://app.ferni.ai/api/bth/health

# Test capabilities endpoint
curl https://app.ferni.ai/api/bth/capabilities
```

## Phase 8: Health Monitoring & Alerting

**Health Check Endpoint:**

The health check is exposed at `/health/bth` and returns:
```json
{
  "overall": "healthy",
  "timestamp": "2026-01-14T...",
  "services": [...],
  "summary": {
    "total": 10,
    "healthy": 10,
    "degraded": 0,
    "unhealthy": 0,
    "avgLatencyMs": 45
  }
}
```

**GCP Alerting Setup:**
```bash
# Create uptime check
gcloud monitoring uptime-check-configs create bth-health \
  --display-name="BTH Services Health" \
  --http-check-path="/api/bth/health" \
  --hostname="app.ferni.ai" \
  --period=300s

# Create alert policy
gcloud alpha monitoring policies create \
  --display-name="BTH Services Degraded" \
  --condition-display-name="BTH health degraded" \
  --condition-filter='resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed"' \
  --notification-channels="projects/johnb-2025/notificationChannels/YOUR_CHANNEL_ID"
```

**Files:**
- `src/services/superhuman/health-check.ts`
- `src/api/bth-validation-routes.ts`

## Full Deployment Sequence

```bash
# 1. Build and typecheck
pnpm build:fast
pnpm typecheck

# 2. Run all tests
pnpm test
pnpm vitest run src/tests/e2e/bth-capabilities-e2e.test.ts

# 3. Deploy voice agent (includes Phase 1, 4 changes)
ferni deploy gce

# 4. Deploy UI server (includes API routes)
ferni deploy ui

# 5. Deploy outreach system (Phase 2)
ferni deploy outreach

# 6. Deploy memory maintenance worker (Phase 3)
# (Manual deployment - see Phase 3 above)

# 7. Deploy frontend (includes UI components)
ferni deploy frontend

# 8. Verify deployment
curl https://app.ferni.ai/api/bth/health
```

## Rollback Procedure

If issues are detected:

```bash
# Rollback voice agent
ferni rollback gce

# Rollback UI server
ferni rollback ui

# Disable outreach scheduler
gcloud scheduler jobs pause outreach-check --location=us-central1

# Disable memory maintenance
gcloud scheduler jobs pause memory-maintenance --location=us-central1
```

## Monitoring Dashboard

Access the BTH monitoring dashboard at:
- Admin Panel → Superhuman Dashboard
- Or directly at: https://app.ferni.ai/admin/bth-dashboard

## Support

If issues arise:
1. Check logs: `ferni logs agent --errors`
2. Check health: `curl https://app.ferni.ai/api/bth/health`
3. Check specific service: `curl https://app.ferni.ai/api/admin/bth/test/{serviceId}`
