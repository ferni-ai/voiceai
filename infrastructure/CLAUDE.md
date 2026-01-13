# Infrastructure (Additional)

**Additional infrastructure configurations** complementing the `infra/` directory.

## Structure

| Directory | Purpose |
|-----------|---------|
| `cloud-scheduler/` | Additional Cloud Scheduler configurations |
| `docker/` | Docker-related infrastructure |
| `scripts/` | Infrastructure automation scripts |
| `terraform/` | Additional Terraform modules |

## Scripts

Located in `scripts/`:

| Script | Purpose |
|--------|---------|
| `check-scaling-health.sh` | Verify auto-scaling health |
| `deploy-context.sh` | Deploy context service |
| `deploy-workers.sh` | Deploy worker services |
| `setup-pubsub.sh` | Initialize Pub/Sub topics |

## Running Scripts

```bash
# Check scaling health
./infrastructure/scripts/check-scaling-health.sh

# Deploy workers
./infrastructure/scripts/deploy-workers.sh
```

## Relationship to `infra/`

This directory contains overflow infrastructure configs. The main infrastructure is in `infra/`:

| `infra/` | `infrastructure/` |
|----------|-------------------|
| Cloud Scheduler jobs | Additional scheduler configs |
| Terraform main | Terraform modules |
| Cloud Armor | - |
| Cloud Run configs | - |

## Related

- `infra/` - Primary infrastructure configs
- `monitoring/` - Alerting and observability
- `docker/` - Main Dockerfiles
