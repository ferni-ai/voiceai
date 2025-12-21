# Managed Instance Group with Auto-Scaling
#
# Regional MIG distributed across multiple zones for high availability.

# Regional Managed Instance Group
resource "google_compute_region_instance_group_manager" "voiceai_agent" {
  name   = "${var.service_name}-mig"
  region = var.region

  base_instance_name = var.service_name

  version {
    instance_template = google_compute_instance_template.voiceai_agent.id
    name              = "primary"
  }

  # Distribution across zones
  distribution_policy_zones = var.zones

  # Target pool for load balancing
  target_pools = []

  # Named ports for health checking
  named_port {
    name = "http"
    port = var.health_check_port
  }

  # Auto-healing based on health check
  auto_healing_policies {
    health_check      = google_compute_health_check.voiceai_agent.id
    initial_delay_sec = 300 # 5 minutes for container startup
  }

  # Update policy for rolling updates
  update_policy {
    type                           = "PROACTIVE"
    minimal_action                 = "REPLACE"
    most_disruptive_allowed_action = "REPLACE"
    max_surge_fixed                = 3
    max_unavailable_fixed          = 0
    replacement_method             = "SUBSTITUTE"
    instance_redistribution_type   = "PROACTIVE"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto-scaler configuration
resource "google_compute_region_autoscaler" "voiceai_agent" {
  name   = "${var.service_name}-autoscaler"
  region = var.region
  target = google_compute_region_instance_group_manager.voiceai_agent.id

  autoscaling_policy {
    min_replicas    = var.min_instances
    max_replicas    = var.max_instances
    cooldown_period = var.cooldown_period

    # CPU-based scaling (primary)
    cpu_utilization {
      target            = var.target_cpu_utilization
      predictive_method = "OPTIMIZE_AVAILABILITY"
    }

    # Scale-in controls to prevent aggressive scale-down
    scale_in_control {
      max_scaled_in_replicas {
        fixed = 1 # Only remove 1 instance at a time
      }
      time_window_sec = 600 # 10-minute window
    }

    # Scaling schedules for predictable traffic patterns
    # (optional - uncomment if you have predictable daily patterns)
    # scaling_schedules {
    #   name                  = "weekday-morning"
    #   min_required_replicas = 3
    #   schedule              = "0 8 * * 1-5"  # 8 AM Mon-Fri
    #   time_zone             = "America/Los_Angeles"
    #   duration_sec          = 14400  # 4 hours
    # }
  }
}

# Health check for auto-healing
resource "google_compute_health_check" "voiceai_agent" {
  name = "${var.service_name}-health-check"

  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = var.health_check_port
    request_path = "/health/ready"
  }

  log_config {
    enable = true
  }
}

# Output the instance group URL
output "instance_group" {
  value       = google_compute_region_instance_group_manager.voiceai_agent.instance_group
  description = "The URL of the instance group"
}

output "autoscaler_id" {
  value       = google_compute_region_autoscaler.voiceai_agent.id
  description = "The ID of the autoscaler"
}
