export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
        <p className="text-sm font-bold tracking-tight text-slate-900">
          Resume ↔ JD Matcher
        </p>
        <nav aria-label="Project links" className="flex items-center gap-1">
          <a
            href="https://github.com/Damika-Anupama/resume-jd-matcher"
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Source
          </a>
          <a
            href="https://github.com/Damika-Anupama"
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            @Damika-Anupama
          </a>
        </nav>
      </div>
    </header>
  );
}
