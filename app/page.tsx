import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MatcherWorkspace } from "@/components/matcher-workspace";
import { ScoreExplanation } from "@/components/score-explanation";
import { PrivacyNote } from "@/components/privacy-note";
import { LimitationsNote } from "@/components/limitations-note";
import { PortfolioCta } from "@/components/portfolio-cta";
import { CheckIcon } from "@/components/icons";

const TRUST_POINTS = ["No signup", "Runs in your browser", "Nothing stored"];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-4 sm:px-6">
        {/* Hero — kept compact so the workspace sits above the fold. */}
        <section className="pb-6 pt-8 sm:pt-10">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            See the skill gaps before you apply.
          </h1>
          <p className="mt-3 max-w-2xl text-base text-slate-600">
            Paste a resume and a job description to see which required keywords
            are covered — and exactly which are not — with the evidence behind
            every match.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Privacy commitments">
            {TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <CheckIcon className="h-4 w-4 shrink-0 text-indigo-700" />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <MatcherWorkspace />

        <ScoreExplanation />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <PrivacyNote />
          <LimitationsNote />
        </div>

        <PortfolioCta />
      </main>
      <SiteFooter />
    </>
  );
}
