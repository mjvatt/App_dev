"""
Rate limiting for auth and other abuse-prone endpoints.

Uses slowapi (a FastAPI/Starlette adapter for limits). The default backend
is in-memory, which means each uvicorn worker keeps its own counters.
For production behind multiple workers, set RATE_LIMIT_STORAGE_URI in the
environment (e.g., redis://host:6379) so all workers share the same counter.
"""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_storage_uri = os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri,
    default_limits=[],
    headers_enabled=True,
)
