# LiveKit Auto-Scaling Architecture

> **Critical:** Never run multiple independent deployments (standalone VM + MIG) simultaneously. LiveKit dispatches jobs to ALL registered workers, causing conflicts.

## The Problem We Solved (Dec 24, 2024)

**Symptom:** Random disconnects with `ROOM_CLOSED` (disconnect reason 10)

**Root Cause:** We had 3 workers competing for jobs:
- 1 standalone VM (`voiceai-agent-gce`)
- 2 MIG instances (`voiceai-agent-mig-*`)

LiveKit dispatched the same job to multiple workers, causing room conflicts.

## How LiveKit Job Dispatch Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     LiveKit Cloud                                │
│                                                                  │
│  When a room is created with agent dispatch:                    │
│  1. LiveKit broadcasts "job available" to ALL registered agents │
│  2. First agent to respond gets the job                         │
│  3. If multiple agents respond, CONFLICTS occur                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ Worker 1 │        │ Worker 2 │        │ Worker 3 │
   │ (VM)     │        │ (MIG)    │        │ (MIG)    │
   └──────────┘        └──────────┘        └──────────┘
        ⚠️ ALL THREE TRY TO HANDLE THE SAME JOB ⚠️
```

## Correct Auto-Scaling Architecture

### Option 1: Single Deployment with MIG (Recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                     LiveKit Cloud                                │
│                                                                  │
│  Job dispatch to agent: "voice-agent"                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │  (Static IP)    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Instance │  │ Instance │  │ Instance │
        │    1     │  │    2     │  │    3     │
        └──────────┘  └──────────┘  └──────────┘
                             │
                    ┌────────┴────────┐
                    │  Shared Redis   │
                    │  (Session State)│
                    └─────────────────┘

✅ LiveKit dispatches to ONE agent pool
✅ MIG handles distribution internally  
✅ Auto-scaling based on CPU/connections
```

### Option 2: LiveKit Agents Framework (Native Scaling)

LiveKit's agents framework has built-in job routing:

```python
# Each worker registers with the SAME agent name
# LiveKit handles job distribution automatically
worker = Worker(
    name="voice-agent",  # Same name = same pool
    request_fnc=request_handler,
)
```

**Key insight:** All MIG instances use the same `AGENT_NAME` env var, so they're part of the same agent pool. LiveKit dispatches each job to exactly ONE worker.

## Why the Conflict Happened

We violated the "single deployment" rule:

```
❌ WRONG: Parallel Deployments
├── voiceai-agent-gce (standalone, AGENT_NAME=voice-agent)
└── voiceai-agent-mig (2 instances, AGENT_NAME=voice-agent)
    
Both registered as "voice-agent" but LiveKit saw them as 3 SEPARATE workers
```

```
✅ CORRECT: Single Deployment
└── voiceai-agent-mig (2 instances, AGENT_NAME=voice-agent)
    
LiveKit sees ONE agent pool with internal scaling
```

## Migration Strategy

When migrating from standalone VM to MIG:

### Phase 1: Prepare MIG (current state)
```bash
# MIG is ready but not receiving traffic
terraform apply  # Creates MIG with min_instances=0
```

### Phase 2: Cut Over (atomic switch)
```bash
# 1. Scale down standalone VM
gcloud compute instances stop voiceai-agent-gce

# 2. Scale up MIG  
gcloud compute instance-groups managed resize voiceai-agent-mig \
  --size=2 --zone=us-central1-a

# 3. Verify health
curl http://<MIG-LB-IP>:8080/health/ready

# 4. Delete standalone VM (once confirmed working)
gcloud compute instances delete voiceai-agent-gce
```

### Phase 3: Enable Auto-Scaling
```bash
# Auto-scaler already configured in Terraform
# Just ensure min_instances >= 1
```

## Environment Configuration

All instances MUST use the same environment:

```bash
# .env for all instances
LIVEKIT_URL=wss://test-rvg91u1z.livekit.cloud
LIVEKIT_API_KEY=<production-key>
LIVEKIT_API_SECRET=<production-secret>
AGENT_NAME=voice-agent  # SAME for all instances!
```

## Monitoring for Conflicts

Watch for these symptoms:

| Symptom | Indicates |
|---------|-----------|
| `ROOM_CLOSED` disconnects | Multiple workers competing |
| "runner initialization timed out" | Job dispatched to dead worker |
| Crash rate > 1/hour | Possible conflicts |

### Quick Check

```bash
# Should show exactly ONE deployment type
gcloud compute instances list --project=johnb-2025 | grep voiceai

# Should NOT see both standalone AND mig instances
```

## Rollback Procedure

If MIG has issues, rollback to standalone:

```bash
# 1. Stop MIG
gcloud compute instance-groups managed resize voiceai-agent-mig --size=0

# 2. Start standalone VM
gcloud compute instances start voiceai-agent-gce

# 3. Verify
curl http://34.134.186.63:8080/health/ready
```

## Cost Comparison

| Setup | Monthly Cost | HA | Auto-Scale |
|-------|--------------|-----|------------|
| Single VM | ~$70 | ❌ | ❌ |
| MIG (1-3) | ~$150 | ✅ | ✅ |
| MIG (1-10) | ~$150-500 | ✅ | ✅ |

## Files

- `infra/gce/autoscaling/` - Terraform configs
- `apps/cli/src/commands/deploy/deploy-gce.ts` - Deployment script
- `src/agents/voice-agent-entry.ts` - Agent entry point

## Related Docs

- `docs/architecture/GCE-CLEAN-ARCHITECTURE.md` - GCE setup
- `CLAUDE.md` - Deployment commands

---

*Created: Dec 24, 2024 after debugging ROOM_CLOSED disconnects*

