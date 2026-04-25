from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db
from api.models.user import Subscription
from api.schemas.billing import SubscriptionStatusResponse
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


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionStatusResponse:
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return SubscriptionStatusResponse(active=False)
    return SubscriptionStatusResponse(
        active=sub.status == "active",
        tier=sub.tier,
        status=sub.status,
        current_period_end=sub.current_period_end,
    )


@router.post("/webhook", status_code=200)
async def stripe_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = handle_webhook(payload, sig)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload or signature")

    sub_obj = event["data"]["object"]  # type: ignore[index]

    match event.get("type"):
        case "customer.subscription.created":
            metadata = sub_obj.get("metadata") or {}
            user_id = metadata.get("user_id")
            plan = metadata.get("plan") or "monthly"
            if user_id:
                await _upsert_subscription(
                    db,
                    stripe_sub_id=sub_obj["id"],
                    stripe_customer_id=sub_obj["customer"],
                    user_id=user_id,
                    tier=plan,
                    status=sub_obj["status"],
                    current_period_end=datetime.fromtimestamp(
                        sub_obj["current_period_end"], tz=timezone.utc
                    ),
                )
        case "customer.subscription.updated":
            await _update_subscription(
                db,
                stripe_sub_id=sub_obj["id"],
                status=sub_obj["status"],
                current_period_end=datetime.fromtimestamp(
                    sub_obj["current_period_end"], tz=timezone.utc
                ),
            )
        case "customer.subscription.deleted":
            await _update_subscription(
                db,
                stripe_sub_id=sub_obj["id"],
                status="canceled",
                current_period_end=datetime.fromtimestamp(
                    sub_obj.get("current_period_end") or 0, tz=timezone.utc
                ),
            )

    return {"received": True}


async def _upsert_subscription(
    db: AsyncSession,
    stripe_sub_id: str,
    stripe_customer_id: str,
    user_id: str,
    tier: str,
    status: str,
    current_period_end: datetime,
) -> None:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        db.add(
            Subscription(
                user_id=user_id,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_sub_id,
                tier=tier,
                status=status,
                current_period_end=current_period_end,
            )
        )
    else:
        sub.status = status
        sub.current_period_end = current_period_end
    await db.commit()


async def _update_subscription(
    db: AsyncSession,
    stripe_sub_id: str,
    status: str,
    current_period_end: datetime,
) -> None:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return
    sub.status = status
    sub.current_period_end = current_period_end
    await db.commit()
