# app/routes/rows.py
import uuid
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from backend.app.store.sheet_store import add_thread, get_thread_ids
from backend.app.graph import recruiter_graph

router = APIRouter()


class CreateRowRequest(BaseModel):
    company: str
    role: str

# ── POST /rows ────────────────────────────────────────────────────────────────

@router.post("/rows")
def create_row(req: CreateRowRequest, background_tasks: BackgroundTasks):
    thread_id = str(uuid.uuid4())
    config    = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "company":          req.company,
        "role":             req.role,
        "resume_text":      "",      # ← empty — resume_node fills this
        "company_overview": "",
        "external_links":   [],
        "employees":        [],
        "message":          "",
        "status":           "researching",
        "error":            None,
    }
    # Save thread_id immediately so GET /rows can see the row straight away
    add_thread(thread_id)
    
    def run_graph():
        recruiter_graph.invoke(initial_state, config)
    # Run graph in background — POST returns instantly, graph runs async
    background_tasks.add_task(run_graph)

    return {"thread_id": thread_id, "status": "researching"}


# ── GET /rows ─────────────────────────────────────────────────────────────────

@router.get("/rows")
def fetch_rows():
    rows = []

    for thread_id in get_thread_ids():
        config   = {"configurable": {"thread_id": thread_id}}
        snapshot = recruiter_graph.get_state(config)

        # snapshot.values is empty if graph hasn't started yet
        if not snapshot.values:
            rows.append({"thread_id": thread_id, "status": "pending"})
            continue

        state = snapshot.values
        rows.append({
            "thread_id":        thread_id,
            "company":          state.get("company"),
            "role":             state.get("role"),
            "status":           state.get("status"),
            "company_overview": state.get("company_overview"),
            "external_links":   state.get("external_links", []),
            "employees":        state.get("employees", []),
            "message":          state.get("message"),
            "error":            state.get("error"),
        })

    return rows