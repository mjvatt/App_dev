"""System prompt and tool schema for the synthesizer agent."""
from __future__ import annotations

from services.agents.grounding import GroundedCandidate

SYSTEM_PROMPT = """You are PATHFINDER, an experienced career-transition counselor for U.S. military \
veterans moving to civilian careers. You produce ranked, personalized civilian career recommendations \
grounded strictly in the data supplied to you.

You will receive:
1. A structured veteran profile (service record, education, civilian skills, location, goals).
2. A list of candidate civilian occupations, each with O*NET title, description, job zone, top skills, \
top knowledge areas, sample core tasks, BLS wage data (when available), and live USAJobs federal \
posting counts (when available).

Your job is to:
- Pick the 5 candidates that best fit this veteran's profile and stated goals. If there are fewer than \
5 candidates, return as many as exist.
- For each pick, write a personalized rationale (3-5 sentences) that references the veteran's specific \
pay grade, branch, MOC, years of service, leadership history, education, civilian skills, location, \
target salary, and goals where relevant. Avoid generic statements that could apply to any veteran.
- Translate military-coded experience into civilian-recruiter language in the rationale (for example, \
'Squad Leader' becomes 'led an 8-12 person team executing time-critical operations under shifting \
constraints, coordinating across multiple stakeholders').
- Identify 2-4 concrete skill gaps with brief notes on how to bridge them when the bridge is well-known.
- Provide 3-4 concrete next-step action items the veteran can act on this week. Action steps must be \
specific and verifiable (for example, 'enroll in <named credential>', 'apply via SkillBridge to \
<specific employer>'). Avoid hedge phrases like 'consider exploring' or 'you might want to'.
- Choose a fit_score in [0, 1] reflecting overall fit. Use the spread of scores to communicate \
relative confidence; avoid clustering all picks at the same value.

Hard rules:
- Recommend ONLY soc_code values from the supplied candidate list. Do not invent occupations.
- Do not estimate wages or posting counts in any field. Wage and posting data is attached \
deterministically after your response.
- If the supplied context does not support a claim, omit the claim.
- Do not flatter the veteran. Stay clinical and useful.

Return your output by calling the recommend tool exactly once."""


RECOMMEND_TOOL = {
    "name": "recommend",
    "description": "Return the top ranked civilian career recommendations for this veteran.",
    "input_schema": {
        "type": "object",
        "properties": {
            "recommendations": {
                "type": "array",
                "minItems": 1,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "soc_code": {"type": "string"},
                        "title": {"type": "string"},
                        "fit_score": {"type": "number", "minimum": 0, "maximum": 1},
                        "rationale": {"type": "string"},
                        "skill_gaps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "skill": {"type": "string"},
                                    "have": {"type": "boolean"},
                                    "note": {"type": ["string", "null"]},
                                },
                                "required": ["skill", "have"],
                            },
                        },
                        "action_steps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": {"type": "string"},
                                    "detail": {"type": ["string", "null"]},
                                    "url": {"type": ["string", "null"]},
                                },
                                "required": ["label"],
                            },
                        },
                    },
                    "required": [
                        "soc_code",
                        "title",
                        "fit_score",
                        "rationale",
                        "skill_gaps",
                        "action_steps",
                    ],
                },
            }
        },
        "required": ["recommendations"],
    },
}


def render_profile(request_dict: dict) -> str:
    """One-shot text rendering of the veteran profile for the user message."""
    branch = (request_dict.get("branch") or "").replace("_", " ").title()
    education = (request_dict.get("education_level") or "").replace("_", " ").title()
    relocate = "open to relocate" if request_dict.get("open_to_relocate") else "not open to relocate"
    work_style = (request_dict.get("work_style") or "no_preference").replace("_", " ")
    target_salary = request_dict.get("target_salary")
    salary_line = f"target salary ${target_salary:,}+" if target_salary else "no target salary stated"
    deployments = request_dict.get("combat_deployments") or 0
    deploy_line = f"{deployments} combat deployments" if deployments else "no combat deployments"

    lines = [
        f"- Service: {request_dict['pay_grade']} {branch} {request_dict['occupation_code']}, "
        f"{request_dict.get('component', '')} component, "
        f"{request_dict['years_of_service']} years of service, {deploy_line}",
        f"- Education: {education}",
        f"- Location: {request_dict.get('location', '')} ({relocate})",
        f"- Work style: {work_style}, {request_dict.get('dependents', 0)} dependents, {salary_line}",
    ]
    if request_dict.get("leadership_roles"):
        lines.append(f"- Leadership roles: {request_dict['leadership_roles']}")
    if request_dict.get("additional_skills"):
        lines.append(f"- Additional skills: {request_dict['additional_skills']}")
    if request_dict.get("certifications"):
        lines.append(f"- Civilian certifications: {request_dict['certifications']}")
    if request_dict.get("civilian_skills"):
        lines.append(f"- Civilian skills: {request_dict['civilian_skills']}")
    if request_dict.get("goals"):
        lines.append(f"- Goals: {request_dict['goals']}")
    return "\n".join(lines)


def render_candidate(idx: int, g: GroundedCandidate) -> str:
    c = g.candidate
    out = [
        f"[{idx}] SOC {c.soc_code} — {c.title}",
        f"    Description: {c.description.strip()}",
    ]
    if c.job_zone is not None:
        zone_summary = (c.job_zone_summary or "").strip()
        zone_text = f"Job zone {c.job_zone}"
        if zone_summary:
            zone_text += f" — {zone_summary[:140]}"
        out.append(f"    {zone_text}")
    if c.top_skills:
        out.append(f"    Top skills: {', '.join(c.top_skills[:8])}")
    if c.top_knowledge:
        out.append(f"    Top knowledge: {', '.join(c.top_knowledge[:6])}")
    if c.core_tasks:
        out.append(f"    Sample tasks: {' | '.join(c.core_tasks[:3])}")
    if g.wages:
        wage_str = g.wages.range_str() or "available"
        out.append(f"    Wage ({g.wages.area_name}, {g.wages.data_year}): {wage_str}")
    if g.postings_count:
        sample = g.sample_postings[0] if g.sample_postings else None
        sample_str = f" e.g., {sample.title} at {sample.department}" if sample else ""
        out.append(f"    Live USAJobs postings near user: {g.postings_count}{sample_str}")
    out.append(f"    Source: {c.source}")
    return "\n".join(out)


def build_user_message(profile: dict, grounded: list[GroundedCandidate]) -> str:
    blocks = ["Veteran profile:", render_profile(profile), "", "Candidate occupations:", ""]
    for i, g in enumerate(grounded, start=1):
        blocks.append(render_candidate(i, g))
        blocks.append("")
    blocks.append(
        "Pick the 5 best fits, write personalized rationale, skill gaps, and action steps. "
        "Return via the recommend tool."
    )
    return "\n".join(blocks)
