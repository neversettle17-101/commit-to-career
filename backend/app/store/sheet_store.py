from typing import Optional
from backend.app.models.state import JobState

_store: dict[str, JobState] = {}


def add_state(state: JobState) -> None:
    _store[state.thread_id] = state


def update_state(state: JobState) -> None:
    _store[state.thread_id] = state


def get_state(thread_id: str) -> Optional[JobState]:
    return _store.get(thread_id)


def get_all_states() -> list[JobState]:
    return list(_store.values())


def approve(thread_id: str) -> bool:
    state = _store.get(thread_id)
    if not state:
        return False
    state.approved = True
    return True
