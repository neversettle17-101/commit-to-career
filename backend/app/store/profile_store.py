from pathlib import Path
from pydantic import BaseModel
from backend.app.store.db import upsert_profile, get_profile_json

UPLOADS_DIR = Path(__file__).parents[3] / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

RESUME_PATH = UPLOADS_DIR / "resume.pdf"


class ProfileData(BaseModel):
    name: str = ""
    email: str = ""
    title: str = ""
    location: str = ""
    previous_company: str = ""
    university: str = ""
    resume_filename: str = ""

    @property
    def has_resume(self) -> bool:
        return RESUME_PATH.exists()


def get_profile() -> ProfileData:
    raw = get_profile_json()
    return ProfileData.model_validate_json(raw) if raw else ProfileData()


def update_profile(
    name: str = "",
    email: str = "",
    title: str = "",
    location: str = "",
    previous_company: str = "",
    university: str = "",
    resume_filename: str = "",
) -> ProfileData:
    current = get_profile()
    updated = ProfileData(
        name=name or current.name,
        email=email or current.email,
        title=title or current.title,
        location=location or current.location,
        previous_company=previous_company or current.previous_company,
        university=university or current.university,
        resume_filename=resume_filename or current.resume_filename,
    )
    upsert_profile(updated.model_dump_json())
    return updated
