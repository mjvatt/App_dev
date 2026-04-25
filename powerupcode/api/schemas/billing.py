from datetime import datetime

from pydantic import BaseModel


class SubscriptionStatusResponse(BaseModel):
    active: bool
    tier: str | None = None
    status: str | None = None
    current_period_end: datetime | None = None
