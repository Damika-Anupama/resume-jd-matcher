#!/usr/bin/env bash
# Validates all infrastructure-as-code in deploy/ without needing a cloud account
# or a running cluster. Safe to run locally and in CI.
#
#   - terraform fmt -check   (formatting)
#   - terraform validate     (config correctness)
#   - kubeconform            (k8s manifests match the API schema)
#   - checkov                (security / best-practice policy scan)
#
# Exit non-zero if any hard check fails.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/terraform"
K8S_DIR="$ROOT/k8s"

echo "==> terraform fmt -check"
terraform -chdir="$TF_DIR" fmt -recursive -check

echo "==> terraform init (backend disabled) + validate"
terraform -chdir="$TF_DIR" init -backend=false -input=false >/dev/null
terraform -chdir="$TF_DIR" validate

echo "==> kubeconform (Kubernetes schema validation)"
kubeconform -strict -summary -kubernetes-version 1.30.0 "$K8S_DIR"

echo "==> checkov (k8s manifests)"
# CKV_K8S_43 (image digest) is a publish-time concern: it is satisfied by the
# release pipeline when images are pushed, not in source manifests. Skipped here
# with an explicit, documented reason rather than silently.
checkov -d "$K8S_DIR" --compact --quiet --skip-check CKV_K8S_43

echo "==> checkov (terraform)"
checkov -d "$TF_DIR" --compact --quiet --framework terraform --skip-check CKV_K8S_43

echo "All IaC validation checks passed."
