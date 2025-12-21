# Cloud Memorystore (Redis) for Voice Agent
#
# Managed Redis instance for caching and session state.
# Replaces the Redis sidecar container for HA deployments.

resource "google_redis_instance" "voiceai_cache" {
  name           = "${var.service_name}-cache"
  region         = var.region
  memory_size_gb = var.redis_memory_size_gb

  # Standard tier for auto-failover
  tier = "STANDARD_HA"

  # Redis version
  redis_version = "REDIS_7_0"

  # Display name
  display_name = "Voice AI Cache"

  # Authorized network (same as instances)
  authorized_network = data.google_compute_network.default.id

  # Connect mode (recommended for private services)
  connect_mode = "PRIVATE_SERVICE_ACCESS"

  # Persistence configuration
  persistence_config {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "ONE_HOUR"
  }

  # Maintenance window (Sunday 3-5 AM Pacific)
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  labels = var.labels

  lifecycle {
    prevent_destroy = true
  }
}

# Outputs
output "redis_host" {
  value       = google_redis_instance.voiceai_cache.host
  description = "The IP of the Redis instance"
}

output "redis_port" {
  value       = google_redis_instance.voiceai_cache.port
  description = "The port of the Redis instance"
}

output "redis_connection_string" {
  value       = "redis://${google_redis_instance.voiceai_cache.host}:${google_redis_instance.voiceai_cache.port}"
  description = "Redis connection string"
  sensitive   = true
}
