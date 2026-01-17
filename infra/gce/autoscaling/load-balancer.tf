# L4 TCP/UDP Load Balancer for Voice Agent
#
# Uses Network Load Balancing for low-latency WebRTC connections.
# Session affinity ensures WebRTC connections stay on same instance.

# Static external IP
resource "google_compute_address" "voiceai_agent" {
  name         = "${var.service_name}-ip"
  region       = var.region
  network_tier = "PREMIUM"
}

# Backend service for TCP traffic (LiveKit signaling)
resource "google_compute_region_backend_service" "voiceai_agent_tcp" {
  name                  = "${var.service_name}-backend-tcp"
  region                = var.region
  protocol              = "TCP"
  load_balancing_scheme = "EXTERNAL"
  timeout_sec           = 30

  # Session affinity for WebRTC
  session_affinity = "CLIENT_IP"

  backend {
    group          = google_compute_region_instance_group_manager.voiceai_agent.instance_group
    balancing_mode = "CONNECTION"
  }

  health_checks = [google_compute_region_health_check.voiceai_agent_tcp.id]

  # Connection draining for graceful shutdown
  connection_draining_timeout_sec = 30
}

# Regional health check for load balancer
resource "google_compute_region_health_check" "voiceai_agent_tcp" {
  name   = "${var.service_name}-health-tcp"
  region = var.region

  check_interval_sec  = 5
  timeout_sec         = 3
  healthy_threshold   = 2
  unhealthy_threshold = 3

  tcp_health_check {
    port = var.health_check_port
  }
}

# Forwarding rule for HTTP/health check port
resource "google_compute_forwarding_rule" "voiceai_agent_http" {
  name                  = "${var.service_name}-fwd-http"
  region                = var.region
  ip_address            = google_compute_address.voiceai_agent.address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "8080"
  backend_service       = google_compute_region_backend_service.voiceai_agent_tcp.id
}

# Forwarding rule for LiveKit signaling (TCP 7880)
resource "google_compute_forwarding_rule" "voiceai_agent_livekit" {
  name                  = "${var.service_name}-fwd-livekit"
  region                = var.region
  ip_address            = google_compute_address.voiceai_agent.address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "7880-7881"
  backend_service       = google_compute_region_backend_service.voiceai_agent_tcp.id
}

# NOTE: UDP traffic for WebRTC media goes directly to instances via their
# external IPs. The load balancer handles initial connection routing,
# then WebRTC negotiates direct UDP paths to specific instances.
#
# For production with many concurrent calls, consider:
# 1. Using LiveKit's built-in load balancing
# 2. Adding a TURN server for NAT traversal
# 3. Using GCP's Global Load Balancer with UDP support (preview)

output "load_balancer_ip" {
  value       = google_compute_address.voiceai_agent.address
  description = "The external IP of the load balancer"
}

output "service_url" {
  value       = "http://${google_compute_address.voiceai_agent.address}:8080"
  description = "The service URL"
}
