# =============================================================================
# Pub/Sub Topics for Ferni Services
#
# These topics enable asynchronous communication between services:
# - Voice Agent → Intelligence Worker (intelligence events)
# - Voice Agent → Async Worker (outreach triggers)
# - Scheduled Jobs → Workers (job triggers)
#
# Usage:
# terraform init
# terraform plan
# terraform apply
# =============================================================================

# -----------------------------------------------------------------------------
# Intelligence Events Topic
# Voice agent publishes intelligence-related events for async processing
# -----------------------------------------------------------------------------
resource "google_pubsub_topic" "intelligence_events" {
  name    = "intelligence-events"
  project = var.project_id

  labels = {
    service     = "intelligence-worker"
    environment = var.environment
  }

  message_retention_duration = "604800s" # 7 days

  # Schema enforcement (optional - for production)
  # schema_settings {
  #   schema   = google_pubsub_schema.intelligence_events.id
  #   encoding = "JSON"
  # }
}

# Subscription for intelligence worker
resource "google_pubsub_subscription" "intelligence_worker_sub" {
  name    = "intelligence-events-worker-sub"
  topic   = google_pubsub_topic.intelligence_events.name
  project = var.project_id

  # Push to Cloud Run service
  push_config {
    push_endpoint = "${var.intelligence_worker_url}/pubsub/push"

    oidc_token {
      service_account_email = var.pubsub_service_account
    }

    attributes = {
      x-goog-version = "v1"
    }
  }

  # Retry policy
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s" # 10 minutes max
  }

  # Dead letter policy
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.intelligence_events_dlq.id
    max_delivery_attempts = 5
  }

  # Acknowledgment deadline
  ack_deadline_seconds = 300 # 5 minutes for processing

  # Message retention
  message_retention_duration = "604800s" # 7 days

  # Expiration policy (never expire)
  expiration_policy {
    ttl = "" # Never expire
  }

  labels = {
    service     = "intelligence-worker"
    environment = var.environment
  }
}

# Dead letter queue for failed intelligence events
resource "google_pubsub_topic" "intelligence_events_dlq" {
  name    = "intelligence-events-dlq"
  project = var.project_id

  labels = {
    service     = "intelligence-worker"
    type        = "dead-letter"
    environment = var.environment
  }
}

# Subscription for DLQ monitoring
resource "google_pubsub_subscription" "intelligence_events_dlq_sub" {
  name    = "intelligence-events-dlq-sub"
  topic   = google_pubsub_topic.intelligence_events_dlq.name
  project = var.project_id

  # Pull subscription for manual inspection
  ack_deadline_seconds = 600

  labels = {
    service     = "intelligence-worker"
    type        = "dead-letter"
    environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Outreach Triggers Topic
# Voice agent publishes outreach triggers for async processing
# -----------------------------------------------------------------------------
resource "google_pubsub_topic" "outreach_triggers" {
  name    = "outreach-triggers"
  project = var.project_id

  labels = {
    service     = "async-worker"
    environment = var.environment
  }

  message_retention_duration = "604800s" # 7 days
}

# Subscription for async worker
resource "google_pubsub_subscription" "outreach_worker_sub" {
  name    = "outreach-triggers-worker-sub"
  topic   = google_pubsub_topic.outreach_triggers.name
  project = var.project_id

  push_config {
    push_endpoint = "${var.async_worker_url}/pubsub/outreach"

    oidc_token {
      service_account_email = var.pubsub_service_account
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  ack_deadline_seconds       = 300
  message_retention_duration = "604800s"

  labels = {
    service     = "async-worker"
    environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Embedding Requests Topic (Future - for Embedding Worker)
# -----------------------------------------------------------------------------
resource "google_pubsub_topic" "embedding_requests" {
  name    = "embedding-requests"
  project = var.project_id

  labels = {
    service     = "embedding-worker"
    environment = var.environment
  }

  message_retention_duration = "86400s" # 1 day (embeddings are less critical)
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "johnb-2025"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "intelligence_worker_url" {
  description = "URL of the Intelligence Worker Cloud Run service"
  type        = string
  default     = "https://ferni-intelligence-worker-xxx-uc.a.run.app"
}

variable "async_worker_url" {
  description = "URL of the Async Worker Cloud Run service"
  type        = string
  default     = "https://ferni-async-xxx-uc.a.run.app"
}

variable "pubsub_service_account" {
  description = "Service account for Pub/Sub push authentication"
  type        = string
  default     = "pubsub-invoker@johnb-2025.iam.gserviceaccount.com"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "intelligence_events_topic" {
  value = google_pubsub_topic.intelligence_events.name
}

output "outreach_triggers_topic" {
  value = google_pubsub_topic.outreach_triggers.name
}

output "embedding_requests_topic" {
  value = google_pubsub_topic.embedding_requests.name
}

