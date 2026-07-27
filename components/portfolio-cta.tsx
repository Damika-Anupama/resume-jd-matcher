import { ArrowRightIcon } from "./icons";

export function PortfolioCta() {
  return (
    <section
      aria-labelledby="cta-heading"
      className="mt-14 rounded-xl border border-indigo-100 bg-indigo-50/60 p-6 sm:p-8"
    >
      <h2 id="cta-heading" className="text-xl font-bold text-slate-900">
        Need a tailored workflow like this for your business?
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-700">
        This demo was built end to end — matching engine, privacy-first
        browser processing, accessibility, and CI — by one engineer. I build
        similar focused tools: internal utilities, document workflows, and
        automation that runs where your data already lives.
      </p>
      <a
        href="https://github.com/Damika-Anupama"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        Get in touch via GitHub
        <ArrowRightIcon className="h-4 w-4 shrink-0" />
      </a>
    </section>
  );
}
