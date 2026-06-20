variable "name" {
  description = "Component name (e.g. backend, frontend)."
  type        = string
}

variable "namespace" {
  description = "Namespace to deploy into."
  type        = string
}

variable "image" {
  description = "Container image reference."
  type        = string
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
}

variable "replicas" {
  description = "Replica count."
  type        = number
  default     = 2
}

variable "config_map_ref" {
  description = "Optional ConfigMap name to load as environment variables."
  type        = string
  default     = null
}
