from typing import Optional
from backend.app.models.state import JobState
from backend.app.store.db import upsert_job, get_job, get_all_jobs, update_job_status


def _upsert(state: JobState) -> None:
    upsert_job(
        thread_id=state.thread_id,
        company=state.company,
        role=state.role,
        status=state.status,
        tags=state.tags if hasattr(state, "tags") else [],
        state_json=state.model_dump_json(),
    )


def add_state(state: JobState) -> None:
    _upsert(state)


def update_state(state: JobState) -> None:
    _upsert(state)


def get_state(thread_id: str) -> Optional[JobState]:
    raw = get_job(thread_id)
    return JobState.model_validate_json(raw) if raw else None


def get_all_states() -> list[JobState]:
    return [JobState.model_validate_json(r) for r in get_all_jobs()]


def approve(thread_id: str) -> bool:
    raw = get_job(thread_id)
    if not raw:
        return False
    state = JobState.model_validate_json(raw)
    state.approved = True
    _upsert(state)
    return True
