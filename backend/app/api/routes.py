import uuid
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form

from backend.app.models.state import JobState
from backend.app.store.sheet_store import add_state, get_all_states, approve
from backend.app.store.profile_store import get_profile, update_profile, RESUME_PATH
from backend.app.orchestrator import run_pipeline
from pydantic import BaseModel

router = APIRouter()


class CreateRowRequest(BaseModel):
    company: str
    role: str


@router.post("/rows")
async def create_row(req: CreateRowRequest, background_tasks: BackgroundTasks):
    thread_id = str(uuid.uuid4())
    state = JobState(thread_id=thread_id, company=req.company, role=req.role)
    add_state(state)
    # run_pipeline is async — FastAPI's BackgroundTasks handles it correctly.
    background_tasks.add_task(run_pipeline, state)
    return {"thread_id": thread_id, "status": "pending"}


@router.get("/rows")
def fetch_rows():
    return [s.model_dump() for s in get_all_states()]


@router.post("/rows/{thread_id}/approve")
def approve_row(thread_id: str):
    """
    Human-in-the-loop gate.
    Sets approved=True in the store so the suspended pipeline resumes.
    """
    if not approve(thread_id):
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"thread_id": thread_id, "approved": True}


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile")
def fetch_profile():
    p = get_profile()
    return {**p.model_dump(), "has_resume": p.has_resume}


@router.post("/profile")
async def save_profile(
    name:             str = Form(""),
    email:            str = Form(""),
    title:            str = Form(""),
    location:         str = Form(""),
    previous_company: str = Form(""),
    university:       str = Form(""),
    resume: Optional[UploadFile] = File(None),
):
    resume_filename = ""
    if resume and resume.filename:
        contents = await resume.read()
        RESUME_PATH.write_bytes(contents)
        resume_filename = resume.filename

    profile = update_profile(
        name=name, email=email, title=title, location=location,
        previous_company=previous_company, university=university,
        resume_filename=resume_filename,
    )
    return {**profile.model_dump(), "has_resume": profile.has_resume}
