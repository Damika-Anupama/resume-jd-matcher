terraform {
  required_version = ">= 1.5.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

# The provider reads the kubeconfig context supplied by the operator. For local
# development point it at a kind/minikube context; for cloud, at your EKS/GKE
# context. No credentials are committed — context selection is via variables.
provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

# Namespace that holds the whole application.
resource "kubernetes_namespace" "app" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/name"       = "resume-jd-matcher"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

# Backend configuration (deploy-safe defaults; real LLM key comes from a Secret).
resource "kubernetes_config_map" "backend" {
  metadata {
    name      = "backend-config"
    namespace = kubernetes_namespace.app.metadata[0].name
  }
  data = {
    LLM_PROVIDER = var.llm_provider
    LLM_MODEL    = var.llm_model
  }
}

# Backend deployment + service via a reusable module.
module "backend" {
  source = "./modules/service"

  name           = "backend"
  namespace      = kubernetes_namespace.app.metadata[0].name
  image          = var.backend_image
  container_port = 8000
  replicas       = var.backend_replicas
  config_map_ref = kubernetes_config_map.backend.metadata[0].name
}

# Frontend deployment + service via the same module.
module "frontend" {
  source = "./modules/service"

  name           = "frontend"
  namespace      = kubernetes_namespace.app.metadata[0].name
  image          = var.frontend_image
  container_port = 3000
  replicas       = var.frontend_replicas
}
