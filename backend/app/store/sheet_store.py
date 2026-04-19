# app/store/sheet_store.py

# Before: stored the full row dict
# After: only tracks thread_ids — graph is the source of truth

_rows: list[str] = []   # just a list of thread_ids


def add_thread(thread_id: str):
    _rows.append(thread_id)


def get_thread_ids() -> list[str]:
    return _rows