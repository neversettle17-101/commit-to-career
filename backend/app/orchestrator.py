import asyncio
import json
import re
from dotenv import load_dotenv

from backend.app.models.state import JobState, Resource, Employee, UserProfile
from backend.app.store.sheet_store import update_state, get_state
from backend.app.agents.researcher import researcher
from backend.app.agents.people import people_finder
from backend.app.agents.drafter import drafter
from backend.app.services.hunter import find_email
from backend.app.services.resend_client import send_email

load_dotenv()

def load_resume() -> str:
    from pypdf import PdfReader
    from backend.app.store.profile_store import RESUME_PATH
    try:
        reader = PdfReader(RESUME_PATH)
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except FileNotFoundError:
        print("[orchestrator] no resume uploaded yet, continuing without it")
        return ""


def _extract_domain(state: JobState, contact: Employee) -> str:
    """Try JD URL first, fall back to company name heuristic."""
    jd = state.job_openings[0] if state.job_openings else None
    if jd and jd.url:
        from urllib.parse import urlparse
        host = urlparse(jd.url).netloc
        # strip www. and return bare domain
        return host.removeprefix("www.") if host else ""
    # heuristic: "Stripe Inc" → "stripe.com"
    return state.company.lower().split()[0] + ".com"


def _parse_json(text: str) -> any:
    # Strip markdown code fences if the LLM wraps output in them
    clean = re.sub(r"```(?:json)?|```", "", text).strip()
    return json.loads(clean)


async def run_pipeline(state: JobState) -> None:
    """
    Coordinates three agents across three explicit workflow patterns.
    Read the pattern labels — they map directly to what you'll study in learning.md.
    """

    # ── PATTERN 1: Sequential ────────────────────────────────────────────────
    # Resume must be loaded before any agent runs — it's a hard dependency.
    # Sequential = one thing at a time, each step feeds the next.
    print(f"[orchestrator] starting pipeline for {state.company}")

    # Snapshot profile into state — agents read from state, not from the store.
    # UserProfile is a domain object; JobState is the pipeline envelope.
    # Adding new profile fields only requires updating UserProfile, not JobState.
    from backend.app.store.profile_store import get_profile
    p = get_profile()
    state.profile = UserProfile(
        name=p.name,
        email=p.email,
        title=p.title,
        location=p.location,
        previous_company=p.previous_company,
        university=p.university,
    )
    state.resume_text = load_resume()
    state.status = "researching"
    update_state(state)

    # ── PATTERN 2: Parallel fan-out ──────────────────────────────────────────
    # Research and people-finding have NO dependency on each other.
    # Both only need (company, role) — inputs available from the start.
    # asyncio.gather runs both agents simultaneously.
    # Wall-clock time = max(research_time, people_time), not their sum.
    prompt = (
        f"Company: {state.company}\n"
        f"Role: {state.role}\n"
        f"Candidate location: {state.profile.location or 'not specified'}\n"
        f"Previous employer: {state.profile.previous_company or 'not provided'}\n"
        f"University: {state.profile.university or 'not provided'}"
    )
    print(f"[orchestrator] running research + people-finding in parallel")

    try:
        research_output, people_output = await asyncio.gather(
            researcher.run(prompt, trace=state.trace),
            people_finder.run(prompt, trace=state.trace),
        )
    except Exception as e:
        state.status = "error"
        state.error = str(e)
        update_state(state)
        return

    # Parse research output
    try:
        research_data = _parse_json(research_output)
        if research_data.get("company_overview") == "COMPANY_NOT_FOUND":
            state.status = "error"
            state.error = f"Could not find company: {state.company}"
            update_state(state)
            return
        state.company_overview = research_data.get("company_overview", "")
        raw_links = research_data.get("external_links", [])
        state.external_links = [Resource(**l) for l in raw_links if isinstance(l, dict)]
        raw_jobs = research_data.get("job_openings", [])
        state.job_openings = [Resource(**j) for j in raw_jobs if isinstance(j, dict)]
        # Fallback: if researcher put jd entries in external_links, migrate them
        if not state.job_openings:
            jd_links = [l for l in state.external_links if l.type == "jd"]
            state.external_links = [l for l in state.external_links if l.type != "jd"]
            state.job_openings = jd_links
    except Exception:
        # Agent returned non-JSON — use raw text as overview, no links
        state.company_overview = research_output
        state.external_links = []
        state.job_openings = []

    # Parse people output
    try:
        people_data = _parse_json(people_output)
        state.employees = [Employee(**p) for p in people_data if isinstance(p, dict)]
    except Exception:
        state.employees = []

    # ── PATTERN 3: Drafting ──────────────────────────────────────────────────
    state.status = "drafting"
    update_state(state)

    top_contact = state.employees[0] if state.employees else Employee(name="Hiring Manager", title="")
    jd_resource = state.job_openings[0] if state.job_openings else None

    draft_prompt = f"""Company overview: {state.company_overview}

Target contact: {top_contact.name} — {top_contact.title}
Role I'm targeting: {state.role}
Job posting URL: {jd_resource.url if jd_resource else "(not found)"}

Job description:
{jd_resource.content if jd_resource and jd_resource.content else "(not available)"}

About me:
Name: {state.profile.name or "(not set)"}
Current title: {state.profile.title or "(not set)"}
Location: {state.profile.location or "(not set)"}

My resume:
{state.resume_text or "(no resume provided)"}"""

    try:
        state.message = await drafter.run(draft_prompt, trace=state.trace)
    except Exception as e:
        state.status = "error"
        state.error = str(e)
        update_state(state)
        return

    # ── Email lookup (Hunter.io) ─────────────────────────────────────────────
    state.status = "finding_email"
    update_state(state)

    domain = _extract_domain(state, top_contact)
    parts  = top_contact.name.strip().split(" ", 1)
    first  = parts[0]
    last   = parts[1] if len(parts) > 1 else ""
    state.contact_email = find_email(first, last, domain)

    # ── HITL gate: review email + message before sending ────────────────────
    # Sending is irreversible — always require explicit user approval.
    state.status = "awaiting_send_approval"
    update_state(state)
    print(f"[orchestrator] waiting for send approval on thread {state.thread_id}")

    while True:
        await asyncio.sleep(2)
        current = get_state(state.thread_id)
        if current is None:
            return
        if current.send_approved:
            state = current
            break

    # ── Send via Resend ──────────────────────────────────────────────────────
    state.status = "sending"
    update_state(state)

    try:
        send_email(
            to=state.contact_email,
            subject=f"Reaching out — {state.role} at {state.company}",
            body=state.message,
        )
        state.status = "sent"
        state.tags = list(set(state.tags + ["email_sent"]))
    except Exception as e:
        state.status = "send_failed"
        state.error = str(e)

    update_state(state)
    print(f"[orchestrator] pipeline complete for {state.company}")
