# ============================================================================
# FERNI SCALING INFRASTRUCTURE
# Terraform configuration for Phase 2-4 microservices architecture
# ============================================================================

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  
  # Store state in GCS (recommended for team environments)
  # backend "gcs" {
  #   bucket = "ferni-terraform-state"
  #   prefix = "scaling"
  # }
}

# ============================================================================
# VARIABLES
# ============================================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "johnb-2025"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# ============================================================================
# PROVIDER
# ============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
}

# ============================================================================
# PUB/SUB - ASYNC EVENT INFRASTRUCTURE
# ============================================================================

# Main event topic - all async events go here
resource "google_pubsub_topic" "ferni_events" {
  name = "ferni-events"
  
  message_retention_duration = "604800s" # 7 days
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "events"
  }
}

# Dead letter topic for failed messages
resource "google_pubsub_topic" "ferni_events_dlq" {
  name = "ferni-events-dlq"
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "events-dlq"
  }
}

# Trust worker subscription
resource "google_pubsub_subscription" "ferni_trust_sub" {
  name  = "ferni-trust-sub"
  topic = google_pubsub_topic.ferni_events.name
  
  # Filter for trust-related events
  filter = "attributes.type = \"trust:update\" OR attributes.type = \"trust:milestone\" OR attributes.type = \"relationship:stage-change\" OR attributes.type = \"conversation:end\""
  
  ack_deadline_seconds = 30
  
  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false
  
  expiration_policy {
    ttl = "" # Never expire
  }
  
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
  
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.ferni_events_dlq.id
    max_delivery_attempts = 5
  }
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "trust-worker"
  }
}

# Analytics worker subscription
resource "google_pubsub_subscription" "ferni_analytics_sub" {
  name  = "ferni-analytics-sub"
  topic = google_pubsub_topic.ferni_events.name
  
  # Filter for analytics-related events
  filter = "attributes.type = \"analytics:interaction\" OR attributes.type = \"analytics:emotion-detected\" OR attributes.type = \"learning:pattern-detected\" OR attributes.type = \"learning:community-insight\" OR attributes.type = \"conversation:turn\""
  
  ack_deadline_seconds = 30
  
  message_retention_duration = "604800s"
  retain_acked_messages      = false
  
  expiration_policy {
    ttl = ""
  }
  
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
  
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.ferni_events_dlq.id
    max_delivery_attempts = 5
  }
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "analytics-worker"
  }
}

# ============================================================================
# CLOUD RUN - WORKER SERVICES (Phase 3)
# ============================================================================

# Trust Worker Service
resource "google_cloud_run_v2_service" "ferni_trust_worker" {
  name     = "ferni-trust-worker"
  location = var.region
  
  template {
    containers {
      image = "gcr.io/${var.project_id}/ferni-worker:latest"
      
      env {
        name  = "WORKER_TYPE"
        value = "trust"
      }
      
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      
      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }
    }
    
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
    
    timeout = "300s"
  }
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "trust-worker"
  }
}

# Analytics Worker Service
resource "google_cloud_run_v2_service" "ferni_analytics_worker" {
  name     = "ferni-analytics-worker"
  location = var.region
  
  template {
    containers {
      image = "gcr.io/${var.project_id}/ferni-worker:latest"
      
      env {
        name  = "WORKER_TYPE"
        value = "analytics"
      }
      
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
    
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "analytics-worker"
  }
}

# Context Service (Phase 4)
resource "google_cloud_run_v2_service" "ferni_context" {
  name     = "ferni-context"
  location = var.region
  
  template {
    containers {
      image = "gcr.io/${var.project_id}/ferni-context:latest"
      
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
      
      ports {
        container_port = 8080
      }
      
      startup_probe {
        http_get {
          path = "/health"
        }
      }
    }
    
    scaling {
      min_instance_count = 0
      max_instance_count = 20
    }
  }
  
  labels = {
    environment = var.environment
    service     = "ferni"
    component   = "context-service"
  }
}

# ============================================================================
# IAM - SERVICE ACCOUNTS & PERMISSIONS
# ============================================================================

# Service account for workers
resource "google_service_account" "ferni_worker" {
  account_id   = "ferni-worker"
  display_name = "Ferni Worker Service Account"
  description  = "Service account for Ferni background workers"
}

# Pub/Sub subscriber permission for workers
resource "google_pubsub_subscription_iam_member" "trust_worker_subscriber" {
  subscription = google_pubsub_subscription.ferni_trust_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.ferni_worker.email}"
}

resource "google_pubsub_subscription_iam_member" "analytics_worker_subscriber" {
  subscription = google_pubsub_subscription.ferni_analytics_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.ferni_worker.email}"
}

# Firestore access for workers
resource "google_project_iam_member" "worker_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.ferni_worker.email}"
}

# Service account for voice agent (Pub/Sub publisher)
resource "google_pubsub_topic_iam_member" "voice_agent_publisher" {
  topic  = google_pubsub_topic.ferni_events.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:voiceai-agent@${var.project_id}.iam.gserviceaccount.com"
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "event_topic" {
  description = "Pub/Sub topic for async events"
  value       = google_pubsub_topic.ferni_events.name
}

output "trust_subscription" {
  description = "Subscription for trust worker"
  value       = google_pubsub_subscription.ferni_trust_sub.name
}

output "analytics_subscription" {
  description = "Subscription for analytics worker"
  value       = google_pubsub_subscription.ferni_analytics_sub.name
}

output "trust_worker_url" {
  description = "Trust worker service URL"
  value       = google_cloud_run_v2_service.ferni_trust_worker.uri
}

output "analytics_worker_url" {
  description = "Analytics worker service URL"
  value       = google_cloud_run_v2_service.ferni_analytics_worker.uri
}

output "context_service_url" {
  description = "Context service URL"
  value       = google_cloud_run_v2_service.ferni_context.uri
}

