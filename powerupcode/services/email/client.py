import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from api.config import settings

logger = logging.getLogger(__name__)

_VERIFY_EXPIRY_HOURS = 24
_RESET_EXPIRY_MINUTES = 15


def _build_html(heading: str, username: str, body: str, cta_url: str, cta_text: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
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

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username or None,
        password=settings.smtp_password or None,
        use_tls=settings.smtp_port == 465,
        start_tls=settings.smtp_port != 465,
    )


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
        body=f"click the button below to reset your password. This link expires in {_RESET_EXPIRY_MINUTES} minutes.",
        cta_url=url,
        cta_text="Reset Password",
    )
    await _send(to_email, subject, html, plain)
