# GCE Instance Template for Voice Agents
#
# Uses Container-Optimized OS to run the voice agent Docker container.

resource "google_compute_instance_template" "voiceai_agent" {
  name_prefix  = "${var.service_name}-template-"
  machine_type = var.use_gpu ? var.gpu_machine_type : var.machine_type
  region       = var.region

  # GPU accelerator (required for Kyutai bridge STT/TTS on GCE)
  dynamic "guest_accelerator" {
    for_each = var.use_gpu ? [1] : []
    content {
      type  = var.gpu_accelerator_type
      count = 1
    }
  }

  # Enable deletion protection only for production
  lifecycle {
    create_before_destroy = true
  }

  labels = var.labels

  tags = ["voiceai-agent", "allow-health-check", "allow-livekit"]

  # Boot disk with Container-Optimized OS
  disk {
    source_image = "projects/cos-cloud/global/images/family/cos-stable"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-ssd"
  }

  # Network interface
  network_interface {
    network    = data.google_compute_network.default.id
    subnetwork = data.google_compute_subnetwork.default.id

    # External IP for WebRTC (required for direct UDP)
    access_config {
      network_tier = "PREMIUM"
    }
  }

  # Service account
  service_account {
    email  = google_service_account.voiceai_agent.email
    scopes = ["cloud-platform"]
  }

  # Metadata for Container-Optimized OS
  metadata = {
    # Container declaration for COS
    gce-container-declaration = yamlencode({
      spec = {
        containers = [{
          name  = var.service_name
          image = "gcr.io/${var.project_id}/${var.service_name}:${var.image_tag}"

          env = [
            { name = "PORT", value = tostring(var.health_check_port) },
            { name = "NODE_ENV", value = "production" },
            { name = "GOOGLE_CLOUD_PROJECT", value = var.project_id },
            { name = "FIREBASE_PROJECT_ID", value = var.project_id },
            { name = "REDIS_HOST", value = google_redis_instance.voiceai_cache.host },
            { name = "REDIS_PORT", value = tostring(google_redis_instance.voiceai_cache.port) },
            { name = "PUBSUB_ENABLED", value = "true" },
            # Secrets are accessed via Secret Manager at runtime
            { name = "USE_SECRET_MANAGER", value = "true" },
          ]

          # Resource limits
          resources = {
            limits = {
              cpu    = "2"
              memory = "4Gi"
            }
            requests = {
              cpu    = "1"
              memory = "2Gi"
            }
          }

          # Startup and liveness probes
          livenessProbe = {
            httpGet = {
              path = "/health"
              port = var.health_check_port
            }
            initialDelaySeconds = 30
            periodSeconds       = 10
            timeoutSeconds      = 5
            failureThreshold    = 3
          }

          readinessProbe = {
            httpGet = {
              path = "/health/ready"
              port = var.health_check_port
            }
            initialDelaySeconds = 10
            periodSeconds       = 5
            timeoutSeconds      = 3
            failureThreshold    = 3
          }
        }]

        # Restart policy
        restartPolicy = "Always"
      }
    })

    # Enable logging to Cloud Logging
    google-logging-enabled = "true"

    # Enable monitoring
    google-monitoring-enabled = "true"

    # GPU driver install: COS does NOT include NVIDIA drivers. The cos-gpu-installer
    # DaemonSet installs them on boot. Required when use_gpu=true.
    cos-gpu-installer-env = var.use_gpu ? jsonencode({
      "NVIDIA_DRIVER_VERSION" = "550.127.05"
    }) : null
    user-data = var.use_gpu ? <<-EOT
      #cloud-config
      runcmd:
        - cos-extensions install gpu
        - mount --bind /var/lib/nvidia /var/lib/nvidia
        - mount -o remount,exec /var/lib/nvidia
    EOT
    : null
  }

  # Scheduling options (TERMINATE required when using GPU)
  scheduling {
    automatic_restart   = true
    on_host_maintenance = var.use_gpu ? "TERMINATE" : "MIGRATE"
    preemptible         = false
  }

  # Shielded VM settings
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}

# Firewall rule for health checks
resource "google_compute_firewall" "allow_health_check" {
  name    = "${var.service_name}-allow-health-check"
  network = data.google_compute_network.default.id

  allow {
    protocol = "tcp"
    ports    = [tostring(var.health_check_port)]
  }

  # GCP health check source ranges
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]

  target_tags = ["allow-health-check"]
}

# Firewall rule for LiveKit WebRTC
resource "google_compute_firewall" "allow_livekit" {
  name    = "${var.service_name}-allow-livekit"
  network = data.google_compute_network.default.id

  # TCP for LiveKit signaling
  allow {
    protocol = "tcp"
    ports    = ["7880", "7881"]
  }

  # UDP for WebRTC media
  allow {
    protocol = "udp"
    ports    = ["50000-60000"]
  }

  source_ranges = ["0.0.0.0/0"]

  target_tags = ["allow-livekit"]
}
