output "namespace" {
  description = "Namespace the application is deployed into."
  value       = kubernetes_namespace.app.metadata[0].name
}

output "backend_service" {
  description = "In-cluster DNS name of the backend service."
  value       = "${module.backend.service_name}.${kubernetes_namespace.app.metadata[0].name}.svc.cluster.local"
}

output "frontend_service" {
  description = "In-cluster DNS name of the frontend service."
  value       = "${module.frontend.service_name}.${kubernetes_namespace.app.metadata[0].name}.svc.cluster.local"
}
