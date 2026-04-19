from pydantic import BaseModel, Field
from typing import Literal, Optional


class Resource(BaseModel):
    name: str
    url: str
    type: Literal["blog", "article", "github", "linkedin"]


class Employee(BaseModel):
    name: str
    title: str
    linkedin_url: str = ""


class JobState(BaseModel):
    # ── Inputs ────────────────────────────────────────────────────────────────
    thread_id: str
    company: str
    role: str
    resume_text: str = ""

    # ── Filled in by agents ───────────────────────────────────────────────────
    company_overview: str = ""
    external_links: list[Resource] = Field(default_factory=list)
    employees: list[Employee] = Field(default_factory=list)
    message: str = ""

    # ── Control flow ──────────────────────────────────────────────────────────
    # Valid values: pending | researching | finding_people |
    #               awaiting_review | drafting | done | error
    status: str = "pending"
    error: Optional[str] = None

    # Human-in-the-loop gate — set to True by POST /rows/{id}/approve
    approved: bool = False
