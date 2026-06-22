# 60-Second Demo Script — resume-jd-matcher

**Goal:** Show a real job seeker paste a resume + JD, get a fit score, see missing skills, and act on suggestions — in 60 seconds. Honest, fast, no hype.

**Format:** Screen recording with voiceover. Total runtime 0:00–0:60.

---

| Time | On screen | Voiceover |
|---|---|---|
| **0:00–0:05** | Cold open on a Gmail-style inbox full of "Unfortunately, we've decided to move forward with other candidates" rejection emails. Subtle red flagging. | "Sixty applications. Sixty rejections. And not one of them told you *why*." |
| **0:05–0:12** | Cut to the resume-jd-matcher web UI — two clean empty text boxes labelled **Resume** and **Job Description**, an **Analyze** button below. | "Here's the fix. Paste your resume on the left, the job description on the right." |
| **0:12–0:22** | Cursor pastes resume text into the left box: *"Built React and Next.js apps in TypeScript with FastAPI and Docker."* Then pastes JD into the right box: *"Need React, TypeScript, Kubernetes and Terraform."* | "Your actual resume. The actual job posting. No uploads, no signup, no AI guessing games." |
| **0:22–0:27** | Cursor clicks **Analyze**. A subtle loading spinner for under a second. | "Click analyze…" |
| **0:27–0:35** | Result panel animates in. Big circular gauge fills to **50**. Label: **Fit score 50 / 100**. | "…and there it is. A fit score of fifty. Calculated, not guessed — matched skills divided by what the job actually requires." |
| **0:35–0:43** | Two columns appear. **Matched** (green): `react`, `typescript`. **Missing** (red): `kubernetes`, `terraform`. Each animates in as it's named. | "You matched React and TypeScript. But the job wants Kubernetes and Terraform — and your resume never says them. *That's* why the ATS filtered you out." |
| **0:43–0:53** | Suggestions list slides up beneath: bullet 1 — *"Add concrete evidence of Kubernetes…"*, bullet 2 — *"Show Terraform experience as infrastructure as code,"* bullet 3 — *"Lead with React + TypeScript."* | "And it doesn't just flag the gap — it tells you exactly what to add. Concrete fixes, in plain English." |
| **0:53–0:57** | Quick highlight badge in corner: **"Deterministic · Explainable · Runs offline."** | "No black box. The score is reproducible math you can audit — and it runs free, offline, by default." |
| **0:57–0:60** | End card: logo, tagline **"Stop guessing why your resume gets rejected."** + URL/CTA placeholder. | "Find your gaps before you hit submit. Try it free." |

---

## Production notes

- **Pace:** Brisk but readable. Don't rush the 0:27–0:43 reveal — that's the payoff.
- **Audio:** Light, upbeat background bed; drop it slightly under the voiceover at the reveal (0:27).
- **Caption everything** — most social viewers watch muted; the matched/missing skills must be legible on a phone.
- **Use the real response** from the live app (fit_score 50, matched react/typescript, missing kubernetes/terraform) — do not fake the numbers. The authenticity is the selling point.
- **No stock "AI brain" imagery.** Keep it screen-real.
