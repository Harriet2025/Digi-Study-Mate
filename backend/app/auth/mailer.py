"""Sends account emails over SMTP (e.g. Gmail with an app password)."""

import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

logger = logging.getLogger("study_mate.mail")


def email_enabled() -> bool:
    s = get_settings()
    return bool(s.smtp_user and s.smtp_password)


def send_password_reset(to: str, name: str, link: str) -> None:
    s = get_settings()
    if not email_enabled():
        if s.app_url.startswith("http://localhost"):
            # Local development without email set up: show the link in the server log instead.
            logger.warning("Email not configured. Password reset link for %s: %s", to, link)
        else:
            logger.error("Password reset requested but SMTP_USER / SMTP_PASSWORD are not set.")
        return

    message = EmailMessage()
    message["Subject"] = "Reset your Study Mate password"
    message["From"] = s.email_from or f"Study Mate <{s.smtp_user}>"
    message["To"] = to
    message.set_content(
        f"Hi {name},\n\n"
        "Someone asked to reset the password for your Study Mate account. If it was you, open this link "
        f"within the next hour to choose a new password:\n\n{link}\n\n"
        "If you didn't ask for this, you can ignore this email; your password won't change.\n\n"
        "Study Mate"
    )
    message.add_alternative(
        f"""<div style="font-family:Arial,sans-serif;font-size:15px;color:#111827;line-height:1.6;max-width:480px">
  <p>Hi {name},</p>
  <p>Someone asked to reset the password for your Study Mate account. If it was you, choose a new password within the next hour:</p>
  <p><a href="{link}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">Reset password</a></p>
  <p style="color:#4b5563;font-size:13px">If you didn't ask for this, you can ignore this email; your password won't change.</p>
</div>""",
        subtype="html",
    )
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as err:
        logger.error("Could not send the password reset email: %r", err)
