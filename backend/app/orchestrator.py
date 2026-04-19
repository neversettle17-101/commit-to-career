import asyncio
import json
import re
from dotenv import load_dotenv

from backend.app.models.state import JobState, Resource, Employee
from backend.app.store.sheet_store import update_state, get_state
from backend.app.agents.researcher import researcher
from backend.app.agents.people import people_finder
from backend.app.agents.drafter import drafter

load_dotenv()

RESUME_PATH = "resume.pdf"


def load_resume() -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(RESUME_PATH)
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except FileNotFoundError:
        print(f"[orchestrator] resume not found at {RESUME_PATH}, continuing without it")
        return ""


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
    state.resume_text = load_resume()
    state.status = "researching"
    update_state(state)

    # ── PATTERN 2: Parallel fan-out ──────────────────────────────────────────
    # Research and people-finding have NO dependency on each other.
    # Both only need (company, role) — inputs available from the start.
    # asyncio.gather runs both agents simultaneously.
    # Wall-clock time = max(research_time, people_time), not their sum.
    prompt = f"Company: {state.company}\nRole: {state.role}"
    print(f"[orchestrator] running research + people-finding in parallel")

    try:
        research_output, people_output = await asyncio.gather(
            researcher.run(prompt),
            people_finder.run(prompt),
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
    except Exception:
        # Agent returned non-JSON — use raw text as overview, no links
        state.company_overview = research_output
        state.external_links = []

    # Parse people output
    try:
        people_data = _parse_json(people_output)
        state.employees = [Employee(**p) for p in people_data if isinstance(p, dict)]
    except Exception:
        state.employees = []

    # ── PATTERN 3: Human-in-the-loop ────────────────────────────────────────
    # The pipeline SUSPENDS here. The frontend shows the research and contacts.
    # The user reviews, edits if needed, then clicks Approve.
    # POST /rows/{thread_id}/approve sets state.approved = True in the store.
    # This polling loop re-reads the store every 2 seconds until approved.
    #
    # Why suspend instead of auto-draft? Because letting an agent send a message
    # without human review is the most common mistake in agentic systems.
    state.status = "awaiting_review"
    update_state(state)
    print(f"[orchestrator] waiting for human approval on thread {state.thread_id}")

    while True:
        await asyncio.sleep(2)
        current = get_state(state.thread_id)
        if current is None:
            return
        if current.approved:
            state = current
            break

    # ── Resume after approval ────────────────────────────────────────────────
    state.status = "drafting"
    update_state(state)

    top_contact = state.employees[0] if state.employees else Employee(name="Hiring Manager", title="")
    draft_prompt = f"""Company overview: {state.company_overview}

Target contact: {top_contact.name} — {top_contact.title}
Role I'm targeting: {state.role}

My resume:
{state.resume_text or "(no resume provided)"}"""

    try:
        state.message = await drafter.run(draft_prompt)
        state.status = "done"
    except Exception as e:
        state.status = "error"
        state.error = str(e)

    update_state(state)
    print(f"[orchestrator] pipeline complete for {state.company}")
