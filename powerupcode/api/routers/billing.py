from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.dependencies import get_current_user
from services.billing.stripe_client import create_checkout_session, handle_webhook

router = APIRouter()

_VALID_PLANS = {"weekly", "monthly", "annual"}


class CheckoutRequest(BaseModel):
    plan: str
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    url: str


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    user_id: Annotated[str, Depends(get_current_user)],
) -> CheckoutResponse:
    if body.plan not in _VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"plan must be one of {_VALID_PLANS}")
    url = await create_checkout_session(user_id, body.plan, body.success_url, body.cancel_url)
    return CheckoutResponse(url=url)


@router.post("/webhook", status_code=200)
async def stripe_webhook(request: Request) -> dict[str, bool]:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = await handle_webhook(payload, sig)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    match event.get("type"):
        case "customer.subscription.created" | "customer.subscription.updated":
            pass  # upsert subscription record
        case "customer.subscription.deleted":
            pass  # mark subscription inactive

    return {"received": True}
