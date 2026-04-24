import os

from services.engine.interface import GameEngine

_engine: GameEngine | None = None


def get_engine() -> GameEngine:
    global _engine
    if _engine is None:
        _engine = _init_engine()
    return _engine


def _init_engine() -> GameEngine:
    module = os.getenv("ENGINE_MODULE", "stub")
    if module == "stub":
        from services.engine.stub import StubEngine
        return StubEngine()
    # engine-core implementation loaded here in production
    raise ImportError(f"Unknown ENGINE_MODULE: {module!r}")
