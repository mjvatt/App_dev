import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from api.config import settings

logger = logging.getLogger(__name__)

_VERIFY_EXPIRY_HOURS = 24
_RESET_EXPIRY_MINUTES = 15


_BODY_STYLE = (
    "margin:0;padding:0;background:#000000;"
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
)


def _build_html(heading: str, username: str, body: str, cta_url: str, cta_text: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="{_BODY_STYLE}">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#09090b;border:1px solid #27272a;border-radius:12px;">
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">PowerUpCode</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#ffffff;">{heading}</p>
          <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;">Hi {username}, {body}</p>
          <a href="{cta_url}"
             style="display:inline-block;padding:10px 24px;background:#ffffff;color:#000000;
                    font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
            {cta_text}
          </a>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <p style="margin:0;font-size:12px;color:#52525b;">
            If the button does not work, copy this link:<br>
            <a href="{cta_url}" style="color:#a1a1aa;">{cta_url}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def _send(to: str, subject: str, html: str, plain: str) -> None:
    if not settings.smtp_host:
        logger.info("Email (SMTP not configured) → %s | %s\n%s", to, subject, plain)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = to
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_port == 465,
            start_tls=settings.smtp_port != 465,
        )
    except Exception:
        logger.exception("Failed to send email to %s (subject: %s)", to, subject)


async def send_verification_email(to_email: str, username: str, token: str) -> None:
    url = f"{settings.app_url}/verify-email?token={token}"
    subject = "Verify your PowerUpCode email"
    plain = (
        f"Hi {username},\n\n"
        f"Verify your email address by visiting:\n{url}\n\n"
        f"This link expires in {_VERIFY_EXPIRY_HOURS} hours.\n\n"
        "If you did not create a PowerUpCode account, you can ignore this email."
    )
    html = _build_html(
        heading="Verify your email",
        username=username,
        body="click the button below to verify your email address.",
        cta_url=url,
        cta_text="Verify Email",
    )
    await _send(to_email, subject, html, plain)


async def send_reengagement_email(to_email: str, username: str, prior_streak: int) -> None:
    url = f"{settings.app_url}/arcade"
    subject = "Your PowerUpCode streak misses you"
    streak_line = (
        f"You had a {prior_streak}-day streak going. "
        if prior_streak >= 3
        else "You haven't been by in a couple of days. "
    )
    plain = (
        f"Hi {username},\n\n"
        f"{streak_line}One challenge today is enough to start a new streak.\n\n"
        f"Pick up where you left off: {url}\n\n"
        "You're getting this because you previously registered for PowerUpCode and have an "
        "active account. Reply to this email or visit your account settings if you'd "
        "rather not receive these."
    )
    html = _build_html(
        heading="Pick up where you left off",
        username=username,
        body=f"{streak_line}One challenge today is enough to start a new streak.",
        cta_url=url,
        cta_text="Solve a Challenge",
    )
    await _send(to_email, subject, html, plain)


async def send_friend_digest_email(
    to_email: str,
    username: str,
    your_weekly_xp: int,
    your_weekly_passes: int,
    your_friend_rank: int,
    total_friends: int,
    top_movers: list[tuple[str, int, int]],
) -> None:
    """Weekly friend-leaderboard digest. `top_movers` is a list of
    (username, weekly_xp, weekly_passes) ordered by weekly_xp desc."""
    url = f"{settings.app_url}/leaderboard"
    subject = "Your weekly friend leaderboard recap"

    rank_line = (
        f"You're ranked #{your_friend_rank} of {total_friends + 1} "
        "in your friend group."
    )
    you_line = (
        f"This week: {your_weekly_xp} XP from {your_weekly_passes} "
        f"pass{'es' if your_weekly_passes != 1 else ''}."
    )

    plain_movers: list[str] = []
    html_mover_rows: list[str] = []
    for name, w_xp, w_passes in top_movers:
        plain_movers.append(
            f"  - {name}: {w_xp} XP, "
            f"{w_passes} pass{'es' if w_passes != 1 else ''}"
        )
        html_mover_rows.append(
            f'<tr><td style="padding:6px 0;font-size:14px;color:#e4e4e7;">'
            f'<span style="color:#ffffff;font-weight:600;">{name}</span> '
            f'<span style="color:#a1a1aa;">— {w_xp} XP, '
            f"{w_passes} pass{'es' if w_passes != 1 else ''}</span>"
            f"</td></tr>"
        )

    movers_section_plain = (
        "Top movers this week:\n" + "\n".join(plain_movers)
        if plain_movers
        else "Nobody else moved this week — you're the one to chase."
    )
    movers_section_html = (
        '<p style="margin:8px 0 4px;font-size:13px;font-weight:600;'
        'color:#a1a1aa;text-transform:uppercase;letter-spacing:0.1em;">'
        "Top movers this week</p>"
        f'<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">'
        f"{''.join(html_mover_rows)}</table>"
        if html_mover_rows
        else (
            '<p style="margin:8px 0 16px;font-size:14px;color:#a1a1aa;">'
            "Nobody else moved this week — you're the one to chase.</p>"
        )
    )

    plain = (
        f"Hi {username},\n\n"
        f"{rank_line}\n"
        f"{you_line}\n\n"
        f"{movers_section_plain}\n\n"
        f"See the full board: {url}\n\n"
        "You're getting this because you have at least one PowerUpCode "
        "friend. Reply to this email or visit your account settings if "
        "you'd rather not receive these."
    )
    html = _build_html(
        heading="Your weekly friend recap",
        username=username,
        body=f"{rank_line} {you_line}",
        cta_url=url,
        cta_text="Open Leaderboard",
    )
    # Inject the movers section between the body paragraph and the CTA.
    html = html.replace(
        f'<a href="{url}"',
        movers_section_html + f'<a href="{url}"',
        1,
    )
    await _send(to_email, subject, html, plain)


async def send_password_reset_email(to_email: str, username: str, token: str) -> None:
    url = f"{settings.app_url}/reset-password?token={token}"
    subject = "Reset your PowerUpCode password"
    plain = (
        f"Hi {username},\n\n"
        f"Reset your password by visiting:\n{url}\n\n"
        f"This link expires in {_RESET_EXPIRY_MINUTES} minutes.\n\n"
        "If you did not request a password reset, you can ignore this email."
    )
    html = _build_html(
        heading="Reset your password",
        username=username,
        body=(
            "click the button below to reset your password. "
            f"This link expires in {_RESET_EXPIRY_MINUTES} minutes."
        ),
        cta_url=url,
        cta_text="Reset Password",
    )
    await _send(to_email, subject, html, plain)
