import asyncio

import stripe

from api.config import settings

stripe.api_key = settings.stripe_secret_key

_PRICE_IDS: dict[str, str] = {
    "weekly": settings.stripe_price_weekly,
    "monthly": settings.stripe_price_monthly,
    "annual": settings.stripe_price_annual,
}


async def create_checkout_session(
    user_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
) -> str:
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        client_reference_id=user_id,
        payment_method_types=["card"],
        line_items=[{"price": _PRICE_IDS[plan], "quantity": 1}],
        mode="subscription",
        subscription_data={"metadata": {"user_id": user_id, "plan": plan}},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url or ""


def handle_webhook(payload: bytes, sig_header: str) -> stripe.Event:
    try:
        return stripe.Webhook.construct_event(  # type: ignore[return-value]
            payload, sig_header, settings.stripe_webhook_secret
        )
    except (stripe.error.SignatureVerificationError, ValueError) as exc:
        raise ValueError(str(exc)) from exc
