import { InfoIcon } from "./icons";

export function LimitationsNote() {
  return (
    <section
      aria-labelledby="limitations-heading"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2
        id="limitations-heading"
        className="flex items-center gap-2 text-base font-bold text-slate-900"
      >
        <InfoIcon className="h-5 w-5 shrink-0 text-slate-600" />
        Honest limitations
      </h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        <li>
          The dictionary is fixed and focused on software engineering — niche,
          emerging, or non-technical skills may not be recognised.
        </li>
        <li>
          Years of experience, proficiency level, recency, and scope (“not only
          X but also Y”) are not modelled.
        </li>
        <li>
          Negation is only filtered on the resume side; a job ad saying “no
          Java needed” still counts Java as a keyword.
        </li>
        <li>
          Keyword coverage is not candidate quality. This is a directional
          keyword check, not an ATS prediction or an assessment of candidate
          ability — use it to spot gaps, then only add a skill when you can
          support it truthfully.
        </li>
      </ul>
    </section>
  );
}
