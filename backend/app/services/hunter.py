import os
import requests


def find_email(first_name: str, last_name: str, domain: str) -> str:
    """
    Look up an email address via Hunter.io's email-finder API.
    Returns the email string on success, empty string if not found or on any error.
    Never raises — a missing email should not crash the pipeline.
    """
    api_key = os.getenv("HUNTER_API_KEY", "")
    if not api_key or not domain:
        return ""

    try:
        resp = requests.get(
            "https://api.hunter.io/v2/email-finder",
            params={
                "domain":     domain,
                "first_name": first_name,
                "last_name":  last_name,
                "api_key":    api_key,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("email") or ""
    except Exception:
        return ""
