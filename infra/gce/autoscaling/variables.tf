# GCE Auto-Scaling Variables

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

variable "zones" {
  description = "GCP Zones for multi-zone deployment"
  type        = list(string)
  default     = ["us-central1-a", "us-central1-b", "us-central1-c"]
}

variable "service_name" {
  description = "Name of the voice agent service"
  type        = string
  default     = "voiceai-agent"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "machine_type" {
  description = "GCE machine type (used when use_gpu is false)"
  type        = string
  default     = "n1-standard-2" # 2 vCPU, 7.5 GB RAM
}

variable "use_gpu" {
  description = "Use GPU instance (L4) for Kyutai bridge STT/TTS; requires gpu_machine_type and gpu_accelerator_type"
  type        = bool
  default     = false
}

variable "gpu_machine_type" {
  description = "GCE machine type when use_gpu is true (e.g. g2-standard-4 for 1x L4)"
  type        = string
  default     = "g2-standard-4"
}

variable "gpu_accelerator_type" {
  description = "GPU accelerator type (e.g. nvidia-l4)"
  type        = string
  default     = "nvidia-l4"
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "target_cpu_utilization" {
  description = "Target CPU utilization for auto-scaling (0.0-1.0)"
  type        = number
  default     = 0.7
}

variable "cooldown_period" {
  description = "Cooldown period in seconds before scaling decisions"
  type        = number
  default     = 180 # 3 minutes
}

variable "health_check_port" {
  description = "Port for health checks"
  type        = number
  default     = 8080
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
}

variable "network" {
  description = "VPC network name"
  type        = string
  default     = "default"
}

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default = {
    service     = "voiceai-agent"
    environment = "production"
    team        = "ferni"
  }
}
