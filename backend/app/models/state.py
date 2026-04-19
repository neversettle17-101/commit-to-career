from typing import TypedDict, List, Optional, Literal

class Resource(TypedDict):
    name: str
    url: str
    type: Literal["blog", "article", "github", "linkedin"]

class RecruitState(TypedDict):
    # inputs
    company: str
    role: str
    resume_text: str          # loaded once at startup

    # filled in by agents
    company_overview: str        # what the company does, culture, stage
    external_links: List[Resource]  # external links for blogs etc 

    employees: List[Resource]     # People finder writes this  [ {name, title, linkedin} ]
    message: str              # Message agent writes this

    # control flow
    status: str               # "researching" | "finding_people" | "drafting" | "awaiting_review" | "done" | "error"
    error: Optional[str]