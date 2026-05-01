const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

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

export interface Recommendation {
  soc_code: string;
  title: string;
  fit_score: number;
  rationale: string;
  skill_gaps: SkillGap[];
  citations: Citation[];
}

export interface RecommendResponse {
  recommendations: Recommendation[];
  notes?: string | null;
}

export interface RecommendRequest {
  moc: string;
  background?: string;
}

export async function recommend(request: RecommendRequest): Promise<RecommendResponse> {
  const response = await fetch(`${API_URL}/v1/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Pathfinder API error: ${response.status}`);
  }
  return response.json();
}
