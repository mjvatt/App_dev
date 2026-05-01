from __future__ import annotations

from collections.abc import Iterable
from functools import lru_cache

from fastembed import TextEmbedding

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
EMBEDDING_DIM = 384
MAX_CORE_TASKS_IN_TEXT = 6


@lru_cache(maxsize=2)
def _model(name: str = DEFAULT_MODEL) -> TextEmbedding:
    return TextEmbedding(model_name=name)


def embed_one(text: str, model_name: str = DEFAULT_MODEL) -> list[float]:
    [vec] = list(_model(model_name).embed([text]))
    return vec.tolist()


def embed_many(texts: Iterable[str], model_name: str = DEFAULT_MODEL) -> list[list[float]]:
    return [v.tolist() for v in _model(model_name).embed(list(texts))]


def build_occupation_embedding_text(
    *,
    title: str,
    description: str,
    top_skills: list[str],
    top_knowledge: list[str],
    job_zone: int | None,
    job_zone_summary: str | None,
    core_tasks: list[str],
) -> str:
    parts = [f"Title: {title}", f"Description: {description}"]
    if top_skills:
        parts.append(f"Top skills: {', '.join(top_skills)}")
    if top_knowledge:
        parts.append(f"Top knowledge areas: {', '.join(top_knowledge)}")
    if job_zone is not None:
        zone_text = f"Job zone {job_zone}"
        if job_zone_summary:
            zone_text += f": {job_zone_summary}"
        parts.append(zone_text)
    if core_tasks:
        # Cap to keep within the 512-token window of bge-small.
        joined = " ".join(core_tasks[:MAX_CORE_TASKS_IN_TEXT])
        parts.append(f"Core tasks: {joined}")
    return "\n".join(parts)
