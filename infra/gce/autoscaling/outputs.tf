# Terraform Outputs for Voice Agent GCE Auto-Scaling

output "project_id" {
  value       = var.project_id
  description = "GCP Project ID"
}

output "region" {
  value       = var.region
  description = "Deployment region"
}

output "service_account_email" {
  value       = google_service_account.voiceai_agent.email
  description = "Service account email for instances"
}

output "instance_template_name" {
  value       = google_compute_instance_template.voiceai_agent.name
  description = "Name of the instance template"
}

output "mig_name" {
  value       = google_compute_region_instance_group_manager.voiceai_agent.name
  description = "Name of the managed instance group"
}

output "scaling_config" {
  value = {
    min_instances    = var.min_instances
    max_instances    = var.max_instances
    target_cpu       = var.target_cpu_utilization
    cooldown_seconds = var.cooldown_period
  }
  description = "Auto-scaling configuration"
}

output "health_check_url" {
  value       = "http://${google_compute_address.voiceai_agent.address}:${var.health_check_port}/health/ready"
  description = "Health check URL"
}

output "deployment_summary" {
  value = <<-EOT
    ╔═══════════════════════════════════════════════════════════╗
    ║           VOICE AGENT GCE AUTO-SCALING                    ║
    ╚═══════════════════════════════════════════════════════════╝

    Service:     ${var.service_name}
    Region:      ${var.region}
    Zones:       ${join(", ", var.zones)}

    Load Balancer IP: ${google_compute_address.voiceai_agent.address}
    Health Check:     http://${google_compute_address.voiceai_agent.address}:${var.health_check_port}/health/ready

    Scaling:
      Min Instances: ${var.min_instances}
      Max Instances: ${var.max_instances}
      Target CPU:    ${var.target_cpu_utilization * 100}%

    Redis:
      Host: ${google_redis_instance.voiceai_cache.host}
      Port: ${google_redis_instance.voiceai_cache.port}

    Instance Template: ${google_compute_instance_template.voiceai_agent.name}
    MIG:               ${google_compute_region_instance_group_manager.voiceai_agent.name}
  EOT
  description = "Summary of the deployment"
}
