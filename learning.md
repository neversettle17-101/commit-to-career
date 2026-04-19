# Learning Log

Each entry documents a tech decision made in this project and the concepts behind it.

---

## 1. Agent State with TypedDict (LangGraph)

**Decision:** `RecruitState` in `models/state.py` is a Python `TypedDict`. Every node in the graph reads from and writes to this single shared object.

**Why:** LangGraph passes state through the graph immutably — each node receives the current state and returns a partial update (dict). LangGraph merges the update back. This avoids shared mutable state bugs and makes the flow easy to trace.

**Concepts to read:**
- [LangGraph: State Management](https://langchain-ai.github.io/langgraph/concepts/low_level/#state)
- [TypedDict in Python](https://docs.python.org/3/library/typing.html#typing.TypedDict)
- Blog: [How LangGraph manages state across nodes](https://blog.langchain.dev/langgraph/)

---

## 2. Sequential Agent Pipeline (Linear Graph)

**Decision:** Nodes are wired in a fixed sequence: `load_resume → research → find_people → draft_message`. Each node does one job and hands off.

**Why:** For a well-defined, ordered task (research → people → message) a linear graph is simpler and easier to debug than a dynamic one. Conditional edges handle error routing without branching every step.

**Concepts to read:**
- [LangGraph: Building graphs](https://langchain-ai.github.io/langgraph/concepts/low_level/#graphs)
- [LangGraph: Conditional edges](https://langchain-ai.github.io/langgraph/concepts/low_level/#conditional-edges)
- Blog: [Agentic design patterns — ReAct, Plan-and-Execute, sequential pipelines](https://www.deeplearning.ai/the-batch/agentic-design-patterns-part-1-overview/)

---

## 3. Async Background Task + Polling (Agent ↔ API communication)

**Decision:** `POST /rows` returns immediately with a `thread_id`. The LangGraph graph runs as a FastAPI `BackgroundTask`. The frontend polls `GET /rows` every 3 seconds to see progress.

**Why:** LLM calls are slow (5–30s). Blocking the HTTP request would time out and give poor UX. Fire-and-forget with polling keeps the API responsive and lets the UI show live status updates per stage.

**Concepts to read:**
- [FastAPI: Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- Blog: [Polling vs WebSockets vs SSE — when to use which](https://ably.com/blog/websockets-vs-long-polling)
- Blog: [Building real-time AI pipelines with streaming](https://python.langchain.com/docs/expression_language/streaming/)

---

## 4. Status Field as Agent Communication Signal

**Decision:** `RecruitState` carries a `status` string (`researching → finding_people → drafting → awaiting_review → error`). Nodes set it; the graph's conditional edges and the frontend both read it.

**Why:** In a multi-step pipeline, downstream nodes and external consumers need to know where execution is. A status field is a lightweight message bus — no pub/sub needed at this scale.

**Concepts to read:**
- [Finite State Machines in agent design](https://refactoring.guru/design-patterns/state)
- [LangGraph: Using status for conditional routing](https://langchain-ai.github.io/langgraph/how-tos/branching/)
