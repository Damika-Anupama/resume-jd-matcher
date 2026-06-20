output "service_name" {
  description = "Name of the created Service."
  value       = kubernetes_service.this.metadata[0].name
}

output "deployment_name" {
  description = "Name of the created Deployment."
  value       = kubernetes_deployment.this.metadata[0].name
}
