# Infrastructure Configuration

**GCP infrastructure definitions** including Cloud Scheduler, Cloud Armor, Cloud Run configs, and Terraform.

## Structure

| Directory/File | Purpose |
|----------------|---------|
| `docker/` | Alternative Dockerfiles (see also root `docker/`) |
| `gce/` | GCE-specific configurations |
| `scripts/` | Infrastructure setup scripts |
| `main.tf` | Terraform main configuration |
| `pubsub-topics.tf` | Pub/Sub topic definitions |

## Cloud Scheduler Jobs

| File | Purpose |
|------|---------|
| `cloud-scheduler-jobs.yaml` | Main scheduled jobs |
| `cloud-scheduler-knowledge-graph.yaml` | Knowledge graph maintenance |
| `cloud-scheduler-landing.yaml` | Landing page jobs |
| `cloud-scheduler-llm-content.yaml` | LLM content generation |
| `cloud-scheduler-marketplace.yaml` | Marketplace jobs |
| `cloud-scheduler-memory.yaml` | Memory-related jobs |
| `cloud-scheduler-retraining.yaml` | Model retraining jobs |

## Cloud Run Configurations

| File | Purpose |
|------|---------|
| `cloudrun-service-agent.yaml` | Voice agent scaling config |
| `cloudrun-service-ui.yaml` | UI server scaling config |

## Security

| File | Purpose |
|------|---------|
| `cloud-armor-policy.yaml` | DDoS protection WAF rules |

## Deployment Scripts

```bash
# Deploy Cloud Scheduler jobs
./scripts/setup-pubsub.sh

# Deploy Cloud Armor (requires External Load Balancer)
gcloud compute security-policies create ferni-ddos-policy \
  --file-name=infra/cloud-armor-policy.yaml

# Deploy Cloud Run scaling configs
gcloud run services replace infra/cloudrun-service-ui.yaml \
  --region=us-central1
```

## Terraform

```bash
# Initialize Terraform
cd infra
terraform init

# Plan changes
terraform plan

# Apply changes
terraform apply
```

## Related

- `infrastructure/` - Additional infrastructure configs
- `monitoring/` - Alerting and observability
- `docker/` - Main Dockerfiles
