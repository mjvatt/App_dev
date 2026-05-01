import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user, get_db, require_verified_user
from api.models.user import ProcessedStripeEvent, Subscription
from api.schemas.billing import SubscriptionStatusResponse
from services.analytics import Events as AnalyticsEvents
from services.analytics import capture as analytics_capture
from services.billing.stripe_client import create_checkout_session, handle_webhook

logger = logging.getLogger(__name__)

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
    user_id: Annotated[str, Depends(require_verified_user)],
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

    event_id = event.get("id")
    if not event_id:
        # Stripe always sends an id; treat its absence as a malformed payload.
        raise HTTPException(status_code=400, detail="Missing event id")

    # Atomic dedupe: try to claim the event_id. If another concurrent delivery
    # already inserted it, rowcount == 0 and we ack without re-processing.
    claim = await db.execute(
        pg_insert(ProcessedStripeEvent)
        .values(event_id=event_id)
        .on_conflict_do_nothing(index_elements=["event_id"])
    )
    if claim.rowcount == 0:
        await db.rollback()
        logger.info("Stripe event %s already processed; skipping", event_id)
        return {"received": True, "duplicate": True}

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
                        sub_obj["current_period_end"], tz=UTC
                    ),
                )
                if sub_obj["status"] in ("active", "trialing"):
                    analytics_capture(
                        user_id,
                        AnalyticsEvents.SubscriptionActivated,
                        {"tier": plan, "stripe_status": sub_obj["status"]},
                    )
        case "customer.subscription.updated":
            await _update_subscription(
                db,
                stripe_sub_id=sub_obj["id"],
                status=sub_obj["status"],
                current_period_end=datetime.fromtimestamp(
                    sub_obj["current_period_end"], tz=UTC
                ),
            )
        case "customer.subscription.deleted":
            stripe_period_end = sub_obj.get("current_period_end")
            await _update_subscription(
                db,
                stripe_sub_id=sub_obj["id"],
                status="canceled",
                current_period_end=(
                    datetime.fromtimestamp(stripe_period_end, tz=UTC)
                    if stripe_period_end
                    else None
                ),
            )
            owner = await _user_id_for_subscription(db, sub_obj["id"])
            if owner:
                analytics_capture(
                    owner,
                    AnalyticsEvents.SubscriptionCanceled,
                    {"stripe_subscription_id": sub_obj["id"]},
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


async def _user_id_for_subscription(
    db: AsyncSession, stripe_sub_id: str
) -> str | None:
    """Look up the owning user_id for a Stripe subscription. Used by the
    cancellation analytics hook where the webhook payload doesn't carry
    the user_id metadata directly."""
    result = await db.execute(
        select(Subscription.user_id).where(
            Subscription.stripe_subscription_id == stripe_sub_id
        )
    )
    return result.scalar_one_or_none()


async def _update_subscription(
    db: AsyncSession,
    stripe_sub_id: str,
    status: str,
    current_period_end: datetime | None,
) -> None:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return
    sub.status = status
    if current_period_end is not None:
        sub.current_period_end = current_period_end
    await db.commit()
