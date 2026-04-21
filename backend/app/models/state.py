from pydantic import BaseModel, Field
from typing import Literal, Optional


class Resource(BaseModel):
    name: str
    url: str
    type: Literal["blog", "article", "github", "linkedin", "jd"]
    content: Optional[str] = None  # full text for jd type; None for regular links


class UserProfile(BaseModel):
    name: str = ""
    email: str = ""
    title: str = ""
    location: str = ""
    previous_company: str = ""
    university: str = ""


class Employee(BaseModel):
    name: str
    title: str
    linkedin_url: str = ""
    warm: bool = False


class TraceEvent(BaseModel):
    ts: str     # ISO timestamp
    agent: str  # which agent emitted this
    kind: str   # "start" | "tool_call" | "tool_result" | "finish" | "error"
    data: str   # query, result snippet, error message, or output summary


class JobState(BaseModel):
    # ── Inputs ────────────────────────────────────────────────────────────────
    thread_id: str
    company: str
    role: str
    resume_text: str = ""

    # ── User profile snapshot (copied from profile store at pipeline start) ───
    profile: UserProfile = Field(default_factory=UserProfile)

    # ── Filled in by agents ───────────────────────────────────────────────────
    company_overview: str = ""
    external_links: list[Resource] = Field(default_factory=list)
    employees: list[Employee] = Field(default_factory=list)
    message: str = ""

    # ── Tags (queryable via Postgres GIN index) ───────────────────────────────
    # e.g. ["message_sent", "interview_scheduled", "fintech", "rejected"]
    tags: list[str] = Field(default_factory=list)

    # ── Observability ─────────────────────────────────────────────────────────
    trace: list[TraceEvent] = Field(default_factory=list)

    # ── Control flow ──────────────────────────────────────────────────────────
    # Valid values: pending | researching | finding_people |
    #               awaiting_review | drafting | done | error
    status: str = "pending"
    error: Optional[str] = None

    # Human-in-the-loop gate — set to True by POST /rows/{id}/approve
    approved: bool = False
