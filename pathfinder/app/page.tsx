"use client";

import { useState } from "react";
import {
  recommend,
  type Branch,
  type Component,
  type EducationLevel,
  type RecommendRequest,
  type RecommendResponse,
  type WorkStyle,
} from "@/lib/api";

const BRANCHES: { value: Branch; label: string }[] = [
  { value: "army", label: "Army" },
  { value: "marines", label: "Marines" },
  { value: "navy", label: "Navy" },
  { value: "air_force", label: "Air Force" },
  { value: "space_force", label: "Space Force" },
  { value: "coast_guard", label: "Coast Guard" },
];

const COMPONENTS: { value: Component; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "reserve", label: "Reserve" },
  { value: "national_guard", label: "National Guard" },
];

const EDUCATION_LEVELS: { value: EducationLevel; label: string }[] = [
  { value: "high_school", label: "High school" },
  { value: "some_college", label: "Some college" },
  { value: "associate", label: "Associate" },
  { value: "bachelor", label: "Bachelor's" },
  { value: "master", label: "Master's" },
  { value: "doctorate", label: "Doctorate" },
];

const WORK_STYLES: { value: WorkStyle; label: string }[] = [
  { value: "no_preference", label: "No preference" },
  { value: "in_person", label: "In-person" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

type FormState = {
  branch: Branch;
  component: Component;
  occupation_code: string;
  pay_grade: string;
  years_of_service: string;
  combat_deployments: string;
  leadership_roles: string;
  additional_skills: string;
  education_level: EducationLevel;
  certifications: string;
  civilian_skills: string;
  location: string;
  open_to_relocate: boolean;
  dependents: string;
  target_salary: string;
  work_style: WorkStyle;
  goals: string;
};

const INITIAL_FORM: FormState = {
  branch: "army",
  component: "active",
  occupation_code: "",
  pay_grade: "",
  years_of_service: "",
  combat_deployments: "0",
  leadership_roles: "",
  additional_skills: "",
  education_level: "high_school",
  certifications: "",
  civilian_skills: "",
  location: "",
  open_to_relocate: false,
  dependents: "0",
  target_salary: "",
  work_style: "no_preference",
  goals: "",
};

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildPayload(form: FormState): RecommendRequest {
  return {
    branch: form.branch,
    component: form.component,
    occupation_code: form.occupation_code.trim(),
    pay_grade: form.pay_grade.trim(),
    years_of_service: Number(form.years_of_service) || 0,
    combat_deployments: Number(form.combat_deployments) || 0,
    leadership_roles: trimOrUndefined(form.leadership_roles),
    additional_skills: trimOrUndefined(form.additional_skills),
    education_level: form.education_level,
    certifications: trimOrUndefined(form.certifications),
    civilian_skills: trimOrUndefined(form.civilian_skills),
    location: form.location.trim(),
    open_to_relocate: form.open_to_relocate,
    dependents: Number(form.dependents) || 0,
    target_salary: form.target_salary ? Number(form.target_salary) : undefined,
    work_style: form.work_style,
    goals: trimOrUndefined(form.goals),
  };
}

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none";

const labelClass = "block text-sm font-medium text-zinc-300";

const sectionClass = "rounded-lg border border-zinc-800 bg-zinc-950/40 p-5";

const sectionTitleClass = "mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400";

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await recommend(buildPayload(form));
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Pathfinder</h1>
        <p className="mt-2 text-zinc-400">
          Veteran-to-civilian career copilot. Personalized to your service record,
          location, and goals.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Service</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="branch" className={labelClass}>Branch</label>
              <select
                id="branch"
                value={form.branch}
                onChange={(e) => update("branch", e.target.value as Branch)}
                className={`${inputClass} mt-1`}
              >
                {BRANCHES.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="component" className={labelClass}>Component</label>
              <select
                id="component"
                value={form.component}
                onChange={(e) => update("component", e.target.value as Component)}
                className={`${inputClass} mt-1`}
              >
                {COMPONENTS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="occupation_code" className={labelClass}>MOC / MOS / AFSC / Rate</label>
              <input
                id="occupation_code"
                value={form.occupation_code}
                onChange={(e) => update("occupation_code", e.target.value.toUpperCase())}
                placeholder="e.g., 11B, 0311, IT, 1B0X1"
                required
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="pay_grade" className={labelClass}>Pay grade</label>
              <input
                id="pay_grade"
                value={form.pay_grade}
                onChange={(e) => update("pay_grade", e.target.value.toUpperCase())}
                placeholder="E-5, W-2, O-3"
                required
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="years_of_service" className={labelClass}>Years of service</label>
              <input
                id="years_of_service"
                type="number"
                min={0}
                max={50}
                value={form.years_of_service}
                onChange={(e) => update("years_of_service", e.target.value)}
                required
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="combat_deployments" className={labelClass}>Combat deployments</label>
              <input
                id="combat_deployments"
                type="number"
                min={0}
                max={20}
                value={form.combat_deployments}
                onChange={(e) => update("combat_deployments", e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="leadership_roles" className={labelClass}>
                Leadership roles <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="leadership_roles"
                value={form.leadership_roles}
                onChange={(e) => update("leadership_roles", e.target.value)}
                placeholder="Team Leader, Squad Leader, Platoon Sergeant, etc."
                className={`${inputClass} mt-1`}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="additional_skills" className={labelClass}>
                Additional skills / specialty schools <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="additional_skills"
                value={form.additional_skills}
                onChange={(e) => update("additional_skills", e.target.value)}
                rows={2}
                placeholder="Air Assault, Combat Lifesaver, language qualifier, security clearance, etc."
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>Civilian readiness</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="education_level" className={labelClass}>Education level</label>
              <select
                id="education_level"
                value={form.education_level}
                onChange={(e) => update("education_level", e.target.value as EducationLevel)}
                className={`${inputClass} mt-1`}
              >
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="certifications" className={labelClass}>
                Civilian certifications <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="certifications"
                value={form.certifications}
                onChange={(e) => update("certifications", e.target.value)}
                rows={2}
                placeholder="CDL, Security+, PMP, A&P, etc."
                className={`${inputClass} mt-1`}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="civilian_skills" className={labelClass}>
                Civilian skills <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="civilian_skills"
                value={form.civilian_skills}
                onChange={(e) => update("civilian_skills", e.target.value)}
                rows={2}
                placeholder="Skills picked up off-duty or before service: programming, trades, languages, etc."
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className={sectionTitleClass}>What you want</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="location" className={labelClass}>Location</label>
              <input
                id="location"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="ZIP, city/state, or 'flexible'"
                required
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="dependents" className={labelClass}>Dependents</label>
              <input
                id="dependents"
                type="number"
                min={0}
                max={20}
                value={form.dependents}
                onChange={(e) => update("dependents", e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="target_salary" className={labelClass}>
                Target salary <span className="text-zinc-500">(optional)</span>
              </label>
              <input
                id="target_salary"
                type="number"
                min={0}
                step={1000}
                value={form.target_salary}
                onChange={(e) => update("target_salary", e.target.value)}
                placeholder="75000"
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label htmlFor="work_style" className={labelClass}>Work style</label>
              <select
                id="work_style"
                value={form.work_style}
                onChange={(e) => update("work_style", e.target.value as WorkStyle)}
                className={`${inputClass} mt-1`}
              >
                {WORK_STYLES.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                id="open_to_relocate"
                type="checkbox"
                checked={form.open_to_relocate}
                onChange={(e) => update("open_to_relocate", e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
              />
              <label htmlFor="open_to_relocate" className="text-sm text-zinc-300">
                Open to relocating
              </label>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="goals" className={labelClass}>
                Goals <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="goals"
                value={form.goals}
                onChange={(e) => update("goals", e.target.value)}
                rows={3}
                placeholder="What do you want out of your next career? Stability, leadership, technical depth, freedom, etc."
                className={`${inputClass} mt-1`}
              />
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={
            loading ||
            !form.occupation_code ||
            !form.pay_grade ||
            !form.years_of_service ||
            !form.location
          }
          className="rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Find roles"}
        </button>
      </form>

      {error && (
        <p className="mt-6 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-10 space-y-6">
          {result.notes && (
            <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
              {result.notes}
            </p>
          )}
          {result.recommendations.map((rec) => (
            <article
              key={rec.soc_code}
              className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5"
            >
              <header className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-medium">{rec.title}</h2>
                <span className="text-xs text-zinc-500">
                  SOC {rec.soc_code} · fit {(rec.fit_score * 100).toFixed(0)}%
                </span>
              </header>

              {(rec.wage_range || rec.open_postings != null) && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
                  {rec.wage_range && <span>Wage: {rec.wage_range}</span>}
                  {rec.open_postings != null && (
                    <span>{rec.open_postings} open postings</span>
                  )}
                </div>
              )}

              <p className="mt-3 text-sm text-zinc-300">{rec.rationale}</p>

              {rec.skill_gaps.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Skill gaps
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {rec.skill_gaps.map((gap, idx) => (
                      <li key={idx} className="flex gap-3 text-zinc-300">
                        <span
                          className={`inline-block w-12 shrink-0 text-xs font-medium uppercase tracking-wide ${
                            gap.have ? "text-emerald-400" : "text-yellow-400"
                          }`}
                        >
                          {gap.have ? "have" : "gap"}
                        </span>
                        <span>
                          {gap.skill}
                          {gap.note && <span className="text-zinc-500"> — {gap.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rec.action_steps.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Next steps
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {rec.action_steps.map((step, idx) => (
                      <li key={idx} className="text-zinc-300">
                        {step.url ? (
                          <a
                            href={step.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {step.label}
                          </a>
                        ) : (
                          <span className="font-medium">{step.label}</span>
                        )}
                        {step.detail && <div className="text-zinc-500">{step.detail}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rec.citations.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Sources
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {rec.citations.map((cite, idx) => (
                      <li key={idx}>
                        {cite.url ? (
                          <a
                            href={cite.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-300 underline-offset-2 hover:underline"
                          >
                            {cite.title}
                          </a>
                        ) : (
                          <span className="text-zinc-300">{cite.title}</span>
                        )}
                        <span className="text-zinc-600"> · {cite.source}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <footer className="mt-16 border-t border-zinc-900 pt-6 text-xs text-zinc-600">
        Pathfinder is informational. It does not replace VA benefits counseling,
        licensed career advisors, or official career transition programs.
      </footer>
    </main>
  );
}
