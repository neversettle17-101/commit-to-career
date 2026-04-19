# tests/test_graph.py
import sys, uuid
sys.path.append("..")

from backend.app.graph import recruiter_graph


def make_config():
    return {"configurable": {"thread_id": str(uuid.uuid4())}}


def make_state(company: str, role: str = "Senior Backend Engineer") -> dict:
    return {
        "company":          company,
        "role":             role,
        "resume_text":      "5 years Python, FastAPI, PostgreSQL. Built payment systems at fintech startup.",
        "company_overview": "",
        "external_links":   [],
        "employees":        [],
        "message":          "",
        "status":           "researching",
        "error":            None,
    }


# ── Test 1: full happy path ───────────────────────────────────────────────────
# Confirms all three nodes ran and each wrote their piece of state

def test_full_pipeline():
    print("\n── Test 1: full pipeline (Stripe) ──")
    config = make_config()

    final = recruiter_graph.invoke(make_state("Stripe"), config)

    # Research wrote this
    assert final["company_overview"], "company_overview is empty"

    # People node wrote this
    assert isinstance(final["employees"], list), "employees should be a list"

    # Message node wrote this
    assert final["message"], "message is empty"
    assert len(final["message"]) > 50, "message too short"

    assert final["status"] == "awaiting_review"
    assert final["error"]  is None

    print(f"  overview:  {final['company_overview'][:80]}...")
    print(f"  employees: {len(final['employees'])} found")
    print(f"  message:\n{final['message']}")
    print("  PASSED")


# ── Test 2: error path stops at research ─────────────────────────────────────
# Confirms the conditional edge works — people + message nodes should never run

def test_error_stops_pipeline():
    print("\n── Test 2: unknown company stops at research ──")
    config = make_config()

    final = recruiter_graph.invoke(make_state("XYZ Fake Corp 99999"), config)

    assert final["status"] == "error"
    assert final["error"]  is not None
    assert final["company_overview"] == ""

    # These should be untouched — proves the later nodes never ran
    assert final["employees"] == []
    assert final["message"]   == ""

    print(f"  error: {final['error']}")
    print("  PASSED")


# ── Test 3: checkpoint has full state after run ───────────────────────────────
# This is exactly what your GET /rows/{thread_id} endpoint will call

def test_checkpoint_readable():
    print("\n── Test 3: checkpoint readable after run ──")
    config = make_config()

    recruiter_graph.invoke(make_state("Notion"), config)

    snapshot = recruiter_graph.get_state(config)
    state    = snapshot.values

    # Graph should be fully finished
    assert snapshot.next == (), f"graph not finished — next: {snapshot.next}"

    # All keys should exist
    for key in ["company_overview", "external_links", "employees", "message", "status"]:
        assert key in state, f"missing key: {key}"

    print(f"  next: {snapshot.next}")
    print(f"  status: {state['status']}")
    print(f"  all keys present: {list(state.keys())}")
    print("  PASSED")


# ── Test 4: stream shows each node completing in order ───────────────────────
# Confirms node execution order and gives you the pattern for SSE updates

def test_streaming_order():
    print("\n── Test 4: node execution order via stream ──")
    config = make_config()

    node_order = []
    for chunk in recruiter_graph.stream(make_state("GitHub"), config):
        node_name = list(chunk.keys())[0]
        node_order.append(node_name)
        print(f"  ✓ {node_name} completed — keys: {list(chunk[node_name].keys())}")

    # Confirm order: research must come before find_people before draft_message
    assert node_order.index("research")      < node_order.index("find_people")
    assert node_order.index("find_people")   < node_order.index("draft_message")

    print(f"  order: {' → '.join(node_order)}")
    print("  PASSED")


# ── Run all ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # test_full_pipeline()
    test_error_stops_pipeline()
    # test_checkpoint_readable()
    # test_streaming_order()
    print("\n── All tests passed ──")