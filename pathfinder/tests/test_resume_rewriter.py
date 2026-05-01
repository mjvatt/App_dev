from types import SimpleNamespace

from api.schemas import RewriteContext, RewriteRequest
from services.agents.resume_rewriter import (
    REWRITE_TOOL,
    SYSTEM_PROMPT,
    _assemble,
    _extract_tool_payload,
    _passthrough,
    _render_context,
    _render_user_message,
)


def _request(bullets=None, context=None) -> RewriteRequest:
    return RewriteRequest(
        bullets=bullets or ["Conducted dismounted patrols.", "Led a 9-soldier squad."],
        context=context,
    )


def test_system_prompt_forbids_invention() -> None:
    assert "Never invent" in SYSTEM_PROMPT
    assert "fabricate" in SYSTEM_PROMPT
    assert "rewrite_bullets" in SYSTEM_PROMPT


def test_rewrite_tool_schema() -> None:
    assert REWRITE_TOOL["name"] == "rewrite_bullets"
    item = REWRITE_TOOL["input_schema"]["properties"]["rewrites"]["items"]
    assert "rewritten" in item["required"]
    # 'notes' is optional; only 'rewritten' is required
    assert item["required"] == ["rewritten"]


def test_render_context_omits_when_none() -> None:
    assert _render_context(None) == ""


def test_render_context_includes_identity_and_target() -> None:
    ctx = RewriteContext(
        branch="army", occupation_code="11B", pay_grade="E-5",
        target_role="Training Specialist",
    )
    text = _render_context(ctx)
    assert "E-5" in text
    assert "Army" in text
    assert "11B" in text
    assert "Training Specialist" in text


def test_render_context_handles_partial_fields() -> None:
    ctx = RewriteContext(target_role="Police Officer")
    text = _render_context(ctx)
    assert "Police Officer" in text
    assert "Veteran:" not in text


def test_render_user_message_numbers_bullets() -> None:
    text = _render_user_message(_request())
    assert "1. Conducted dismounted patrols." in text
    assert "2. Led a 9-soldier squad." in text


def test_extract_tool_payload_dict_input() -> None:
    block = SimpleNamespace(
        type="tool_use", name="rewrite_bullets",
        input={"rewrites": [{"rewritten": "x"}]},
    )
    response = SimpleNamespace(content=[block])
    assert _extract_tool_payload(response) == {"rewrites": [{"rewritten": "x"}]}


def test_extract_tool_payload_string_input() -> None:
    block = SimpleNamespace(
        type="tool_use", name="rewrite_bullets",
        input='{"rewrites": []}',
    )
    response = SimpleNamespace(content=[block])
    assert _extract_tool_payload(response) == {"rewrites": []}


def test_extract_tool_payload_wrong_tool_name() -> None:
    block = SimpleNamespace(
        type="tool_use", name="other_tool", input={"rewrites": []}
    )
    response = SimpleNamespace(content=[block])
    assert _extract_tool_payload(response) is None


def test_assemble_pairs_originals_to_rewrites_by_index() -> None:
    req = _request()
    payload = {
        "rewrites": [
            {"rewritten": "Led small-team operations in unfamiliar terrain.",
             "notes": "Translated 'dismounted patrol'."},
            {"rewritten": "Led a 9-person team executing time-critical operations.",
             "notes": None},
        ]
    }
    resp = _assemble(req, payload)
    assert len(resp.rewrites) == 2
    assert resp.rewrites[0].original == "Conducted dismounted patrols."
    assert "small-team operations" in resp.rewrites[0].rewritten
    assert resp.rewrites[0].notes is not None
    assert resp.rewrites[1].notes is None
    assert resp.notes is None


def test_assemble_handles_fewer_rewrites_than_inputs() -> None:
    req = _request(bullets=["a", "b", "c"])
    payload = {"rewrites": [{"rewritten": "A"}]}
    resp = _assemble(req, payload)
    assert resp.rewrites[0].rewritten == "A"
    assert resp.rewrites[1].original == "b" and resp.rewrites[1].rewritten == "b"
    assert resp.rewrites[1].notes == "LLM returned fewer rewrites than inputs."
    assert resp.rewrites[2].rewritten == "c"


def test_assemble_handles_extra_rewrites_with_top_level_note() -> None:
    req = _request(bullets=["a"])
    payload = {"rewrites": [{"rewritten": "A"}, {"rewritten": "B"}]}
    resp = _assemble(req, payload)
    assert len(resp.rewrites) == 1
    assert resp.notes is not None and "trailing items dropped" in resp.notes


def test_assemble_handles_empty_rewritten_string() -> None:
    req = _request(bullets=["a"])
    payload = {"rewrites": [{"rewritten": "  ", "notes": None}]}
    resp = _assemble(req, payload)
    assert resp.rewrites[0].rewritten == "a"
    assert "empty rewrite" in (resp.rewrites[0].notes or "")


def test_passthrough_returns_originals_with_note() -> None:
    req = _request()
    resp = _passthrough(req, "no key")
    assert resp.notes == "no key"
    assert all(r.original == r.rewritten for r in resp.rewrites)
    assert all(r.notes is None for r in resp.rewrites)
