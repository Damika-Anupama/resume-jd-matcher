export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h2 className="text-sm font-semibold text-slate-900">
          A small technical case study
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Deterministic TypeScript matching engine with a byte-identical Python
          counterpart (parity-tested in CI), fully client-side processing,
          WCAG-minded UI, and Playwright end-to-end coverage.{" "}
          <a
            href="https://github.com/Damika-Anupama/resume-jd-matcher#readme"
            className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800"
          >
            Read the write-up in the README
          </a>
          .
        </p>
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Technology stack">
          {["Next.js", "React", "TypeScript", "Tailwind CSS", "FastAPI", "Playwright"].map(
            (t) => (
              <li
                key={t}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {t}
              </li>
            )
          )}
        </ul>
        <p className="mt-5 text-xs text-slate-500">
          Sample data is entirely fictional. Built by{" "}
          <a
            href="https://github.com/Damika-Anupama"
            className="underline underline-offset-2 hover:text-slate-700"
          >
            Damika Anupama
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
