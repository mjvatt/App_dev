const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export type Branch =
  | "army"
  | "marines"
  | "navy"
  | "air_force"
  | "space_force"
  | "coast_guard";

export type Component = "active" | "reserve" | "national_guard";

export type EducationLevel =
  | "high_school"
  | "some_college"
  | "associate"
  | "bachelor"
  | "master"
  | "doctorate";

export type WorkStyle = "in_person" | "hybrid" | "remote" | "no_preference";

export interface RecommendRequest {
  branch: Branch;
  component: Component;
  occupation_code: string;
  pay_grade: string;
  years_of_service: number;
  combat_deployments: number;
  leadership_roles?: string;
  additional_skills?: string;

  education_level: EducationLevel;
  certifications?: string;
  civilian_skills?: string;

  location: string;
  open_to_relocate: boolean;
  dependents: number;
  target_salary?: number;
  work_style: WorkStyle;

  goals?: string;
}

export interface Citation {
  source: string;
  title: string;
  url?: string | null;
}

export interface SkillGap {
  skill: string;
  have: boolean;
  note?: string | null;
}

export interface ActionStep {
  label: string;
  detail?: string | null;
  url?: string | null;
}

export interface Recommendation {
  soc_code: string;
  title: string;
  fit_score: number;
  rationale: string;
  wage_range?: string | null;
  open_postings?: number | null;
  skill_gaps: SkillGap[];
  action_steps: ActionStep[];
  citations: Citation[];
}

export interface RecommendResponse {
  recommendations: Recommendation[];
  notes?: string | null;
}

export async function recommend(request: RecommendRequest): Promise<RecommendResponse> {
  const response = await fetch(`${API_URL}/v1/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Pathfinder API error ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}
