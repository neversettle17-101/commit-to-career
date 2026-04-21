import os
import resend


def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send a plain-text email via Resend.
    RESEND_FROM_EMAIL must be a verified sender in your Resend dashboard.
    Raises on failure so the orchestrator can mark status = "send_failed".
    """
    resend.api_key = os.getenv("RESEND_API_KEY", "")
    from_email = os.getenv("RESEND_FROM_EMAIL", "")

    resend.Emails.send({
        "from":    from_email,
        "to":      [to],
        "subject": subject,
        "text":    body,
    })
    return True
