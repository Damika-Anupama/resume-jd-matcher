variable "kubeconfig_path" {
  description = "Path to the kubeconfig file."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "kubeconfig context to deploy into (e.g. a kind or EKS context)."
  type        = string
  default     = null
}

variable "namespace" {
  description = "Namespace for the application."
  type        = string
  default     = "resume-jd-matcher"
}

variable "backend_image" {
  description = "Container image for the FastAPI backend."
  type        = string
  default     = "ghcr.io/damika-anupama/resume-jd-matcher-backend:v1.0.0"
}

variable "frontend_image" {
  description = "Container image for the Next.js frontend."
  type        = string
  default     = "ghcr.io/damika-anupama/resume-jd-matcher-frontend:v1.0.0"
}

variable "backend_replicas" {
  description = "Replica count for the backend."
  type        = number
  default     = 2
}

variable "frontend_replicas" {
  description = "Replica count for the frontend."
  type        = number
  default     = 2
}

variable "llm_provider" {
  description = "LLM provider for the backend (deploy-safe default is 'mock')."
  type        = string
  default     = "mock"
}

variable "llm_model" {
  description = "Model id used when the LLM provider is enabled."
  type        = string
  default     = "openai/gpt-4o-mini"
}
