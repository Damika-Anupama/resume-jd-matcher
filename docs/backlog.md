# Backlog — deferred work, prioritized

Honest list of what the private full-product architecture still needs before
it could be called production-ready, plus demo improvements. Ordered by
priority within each section.

## P1 — correctness & security

1. **Dependency bumps flagged by audits.**
   - frontend: `next` 16.2.9 → **16.2.11** (multiple high advisories, incl.
     GHSA-6gpp-xcg3-4w24, GHSA-4633-3j49-mh5q; also pulls fixed
     postcss/sharp).
   - backend: `pypdf` 5.1.0 → ≥ 6.14.2 (many PYSEC advisories),
     `python-multipart` 0.0.20 → ≥ 0.0.31, `fastapi` bump to pull a patched
     `starlette` (≥ 1.3.1 line). Then flip the CI `backend-audit` lane from
     report-only to failing.
2. **Kafka DLQ + retry policy.** The async analyze path has no dead-letter
   topic; a poison message can be retried forever or dropped silently.
3. **Idempotency on the async path.** Duplicate job submission produces
   duplicate work; job IDs are not idempotency keys.
4. **TLS / ingress hardening.** K8s manifests have no TLS, no ingress rules,
   no network policies.

## P2 — release engineering

5. **Image release pipeline.** No CI job builds/pushes Docker images or pins
   them by digest in the manifests (Checkov CKV_K8S_43 is skipped for this
   documented reason).
6. **Terraform ↔ manifest parity.** Terraform is validated but not applied
   anywhere; it does not provably produce the environment the k8s manifests
   assume.
7. **Secrets management.** API keys arrive via plain env vars; no
   secret-store integration.

## P3 — matching quality

8. **Real-world evaluation dataset.** Current metrics use a synthetic,
   self-aligned dataset and measure extraction agreement, not real-world
   quality. Collect genuine JD/resume pairs (with consent), label them, and
   report honest numbers.
9. **Taxonomy breadth.** ~60 canonical skills covers a narrow slice of tech
   roles; non-tech roles get `insufficient signal` almost always.
10. **JD-side negation.** "No PHP here" in a JD still counts PHP as required
    (documented limitation in ADR 0001).
11. **DOCX edge cases.** Tables, text boxes, headers/footers and
    multi-column layouts lose or scramble text during extraction.

## P4 — demo polish

12. **PDF extraction robustness** (scanned/image-only PDFs → clear
    "no extractable text" message rather than an empty resume).
13. **Shareable results** without violating the privacy model (e.g. encode
    results — never inputs — in a URL fragment).
14. **i18n.** English-only cue words for required/nice-to-have tiering.
15. **K8s env parity with the hardened backend.** The Kubernetes manifests do
    not yet set `KAFKA_BOOTSTRAP_SERVERS` or `CORS_ALLOW_ORIGINS`; the backend
    now fails safe without them (async endpoints return 503 `async_disabled`,
    CORS falls back to a localhost dev allowlist), so a k8s deployment of the
    private full product needs these set explicitly.
