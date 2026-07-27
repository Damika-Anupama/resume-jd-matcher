import { ShieldIcon } from "./icons";

export function PrivacyNote() {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2
        id="privacy-heading"
        className="flex items-center gap-2 text-base font-bold text-slate-900"
      >
        <ShieldIcon className="h-5 w-5 shrink-0 text-indigo-700" />
        Private by design
      </h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        <li>
          The analysis is a pure function that runs in your browser after the
          page loads — your resume and the job description are never uploaded.
        </li>
        <li>
          Nothing is stored: no accounts, no database, and no analytics on what
          you paste. Reloading or pressing “Clear data” wipes everything.
        </li>
        <li>
          Files you upload are read locally in the browser and never leave your
          device.
        </li>
        <li>
          The code is open source, so you can verify every claim on this page in{" "}
          <a
            href="https://github.com/Damika-Anupama/resume-jd-matcher"
            className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800"
          >
            the repository
          </a>
          .
        </li>
      </ul>
    </section>
  );
}
