import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from backend.app.models.state import JobState
from backend.app.store.sheet_store import add_state, get_all_states, approve
from backend.app.orchestrator import run_pipeline

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
