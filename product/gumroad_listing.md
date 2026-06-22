# Gumroad Listing — resume-jd-matcher

> **DRAFT — NOT PUBLISHED**
> This is a working draft for review only. Nothing here is live on Gumroad or anywhere else. Prices, copy, and tiers are proposals pending Damika's sign-off.

---

## Product title options

1. **resume-jd-matcher — See Why Your Resume Gets Rejected (Before You Apply)**
2. **Beat the ATS: Instant Resume ↔ Job-Description Fit Score**
3. **Resume Gap Finder — Match Your Resume to Any Job in One Click**

*(Recommended: Option 1 for clarity + curiosity; Option 2 for SEO on "ATS".)*

---

## Short description (≤ 200 chars)

Paste your resume and any job description. Get a transparent 0–100 fit score, the exact skills you matched and missed, and concrete fixes. Deterministic, explainable, runs offline. No AI black box.

---

## Long description

**You're not getting rejected because you're unqualified. You're getting rejected because an ATS scanned for keywords your resume didn't say — and nobody told you which ones.**

resume-jd-matcher turns that silent rejection into a clear, fixable checklist.

Paste your resume and the job description you're targeting. In under a second you get:

- ✅ **A fit score from 0 to 100** — calculated as *matched required skills ÷ total required skills*. Transparent and reproducible: same inputs, same score, every time.
- ✅ **Matched skills** — what the posting wants that you already have.
- ✅ **Missing skills** — the exact gaps that get you auto-filtered, alias-aware (so "k8s" and "Kubernetes" count as the same thing).
- ✅ **3–5 concrete suggestions** — specific edits to close the gap, not generic "tailor your resume" advice.

**Why it's different from every "AI resume" tool:**
This is *not* a black box. The core is a deterministic skill-overlap matcher you can read, audit, and run yourself — fully offline, at zero API cost. There's no hallucination risk in your score. An optional LLM layer adds polished suggestion wording *only if you want it* and *only if you supply a key*.

**What you get:**
A real, tested product — FastAPI backend, Next.js frontend, pytest suite (12 passing), an evaluation harness, Prometheus metrics, Docker images, and Kubernetes + Terraform deploy configs. Built by an engineer, not a no-code wrapper.

Stop spraying and praying. Start applying only when your fit is strong.

---

## Pricing tiers

### 🆓 Free / Open Source — **$0**
- Full source code (backend + frontend)
- Deterministic matcher, runs offline forever
- `POST /analyze` API + local web UI
- pytest suite + eval harness
- MIT-style self-host license
- Community support (GitHub issues)

### ⭐ Pro — **$29 one-time**
- Everything in Free, plus:
- **Pre-configured OpenRouter LLM suggestions** setup guide + prompt templates
- **Hosted quick-start**: one-click Docker Compose + `.env` presets
- **Extended skill dictionary** (expanded aliases across data, DevOps, mobile, ML roles)
- **Batch mode**: score one resume against many JDs and rank them
- Priority email support
- Free updates for 12 months

### 👥 Team — **$99 one-time** (up to 5 seats)
- Everything in Pro, plus:
- **Kafka + Redis async pipeline** deployment guide for high-volume matching
- **Kubernetes manifests + Terraform** walkthrough for cloud deploy
- **Prometheus/Grafana** dashboard starter
- Shared internal deployment license (career-services teams, bootcamps, agencies)
- 30-min onboarding call
- Free updates for 12 months

*(Pricing is a proposal — validate against comparable dev-tool / job-tool listings before publishing. One-time pricing chosen deliberately to undercut the $15–40/mo subscription "AI resume" crowd.)*

---

## Suggested cover-image concept

A clean split-screen card on a dark slate background:

- **Left half:** a plain resume snippet with two lines subtly highlighted green (matched) and two lines highlighted red (missing).
- **Right half:** a large circular gauge reading **"Fit: 50"** with three short suggestion bullets beneath it.
- **Top bar text:** *"See why your resume fails — in one click."*
- Monospace accent font for the score to signal "engineered / deterministic, not magic."

Keep it screenshot-real (show actual matched/missing skills like `react`, `typescript`, `kubernetes`, `terraform`) rather than abstract AI imagery — the honesty is the brand.

---

## Tags / categories

**Category:** Software Development / Developer Tools (secondary: Career & Productivity)

**Tags:** `resume`, `ats`, `job-search`, `career`, `fastapi`, `nextjs`, `developer-tools`, `open-source`, `python`, `self-hosted`, `job-application`, `ats-checker`, `resume-scanner`, `bootcamp`
