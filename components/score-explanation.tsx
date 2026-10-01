/**
 * "How this score works" — full transparency about the deterministic,
 * dictionary-based method, so the number is never a black box.
 */
export function ScoreExplanation() {
  return (
    <section aria-labelledby="how-heading" className="mt-14">
      <h2 id="how-heading" className="text-xl font-bold text-slate-900">
        How this score works
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-700">
        Every step is deterministic and inspectable — the same inputs always
        produce the same result, and each matched keyword shows the resume line
        it came from.
      </p>

      <ol className="mt-5 grid gap-4 sm:grid-cols-2">
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            1. Dictionary keyword matching
          </h3>
          <p className="mt-1.5 text-sm text-slate-600">
            Both texts are scanned against a fixed, open-source dictionary of
            common software-engineering skills and their aliases (for example
            “k8s” counts as Kubernetes). Nothing is inferred or guessed.
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            2. Required vs nice-to-have tiers
          </h3>
          <p className="mt-1.5 text-sm text-slate-600">
            Job-description keywords under headings like “Nice to have”, or in
            phrases like “is a plus”, are tiered as optional. Everything else is
            treated as required. When in doubt, a keyword defaults to required.
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            3. Negation filtering
          </h3>
          <p className="mt-1.5 text-sm text-slate-600">
            Resume statements such as “no Kubernetes experience” or “eager to
            learn Terraform” are never counted as evidence of a skill — a
            keyword only matches when it appears in a non-negated sentence.
          </p>
        </li>
        <li className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">4. The formula</h3>
          <p className="mt-1.5 text-sm text-slate-600">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
              coverage = matched required ÷ total required × 100
            </span>
            <br />
            Nice-to-have keywords are reported separately and never change the
            score. Bands: Strong ≥ 80%, Partial 50–79%, Low &lt; 50%.
          </p>
        </li>
      </ol>

      <p className="mt-5 max-w-3xl rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800">
        This is a directional keyword check, not an ATS prediction or an
        assessment of candidate ability.
      </p>
    </section>
  );
}
