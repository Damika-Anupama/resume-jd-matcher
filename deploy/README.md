# Deployment & Infrastructure

Infrastructure-as-code for running **resume-jd-matcher** on Kubernetes. Two
equivalent paths are provided:

- **`k8s/`** — plain Kubernetes manifests (apply with `kubectl`/`kustomize`).
- **`terraform/`** — the same topology expressed with Terraform + the Kubernetes
  provider, using a reusable `service` module for the backend and frontend.

Everything here is **validated in CI without a cloud account or a running
cluster** (see `scripts/validate.sh`): `terraform validate`, `kubeconform`
schema checks, and `checkov` security scanning.

## Topology

```
                 ┌──────────────── Ingress (nginx) ────────────────┐
                 │  host: resume-jd-matcher.local                  │
                 │   /api  → backend Service :80 → :8000           │
                 │   /     → frontend Service :80 → :3000          │
                 └─────────────────────────────────────────────────┘
                          │                         │
                 ┌────────▼────────┐       ┌────────▼─────────┐
                 │ backend (2..6)  │       │ frontend (2..6)  │
                 │ FastAPI :8000   │       │ Next.js :3000    │
                 │ HPA @70% CPU    │       │ HPA @70% CPU     │
                 │ /metrics scrape │       │                  │
                 └─────────────────┘       └──────────────────┘
       NetworkPolicies: default-deny ingress + explicit allows
```

## What's included

| File | Purpose |
|---|---|
| `k8s/00-namespace.yaml` | Namespace |
| `k8s/10-backend-configmap.yaml` | Backend env (deploy-safe `LLM_PROVIDER=mock`) |
| `k8s/20-backend.yaml` | Backend Deployment + Service |
| `k8s/30-frontend.yaml` | Frontend Deployment + Service |
| `k8s/40-ingress.yaml` | Ingress routing `/api` → backend, `/` → frontend |
| `k8s/45-networkpolicy.yaml` | Default-deny + least-privilege allows |
| `k8s/50-hpa.yaml` | HorizontalPodAutoscalers (CPU 70%) |
| `terraform/` | Same topology via Terraform + reusable `service` module |
| `scripts/validate.sh` | One command to validate all IaC |

## Security hardening (verified by checkov)

Every workload runs with:
- `runAsNonRoot` + non-root UID, `fsGroup`, `seccompProfile: RuntimeDefault`
- `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`
- all Linux capabilities dropped (`drop: [ALL]`)
- CPU/memory requests **and** limits
- liveness + readiness probes
- `automountServiceAccountToken: false`
- NetworkPolicies (default-deny ingress + scoped allows)

checkov result: **k8s 183/183, terraform 57/57** passing.

> Residual finding `CKV_K8S_43` (pin image by digest) is intentionally deferred
> to the release pipeline — digests are only knowable once images are published
> to the registry — and is skipped with a documented reason in `validate.sh`.

## Container images

Both services ship production multi-stage Dockerfiles:
- `backend/Dockerfile` — `python:3.13-slim`, non-root, healthcheck.
- `frontend/Dockerfile` — `node:22-alpine`, Next.js **standalone** output, non-root.

Build:

```bash
docker build -t ghcr.io/damika-anupama/resume-jd-matcher-backend:v1.0.0 ./backend
docker build -t ghcr.io/damika-anupama/resume-jd-matcher-frontend:v1.0.0 ./frontend
```

## Deploy

### With kubectl (kind / minikube / any cluster)

```bash
kubectl apply -f deploy/k8s/
kubectl -n resume-jd-matcher get pods,svc,ingress
```

### With Terraform

```bash
cd deploy/terraform
terraform init
terraform apply -var "kube_context=kind-kind"
```

For the real LLM path, create a Secret with `OPENROUTER_API_KEY` and set
`LLM_PROVIDER=openrouter` in the backend ConfigMap (never put the key in a
ConfigMap or in source).

## Validate locally

```bash
# Requires: terraform, kubeconform, checkov (pip install checkov)
bash deploy/scripts/validate.sh
```
