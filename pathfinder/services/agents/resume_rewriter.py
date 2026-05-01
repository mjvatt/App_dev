"""Resume bullet rewriter.

Takes military-coded resume bullets and returns civilian-recruiter
language. Single Claude call with structured tool-use output. The LLM
authors `rewritten` and `notes` only; the original bullet is attached
deterministically by index so it can never be rewritten or dropped.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from anthropic import AsyncAnthropic

from api.config import get_settings
from api.schemas import RewriteContext, RewriteItem, RewriteRequest, RewriteResponse

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior resume writer specializing in translating U.S. military experience \
into civilian-recruiter language. Your readers are corporate hiring managers and ATS keyword filters \
that do not understand military jargon, ranks, or unit structures.

Rewrite each input bullet so that it:
- Leads with a strong civilian-translatable action verb (Led, Coordinated, Designed, Delivered, \
Trained, Managed, Drove, Reduced, Improved, Engineered, Implemented).
- Replaces military-only terms with civilian equivalents. For example: 'dismounted patrol' becomes \
'small-team operation in unfamiliar terrain'; 'Squad Leader' becomes 'team lead managing 8-12 \
direct reports'; 'OEF/OIF' becomes 'overseas deployment under hostile conditions'.
- Quantifies scope, scale, and outcome ONLY when the original supports it (team size implied by \
rank, time-frame implied by deployment count, etc.). When the original is vague, the rewrite stays \
vague — never fabricate numbers, dollar figures, percentage gains, or outcomes.
- Maintains the original meaning, scope, and tone. Do not exaggerate or invent.
- Drops MOS codes, classified details, and acronyms with no civilian relevance. Keep technical \
acronyms (CDL, PMP, TS/SCI) and tool names that civilian recruiters recognize.
- If a target civilian role is provided in the context, lean the language toward keywords that \
would surface that role's job descriptions, but do not invent skills the original does not imply.

Hard rules:
- Produce exactly one rewrite per input bullet, in the same order.
- Never invent quantitative claims (counts, percentages, dollars, durations) that the original does \
not support. If unsure, omit the number.
- The note field, when set, briefly explains the most material change (jargon translated, scope \
clarified, etc.) in under 120 characters. Use null when no notable change was made.
- Output via the rewrite_bullets tool exactly once."""


REWRITE_TOOL = {
    "name": "rewrite_bullets",
    "description": "Return one rewritten bullet per input bullet, in input order.",
    "input_schema": {
        "type": "object",
        "properties": {
            "rewrites": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "rewritten": {"type": "string"},
                        "notes": {"type": ["string", "null"]},
                    },
                    "required": ["rewritten"],
                },
            }
        },
        "required": ["rewrites"],
    },
}


def _render_context(ctx: RewriteContext | None) -> str:
    if ctx is None:
        return ""
    bits: list[str] = []
    if ctx.pay_grade or ctx.branch or ctx.occupation_code:
        identity = " ".join(
            x for x in (ctx.pay_grade, (ctx.branch or "").replace("_", " ").title(), ctx.occupation_code) if x
        )
        bits.append(f"Veteran: {identity}")
    if ctx.target_role:
        bits.append(f"Target civilian role: {ctx.target_role}")
    if not bits:
        return ""
    return "\n".join(bits) + "\n\n"


def _render_user_message(request: RewriteRequest) -> str:
    header = _render_context(request.context)
    body = "\n".join(f"{i + 1}. {b.strip()}" for i, b in enumerate(request.bullets))
    return f"{header}Bullets to rewrite:\n{body}"


def _extract_tool_payload(response: Any) -> dict[str, Any] | None:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "rewrite_bullets":
            data = block.input
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    return None
            if isinstance(data, dict):
                return data
    return None


def _passthrough(request: RewriteRequest, note: str) -> RewriteResponse:
    return RewriteResponse(
        rewrites=[RewriteItem(original=b, rewritten=b, notes=None) for b in request.bullets],
        notes=note,
    )


async def rewrite(request: RewriteRequest) -> RewriteResponse:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return _passthrough(
            request, "ANTHROPIC_API_KEY is not configured; bullets returned unchanged."
        )

    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=settings.synthesizer_model,
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[REWRITE_TOOL],
            tool_choice={"type": "tool", "name": "rewrite_bullets"},
            messages=[{"role": "user", "content": _render_user_message(request)}],
        )
    except Exception as exc:
        log.warning("rewrite LLM call failed: %s", exc)
        return _passthrough(request, "LLM call failed; bullets returned unchanged.")

    payload = _extract_tool_payload(response)
    if payload is None:
        log.warning("rewrite returned no tool_use block")
        return _passthrough(request, "LLM did not return structured output.")

    return _assemble(request, payload)


def _assemble(request: RewriteRequest, payload: dict[str, Any]) -> RewriteResponse:
    rewrites = payload.get("rewrites") or []
    n = len(request.bullets)
    items: list[RewriteItem] = []
    for i, original in enumerate(request.bullets):
        if i < len(rewrites):
            entry = rewrites[i] or {}
            rewritten = (entry.get("rewritten") or "").strip()
            note = entry.get("notes")
            if not rewritten:
                rewritten = original
                note = note or "LLM returned an empty rewrite."
            items.append(RewriteItem(original=original, rewritten=rewritten, notes=note))
        else:
            items.append(
                RewriteItem(
                    original=original,
                    rewritten=original,
                    notes="LLM returned fewer rewrites than inputs.",
                )
            )
    notes = None
    if len(rewrites) > n:
        notes = f"LLM returned {len(rewrites)} rewrites for {n} bullets; trailing items dropped."
    return RewriteResponse(rewrites=items, notes=notes)
