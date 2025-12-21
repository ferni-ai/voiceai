# GCE Auto-Scaling Configuration

> Managed Instance Group (MIG) configuration for high-availability voice agents.

## Overview

This directory contains Terraform configurations for deploying voice agents on
GCE with automatic scaling and high availability.

## Why MIG over Single Instance?

| Aspect | Current (Single VM) | New (MIG) |
|--------|---------------------|-----------|
| Availability | Single point of failure | Multi-zone HA |
| Scaling | Manual SSH to resize | Auto-scale 1-10 instances |
| Updates | Blue-green on single VM | Rolling updates, zero downtime |
| Health | External health check | GCP-managed health checks |
| Recovery | Manual intervention | Auto-healing |

## Architecture

```
                    ┌─────────────────────┐
                    │   TCP/UDP Load      │
                    │   Balancer (L4)     │
                    │   (Static IP)       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
       │  Instance   │  │  Instance   │  │  Instance   │
       │   Zone A    │  │   Zone B    │  │   Zone C    │
       └─────────────┘  └─────────────┘  └─────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   Redis (Cloud     │
                    │   Memorystore)     │
                    └─────────────────────┘
```

## Components

### 1. Instance Template (`instance-template.tf`)
- Container-optimized OS with Docker
- Preloaded with voice agent container
- 2 vCPU, 4GB RAM (n1-standard-2)
- GPU optional for future AI processing

### 2. Managed Instance Group (`mig.tf`)
- Regional distribution across 3 zones
- Auto-healing based on health checks
- Auto-scaling: 1 (min) to 10 (max) instances
- Scale-up: CPU > 70% or connections > 8 per instance
- Scale-down: CPU < 30% for 10 minutes

### 3. Health Check (`health-check.tf`)
- HTTP health check on /health/ready
- 10-second check interval
- 3 consecutive failures = unhealthy
- Auto-replacement of unhealthy instances

### 4. Load Balancer (`load-balancer.tf`)
- L4 TCP/UDP load balancer
- Session affinity (WebRTC connections)
- Static external IP
- SSL termination at instance

### 5. Redis (Cloud Memorystore) (`redis.tf`)
- Managed Redis instance
- Private VPC connection
- 1GB standard tier
- Auto-failover

## Scaling Triggers

| Metric | Scale Up | Scale Down | Cooldown |
|--------|----------|------------|----------|
| CPU | > 70% | < 30% | 3 min |
| Connections | > 8/instance | < 2/instance | 5 min |
| Custom (queue depth) | > 50 msgs | < 10 msgs | 5 min |

## Deployment

```bash
# Initialize Terraform
cd infra/gce/autoscaling
terraform init

# Plan changes
terraform plan -out=tfplan

# Apply (requires GCP credentials)
terraform apply tfplan

# Update instance template (rolling update)
terraform apply -var="image_tag=new-tag"
```

## Migration from Single VM

1. **Phase 1: Parallel deployment**
   - Deploy MIG alongside existing VM
   - Test with subset of traffic

2. **Phase 2: Traffic shift**
   - Update DNS/Load balancer to MIG
   - Monitor for issues

3. **Phase 3: Decommission**
   - Remove old single VM
   - Update deploy scripts

## Cost Estimate

| Component | Monthly Cost |
|-----------|--------------|
| 1 n1-standard-2 (min) | ~$50 |
| 3 n1-standard-2 (avg) | ~$150 |
| Load Balancer | ~$20 |
| Cloud Memorystore 1GB | ~$35 |
| **Total (avg)** | **~$205/month** |

Current single VM: ~$70/month
Difference: ~$135/month for HA

## Files

- `main.tf` - Provider and variables
- `instance-template.tf` - VM template
- `mig.tf` - Managed Instance Group
- `health-check.tf` - Health check config
- `load-balancer.tf` - L4 load balancer
- `redis.tf` - Cloud Memorystore
- `outputs.tf` - Deployment outputs
- `variables.tf` - Configuration variables
