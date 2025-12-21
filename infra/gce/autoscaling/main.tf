# GCE Auto-Scaling Infrastructure
#
# This Terraform configuration creates a highly-available voice agent deployment
# using GCE Managed Instance Groups with auto-scaling and auto-healing.

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "johnb-2025-terraform-state"
    prefix = "voiceai-agent/gce-autoscaling"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Data sources for existing resources
data "google_compute_network" "default" {
  name = var.network
}

data "google_compute_subnetwork" "default" {
  name   = var.network
  region = var.region
}

# Service account for voice agent instances
resource "google_service_account" "voiceai_agent" {
  account_id   = "${var.service_name}-sa"
  display_name = "Voice AI Agent Service Account"
  description  = "Service account for voice agent GCE instances"
}

# IAM bindings for the service account
resource "google_project_iam_member" "voiceai_agent_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/secretmanager.secretAccessor",
    "roles/firestore.user",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.voiceai_agent.email}"
}
