# Monitoring Configuration

**GCP Cloud Monitoring** alerting policies and observability configurations.

## Files

| File | Purpose |
|------|---------|
| `alerting-policies.yaml` | Cloud Monitoring alert definitions |
| `alerts.yaml` | Additional alert configurations |
| `observability-config.yaml` | Observability settings |
| `pubsub-dashboard.json` | Pub/Sub monitoring dashboard |

## Alert Categories

The alerting policies cover:
- Service health (uptime, latency)
- Error rates
- Resource utilization (CPU, memory)
- Pub/Sub queue depths
- Voice call quality metrics

## Deploying Alerts

```bash
# Deploy alerting policies
gcloud monitoring policies create \
  --policy-from-file=monitoring/alerting-policies.yaml

# Or use the setup script
pnpm ops:setup-scheduler
```

## Dashboard Import

```bash
# Import Pub/Sub dashboard
gcloud monitoring dashboards create \
  --config-from-file=monitoring/pubsub-dashboard.json
```

## Viewing Alerts

1. GCP Console > Monitoring > Alerting
2. Or via CLI: `gcloud monitoring policies list`

## Related Monitoring

Runtime monitoring is also available via:
- `/health` - Liveness check
- `/health/ready` - Readiness check
- `/api/observability` - Runtime metrics
- `/api/crash-analytics` - Crash data

## Quick Diagnostics

```bash
# From project root
pnpm ops:diagnose      # Full diagnostic dashboard
pnpm ops:logs          # View recent logs
pnpm ops:logs:errors   # Error logs only
```

## Related

- `infra/` - Infrastructure configs that trigger alerts
- `docs/runbooks/` - Runbooks for responding to alerts
