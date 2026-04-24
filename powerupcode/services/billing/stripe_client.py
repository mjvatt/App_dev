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
    session = stripe.checkout.Session.create(
        client_reference_id=user_id,
        payment_method_types=["card"],
        line_items=[{"price": _PRICE_IDS[plan], "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url or ""


async def handle_webhook(payload: bytes, sig_header: str) -> dict:  # type: ignore[type-arg]
    return stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
